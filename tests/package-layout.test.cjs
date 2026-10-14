const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const exists = name => assert(fs.existsSync(path.join(root,name)), `missing extension resource ${name}`);
test('manifest and HTML references point to packaged local resources', () => {
  exists(manifest.background.service_worker);
  exists(manifest.action.default_popup);
  Object.values(manifest.icons).forEach(exists);
  manifest.content_scripts.flatMap(s => s.js || []).forEach(exists);
  for (const html of [manifest.action.default_popup,'src/viewer/viewer.html']) {
    const text = fs.readFileSync(path.join(root,html),'utf8');
    for (const [,resource] of text.matchAll(/(?:src|href)="([^"]+)"/g)) exists(path.posix.join(path.posix.dirname(html),resource));
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(text), 'extension CSP requires external scripts');
  }
});
test('only frame control runs on CHZZK; homepage overlay and scripting injection are removed', () => {
  assert(!manifest.permissions.includes('scripting'));
  assert(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
  assert.equal(manifest.content_scripts.length,1);
  assert(manifest.content_scripts[0].all_frames);
  assert(!manifest.content_scripts[0].js.some(file => file.includes('/viewer/')));
  assert.equal(manifest.version,'2.0.1');
  assert(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
  assert(manifest.content_security_policy.extension_pages.includes('frame-src https://chzzk.naver.com'));
});
