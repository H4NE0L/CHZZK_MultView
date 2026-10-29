const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = (process.env.CZ_TEST_ROOT || path.resolve(__dirname,'..'));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const exists = name => assert(fs.existsSync(path.join(root,name)), `missing extension resource ${name}`);
test('manifest and HTML references point to packaged local resources', () => {
  exists(manifest.background.service_worker);
  exists(manifest.action.default_popup);
  Object.values(manifest.icons).forEach(exists);
  manifest.content_scripts.flatMap(s => s.js || []).forEach(exists);
  for (const html of [manifest.action.default_popup,'src/viewer/viewer.html','src/viewer/recording.html','src/settings/backup.html']) {
    const text = fs.readFileSync(path.join(root,html),'utf8');
    for (const [,resource] of text.matchAll(/(?:src|href)="([^"]+)"/g)) exists(path.posix.join(path.posix.dirname(html),resource));
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(text), 'extension CSP requires external scripts');
  }
});
test('CHZZK has an explicit top-level launcher while frame controls remain isolated', () => {
  assert(manifest.permissions.includes('scripting'));
  assert(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
  assert.equal(manifest.content_scripts.length,3);
  assert(!manifest.content_scripts[1].all_frames);
  assert.deepEqual(manifest.content_scripts[1].js,['src/content/site-launcher.js']);
  assert(manifest.web_accessible_resources[0].resources.includes('src/viewer/viewer.css'));
  assert(manifest.content_scripts[0].all_frames);
  assert.equal(manifest.content_scripts[2].world,'MAIN');
  assert.equal(manifest.content_scripts[2].run_at,'document_start');
  assert(!manifest.content_scripts[0].js.some(file => file.includes('/viewer/')));
  assert.equal(manifest.version,'3.0.0');
  assert(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
  assert(manifest.content_security_policy.extension_pages.includes('frame-src https://chzzk.naver.com'));
});
test('compiled package contains runtime scripts without development TypeScript or source maps',()=>{
 const files=fs.readdirSync(root,{recursive:true}).filter(name=>fs.statSync(path.join(root,name)).isFile());
 assert(!files.some(name=>/\.(ts|map)$/.test(name)));
 assert(!files.some(name=>name.includes('node_modules')));
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../config/runtime.json'),'utf8'));
 assert.deepEqual(manifest.content_scripts[0].js,config.frame);
 for(const kind of ['viewer','popup','backup']){
  const html=fs.readFileSync(path.join(root,kind==='backup'?'src/settings/backup.html':`src/${kind}/${kind}.html`),'utf8');
  const actual=[...html.matchAll(/<script src="([^"]+)"/g)].map(([,file])=>path.posix.normalize(`src/${kind==='backup'?'settings':kind}/${file}`));
  assert.deepEqual(actual,config[kind]);
 }
});
test('only runtime entries ship; test exports and bundled implementation modules stay outside dist',()=>{
 for(const file of ['src/viewer/controllers/session.js','src/viewer/models/channel-input.js','src/shared/chat/roles.js','src/shared/media/object-urls.js','src/viewer/audio.js'])assert(!fs.existsSync(path.join(root,file)),file+' should be bundled, not separately shipped');
 const scripts=fs.readdirSync(path.join(root,'src'),{recursive:true}).filter(file=>file.endsWith('.js'));
 for(const file of scripts){
  const text=fs.readFileSync(path.join(root,'src',file),'utf8');assert(!text.includes('__CZTestModule'),file+' contains test exports');
  for(const [,args] of text.matchAll(/\bimportScripts\(([^)]*)\)/g))for(const [,dependency] of args.matchAll(/["']([^"']+)["']/g))exists(path.posix.normalize(path.posix.join('src',path.posix.dirname(file),dependency)));
 }
 const viewer=fs.readFileSync(path.join(root,'src/viewer/viewer.js'),'utf8');
 for(const name of ['CZAudio','CZPlayers','CZMediaTools','CZRuntime','CZViewerSession','CZChannelInputs','CZObjectURLs','CZExportJobs'])assert(!viewer.includes('globalThis.'+name),'temporary global '+name);
 assert(!viewer.includes('mediabunny.min.mjs'),'vendor must remain lazy in export worker');
});
test('stylesheet fragments preserve cascade order and are emitted as the same local stylesheet paths',()=>{
 const repository=path.resolve(__dirname,'..'),styles=require('../config/styles.json');
 for(const [output,inputs] of Object.entries(styles)){
  const expected=inputs.map(file=>fs.readFileSync(path.join(repository,file),'utf8')).join('');assert.equal(fs.readFileSync(path.join(root,output),'utf8'),expected);
  for(const input of inputs)assert(!fs.existsSync(path.join(root,input)),'source CSS fragment shipped separately');
 }
});
