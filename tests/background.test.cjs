const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture({existing = [], failRules = false, response = {ok: true}} = {}) {
  const operations = [];
  const tabs = [...existing];
  let nextId = 20;const storage={};
  const base = 'chrome-extension://test/src/viewer/viewer.html';
  const chrome = {
    runtime: {id: 'test', getURL: file => `chrome-extension://test/${file}`, sendMessage: async message => { operations.push(['message', plain(message)]); return response; }},
    windows: {create:async props=>{const tab={id:nextId++,windowId:nextId+100,url:props.url};tabs.push(tab);operations.push(['window',props]);return {id:tab.windowId,tabs:[tab]};},remove:async id=>{for(let i=tabs.length-1;i>=0;i--)if(tabs[i].windowId===id)tabs.splice(i,1);operations.push(['removeWindow',id]);}},
    storage:{local:{get:async key=>({[key]:storage[key]}),set:async values=>Object.assign(storage,plain(values)),remove:async key=>{delete storage[key];}}},
    tabs: {
      query: async options => options?.windowId!=null?tabs.filter(tab=>tab.windowId===options.windowId):tabs,
      get:async id=>{const tab=tabs.find(tab=>tab.id===id);if(!tab)throw Error("tab missing");return tab;},
      create: async props => {const tab = {id: nextId++, windowId: 4, ...props}; tabs.push(tab); operations.push(['create', props]); return tab;},
      update: async (id, props) => { Object.assign(tabs.find(t => t.id === id), props); operations.push(['update', id, props]); },
      remove: async id => { tabs.splice(tabs.findIndex(t => t.id === id), 1); operations.push(['remove', id]); }
    },
    declarativeNetRequest: {updateSessionRules: async rules => { operations.push(['rules', plain(rules)]); if (failRules) throw Error('rule failure'); }}
  };
  const context = vm.createContext({chrome, URL, console});
  vm.runInContext(source('shared/session-store.js'), context);
  vm.runInContext(source('background/viewer-tabs.js'), context);
  return {manager: context.CZViewerTabs, operations, tabs, base, context, chrome,storage};
}
test('new viewer installs CHZZK subframe rules before loading its dedicated URL', async () => {
  const f = fixture({existing: [{id: 2, url: 'https://chzzk.naver.com/live/aaaaaa'}]});
  assert.equal((await f.manager.open(['aaaaaa', 'aaaaaa', 'https://evil.invalid/'])).ok, true);
  assert.deepEqual(f.operations.map(o => o[0]), ['window','rules','update']);
  const rule = f.operations[1][1].addRules[0];
  assert.deepEqual(rule.condition, {initiatorDomains: ['test'], requestDomains: ['chzzk.naver.com'], resourceTypes: ['sub_frame'], tabIds: [20]});
  assert.equal(new URL(f.tabs[1].url).pathname, '/src/viewer/viewer.html');
  assert.deepEqual(JSON.parse(new URL(f.tabs[1].url).searchParams.get('inputs')), ['https://chzzk.naver.com/live/aaaaaa']);
  assert.equal(f.tabs[0].url, 'https://chzzk.naver.com/live/aaaaaa');
});
test('every popup open creates a separate window and leaves existing players untouched',async()=>{
 const f=fixture({existing:[{id:7,windowId:4,url:'chrome-extension://test/src/viewer/viewer.html'}]});
 const first=await f.manager.open([]),second=await f.manager.open(['video/12345678']);
 assert.notEqual(first.tabId,second.tabId);assert.notEqual(first.windowId,second.windowId);
 assert.equal(f.operations.filter(op=>op[0]==='window').length,2);
 assert(!f.operations.some(op=>op[0]==='update' && op[1]===7));
 assert(!f.operations.some(op=>op[0]==='message' && op[1].type==='VIEWER_SET_INPUTS'));
 const rule=f.operations.filter(op=>op[0]==='rules').at(-1)[1].addRules[0];
 assert.deepEqual(rule.condition.tabIds,[7,first.tabId,second.tabId]);
 assert.deepEqual(f.storage[f.manager.OWNER_KEY],{tabId:second.tabId});
 assert.deepEqual(JSON.parse(new URL(f.tabs.at(-1).url).searchParams.get('inputs')),['https://chzzk.naver.com/video/12345678']);
});
test('new-tab selection creates tabs in the current window without reusing viewers',async()=>{
 const f=fixture(),window=await f.manager.open([]),tab=await f.manager.open(['aaaaaa'],{target:'tab'});
 assert.notEqual(window.tabId,tab.tabId);assert.equal(tab.windowId,4);
 assert.equal(f.operations.filter(op=>op[0]==='window').length,1);assert.equal(f.operations.filter(op=>op[0]==='create').length,1);
 assert.deepEqual(f.storage[f.manager.OWNER_KEY],{tabId:tab.tabId});
 assert.deepEqual(f.operations.filter(op=>op[0]==='rules').at(-1)[1].addRules[0].condition.tabIds,[window.tabId,tab.tabId]);
});
test('failed new-tab navigation closes only the temporary tab and restores the latest writer',async()=>{
 const f=fixture(),first=await f.manager.open([]);f.chrome.tabs.update=async()=>{throw Error('navigation failed');};
 await assert.rejects(f.manager.open([],{target:'tab'}),/navigation failed/);
 assert.equal(f.tabs.length,1);assert.equal(f.tabs[0].id,first.tabId);assert.equal(f.storage[f.manager.OWNER_KEY].tabId,first.tabId);
 assert.equal(f.operations.filter(op=>op[0]==='removeWindow').length,0);
});
test('simultaneous opens create distinct windows and rules are removed when none remain',async()=>{
 const f=fixture(),results=await Promise.all([f.manager.open([]),f.manager.open([])]);
 assert.notEqual(results[0].tabId,results[1].tabId);f.tabs.length=0;await f.manager.refreshRules();
 assert.deepEqual(f.operations.at(-1)[1],{removeRuleIds:[20001],addRules:[]});
});
test('header-rule failure closes the temporary tab and reports the error', async () => {
  const f = fixture({failRules: true});
  await assert.rejects(f.manager.open(['aaaaaa']), /rule failure/);
  assert.equal(f.tabs.length,0);
  assert(f.operations.some(op=>op[0]==='removeWindow'));
  assert.equal(f.storage[f.manager.OWNER_KEY],undefined);
});

