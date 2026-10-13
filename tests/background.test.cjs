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
  let nextId = 20;
  const base = 'chrome-extension://test/src/viewer/viewer.html';
  const chrome = {
    runtime: {id: 'test', getURL: file => `chrome-extension://test/${file}`, sendMessage: async message => { operations.push(['message', plain(message)]); return response; }},
    windows: {update: async (...args) => operations.push(['focus', ...args])},
    tabs: {
      query: async () => tabs,
      create: async props => {const tab = {id: nextId++, windowId: 4, ...props}; tabs.push(tab); operations.push(['create', props]); return tab;},
      update: async (id, props) => { Object.assign(tabs.find(t => t.id === id), props); operations.push(['update', id, props]); },
      remove: async id => { tabs.splice(tabs.findIndex(t => t.id === id), 1); operations.push(['remove', id]); }
    },
    declarativeNetRequest: {updateSessionRules: async rules => { operations.push(['rules', plain(rules)]); if (failRules) throw Error('rule failure'); }}
  };
  const context = vm.createContext({chrome, URL, console});
  vm.runInContext(source('shared/session-store.js'), context);
  vm.runInContext(source('background/viewer-tabs.js'), context);
  return {manager: context.CZViewerTabs, operations, tabs, base, context, chrome};
}
test('new viewer installs CHZZK subframe rules before loading its dedicated URL', async () => {
  const f = fixture({existing: [{id: 2, url: 'https://chzzk.naver.com/live/aaaaaa'}]});
  assert.equal((await f.manager.open(['aaaaaa', 'aaaaaa', 'https://evil.invalid/'])).ok, true);
  assert.deepEqual(f.operations.map(o => o[0]), ['create','rules','update']);
  const rule = f.operations[1][1].addRules[0];
  assert.deepEqual(rule.condition, {initiatorDomains: ['test'], requestDomains: ['chzzk.naver.com'], resourceTypes: ['sub_frame'], tabIds: [20]});
  assert.equal(new URL(f.tabs[1].url).pathname, '/src/viewer/viewer.html');
  assert.deepEqual(JSON.parse(new URL(f.tabs[1].url).searchParams.get('inputs')), ['https://chzzk.naver.com/live/aaaaaa']);
  assert.equal(f.tabs[0].url, 'https://chzzk.naver.com/live/aaaaaa');
});
test('reuse a viewer without resetting its session when popup has no inputs', async () => {
  const f = fixture(); f.tabs.push({id: 7, windowId: 4, url: f.base});
  assert.equal((await f.manager.open([])).tabId, 7);
  assert(!f.operations.some(o => ['message','create'].includes(o[0])));
  assert.deepEqual(plain(f.operations.find(o => o[0] === 'update')), ['update',7,{active: true}]);
});
test('explicit inputs are routed only to the existing viewer tab', async () => {
  const f = fixture(); f.tabs.push({id: 7, windowId: 4, url: f.base});
  await f.manager.open(['video/12345678']);
  assert.deepEqual(f.operations.find(o => o[0] === 'message')[1], {type:'VIEWER_SET_INPUTS',tabId:7,initialInputs:['https://chzzk.naver.com/video/12345678']});
});
test('simultaneous opens reuse one tab; rules are removed when no viewer remains', async () => {
  const f = fixture();
  const results = await Promise.all([f.manager.open([]),f.manager.open([])]);
  assert.equal(results[0].tabId,results[1].tabId);
  assert.equal(f.operations.filter(o => o[0] === 'create').length, 1);
  f.tabs.length = 0;
  await f.manager.refreshRules();
  assert.deepEqual(f.operations.at(-1)[1], {removeRuleIds:[20001],addRules:[]});
});
test('header-rule failure closes the temporary tab and reports the error', async () => {
  const f = fixture({failRules: true});
  await assert.rejects(f.manager.open(['aaaaaa']), /rule failure/);
  assert.equal(f.tabs.length,0);
  assert.equal(f.operations.at(-1)[0], 'remove');
});

test('loading viewer tabs are reused via pendingUrl rather than creating duplicates', async () => {
  const f = fixture(); f.tabs.push({id:7,windowId:4,url:'about:blank',pendingUrl:f.base+'#favorites'});
  assert.equal((await f.manager.open([])).tabId,7);
  assert(!f.operations.some(o => o[0] === 'create'));
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
