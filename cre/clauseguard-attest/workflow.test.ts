import { describe, expect } from 'bun:test'
import { createHash } from 'node:crypto'
import { TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, HttpActionsMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { decodeAbiParameters, parseAbiParameters } from 'viem'
import { initWorkflow, onHttpTrigger } from './workflow'
// The real ClauseGuard engine and samples (same code as the web app and /api/review).
const cg = require('../../rules.js')
const SAMPLES = require('../../samples.js')

const SEPOLIA = 16015286601757825753n
const config = { apiUrl: 'https://clauseguard-bli.vercel.app/api/review', riskThreshold: 70, evms: [{ registryAddress: '0x000000000000000000000000000000000000dEaD', chainSelectorName: 'ethereum-testnet-sepolia', gasLimit: '300000' }] }
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

// HTTP mock = the API handler logic, run locally.
const apiMock = (tamper = false) => (req: any) => {
	const text = JSON.parse(Buffer.from(req.body).toString('utf-8')).text
	const r = cg.check(text), docHash = tamper ? sha(text + ' ') : sha(text)
	const reportHash = sha(cg.canonical(cg.reportPayload(docHash, r)))
	return { statusCode: 200, body: new TextEncoder().encode(JSON.stringify({ docHash, reportHash, ...r })) }
}
const run = (text: string, tamper = false) => {
	HttpActionsMock.testInstance().sendRequest = apiMock(tamper)
	let written: any = null
	EvmMock.testInstance(SEPOLIA).writeReport = (req: any) => { written = req; return { txStatus: TxStatus.SUCCESS, txHash: new Uint8Array(32).fill(7) } }
	const runtime = newTestRuntime() as any
	runtime.config = config
	const out = JSON.parse(onHttpTrigger(runtime, { input: new TextEncoder().encode(JSON.stringify({ text })) } as any))
	return { out, written }
}

describe('clauseguard-attest', () => {
	test('risky PPA is flagged needsLawyer and written on-chain', () => {
		const { out, written } = run(SAMPLES.risky)
		expect(out.docHash).toBe(sha(SAMPLES.risky))
		expect(out.needsLawyer).toBe(true)
		expect(out.score).toBeLessThan(70)
		expect(written).not.toBeNull()
	})
	test('balanced PPA passes without flag', () => {
		const { out } = run(SAMPLES.fair)
		expect(out.score).toBe(100)
		expect(out.needsLawyer).toBe(false)
	})
	test('encoded attestation decodes back to the review', () => {
		const { encodeAttestation } = require('./workflow')
		const hex = encodeAttestation({ docHash: 'a'.repeat(64), reportHash: 'b'.repeat(64), ruleset: 'clauseguard-rules-2.0.0', score: 17, high: 4 }, true)
		const [d, r, s, h, f, rs] = decodeAbiParameters(parseAbiParameters('bytes32, bytes32, uint8, uint8, bool, string'), hex)
		expect(d).toBe('0x' + 'a'.repeat(64)); expect(r).toBe('0x' + 'b'.repeat(64)); expect(s).toBe(17); expect(h).toBe(4); expect(f).toBe(true); expect(rs).toBe('clauseguard-rules-2.0.0')
	})
	test('rejects an API that returns a different document hash', () => {
		expect(() => run(SAMPLES.risky, true)).toThrow()
	})
	test('rejects empty payload', () => {
		const runtime = newTestRuntime() as any; runtime.config = config
		expect(() => onHttpTrigger(runtime, { input: new Uint8Array() } as any)).toThrow('empty HTTP payload')
	})
	test('registers one HTTP-trigger handler', () => {
		expect(initWorkflow(config)).toHaveLength(1)
	})
})
