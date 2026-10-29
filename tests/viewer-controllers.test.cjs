const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=process.env.CZ_TEST_ROOT||path.resolve(__dirname,'../dist'),plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const timers=new Map(),listeners=new Set(),sent=[],opened=[];let next=0;
 const context=vm.createContext({console,URL,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),chrome:{storage:{local:{}},tabs:{getCurrent:async()=>({id:11})},runtime:{id:'own',sendMessage:async message=>{sent.push(plain(message));return message.type==='SITE_VIEWER_TAB'?{ok:true,tabId:22}:{ok:true};},onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}}});
 for(const file of ['shared/runtime/scope','shared/session-store','viewer/controllers/session','viewer/models/channel-input'])vm.runInContext(require('./support/modules.cjs').read(path.join(root,'src/'+file+'.js'),'utf8'),context);
 const state=context.CZSessionStore.normalize({channels:[{uid:'aaaaaa',volume:.3,muted:false}],masterVolume:.8}),scope=new context.CZRuntime.ResourceScope();
 const session=context.CZViewerSession.create({state,scope,open:async inputs=>opened.push(plain(inputs))});
 return {context,state,scope,session,timers,listeners,sent,opened};
}
test('session coalesces slider saves, captures current state and removes pending work at disposal',async()=>{
 const f=fixture();await f.session.register(false);assert.equal(f.session.tabId,11);
 f.session.saveSoon();f.session.saveSoon();assert.equal(f.timers.size,1);f.state.masterVolume=.6;
 [...f.timers.values()][0]();assert.equal(f.timers.size,0);
 assert.equal(f.sent.filter(m=>m.type==='VIEWER_SAVE_STATE').length,1);assert.equal(f.sent.at(-1).state.masterVolume,.6);
 f.session.saveSoon();f.scope.dispose();assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
 const count=f.sent.length;f.session.saveSoon();f.session.save();assert.equal(f.sent.length,count);
});
test('session routes snapshots and list replacement only for this extension and registered tab',async()=>{
 const f=fixture();await f.session.register(true);assert.equal(f.session.tabId,22);const receive=[...f.listeners][0],sender={id:'own'};let result;
 receive({type:'VIEWER_GET_STATE',tabId:22},sender,value=>result=value);assert.equal(result.ok,false);
 f.session.markReady();result=null;
 assert.equal(receive({type:'VIEWER_GET_STATE',tabId:22},{id:'foreign'},value=>result=value),undefined);assert.equal(result,null);
 receive({type:'VIEWER_GET_STATE',tabId:23},sender,value=>result=value);assert.equal(result,null);
 receive({type:'VIEWER_GET_STATE',tabId:22},sender,value=>result=value);assert.equal(result.state.masterVolume,.8);
 assert.equal(receive({type:'VIEWER_SET_INPUTS',tabId:22,initialInputs:['bbbbbb']},sender,value=>result=value),true);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.opened,[['bbbbbb']]);assert.equal(result.ok,true);f.scope.dispose();
});
test('requested channels replace the list, preserve surviving audio and resolve favorite names without mutating input',()=>{
 const f=fixture(),current=[{uid:'aaaaaa',name:'기존 이름',title:'기존 이름',volume:.23,muted:false},{uid:'cccccc',volume:.7,muted:true}],before=structuredClone(current);
 const next=plain(f.context.CZChannelInputs.requestedChannels(['bbbbbb','aaaaaa','https://chzzk.naver.com/live/bbbbbb','https://evil.invalid/'],current,[{uid:'bbbbbb',name:'즐겨찾기 이름'}]));
 assert.deepEqual(next.map(c=>c.uid),['bbbbbb','aaaaaa']);assert.equal(next[0].name,'즐겨찾기 이름');assert.equal(next[1].volume,.23);assert.equal(next[1].muted,false);assert.equal(next[1].name,'기존 이름');assert.deepEqual(current,before);f.scope.dispose();
});
test('requested replay and live inputs remain separate and use canonical CHZZK addresses',()=>{
 const f=fixture(),next=plain(f.context.CZChannelInputs.requestedChannels(['video/12345678','aaaaaa','https://chzzk.naver.com/video/12345678'],[],[]));
 assert.deepEqual(next.map(c=>c.uid),['video:12345678','aaaaaa']);assert.equal(next[0].url,'https://chzzk.naver.com/video/12345678');assert.equal(next[0].type,'video');f.scope.dispose();
});
