const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture() {
  const data = {};
  const context = vm.createContext({URL, chrome: {storage: {local: {get: async () => data, set: async value => Object.assign(data,value)}}}});
  for (const name of ['session-store','messages']) vm.runInContext(fs.readFileSync(path.join(__dirname, `../src/shared/${name}.js`),'utf8'),context);
  return {store:context.CZSessionStore, messages:context.CZMessages, data};
}
test('legacy session migration retains mute, per-tile/master volume, layout and selected main', async () => {
  const {store,data} = fixture();
  data.chzzkMultiviewV09 = {channels:[{uid:'aaaaaa',muted:false,volume:.4},{uid:'video:12345678',muted:true,volume:.7}],selectedUid:'video:12345678',layout:'main-sub',masterVolume:.5,mainOnly:true,chatSide:'left',chatOpen:false};
  const state = await store.read();
  assert.equal(state.channels[0].muted,false);
  assert.equal(state.channels[0].volume,.4);
  assert.equal(state.channels[1].url,'https://chzzk.naver.com/video/12345678');
  assert.equal(state.selectedUid,'video:12345678');
  assert.equal(state.layout,'main-sub');
  assert.equal(state.masterVolume,.5);
  assert.equal(state.mainOnly,true);
  assert.equal(state.chatOpen,false);
  await store.write(state);
  assert.equal(data.chzzkMultiviewV09.channels[0].muted,false);
});
test('session rejects foreign URLs, duplicate players and out-of-range selection/volume', () => {
  const {store} = fixture();
  const result = store.normalize({channels:[{uid:'aaaaaa',volume:99},{uid:'aaaaaa'},{uid:'bbbbbb',url:'https://evil.invalid/live/bbbbbb'}],selectedUid:'bbbbbb',masterVolume:-1});
  assert.equal(result.channels.length,1);
  assert.equal(result.selectedUid,'aaaaaa');
  assert.equal(result.channels[0].volume,1);
  assert.equal(result.masterVolume,0);
});
test('frame messages must match CHZZK origin AND the actual player window', () => {
  const {messages} = fixture();
  const source = {}, frame = {contentWindow:source};
  const event = {origin:'https://chzzk.naver.com',source,data:{source:'chzzk-multiview',type:'VIDEO_STATE',uid:'aaaaaa',muted:false,volume:.5,reason:'player'}};
  assert(messages.isPlayerMessage(event,frame));
  assert(!messages.isPlayerMessage({...event,source:{}},frame));
  assert(!messages.isPlayerMessage({...event,origin:'https://evil.invalid'},frame));
  assert(!messages.isPlayerMessage({...event,data:{...event.data,volume:NaN}},frame));
  assert(!messages.isPlayerMessage(event,null));
});
test('frame accepts commands only from its extension parent', () => {
  const {messages} = fixture(); const parent = {};
  const origin = 'chrome-extension://test';
  const event = {origin,source:parent,data:{source:'chzzk-multiview',type:'SET_VOLUME'}};
  assert(messages.isParentCommand(event,origin,parent));
  assert(!messages.isParentCommand({...event,origin:'https://chzzk.naver.com'},origin,parent));
  assert(!messages.isParentCommand({...event,source:{}},origin,parent));
});
test('outgoing commands wait for readiness and skip inherited extension-origin documents', () => {
  const {messages} = fixture(), sent = [];
  const win = {location:{origin:'chrome-extension://test'},postMessage:(...args)=>sent.push(args)};
  const frame = {dataset:{},contentWindow:win}, command = {type:'SET_VOLUME'};
  assert.equal(messages.postToPlayer(frame,command),false);
  frame.dataset.playerReady='true';
  assert.equal(messages.postToPlayer(frame,command),false);
  assert.equal(sent.length,0);
  Object.defineProperty(win,'location',{get(){throw Error('Cross-origin access denied');}});
  assert.equal(messages.postToPlayer(frame,command),true);
  assert.equal(sent[0][1],'https://chzzk.naver.com');
  frame.dataset.playerReady='false';
  assert.equal(messages.postToPlayer(frame,command),false);
  assert.equal(sent.length,1);
});
test('media shortcuts use physical S/R keys across keyboard layouts and ignore held/modified input',()=>{
  const {messages}=fixture();
  assert.equal(messages.mediaShortcut({key:'ㄴ',code:'KeyS'}),'s');
  assert.equal(messages.mediaShortcut({key:'R',code:'KeyR'}),'r');
  assert.equal(messages.mediaShortcut({key:'r',code:'KeyR',repeat:true}),null);
  assert.equal(messages.mediaShortcut({key:'s',code:'KeyS',ctrlKey:true}),null);
  assert.equal(messages.mediaShortcut({key:'s',code:'KeyS',isComposing:true}),null);
});
test('general shortcuts normalize all requested physical keys and shortcut preferences migrate/persist',()=>{
  const {messages,store}=fixture();
  for(const key of ['F','H','B','V','G','C'])assert.equal(messages.mediaShortcut({key,code:'Key'+key}),key.toLowerCase());
  assert.equal(store.normalize({}).shortcutsEnabled,true);
  assert.equal(store.normalize({shortcutsEnabled:false}).shortcutsEnabled,false);
});
