// ClauseGuard attestation workflow (Chainlink CRE, TypeScript SDK)
// HTTP trigger {text} -> every DON node calls the ClauseGuard review API -> consensus on the result
// -> the workflow recomputes the document hash itself -> signed report -> ClauseGuardRegistry on Sepolia.
// Result: a public, tamper-evident record "document X was reviewed with ruleset Y and scored Z".
import {
	bytesToHex,
	ConsensusAggregationByFields,
	cre,
	getNetwork,
	hexToBase64,
	type HTTPPayload,
	type HTTPSendRequester,
	identical,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, sha256, toBytes, type Hex } from 'viem'
import { z } from 'zod'

export const configSchema = z.object({
	apiUrl: z.string(),
	riskThreshold: z.number(), // score below this => flagged "needs lawyer" on-chain
	evms: z.array(z.object({ registryAddress: z.string(), chainSelectorName: z.string(), gasLimit: z.string() })),
})
export type Config = z.infer<typeof configSchema>

export type Review = { docHash: string; reportHash: string; ruleset: string; score: number; high: number }

// Runs on each node; results must be identical across nodes (the API is deterministic).
export const fetchReview = (sendRequester: HTTPSendRequester, args: { url: string; text: string }): Review => {
	const response = sendRequester
		.sendRequest({
			url: args.url,
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: Buffer.from(JSON.stringify({ text: args.text })).toString('base64'),
		})
		.result()
	if (response.statusCode !== 200) throw new Error(`ClauseGuard API returned ${response.statusCode}`)
	const j = JSON.parse(Buffer.from(response.body).toString('utf-8'))
	return { docHash: j.docHash, reportHash: j.reportHash, ruleset: j.ruleset, score: j.score, high: j.counts.high }
}

export const encodeAttestation = (r: Review, flagged: boolean): Hex =>
	encodeAbiParameters(
		parseAbiParameters('bytes32 docHash, bytes32 reportHash, uint8 score, uint8 highFindings, bool needsLawyer, string ruleset'),
		[`0x${r.docHash}` as Hex, `0x${r.reportHash}` as Hex, r.score, r.high, flagged, r.ruleset],
	)

export const parseText = (payload: HTTPPayload): string => {
	if (!payload.input || payload.input.length === 0) throw new Error('empty HTTP payload')
	const j = JSON.parse(Buffer.from(payload.input).toString('utf-8'))
	if (typeof j.text !== 'string' || !j.text.trim()) throw new Error('payload must be {"text": "..."}')
	return j.text
}

export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
	const text = parseText(payload)
	// 1. Independent hash: the workflow does not trust the API for the document fingerprint.
	const localDocHash = sha256(toBytes(text)).slice(2)
	runtime.log(`document sha256 ${localDocHash}`)

	// 2. Off-chain review by every node, aggregated by consensus.
	const http = new cre.capabilities.HTTPClient()
	const review = http
		.sendRequest(
			runtime,
			fetchReview,
			ConsensusAggregationByFields<Review>({ docHash: identical, reportHash: identical, ruleset: identical, score: identical, high: identical }),
		)({ url: runtime.config.apiUrl, text })
		.result()
	runtime.log(`review score=${review.score} high=${review.high} ruleset=${review.ruleset}`)
	if (review.docHash !== localDocHash) throw new Error('API document hash does not match the hash computed by the workflow')

	// 3. Decision: the score changes what is written on-chain.
	const flagged = review.score < runtime.config.riskThreshold || review.high > 0
	runtime.log(flagged ? 'decision: NEEDS LAWYER (high-risk findings)' : 'decision: no high-risk findings')

	// 4. Signed report -> registry contract.
	const evm = runtime.config.evms[0]
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: evm.chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`unknown chain ${evm.chainSelectorName}`)
	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const report = runtime
		.report({ encodedPayload: hexToBase64(encodeAttestation(review, flagged)), encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256' })
		.result()
	const res = evmClient.writeReport(runtime, { receiver: evm.registryAddress, report, gasConfig: { gasLimit: evm.gasLimit } }).result()
	if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${res.errorMessage || res.txStatus}`)
	const tx = bytesToHex(res.txHash || new Uint8Array(32))
	runtime.log(`attestation written, tx ${tx}`)
	return JSON.stringify({ docHash: review.docHash, reportHash: review.reportHash, score: review.score, needsLawyer: flagged, tx })
}

export function initWorkflow(config: Config) {
	const httpTrigger = new cre.capabilities.HTTPCapability()
	return [cre.handler(httpTrigger.trigger({}), onHttpTrigger)]
}
