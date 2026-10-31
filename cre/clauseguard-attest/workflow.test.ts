import { describe, expect } from 'bun:test'
import { createHash } from 'node:crypto'
import { TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, HttpActionsMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { decodeAbiParameters, parseAbiParameters } from 'viem'
import { initWorkflow, lawQuery, onHttpTrigger } from './workflow'
// The real ClauseGuard engine and samples (same code as the web app and /api/review).
const cg = require('../../rules.js')
const SAMPLES = require('../../samples.js')

const SEPOLIA = 16015286601757825753n
const config = {
	apiUrl: 'https://clauseguard-bli.vercel.app/api/review',
	riskThreshold: 70,
	sparqlUrl: 'https://publications.europa.eu/webapi/rdf/sparql',
	citedCelex: ['31993L0013', '32011L0083', '32008L0048', '32011L0007', '32016R0679', '32019L0944', '32023R1114'],
	gleifUrl: 'https://api.gleif.org/api/v1/lei-records',
	evms: [{ registryAddress: '0x000000000000000000000000000000000000dEaD', chainSelectorName: 'ethereum-testnet-sepolia', gasLimit: '300000' }],
}
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const enc = (s: string) => new TextEncoder().encode(s)

// HTTP mock = route by req.url: ClauseGuard API / EUR-Lex SPARQL / GLEIF LEI.
const makeMock = (opts: { repealed?: string[]; leiStatus?: { entityStatus: string; registrationStatus: string; legalName: string } | null }) => (req: any) => {
	const url: string = req.url
	if (url.startsWith(config.apiUrl)) {
		const text = JSON.parse(Buffer.from(req.body).toString('utf-8')).text
		const r = cg.check(text)
		const docHash = sha(text)
		const reportHash = sha(cg.canonical(cg.reportPayload(docHash, r)))
		return { statusCode: 200, body: enc(JSON.stringify({ docHash, reportHash, ...r })) }
	}
	if (url.includes('sparql')) {
		const decoded = decodeURIComponent(url)
		const celexes = decoded.match(/"(\d{5}[A-Z]\d{4})"/g)?.map((m) => m.slice(1, -1)) ?? []
		const bindings = celexes.map((c) => ({
			celex: { value: c },
			force: { value: opts.repealed?.includes(c) ? '0' : '1' },
		}))
		return { statusCode: 200, body: enc(JSON.stringify({ results: { bindings } })) }
	}
	if (url.includes('gleif')) {
		const lei = url.split('/').pop() ?? ''
		if (lei === 'ZZZZZZZZZZZZZZZZZZZZ') return { statusCode: 404, body: new Uint8Array() }
		if (opts.leiStatus) {
			return {
				statusCode: 200,
				body: enc(
					JSON.stringify({
						data: {
							attributes: {
								entity: { status: opts.leiStatus.entityStatus, legalName: { name: opts.leiStatus.legalName } },
								registration: { status: opts.leiStatus.registrationStatus },
							},
						},
					}),
				),
			}
		}
		return { statusCode: 404, body: new Uint8Array() }
	}
	throw new Error(`mock: unhandled url ${url}`)
}

const run = (text: string, opts: { repealed?: string[]; leiStatus?: { entityStatus: string; registrationStatus: string; legalName: string } | null } = {}) => {
	HttpActionsMock.testInstance().sendRequest = makeMock(opts)
	let written: any = null
	EvmMock.testInstance(SEPOLIA).writeReport = (req: any) => {
		written = req
		return { txStatus: TxStatus.SUCCESS, txHash: new Uint8Array(32).fill(7) }
	}
	const runtime = newTestRuntime() as any
	runtime.config = config
	const out = JSON.parse(onHttpTrigger(runtime, { input: enc(JSON.stringify({ text })) } as any))
	return { out, written }
}

const runWithLei = (text: string, lei: string, opts: { repealed?: string[]; leiStatus?: { entityStatus: string; registrationStatus: string; legalName: string } | null } = {}) => {
	HttpActionsMock.testInstance().sendRequest = makeMock(opts)
	let written: any = null
	EvmMock.testInstance(SEPOLIA).writeReport = (req: any) => {
		written = req
		return { txStatus: TxStatus.SUCCESS, txHash: new Uint8Array(32).fill(7) }
	}
	const runtime = newTestRuntime() as any
	runtime.config = config
	const out = JSON.parse(onHttpTrigger(runtime, { input: enc(JSON.stringify({ text, counterpartyLei: lei })) } as any))
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
		HttpActionsMock.testInstance().sendRequest = (req: any) => {
			const url: string = req.url
			if (url.startsWith(config.apiUrl)) {
				const text = JSON.parse(Buffer.from(req.body).toString('utf-8')).text
				const r = cg.check(text)
				const docHash = sha(text + ' ')
				const reportHash = sha(cg.canonical(cg.reportPayload(docHash, r)))
				return { statusCode: 200, body: enc(JSON.stringify({ docHash, reportHash, ...r })) }
			}
			if (url.includes('sparql')) {
				const decoded = decodeURIComponent(url)
				const celexes = decoded.match(/"(\d{5}[A-Z]\d{4})"/g)?.map((m) => m.slice(1, -1)) ?? []
				const bindings = celexes.map((c) => ({ celex: { value: c }, force: { value: '1' } }))
				return { statusCode: 200, body: enc(JSON.stringify({ results: { bindings } })) }
			}
			throw new Error('mock: unhandled url ' + url)
		}
		const runtime = newTestRuntime() as any
		runtime.config = config
		expect(() => onHttpTrigger(runtime, { input: enc(JSON.stringify({ text: SAMPLES.risky })) } as any)).toThrow()
	})
	test('rejects empty payload', () => {
		const runtime = newTestRuntime() as any; runtime.config = config
		expect(() => onHttpTrigger(runtime, { input: new Uint8Array() } as any)).toThrow('empty HTTP payload')
	})
	test('registers one HTTP-trigger handler', () => {
		expect(initWorkflow(config)).toHaveLength(1)
	})
	test('fair PPA + all laws in force + no LEI -> needsLawyer false, lawInForce 7/7', () => {
		const { out } = run(SAMPLES.fair)
		expect(out.needsLawyer).toBe(false)
		expect(out.lawInForce).toBe('7/7')
		expect(out.counterparty).toBeNull()
		expect(out.reasons).toHaveLength(0)
	})
	test('fair PPA but 32019L0944 repealed -> needsLawyer true, reason cited law not in force', () => {
		const { out } = run(SAMPLES.fair, { repealed: ['32019L0944'] })
		expect(out.needsLawyer).toBe(true)
		expect(out.lawInForce).toBe('6/7')
		expect(out.reasons.some((r: string) => r.includes('cited law not in force: 32019L0944'))).toBe(true)
	})
	test('fair PPA + LEI ACTIVE/ISSUED -> needsLawyer false and counterparty.legalName set', () => {
		const { out } = runWithLei(SAMPLES.fair, '5493001KJTIIGC8Y1R12', { leiStatus: { entityStatus: 'ACTIVE', registrationStatus: 'ISSUED', legalName: 'ACME Energy GmbH' } })
		expect(out.needsLawyer).toBe(false)
		expect(out.counterparty.legalName).toBe('ACME Energy GmbH')
		expect(out.counterparty.entityStatus).toBe('ACTIVE')
		expect(out.counterparty.registrationStatus).toBe('ISSUED')
	})
	test('fair PPA + LEI LAPSED -> needsLawyer true', () => {
		const { out } = runWithLei(SAMPLES.fair, '5493001KJTIIGC8Y1R12', { leiStatus: { entityStatus: 'ACTIVE', registrationStatus: 'LAPSED', legalName: 'ACME Energy GmbH' } })
		expect(out.needsLawyer).toBe(true)
		expect(out.reasons.some((r: string) => r.includes('counterparty LEI LAPSED'))).toBe(true)
	})
	test('fair PPA + unknown LEI (404) -> needsLawyer true', () => {
		const { out } = runWithLei(SAMPLES.fair, 'ZZZZZZZZZZZZZZZZZZZZ')
		expect(out.needsLawyer).toBe(true)
		expect(out.counterparty.entityStatus).toBe('NOT_FOUND')
		expect(out.reasons.some((r: string) => r.includes('counterparty LEI NOT_FOUND'))).toBe(true)
	})
	test('invalid LEI throws invalid LEI', () => {
		HttpActionsMock.testInstance().sendRequest = makeMock({})
		const runtime = newTestRuntime() as any
		runtime.config = config
		expect(() => onHttpTrigger(runtime, { input: enc(JSON.stringify({ text: SAMPLES.fair, counterpartyLei: 'abc' })) } as any)).toThrow('invalid LEI')
	})
	test('lawQuery contains every CELEX as a typed literal', () => {
		const q = lawQuery(['31993L0013', '32011L0083', '32008L0048', '32011L0007', '32016R0679', '32019L0944', '32023R1114'])
		for (const c of ['31993L0013', '32011L0083', '32008L0048', '32011L0007', '32016R0679', '32019L0944', '32023R1114']) {
			expect(q).toContain(`"${c}"^^<http://www.w3.org/2001/XMLSchema#string>`)
		}
	})
})
