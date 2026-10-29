const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(fail=false){let handler;const calls=[];const context=vm.createContext({URL,Number,chrome:{runtime:{id:'own',onMessage:{addListener:fn=>handler=fn}},scripting:{executeScript:async value=>{calls.push(value);if(fail)throw Error('blocked');}}}});vm.runInContext(fs.readFileSync('src/background/chat-metadata.js','utf8'),context);return {handler,calls};}
test('chat source metadata is injected only into our requesting CHZZK chat subframe',async()=>{
 const f=fixture(),sender={id:'own',url:'https://chzzk.naver.com/live/abcd/chat?multiview=1',tab:{id:3},frameId:7};let reply;
 assert.equal(f.handler({type:'CHAT_METADATA_INIT'},sender,value=>reply=value),true);await new Promise(resolve=>setImmediate(resolve));assert(reply.ok);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{target:{tabId:3,frameIds:[7]},world:'MAIN',files:['src/content/chat-metadata-main.js']});
 for(const invalid of [{...sender,id:'foreign'},{...sender,frameId:0},{...sender,url:'https://evil.invalid/live/abcd/chat'},{...sender,url:'https://chzzk.naver.com/live/abcd'},{...sender,tab:undefined}])assert.equal(f.handler({type:'CHAT_METADATA_INIT'},invalid,()=>assert.fail('must not reply as authorized')),undefined);
 assert.equal(f.calls.length,1);
});
test('chat metadata injection failure reports an error instead of fabricating timestamps',async()=>{const f=fixture(true);let reply;f.handler({type:'CHAT_METADATA_INIT'},{id:'own',url:'https://chzzk.naver.com/live/abcd/chat',tab:{id:3},frameId:7},value=>reply=value);await new Promise(resolve=>setImmediate(resolve));assert.equal(reply.ok,false);});
