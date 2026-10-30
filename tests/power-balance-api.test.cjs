const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
function fixture(){const timers=new Map();let next=0;const ctx=vm.createContext({console,AbortController,fetch:()=>{throw Error('unexpected request');},window:new EventTarget(),setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id)});vm.runInContext(require('./support/modules.cjs').read('src/content/chat/power-api.js','utf8'),ctx);return {api:ctx.CZPowerApi,timers};}
const response=(amount=300,overrides={})=>({ok:true,status:200,json:async()=>({code:200,content:{channelId:'channelA',active:true,amount,...overrides}})});
test('confirmed log-power GET reads only a matching active channel amount, with browser credentials',async()=>{
 const {api}=fixture();let request;
 assert.equal(await api.fetchBalance('channelA',{fetchImpl:async(...args)=>{request=args;return response();}}),300);
 assert.equal(request[0],'https://api.chzzk.naver.com/service/v1/channels/channelA/log-power');assert.equal(request[1].method,'GET');assert.equal(request[1].credentials,'include');assert(!('Authorization' in request[1].headers));
 assert.equal(await api.fetchBalance('channelA',{fetchImpl:async()=>response(0)}),0);
 for(const invalid of [response(300,{channelId:'channelB'}),response(300,{active:false}),response('300'),response(-1),response(NaN),{ok:false,status:401}])await assert.rejects(api.fetchBalance('channelA',{fetchImpl:async()=>invalid}));
});
test('balance polling is sequential, owns its deadline, aborts on disposal and ignores late replies',async()=>{
 const f=fixture(),calls=[],values=[];let finish;
 const reader=f.api.create({getUid:()=> 'channelA',onValue:value=>values.push(value),fetchImpl:(_url,options)=>{calls.push(options);return new Promise(resolve=>finish=resolve);}});
 reader.start();reader.start();assert.equal(calls.length,1);assert.equal([...f.timers.values()][0].ms,15000);
 finish(response());await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(values,[300]);assert.equal(f.timers.size,1);
 const wait=[...f.timers.values()][0];assert.equal(wait.ms,30000);wait.fn();assert.equal(calls.length,2);
 reader.dispose();reader.dispose();assert.equal(f.timers.size,0);assert.equal(calls[1].signal.aborted,true);
 finish(response(999));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(values,[300]);assert.equal(f.timers.size,0);
});
