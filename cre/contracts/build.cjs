// Compiles ClauseGuardRegistry.sol and ClauseGuardGate.sol with solc 0.8.24 (optimizer 200)
const solc = require('solc');
const fs = require('fs');

const registrySrc = fs.readFileSync(__dirname + '/ClauseGuardRegistry.sol', 'utf8');
const gateSrc = fs.readFileSync(__dirname + '/ClauseGuardGate.sol', 'utf8');

const input = JSON.stringify({
  language: 'Solidity',
  sources: {
    'ClauseGuardRegistry.sol': { content: registrySrc },
    'ClauseGuardGate.sol': { content: gateSrc }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
});

const out = JSON.parse(solc.compile(input));

let hasError = false;
(out.errors || []).forEach(e => {
  console.log(e.severity, e.formattedMessage);
  if (e.severity === 'error') hasError = true;
});

if (hasError) {
  process.exit(1);
}

const reg = out.contracts['ClauseGuardRegistry.sol'].ClauseGuardRegistry;
fs.writeFileSync(__dirname + '/ClauseGuardRegistry.abi.json', JSON.stringify(reg.abi, null, 1));
fs.writeFileSync(__dirname + '/ClauseGuardRegistry.bin', reg.evm.bytecode.object);
console.log('built ClauseGuardRegistry', reg.evm.bytecode.object.length / 2, 'bytes');

const gate = out.contracts['ClauseGuardGate.sol'].ClauseGuardGate;
fs.writeFileSync(__dirname + '/ClauseGuardGate.abi.json', JSON.stringify(gate.abi, null, 1));
fs.writeFileSync(__dirname + '/ClauseGuardGate.bin', gate.evm.bytecode.object);
console.log('built ClauseGuardGate', gate.evm.bytecode.object.length / 2, 'bytes');
