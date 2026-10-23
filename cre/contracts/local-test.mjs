import ganache from 'ganache';
import { encodeAbiParameters, parseAbiParameters, encodeFunctionData, decodeFunctionResult, encodeDeployData } from 'viem';
import fs from 'fs';
const abi = JSON.parse(fs.readFileSync('./ClauseGuardRegistry.abi.json'));
const P = ganache.provider({ logging:{quiet:true}, chain:{hardfork:'shanghai'} }); const rq=(method,params)=>P.request({method,params});
const [fwd, other] = await rq('eth_accounts',[]);
const dh = await rq('eth_sendTransaction',[{from:fwd, data: encodeDeployData({abi, bytecode:'0x'+fs.readFileSync('./ClauseGuardRegistry.bin','utf8'), args:[fwd]}), gas:'0x2dc6c0'}]);
const addr=(await rq('eth_getTransactionReceipt',[dh])).contractAddress;
const doc='0x'+'a'.repeat(64), rep='0x'+'b'.repeat(64);
const report=encodeAbiParameters(parseAbiParameters('bytes32, bytes32, uint8, uint8, bool, string'),[doc,rep,17,4,true,'clauseguard-rules-2.0.0']);
const data=encodeFunctionData({abi,functionName:'onReport',args:['0x',report]});
const r1=await rq('eth_getTransactionReceipt',[await rq('eth_sendTransaction',[{from:fwd,to:addr,data,gas:'0x1e8480'}])]); console.log('forwarder tx status',r1.status,'logs',r1.logs.length);
try{await rq('eth_call',[{from:other,to:addr,data},'latest']);console.log('BAD')}catch(e){console.log('other sender rejected: OK')}
const out=await rq('eth_call',[{to:addr,data:encodeFunctionData({abi,functionName:'latest',args:[doc]})},'latest']);
console.log(decodeFunctionResult({abi,functionName:'latest',data:out}));
const s=await rq('eth_call',[{to:addr,data:encodeFunctionData({abi,functionName:'supportsInterface',args:['0x805f2132']})},'latest']);console.log('IReceiver iface',s.endsWith('1'));
