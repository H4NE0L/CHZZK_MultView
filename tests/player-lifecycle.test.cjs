const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
function fixture(ready=true){const listeners=new Set(),timers=new Map(),sent=[];let next=0;const ctx=vm.createContext({console,Date,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),window:{addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)},CZMessages:{postToPlayer:(frame,data)=>{sent.push(data);return ready;}}});for(const file of ['src/shared/runtime/scope.js','src/viewer/player-lifecycle.js'])vm.runInContext(require('./support/modules.cjs').read(file,'utf8'),ctx);const scope=new ctx.CZRuntime.ResourceScope(),frame={dataset:{playerReady:'true'},contentWindow:{},remove(){this.removed=true;}};return {api:ctx.CZPlayerLifecycle,scope,frame,sent,timers,listeners,emit:data=>[...listeners].forEach(fn=>fn({origin:'https://chzzk.naver.com',source:frame.contentWindow,data}))};}
test('removed frame stays alive for authorized teardown acknowledgement; duplicate requests coalesce',async()=>{
 const f=fixture(),job=f.api.releasePlayer(f.frame,f.scope,'a');assert.equal(f.api.releasePlayer(f.frame,f.scope,'a'),job);assert.equal(f.sent.length,1);assert(!f.frame.removed);
 f.emit({source:'chzzk-multiview',type:'PLAYER_DISPOSED',uid:'other',requestId:f.sent[0].requestId});assert(!f.frame.removed);
 f.emit({source:'chzzk-multiview',type:'PLAYER_DISPOSED',uid:'a',requestId:f.sent[0].requestId,details:{before:{actual:{ended:true,volume:.2,muted:false}},audio:{observed:1}}});await job;
 assert(f.frame.removed);assert.equal(f.scope.size,0);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.api.recentPlayerTeardowns()[0].status,'acknowledged');assert.equal(f.api.recentPlayerTeardowns()[0].details.before.actual.ended,true);
});
test('unresponsive/unready players and viewer disposal always finish bounded cleanup',async()=>{
 for(const mode of ['timeout','not-ready','viewer-disposed']){
  const f=fixture(mode!=='not-ready'),job=f.api.releasePlayer(f.frame,f.scope,'a');
  if(mode==='timeout')[...f.timers.values()][0]();else if(mode==='viewer-disposed')f.scope.dispose();await job;
  assert(f.frame.removed);assert.equal(f.scope.size,0);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);assert.equal(f.api.recentPlayerTeardowns()[0].status,mode);
 }
});
