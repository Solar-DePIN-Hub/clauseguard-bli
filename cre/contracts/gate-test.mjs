import ganache from 'ganache';
import { encodeAbiParameters, parseAbiParameters, encodeFunctionData, decodeFunctionResult, encodeDeployData } from 'viem';
import fs from 'fs';

const regAbi = JSON.parse(fs.readFileSync('./ClauseGuardRegistry.abi.json'));
const gateAbi = JSON.parse(fs.readFileSync('./ClauseGuardGate.abi.json'));

const P = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' } });
const rq = (method, params) => P.request({ method, params });

const accounts = await rq('eth_accounts', []);
const [fwd, owner, lawyer, producer, offtaker, stranger] = accounts;

// Deploy Registry
const regDeploy = await rq('eth_sendTransaction', [{
  from: fwd,
  data: encodeDeployData({ abi: regAbi, bytecode: '0x' + fs.readFileSync('./ClauseGuardRegistry.bin', 'utf8'), args: [fwd] }),
  gas: '0x2dc6c0'
}]);
const regAddr = (await rq('eth_getTransactionReceipt', [regDeploy])).contractAddress;

// Deploy Gate
const gateDeploy = await rq('eth_sendTransaction', [{
  from: owner,
  data: encodeDeployData({ abi: gateAbi, bytecode: '0x' + fs.readFileSync('./ClauseGuardGate.bin', 'utf8'), args: [regAddr] }),
  gas: '0x2dc6c0'
}]);
const gateAddr = (await rq('eth_getTransactionReceipt', [gateDeploy])).contractAddress;

let passed = 0;
let failed = 0;

function ok(cond, name) {
  if (cond) {
    console.log('PASS:', name);
    passed++;
  } else {
    console.log('FAIL:', name);
    failed++;
  }
}

async function expectRevert(promise, errorName) {
  try {
    await promise;
    ok(false, `Expected revert ${errorName}`);
  } catch (e) {
    ok(true, `Expected revert ${errorName}`);
  }
}

async function writeReview(doc, rep, score, high, flag) {
  const report = encodeAbiParameters(
    parseAbiParameters('bytes32, bytes32, uint8, uint8, bool, string'),
    [doc, rep, score, high, flag, 'clauseguard-rules-2.0.0']
  );
  const data = encodeFunctionData({ abi: regAbi, functionName: 'onReport', args: ['0x', report] });
  const tx = await rq('eth_sendTransaction', [{ from: fwd, to: regAddr, data, gas: '0x1e8480' }]);
  const receipt = await rq('eth_getTransactionReceipt', [tx]);
  return receipt.status === '0x1';
}

async function getStatus(doc) {
  const data = encodeFunctionData({ abi: gateAbi, functionName: 'status', args: [doc] });
  const out = await rq('eth_call', [{ to: gateAddr, data }, 'latest']);
  return decodeFunctionResult({ abi: gateAbi, functionName: 'status', data: out });
}

async function getDeal(doc) {
  const data = encodeFunctionData({ abi: gateAbi, functionName: 'deals', args: [doc] });
  const out = await rq('eth_call', [{ to: gateAddr, data }, 'latest']);
  return decodeFunctionResult({ abi: gateAbi, functionName: 'deals', data: out });
}

async function getBalance(addr) {
  const bal = await rq('eth_getBalance', [addr, 'latest']);
  return BigInt(bal);
}

// Case a) sign before any review -> reverts
const doc = '0x' + 'a'.repeat(64);
await expectRevert(
  rq('eth_call', [{ from: producer, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'sign', args: [doc] }) }, 'latest']),
  'NotReviewed'
);

// Case b) offtaker openDeal(doc, producer) with value 1 ether
const openData = encodeFunctionData({ abi: gateAbi, functionName: 'openDeal', args: [doc, producer] });
const openTx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: openData, value: '0xde0b6b3a7640000', gas: '0x2dc6c0' }]);
const openReceipt = await rq('eth_getTransactionReceipt', [openTx]);
ok(openReceipt.status === '0x1', 'openDeal success');

