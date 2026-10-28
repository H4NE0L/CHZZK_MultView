const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(url){const updates=[];const ctx=vm.createContext({URL,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p},tabs:{get:async()=>({url,mutedInfo:{muted:true}}),update:async(id,props)=>updates.push({id,props})}}});vm.runInContext(fs.readFileSync('src/background/audible-tabs.js','utf8'),ctx);return {unmute:ctx.CZAudibleTabs.unmute,updates};}
test('explicit volume use can unmute the correct site or extension tab',async()=>{
 const site=setup('https://chzzk.naver.com/live/test');assert((await site.unmute({id:'test',frameId:0,tab:{id:7},url:'https://chzzk.naver.com/live/test'})).ok);assert.equal(site.updates[0].id,7);
 const url='chrome-extension://test/src/viewer/viewer.html',ext=setup(url);assert((await ext.unmute({id:'test',url},8)).ok);assert.equal(ext.updates[0].id,8);
});
test('child players, foreign senders and unrelated tabs cannot unmute another tab',async()=>{
 const f=setup('https://unrelated.invalid');
 await assert.rejects(f.unmute({id:'foreign',frameId:0,url:'https://chzzk.naver.com',tab:{id:7}}));
 await assert.rejects(f.unmute({id:'test',frameId:2,url:'https://chzzk.naver.com/live/test',tab:{id:7}}));
 await assert.rejects(f.unmute({id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},7));assert.equal(f.updates.length,0);
});
