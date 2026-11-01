const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {read}=require('./support/modules.cjs');
function fixture(){let poll,dispose,online=false,fail=false;const frames=new Map(),tileMap=new Map(),buttons=[],reloads=[];const scope={isDisposed:false,interval(fn){poll=fn;},add(fn){dispose=fn;}};
 const context=vm.createContext({Promise,document:{createElement(){const button={hidden:false,disabled:false,setAttribute(){}};buttons.push(button);return button;}},CZChzzkApi:{fetchLiveInfo:async()=>{if(fail)throw Error('network');return {online};}}});vm.runInContext(read('src/viewer/live-tracker.js','utf8'),context);
 const tracker=context.CZLiveTracker.createLiveTracker({scope,tileMap});
 function add(uid,type='live'){const frame={dataset:{},set src(value){reloads.push(uid);}},tile={isConnected:true,querySelector:()=>frame,append(){}};frames.set(uid,frame);tileMap.set(uid,tile);tracker.watch({uid,type,url:'https://chzzk.naver.com/live/'+uid},tile);return tile;}
 return {add,buttons,reloads,tileMap,tracker,scope,poll:()=>poll(),online:value=>online=value,fail:()=>fail=true,dispose(){scope.isDisposed=true;dispose();}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('offline-to-online reconnects only that live tile once and ignores replay/removed tiles',async()=>{
 const f=fixture();f.add('aaaaaa');f.add('video:123','video');await settle();assert.equal(f.buttons.length,1);assert.equal(f.buttons[0].hidden,false);assert.deepEqual(f.reloads,[]);
 f.online(true);await f.poll();assert.deepEqual(f.reloads,['aaaaaa']);assert.equal(f.buttons[0].hidden,true);await f.poll();assert.deepEqual(f.reloads,['aaaaaa']);
 f.online(false);await f.poll();f.tileMap.delete('aaaaaa');f.online(true);await f.poll();assert.deepEqual(f.reloads,['aaaaaa']);f.dispose();
});
test('API failure does not invent OFFLINE or reload a healthy tile; disposed work is ignored',async()=>{
 const f=fixture();f.online(true);f.add('aaaaaa');await settle();assert.equal(f.buttons[0].hidden,true);f.fail();await f.poll();assert.equal(f.buttons[0].hidden,true);assert.deepEqual(f.reloads,[]);f.dispose();await f.poll();assert.deepEqual(f.reloads,[]);
});

test('replacing a queued tile with the same UID retains the new tracking entry',async()=>{
 const f=fixture();f.add('aaaaaa');f.add('bbbbbb');f.add('cccccc');await settle();
 const pending=f.poll();f.add('cccccc');await pending;await settle();f.online(true);await f.poll();assert.deepEqual(f.reloads.sort(),['aaaaaa','bbbbbb','cccccc']);f.dispose();
});