// Case c) review flagged -> status = reviewed, needsLawyer, !cleared; producer sign reverts; release reverts
const rep1 = '0x' + '1'.repeat(64);
await writeReview(doc, rep1, 17, 4, true);
let st = await getStatus(doc);
ok(st[0] === true, 'reviewed true');
ok(st[1] === true, 'needsLawyer true');
ok(st[2] === false, 'cleared false');

await expectRevert(
  rq('eth_call', [{ from: producer, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'sign', args: [doc] }) }, 'latest']),
  'NeedsLawyer'
);

await expectRevert(
  rq('eth_call', [{ from: offtaker, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'release', args: [doc] }) }, 'latest']),
  'NeedsLawyer'
);

// Case d) stranger approve -> reverts (NotLawyer). owner setLawyer(lawyer,true). lawyer approve(doc, wrong hash) -> reverts (StaleReport). lawyer approve(doc, rep1) -> ok; status cleared.
await expectRevert(
  rq('eth_call', [{ from: stranger, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'approve', args: [doc, rep1] }) }, 'latest']),
  'NotLawyer'
);

const setLawyerData = encodeFunctionData({ abi: gateAbi, functionName: 'setLawyer', args: [lawyer, true] });
const setLawyerTx = await rq('eth_sendTransaction', [{ from: owner, to: gateAddr, data: setLawyerData, gas: '0x1e8480' }]);
const setLawyerReceipt = await rq('eth_getTransactionReceipt', [setLawyerTx]);
ok(setLawyerReceipt.status === '0x1', 'setLawyer success');

const wrongHash = '0x' + 'f'.repeat(64);
await expectRevert(
  rq('eth_call', [{ from: lawyer, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'approve', args: [doc, wrongHash] }) }, 'latest']),
  'StaleReport'
);

const approveData = encodeFunctionData({ abi: gateAbi, functionName: 'approve', args: [doc, rep1] });
const approveTx = await rq('eth_sendTransaction', [{ from: lawyer, to: gateAddr, data: approveData, gas: '0x1e8480' }]);
const approveReceipt = await rq('eth_getTransactionReceipt', [approveTx]);
ok(approveReceipt.status === '0x1', 'approve success');

st = await getStatus(doc);
ok(st[2] === true, 'cleared true after approve');

// Case e) both sign ok; then a NEW flagged review rep2 arrives -> status not cleared (approval invalidated) -> release reverts.
const signProducerData = encodeFunctionData({ abi: gateAbi, functionName: 'sign', args: [doc] });
const signProducerTx = await rq('eth_sendTransaction', [{ from: producer, to: gateAddr, data: signProducerData, gas: '0x1e8480' }]);
const signProducerReceipt = await rq('eth_getTransactionReceipt', [signProducerTx]);
ok(signProducerReceipt.status === '0x1', 'producer sign success');

const signOfftakerData = encodeFunctionData({ abi: gateAbi, functionName: 'sign', args: [doc] });
const signOfftakerTx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: signOfftakerData, gas: '0x1e8480' }]);
const signOfftakerReceipt = await rq('eth_getTransactionReceipt', [signOfftakerTx]);
ok(signOfftakerReceipt.status === '0x1', 'offtaker sign success');

const rep2 = '0x' + '2'.repeat(64);
await writeReview(doc, rep2, 15, 5, true);
st = await getStatus(doc);
ok(st[2] === false, 'cleared false after new review');

await expectRevert(
  rq('eth_call', [{ from: offtaker, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'release', args: [doc] }) }, 'latest']),
  'NeedsLawyer'
);

// Case f) lawyer approves rep2 -> release ok; producer balance increased by 1 ether; deal.released true; second release reverts.
const approve2Data = encodeFunctionData({ abi: gateAbi, functionName: 'approve', args: [doc, rep2] });
const approve2Tx = await rq('eth_sendTransaction', [{ from: lawyer, to: gateAddr, data: approve2Data, gas: '0x1e8480' }]);
const approve2Receipt = await rq('eth_getTransactionReceipt', [approve2Tx]);
ok(approve2Receipt.status === '0x1', 'approve rep2 success');

