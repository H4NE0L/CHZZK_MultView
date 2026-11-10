const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const ctx=vm.createContext({Date});vm.runInContext(require('./support/modules.cjs').read('src/shared/media/filename.js','utf8'),ctx);const api=ctx.CZMediaFilename;
const data={channel:'방송인',title:'오늘 방송',uid:'abc123',date:new Date(2026,10,10,9,8,7)};
test('media filename defaults preserve existing names and local date/time tokens',()=>{
 assert.equal(api.formatMediaName(undefined,'screenshot',data),'방송인_오늘 방송_20261110090807');
 assert.equal(api.formatMediaName(undefined,'recording',data),'[26.11.10]방송인_오늘 방송');
 assert.equal(api.formatMediaName('{uid}_{date}_{time}_{YY}','recording',data),'abc123_2026-11-10_09-08-07_26');
});
test('media filename validates placeholders and leaves extension selection to the downloader',()=>{
 for(const bad of ['',null,'{unknown}','{date','x.png','x.MP4','x'.repeat(201)])assert(api.templateError(bad));
 assert.equal(api.templateError('정리_{channel}_{HH}{mm}{ss}'),'');
 assert.equal(api.normalizeTemplate('{bad}','recording'),api.DEFAULT_RECORDING_NAME);
});
test('media filename handles unsafe Windows names, trailing dots, emoji and metadata literally',()=>{
 assert.equal(api.formatMediaName('CON','screenshot',data),'_CON');
 assert.equal(api.formatMediaName('..','screenshot',data),'CHZZK');
 assert.equal(api.formatMediaName('사진_{title}. ','screenshot',{...data,title:'a/b:c*?'}),'사진_a_b_c__');
 assert.equal(api.formatMediaName('{title}','screenshot',{...data,title:'{channel}'}),'{channel}');
 const value=api.formatMediaName('a'.repeat(179)+'{title}','screenshot',{...data,title:'😀'.repeat(70)});assert(value.length<=180);assert(!/[\ud800-\udbff]$/.test(value));
});
