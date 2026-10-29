const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){let handler;const calls=[];vm.runInNewContext(require('./support/modules.cjs').read('src/background/power-diagnostics.js','utf8'),{URL,Number,chrome:{runtime:{id:'own',onMessage:{addListener:fn=>handler=fn}},scripting:{executeScript:async value=>{calls.push(value);return [{result:{video:{paused:false}}}];}}}});return {handler,calls};}
test('power diagnostics reads only the requesting authorized live player subframe',async()=>{
 const f=fixture(),sender={id:'own',url:'https://chzzk.naver.com/live/abcd',frameId:7,tab:{id:3}};let reply;
 assert.equal(f.handler({type:'POWER_DIAGNOSTICS'},sender,value=>reply=value),true);await new Promise(resolve=>setImmediate(resolve));assert(reply.ok);assert.equal(f.calls[0].world,'MAIN');assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].target)),{tabId:3,frameIds:[7]});
 for(const invalid of [{...sender,id:'foreign'},{...sender,frameId:0},{...sender,url:'https://chzzk.naver.com/live/abcd/chat'},{...sender,url:'https://evil.invalid/live/abcd'},{...sender,tab:undefined}])assert.equal(f.handler({type:'POWER_DIAGNOSTICS'},invalid,()=>assert.fail()),undefined);
 assert.equal(f.calls.length,1);
});
test('power snapshot strips request secrets and never triggers native reward buttons',()=>{
 const f=fixture(),sender={id:'own',url:'https://chzzk.naver.com/live/abcd',frameId:7,tab:{id:3}};f.handler({type:'POWER_DIAGNOSTICS'},sender,()=>{});const snapshot=f.calls[0].func;
 const button={className:'bonus',disabled:false,closest:()=>null,querySelectorAll:()=>[],getAttribute:key=>key==='aria-label'?'통나무 파워 보너스 받기':null,click:()=>assert.fail('read only')};
 const output=vm.runInNewContext('('+snapshot.toString()+')()',{URL,Date,document:{visibilityState:'visible',hasFocus:()=>false,querySelector:selector=>selector==='video'?{paused:false,ended:false,readyState:4,muted:true}:null,querySelectorAll:()=>[button]},performance:{getEntriesByType:()=>[{name:'https://api.chzzk.naver.com/service/v1/power/abcdefabcdefabcdefabcd?token=SECRET&uid=PRIVATE',initiatorType:'fetch',responseStatus:200},{name:'https://evil.invalid/secret',initiatorType:'fetch'}]},getComputedStyle:()=>({display:'none'})});
 assert.equal(output.buttons.length,1);assert.equal(output.routes.length,1);assert(!JSON.stringify(output).includes('SECRET'));assert(!JSON.stringify(output).includes('PRIVATE'));assert(output.routes[0].path.endsWith('/:id'));
});