test('loading existing viewers retain rules but are not reused',async()=>{
 const f=fixture({existing:[{id:7,windowId:4,url:'about:blank',pendingUrl:'chrome-extension://test/src/viewer/viewer.html#favorites'}]});
 const result=await f.manager.open([]);assert.notEqual(result.tabId,7);
 assert.deepEqual(f.operations.find(op=>op[0]==='rules')[1].addRules[0].condition.tabIds,[7,result.tabId]);
});
test('only the most recently opened viewer can save, including late saves on close',async()=>{
 const f=fixture(),first=await f.manager.open([]),second=await f.manager.open([]);
 const sender=id=>({id:'test',url:f.base,frameId:0,tab:{id}});
 assert.equal((await f.manager.session({type:'VIEWER_SAVE_STATE',tabId:second.tabId,state:{channels:[{uid:'bbbbbb'}]}},sender(second.tabId))).saved,true);
 assert.equal((await f.manager.session({type:'VIEWER_SAVE_STATE',tabId:first.tabId,state:{channels:[{uid:'aaaaaa'}]}},sender(first.tabId))).saved,false);
 assert.equal(f.storage.chzzkMultiviewV09.channels[0].uid,'bbbbbb');
 await f.manager.session({type:'VIEWER_REGISTER_SESSION',tabId:first.tabId},sender(first.tabId));
 assert.equal(f.storage[f.manager.OWNER_KEY].tabId,second.tabId,'reloading older window cannot take ownership');
 f.tabs.splice(f.tabs.findIndex(tab=>tab.id===second.tabId),1);
 assert.equal((await f.manager.session({type:'VIEWER_SAVE_STATE',tabId:first.tabId,state:{}},sender(first.tabId))).saved,false);
 assert.equal(f.storage.chzzkMultiviewV09.channels[0].uid,'bbbbbb');
});
test('opening snapshots live state before ownership changes, without waiting for debounce',async()=>{
 const f=fixture(),first=await f.manager.open([]);
 f.chrome.runtime.sendMessage=async message=>{assert.equal(message.type,'VIEWER_GET_STATE');assert.equal(message.tabId,first.tabId);return {ok:true,state:{channels:[{uid:'aaaaaa',volume:.63}],masterVolume:.42}};};
 const second=await f.manager.open([]);
 assert.equal(f.storage.chzzkMultiviewV09.channels[0].volume,.63);assert.equal(f.storage.chzzkMultiviewV09.masterVolume,.42);
 assert.equal(f.storage[f.manager.OWNER_KEY].tabId,second.tabId);
});
test('site viewer snapshot is addressed to its top content frame before opening a window',async()=>{
 const f=fixture({existing:[{id:3,url:'https://chzzk.naver.com/live/aaaaaa'}]});await f.manager.remember(3);
 f.chrome.tabs.sendMessage=async(id,message,options)=>{assert.equal(id,3);assert.equal(message.type,'VIEWER_GET_STATE');assert.equal(options.frameId,0);return {ok:true,state:{channels:[{uid:'cccccc'}]}};};
 const viewer=await f.manager.open([]);assert.equal(f.storage.chzzkMultiviewV09.channels[0].uid,'cccccc');assert.equal(f.storage[f.manager.OWNER_KEY].tabId,viewer.tabId);
});
test('latest closing window can finish its final save even after its tab disappears',async()=>{
 const f=fixture(),viewer=await f.manager.open([]);f.tabs.length=0;
 const result=await f.manager.session({type:'VIEWER_SAVE_STATE',tabId:viewer.tabId,state:{masterVolume:.37}},{id:'test',url:f.base});
 assert.equal(result.saved,true);assert.equal(f.storage.chzzkMultiviewV09.masterVolume,.37);
});
test('failed navigation removes only the new window and restores the previous writer',async()=>{
 const f=fixture(),first=await f.manager.open([]);
 f.chrome.tabs.update=async()=>{throw Error('navigation failed');};
 await assert.rejects(f.manager.open([]),/navigation failed/);
 assert.equal(f.tabs.length,1);assert.equal(f.tabs[0].id,first.tabId);
 assert.equal(f.storage[f.manager.OWNER_KEY].tabId,first.tabId);
});
test('session saves reject foreign origins, child frames and mismatched tab IDs',async()=>{
 const f=fixture(),viewer=await f.manager.open([]),message={type:'VIEWER_SAVE_STATE',tabId:viewer.tabId,state:{}};
 for(const sender of [{id:'foreign',url:f.base,tab:{id:viewer.tabId}},{id:'test',url:'https://evil.invalid',tab:{id:viewer.tabId}},{id:'test',url:'https://chzzk.naver.com/live/aaaaaa',frameId:1,tab:{id:viewer.tabId}},{id:'test',url:f.base,tab:{id:99}}])await assert.rejects(f.manager.session(message,sender));
 assert.equal((await f.manager.session(message,{id:'test',url:f.base})).saved,true,'extension tab sender can be resolved with getCurrent tab ID');
});

test('service-worker entry imports local modules and routes an authorized popup request', async () => {
  const f = fixture();
  const listeners = [];
  const addListener = () => {};
  f.chrome.cookies = {get: async () => null, onChanged: {addListener}};
  Object.assign(f.chrome.runtime, {onMessage: {addListener: fn => listeners.push(fn)}, onInstalled: {addListener}, onStartup: {addListener}});
  Object.assign(f.chrome.tabs, {onUpdated: {addListener}, onRemoved: {addListener}});
  f.context.importScripts = (...names) => names.forEach(name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background',name),'utf8'),f.context));
  vm.runInContext(source('background/background.js'),f.context);
  const result = await new Promise(resolve => {
    assert.equal(listeners[0]({type:'OPEN_MULTIVIEW_FROM_POPUP',initialInputs:['aaaaaa']},{id:'test'},resolve),true);
  });
  assert.equal(result.ok,true);
  assert(f.tabs[0].url.startsWith(f.base));
  assert.equal(listeners[0]({type:'OPEN_MULTIVIEW_FROM_POPUP'},{id:'foreign'},() => assert.fail('unauthorized response')),undefined);
});
