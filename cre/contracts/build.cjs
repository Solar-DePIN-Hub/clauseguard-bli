// Compiles ClauseGuardRegistry.sol with solc 0.8.24 (optimizer 200) -> .abi.json + .bin
const solc = require('solc'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/ClauseGuardRegistry.sol', 'utf8');
const out = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'R.sol': { content: src } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
(out.errors || []).forEach(e => console.log(e.severity, e.formattedMessage));
const c = out.contracts['R.sol'].ClauseGuardRegistry;
fs.writeFileSync(__dirname + '/ClauseGuardRegistry.abi.json', JSON.stringify(c.abi, null, 1));
fs.writeFileSync(__dirname + '/ClauseGuardRegistry.bin', c.evm.bytecode.object);
console.log('built', c.evm.bytecode.object.length / 2, 'bytes');
