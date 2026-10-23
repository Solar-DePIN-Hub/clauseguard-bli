# ClauseGuard × Chainlink CRE — on-chain review attestations

`clauseguard-attest` is a CRE workflow (TypeScript SDK) that turns a ClauseGuard review into a public, tamper-evident record.

```
HTTP trigger {text}
   │
   ├─ workflow computes sha256(text) itself (docHash)
   ├─ HTTP capability: every DON node POSTs the text to ClauseGuard /api/review
   │      └─ consensus: docHash, reportHash, ruleset, score, high must be identical on all nodes
   ├─ check: API docHash == workflow docHash (otherwise abort)
   ├─ decision: needsLawyer = score < riskThreshold OR any high finding
   └─ signed report → EVM writeReport → ClauseGuardRegistry.onReport() on Ethereum Sepolia
                                       (stores reportHash, score, highFindings, needsLawyer, ruleset, timestamp per docHash)
```

Contract text is never written on-chain. Only hashes and the score are.

## What is verified today
- `bun test` in `clauseguard-attest/`: 6 tests pass. They use the CRE SDK test runtime with HTTP and EVM capability mocks, and the real ClauseGuard engine (`../rules.js`). They cover a risky PPA flagged on-chain, a balanced PPA not flagged, ABI round-trip, rejection of a mismatching API hash, and an empty payload.
- `bunx cre-compile main.ts out.wasm`: the workflow compiles to WASM (about 2.6 MB).
- `contracts/`: `ClauseGuardRegistry.sol` compiles with solc 0.8.24. `npm test` deploys it on a local ganache chain and checks three things: a report from the forwarder is stored, any other sender is rejected, and ERC-165 reports `IReceiver`.

## Run the simulation (needs a free CRE account)
```bash
cre login                                  # browser login to your CRE account (2FA)
cre workflow supported-chains              # copy the Sepolia forwarder address
# deploy contracts/ClauseGuardRegistry.sol on Sepolia with that forwarder as constructor arg,
# put the address into clauseguard-attest/config.json -> evms[0].registryAddress
cd cre && cre workflow simulate clauseguard-attest --target staging-settings \
  --non-interactive --trigger-index 0 --http-payload clauseguard-attest/payload-risky.json
# add --broadcast to send the real Sepolia transaction (needs CRE_ETH_PRIVATE_KEY of a Sepolia test wallet in .env)
```
