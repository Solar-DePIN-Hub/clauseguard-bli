// ClauseGuard attestation workflow (Chainlink CRE, TypeScript SDK)
// HTTP trigger {text, counterpartyLei?} -> every DON node calls the ClauseGuard review API -> consensus on the result
// -> external legal data (EUR-Lex Cellar SPARQL + GLEIF LEI) under DON consensus
// -> the workflow recomputes the document hash itself -> signed report -> ClauseGuardRegistry on Sepolia.
// Result: a public, tamper-evident record "document X was reviewed with ruleset Y and scored Z",
// where the on-chain decision (needsLawyer) also reflects the cited law status and counterparty LEI.
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
	sparqlUrl: z.string(),
	citedCelex: z.array(z.string()),
	gleifUrl: z.string(),
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

export const lawQuery = (celex: string[]): string => {
	const literals = celex.map((c) => `"${c}"^^<http://www.w3.org/2001/XMLSchema#string>`).join(', ')
	return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT ?celex ?force WHERE { ?w cdm:resource_legal_id_celex ?celex . FILTER(?celex IN (${literals})) OPTIONAL { ?w cdm:resource_legal_in-force ?force } }`
}

export type LawStatus = { checked: number; inForce: number; notInForce: string }

export const fetchLawStatus = (sendRequester: HTTPSendRequester, args: { url: string; celex: string[] }): LawStatus => {
	const response = sendRequester
		.sendRequest({
			url: `${args.url}?query=${encodeURIComponent(lawQuery(args.celex))}`,
			method: 'GET',
			headers: { accept: 'application/sparql-results+json' },
		})
		.result()
	if (response.statusCode !== 200) throw new Error(`EUR-Lex SPARQL returned ${response.statusCode}`)
	const j = JSON.parse(Buffer.from(response.body).toString('utf-8'))
	const bindings: any[] = j.results?.bindings ?? []
	const inForceSet = new Set<string>()
	for (const b of bindings) {
		const celexVal = b.celex?.value
		const forceVal = b.force?.value
		if (typeof celexVal === 'string' && (forceVal === '1' || forceVal === 'true')) inForceSet.add(celexVal)
	}
	const checked = args.celex.length
	const inForce = args.celex.filter((c) => inForceSet.has(c)).length
	const notInForce = args.celex.filter((c) => !inForceSet.has(c)).sort().join(',')
	return { checked, inForce, notInForce }
}

export type LeiStatus = { lei: string; entityStatus: string; registrationStatus: string; legalName: string }

export const fetchLei = (sendRequester: HTTPSendRequester, args: { url: string; lei: string }): LeiStatus => {
	const response = sendRequester
		.sendRequest({
			url: `${args.url}/${args.lei}`,
			method: 'GET',
			headers: { accept: 'application/json' },
		})
		.result()
	if (response.statusCode === 404) {
		return { lei: args.lei, entityStatus: 'NOT_FOUND', registrationStatus: 'NOT_FOUND', legalName: '' }
	}
	if (response.statusCode !== 200) throw new Error(`GLEIF returned ${response.statusCode}`)
	const j = JSON.parse(Buffer.from(response.body).toString('utf-8'))
	const entityStatus = j?.data?.attributes?.entity?.status ?? ''
	const registrationStatus = j?.data?.attributes?.registration?.status ?? ''
	const legalName = j?.data?.attributes?.entity?.legalName?.name ?? ''
	return { lei: args.lei, entityStatus, registrationStatus, legalName }
}

export const parsePayload = (payload: HTTPPayload): { text: string; counterpartyLei?: string } => {
	if (!payload.input || payload.input.length === 0) throw new Error('empty HTTP payload')
	const j = JSON.parse(Buffer.from(payload.input).toString('utf-8'))
	if (typeof j.text !== 'string' || !j.text.trim()) throw new Error('payload must be {"text": "..."}')
	if (j.counterpartyLei !== undefined) {
		if (typeof j.counterpartyLei !== 'string' || !/^[A-Z0-9]{20}$/.test(j.counterpartyLei)) throw new Error('invalid LEI')
	}
	return { text: j.text, counterpartyLei: j.counterpartyLei }
}

export const parseText = (payload: HTTPPayload): string => parsePayload(payload).text

export const encodeAttestation = (r: Review, flagged: boolean): Hex =>
	encodeAbiParameters(
		parseAbiParameters('bytes32 docHash, bytes32 reportHash, uint8 score, uint8 highFindings, bool needsLawyer, string ruleset'),
		[`0x${r.docHash}` as Hex, `0x${r.reportHash}` as Hex, r.score, r.high, flagged, r.ruleset],
	)

export const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
	const { text, counterpartyLei } = parsePayload(payload)
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

	// 3. External legal data under DON consensus.
	const law = http
		.sendRequest(
			runtime,
			fetchLawStatus,
			ConsensusAggregationByFields<LawStatus>({ checked: identical, inForce: identical, notInForce: identical }),
		)({ url: runtime.config.sparqlUrl, celex: runtime.config.citedCelex })
		.result()
	runtime.log(`law check: ${law.inForce}/${law.checked} cited acts in force (EUR-Lex Cellar)`)

	let lei: LeiStatus | null = null
	if (counterpartyLei) {
		lei = http
			.sendRequest(
				runtime,
				fetchLei,
				ConsensusAggregationByFields<LeiStatus>({ lei: identical, entityStatus: identical, registrationStatus: identical, legalName: identical }),
			)({ url: runtime.config.gleifUrl, lei: counterpartyLei })
			.result()
		runtime.log(`lei check: ${lei.entityStatus}/${lei.registrationStatus} ${lei.legalName}`)
	}

	// 4. Decision: the score, the cited law status and the counterparty LEI change what is written on-chain.
	const reasons: string[] = []
	if (review.score < runtime.config.riskThreshold || review.high > 0) reasons.push('high-risk clauses')
	if (law.inForce < law.checked) reasons.push(`cited law not in force: ${law.notInForce}`)
	if (lei && !(lei.entityStatus === 'ACTIVE' && (lei.registrationStatus === 'ISSUED' || lei.registrationStatus === 'PENDING_TRANSFER' || lei.registrationStatus === 'PENDING_ARCHIVAL'))) {
		reasons.push(`counterparty LEI ${lei.registrationStatus}`)
	}
	const flagged = reasons.length > 0
	runtime.log(flagged ? `decision: NEEDS LAWYER (${reasons.join('; ')})` : 'decision: no high-risk findings')

	// 5. Signed report -> registry contract.
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
	return JSON.stringify({
		docHash: review.docHash,
		reportHash: review.reportHash,
		score: review.score,
		needsLawyer: flagged,
		lawInForce: `${law.inForce}/${law.checked}`,
		counterparty: lei ?? null,
		reasons,
		tx,
	})
}

export function initWorkflow(config: Config) {
	const httpTrigger = new cre.capabilities.HTTPCapability()
	return [cre.handler(httpTrigger.trigger({}), onHttpTrigger)]
}
