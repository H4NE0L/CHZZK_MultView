const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.CZ_TEST_ROOT||path.resolve(__dirname,'../dist');
function setup(){
 const timers=new Map(),intervals=new Map(),listeners=new Map(),requests=[],notices=[],signals=[];let id=0;
 const context=vm.createContext({console,Blob,Date,URL,AbortController,fetch:async(_url,options)=>{signals.push(options.signal);return {ok:false};},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:id=>intervals.delete(id),window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},chrome:{storage:{local:{get:async()=>({})}}},MediaRecorder:{isTypeSupported:mime=>mime.startsWith('video/webm')},CZMessages:{postToPlayer:(frame,message)=>{requests.push(message);return true;}}});
 vm.runInContext(require('./support/modules.cjs').read(path.join(root,'src/viewer/media-tools.js'),'utf8'),context);
 const media=context.CZMediaTools.create({state:{channels:[{uid:'aaaaaa',name:'A'}],selectedUid:'aaaaaa'},ui:null,tileMap:new Map([['aaaaaa',{querySelector:()=>null}]]),showNotice:value=>notices.push(value)});
 return {media,timers,intervals,listeners,requests,notices,signals};
}
test('media controller limits in-flight screenshots and clears timers/listeners on disposal',async()=>{
 const f=setup();for(let i=0;i<12;i++)f.media.screenshot('aaaaaa');assert.equal(f.requests.length,2);assert(f.notices.some(value=>value.includes('처리 중')));
 f.media.dispose();f.media.dispose();assert.equal(f.timers.size,0);assert.equal(f.intervals.size,0);assert.equal(f.listeners.size,0);
 f.media.receive({type:'MEDIA_KEY',uid:'aaaaaa',action:'screenshot'});assert.equal(f.requests.length,2);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.timers.size,0);
});
test('recording guard includes results in flight and detached tiles release request state',()=>{
 const f=setup();f.media.toggleRecording('aaaaaa');assert(f.media.isRecording('aaaaaa'));
 f.media.receive({type:'MEDIA_STATE',uid:'aaaaaa',recording:false});assert(f.media.isRecording('aaaaaa'),'stop acknowledgment must not allow tile removal before result arrives');
 assert.equal(f.media.canDisplay([],'grid'),false);assert.equal(f.media.canDisplay([{uid:'aaaaaa'}],'main-sub'),true);
 f.media.detach('aaaaaa');assert.equal(f.media.hasRecordings(),false);f.media.dispose();assert.equal(f.timers.size,0);assert.equal(f.intervals.size,0);
});

test('failed screenshot responses cancel metadata requests instead of retaining them',()=>{
 const f=setup();f.media.screenshot('aaaaaa');const request=f.requests[0];assert.equal(f.signals[0].aborted,false);
 f.media.receive({type:'MEDIA_RESULT',uid:'aaaaaa',requestId:request.requestId,kind:'screenshot',error:'capture failed'});
 assert.equal(f.signals[0].aborted,true);assert(f.notices.includes('capture failed'));f.media.dispose();assert.equal(f.timers.size,0);
});
