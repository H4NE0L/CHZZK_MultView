const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(video) {
  const sent=[], handlers={};let active;
  class Recorder {
    static isTypeSupported(type){return type==='video/webm';}
    constructor(stream,{mimeType}){this.mimeType=mimeType;this.state='inactive';active=this;}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['video'])});this.onstop?.();}
  }
  const ctx=vm.createContext({Blob,Date,MediaRecorder:Recorder,setInterval:()=>1,clearInterval(){},window:{addEventListener:(name,fn)=>handlers[name]=fn},document:{addEventListener:(name,fn)=>handlers[name]=fn,createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:fn=>fn(new Blob(['png'],{type:'image/png'}))})}});
  vm.runInContext(fs.readFileSync('src/shared/messages.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('src/content/media-frame.js','utf8'),ctx);
  const media=ctx.CZMediaFrame.create({uid:'aaaaaa',findVideo:()=>video,send:data=>sent.push(data),seekRange:()=>[0,10],seekBy:delta=>({ok:true,applied:delta})});
  return {media,sent,handlers,active:()=>active};
}
test('screenshot returns a PNG blob and reports missing video dimensions',async()=>{
  const f=fixture({videoWidth:320,videoHeight:180});
  await f.media.command({type:'MEDIA_SCREENSHOT',requestId:1});
  assert.equal(f.sent[0].blob.type,'image/png');assert.equal(f.sent[0].requestId,1);
  const empty=fixture({videoWidth:0});await empty.media.command({type:'MEDIA_SCREENSHOT'});assert.match(empty.sent[0].error,/준비/);
});
test('recording start/stop returns a blob without stopping source player tracks',async()=>{
  let stopped=false;
  const f=fixture({captureStream:()=>({getVideoTracks:()=>[{stop:()=>{stopped=true;}}]})});
  await f.media.command({type:'MEDIA_RECORD',mime:'video/webm',requestId:2});
  assert.equal(f.sent[0].recording,true);
  await f.media.command({type:'MEDIA_STOP'});
  assert.equal(f.sent.at(-1).blob.size,5);assert.equal(f.sent.at(-1).requestId,2);assert.equal(stopped,false);
});
test('unsupported recording format and invalid seek do not fabricate success',async()=>{
  const f=fixture({captureStream(){},currentTime:3});
  await f.media.command({type:'MEDIA_RECORD',mime:'video/mp4'});assert.match(f.sent[0].error,/지원/);
  await f.media.command({type:'MEDIA_SEEK',time:NaN});assert.equal(f.sent[1].ok,false);
});
test('arrow shortcuts avoid chat input and report a three-second command',()=>{
  const f=fixture({});let prevented=false;
  f.handlers.keydown({key:'ArrowLeft',composedPath:()=>[{matches:()=>true}],preventDefault(){prevented=true;}});
  assert.equal(f.sent.length,0);
  f.handlers.keydown({key:'ArrowRight',composedPath:()=>[],preventDefault(){prevented=true;},stopImmediatePropagation(){}});
  assert.equal(prevented,true);assert.equal(f.sent[0].delta,3);
});
test('ordinary CHZZK nested iframe exits before observers, state reports or player mutations',()=>{
  let sent=0;
  const ctx=vm.createContext({URLSearchParams,chrome:{runtime:{getURL:()=> 'chrome-extension://test/'}},window:{top:{},parent:{postMessage:()=>sent++}},location:{search:'',pathname:'/live/aaaaaa',ancestorOrigins:['https://chzzk.naver.com']}});
  vm.runInContext(fs.readFileSync('src/content/chzzk-frame.js','utf8'),ctx);
  assert.equal(sent,0);
});
test('S and R shortcuts report capture/toggle actions and ignore held keys',()=>{
  const f=fixture({});
  const event=key=>({key,composedPath:()=>[],preventDefault(){},stopImmediatePropagation(){}});
  f.handlers.keydown(event('s'));
  f.handlers.keydown({...event('r'),repeat:true});
  f.handlers.keydown(event('r'));
  assert.deepEqual(f.sent.map(message=>message.action),['screenshot','record']);
});
