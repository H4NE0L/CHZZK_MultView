const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture(inject) {
  const listeners = [];
  const context = vm.createContext({console, chrome: {
    scripting: {executeScript: inject},
    cookies: {onChanged: {addListener() {}}},
    runtime: {onInstalled: {addListener() {}}, onStartup: {addListener() {}}, onMessage: {addListener: f => listeners.push(f)}}
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), context);
  return context;
}

test('fallback injection loads the shared store before MultiView in the top frame', async () => {
  let request;
  const context = fixture(async value => { request = value; });
  assert.equal(await vm.runInContext('ensurePageContentScript(42)', context), true);
  assert.deepEqual(JSON.parse(JSON.stringify(request)), {target: {tabId: 42, frameIds: [0]}, files: ['favorites-store.js','chzzk-page.js']});
});

test('fallback reports a failed injection instead of claiming success', async () => {
  const context = fixture(async () => { throw Error('permission denied'); });
  // Expected failure: the background helper catches the browser error.
  context.console = {warn() {}};
  assert.equal(await vm.runInContext('ensurePageContentScript(42)', context), false);
});
