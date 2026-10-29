const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=(process.env.CZ_TEST_ROOT || path.resolve(__dirname,'..'));
function fixture(){
  let handler;const calls=[],records=[],remembered=[];
  const context=vm.createContext({CZViewerTabs:{remember:async id=>remembered.push(id)},URL,Blob,Uint8Array,atob,chrome:{runtime:{id:'extension-id',getURL:p=>'chrome-extension://extension-id/'+p,onMessage:{addListener:h=>handler=h}},scripting:{executeScript:async options=>calls.push(options)},tabs:{onRemoved:{addListener(){}},create:async options=>{calls.push(options);return {id:9};},update:async()=>{}},windows:{create:async options=>calls.push(options)}},CZRecordings:{put:async record=>records.push(record)}});
  vm.runInContext(fs.readFileSync(path.join(root,'src/shared/session-store.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'src/background/site-viewer.js'),'utf8'),context);
  const sender={id:'extension-id',frameId:0,url:'https://chzzk.naver.com/',tab:{id:5}};
  return {calls,records,remembered,send:(message,who=sender)=>new Promise(resolve=>{if(handler(message,who,resolve)!==true)resolve(undefined);}),sender};
}
test('site launch requires our top-level CHZZK sender and injects only that frame',async()=>{
  const f=fixture();
  assert.equal(await f.send({type:'OPEN_MULTIVIEW_ON_SITE'},{...f.sender,frameId:2}),undefined);
  assert.equal(await f.send({type:'OPEN_MULTIVIEW_ON_SITE'},{...f.sender,url:'https://foreign.invalid'}),undefined);
  assert.equal((await f.send({type:'OPEN_MULTIVIEW_ON_SITE'})).ok,true);
  assert.deepEqual(f.remembered,[5]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].target)),{tabId:5,frameIds:[0]});
  for(const file of f.calls[0].files)assert(fs.existsSync(path.join(root,file)),file);
});
test('site recording bridge reconstructs binary data across chunks and rejects foreign tab access',async()=>{
  const f=fixture(),id='12345678-1234-1234-1234-123456789abc';
  assert.equal((await f.send({type:'SITE_RECORDING_BEGIN',metadata:{id,name:'[26.10.15]방송_제목'},mime:'video/webm'})).ok,true);
  const data=Buffer.from([0,255,128,1,42]).toString('base64');
  assert.equal((await f.send({type:'SITE_RECORDING_CHUNK',id,data},{...f.sender,tab:{id:6}})).ok,false);
  assert.equal((await f.send({type:'SITE_RECORDING_CHUNK',id,data})).ok,true);
  assert.equal((await f.send({type:'SITE_RECORDING_FINISH',id})).ok,true);
  assert.deepEqual([...new Uint8Array(await f.records[0].blob.arrayBuffer())],[0,255,128,1,42]);
  assert.equal(f.records[0].blob.type,'video/webm');
  assert.equal((await f.send({type:'SITE_RECORDING_FINISH',id})).ok,false);
  assert.equal((await f.send({type:'SITE_OPEN_ORIGINAL',url:'https://foreign.invalid'})).ok,false);
});
