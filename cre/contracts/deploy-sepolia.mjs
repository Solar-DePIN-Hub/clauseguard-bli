import { readFileSync, writeFileSync } from 'node:fs';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { encodeAbiParameters, parseAbiParameters, keccak256, toHex, stringToHex } from 'viem';

const pk = process.env.SEPOLIA_DEPLOYER_PK;
if (!pk) {
  console.error('SEPOLIA_DEPLOYER_PK is not set');
  process.exit(1);
}
const RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

const account = privateKeyToAccount(pk);
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });

const registryAbi = JSON.parse(readFileSync('./ClauseGuardRegistry.abi.json', 'utf8'));
const registryBin = readFileSync('./ClauseGuardRegistry.bin', 'utf8').trim();
const gateAbi = JSON.parse(readFileSync('./ClauseGuardGate.abi.json', 'utf8'));
const gateBin = readFileSync('./ClauseGuardGate.bin', 'utf8').trim();

const deployer = account.address;
const txs = [];

async function sendTx(label, args) {
  const hash = await walletClient.writeContract(args);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const status = receipt.status === 'success' ? 'success' : 'reverted';
  console.log(`${label} ${hash} ${status}`);
  txs.push({ label, hash, status });
  return receipt;
}

try {
  // Deploy Registry
  const registryDeployArgs = {
    abi: registryAbi,
    bytecode: '0x' + registryBin,
    args: [deployer],
  };
  const registryHash = await walletClient.deployContract(registryDeployArgs);
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryStatus = registryReceipt.status === 'success' ? 'success' : 'reverted';
  console.log(`registry ${registryHash} ${registryStatus}`);
  txs.push({ label: 'registry', hash: registryHash, status: registryStatus });
  const registryAddress = registryReceipt.contractAddress;

  // Deploy Gate
  const gateDeployArgs = {
    abi: gateAbi,
    bytecode: '0x' + gateBin,
    args: [registryAddress],
  };
  const gateHash = await walletClient.deployContract(gateDeployArgs);
  const gateReceipt = await publicClient.waitForTransactionReceipt({ hash: gateHash });
  const gateStatus = gateReceipt.status === 'success' ? 'success' : 'reverted';
  console.log(`gate ${gateHash} ${gateStatus}`);
  txs.push({ label: 'gate', hash: gateHash, status: gateStatus });
  const gateAddress = gateReceipt.contractAddress;

  const docHash = keccak256(stringToHex('ClauseGuard demo: risky apartment lease v1'));
  const reportHash = keccak256(stringToHex('ClauseGuard report demo v1'));

  // Step 1: registry.onReport
  const encodedReport = encodeAbiParameters(
    parseAbiParameters('bytes32, bytes32, uint8, uint8, bool, string'),
    [docHash, reportHash, 29, 3, true, 'clauseguard-rules-3.0.0']
  );
  await sendTx('onReport', {
    address: registryAddress,
    abi: registryAbi,
    functionName: 'onReport',
    args: ['0x', encodedReport],
  });

  // Step 2: gate.setLawyer
  await sendTx('setLawyer', {
    address: gateAddress,
    abi: gateAbi,
    functionName: 'setLawyer',
    args: [deployer, true],
  });

  // Step 3: gate.openDeal
  const producer = '0x000000000000000000000000000000000000dEaD';
  await sendTx('openDeal', {
    address: gateAddress,
    abi: gateAbi,
    functionName: 'openDeal',
    args: [docHash, producer],
    value: 0n,
  });

  // Step 4: sign refusal
  let refusalMsg = '';
  try {
    await publicClient.simulateContract({
      address: gateAddress,
      abi: gateAbi,
      functionName: 'sign',
      args: [docHash],
      account: deployer,
    });
  } catch (e) {
    refusalMsg = e.message || String(e);
  }
  if (!refusalMsg.includes('NeedsLawyer')) {
    throw new Error(`Expected NeedsLawyer in refusal, got: ${refusalMsg}`);
  }

  // Send real tx with explicit gas to create reverted tx on-chain
  const signHash = await walletClient.writeContract({
    address: gateAddress,
    abi: gateAbi,
    functionName: 'sign',
    args: [docHash],
    gas: 100000n,
  });
  const signReceipt = await publicClient.waitForTransactionReceipt({ hash: signHash });
  const signStatus = signReceipt.status === 'success' ? 'success' : 'reverted';
  console.log(`signRefusal ${signHash} ${signStatus}`);
  txs.push({ label: 'signRefusal', hash: signHash, status: signStatus });

  // Step 5: gate.approve
  await sendTx('approve', {
    address: gateAddress,
    abi: gateAbi,
    functionName: 'approve',
    args: [docHash, reportHash],
  });

  // Step 6: gate.sign succeeds
  await sendTx('sign', {
    address: gateAddress,
    abi: gateAbi,
    functionName: 'sign',
    args: [docHash],
  });

  // Read status
  const statusResult = await publicClient.readContract({
    address: gateAddress,
    abi: gateAbi,
    functionName: 'status',
    args: [docHash],
  });
  console.log('status:', statusResult);

  const output = {
    chainId: sepolia.id,
    registry: registryAddress,
    gate: gateAddress,
    deployer,
    docHash,
    reportHash,
    txs,
    note: 'forwarder = deployer for demo; production uses Chainlink KeystoneForwarder',
  };
  writeFileSync('./sepolia-deployment.json', JSON.stringify(output, null, 2));

  console.log(`https://sepolia.etherscan.io/address/${registryAddress}`);
  console.log(`https://sepolia.etherscan.io/address/${gateAddress}`);
  for (const t of txs) {
    console.log(`https://sepolia.etherscan.io/tx/${t.hash}`);
  }
} catch (err) {
  console.error('Deployment failed:', err);
  process.exit(1);
}