const prodBalBefore = await getBalance(producer);
const releaseData = encodeFunctionData({ abi: gateAbi, functionName: 'release', args: [doc] });
const releaseTx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: releaseData, gas: '0x2dc6c0' }]);
const releaseReceipt = await rq('eth_getTransactionReceipt', [releaseTx]);
ok(releaseReceipt.status === '0x1', 'release success');

const prodBalAfter = await getBalance(producer);
ok(prodBalAfter - prodBalBefore === 1000000000000000000n, 'producer balance increased by 1 ether');

let deal = await getDeal(doc);
ok(deal[5] === true, 'deal.released true');

await expectRevert(
  rq('eth_call', [{ from: offtaker, to: gateAddr, data: encodeFunctionData({ abi: gateAbi, functionName: 'release', args: [doc] }) }, 'latest']),
  'AlreadyReleased'
);

// Case g) a second doc (doc2) reviewed clean: open deal with 0 value, both sign without lawyer -> ok
const doc2 = '0x' + 'c'.repeat(64);
const rep3 = '0x' + '3'.repeat(64);
await writeReview(doc2, rep3, 100, 0, false);

const open2Data = encodeFunctionData({ abi: gateAbi, functionName: 'openDeal', args: [doc2, producer] });
const open2Tx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: open2Data, value: '0x0', gas: '0x1e8480' }]);
const open2Receipt = await rq('eth_getTransactionReceipt', [open2Tx]);
ok(open2Receipt.status === '0x1', 'openDeal doc2 success');

const sign2ProducerData = encodeFunctionData({ abi: gateAbi, functionName: 'sign', args: [doc2] });
const sign2ProducerTx = await rq('eth_sendTransaction', [{ from: producer, to: gateAddr, data: sign2ProducerData, gas: '0x1e8480' }]);
const sign2ProducerReceipt = await rq('eth_getTransactionReceipt', [sign2ProducerTx]);
ok(sign2ProducerReceipt.status === '0x1', 'producer sign doc2 success');

const sign2OfftakerData = encodeFunctionData({ abi: gateAbi, functionName: 'sign', args: [doc2] });
const sign2OfftakerTx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: sign2OfftakerData, gas: '0x1e8480' }]);
const sign2OfftakerReceipt = await rq('eth_getTransactionReceipt', [sign2OfftakerTx]);
ok(sign2OfftakerReceipt.status === '0x1', 'offtaker sign doc2 success');

// Case h) refund path: doc3 flagged, offtaker opens with 0.5 ether, refund -> ok and escrow returned
const doc3 = '0x' + 'd'.repeat(64);
const rep4 = '0x' + '4'.repeat(64);
await writeReview(doc3, rep4, 10, 6, true);

const open3Data = encodeFunctionData({ abi: gateAbi, functionName: 'openDeal', args: [doc3, producer] });
const open3Tx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: open3Data, value: '0x6f05b59d3b20000', gas: '0x1e8480' }]);
const open3Receipt = await rq('eth_getTransactionReceipt', [open3Tx]);
ok(open3Receipt.status === '0x1', 'openDeal doc3 success');

const refundData = encodeFunctionData({ abi: gateAbi, functionName: 'refund', args: [doc3] });
const refundTx = await rq('eth_sendTransaction', [{ from: offtaker, to: gateAddr, data: refundData, gas: '0x1e8480' }]);
const refundReceipt = await rq('eth_getTransactionReceipt', [refundTx]);
ok(refundReceipt.status === '0x1', 'refund success');

deal = await getDeal(doc3);
ok(deal[2] === 0n, 'deal.escrow == 0 after refund');

console.log(`${passed} passed`);
if (failed > 0) {
  process.exit(1);
}
