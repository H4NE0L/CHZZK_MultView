const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
test('latest sync is a live-only explicit command and preserves numeric adjustments',()=>{
 const commands=[],channels=[{uid:'liveA'},{uid:'vod',type:'video'}],frame={contentWindow:{}},ctx=vm.createContext({console,Map,Date,setTimeout(){},CZMessages:{postToPlayer:(_frame,data)=>commands.push(data)}});
 vm.runInContext(require('./support/modules.cjs').read('src/viewer/sync.js','utf8'),ctx);
 const sync=ctx.CZSync.create({state:{channels},ui:null,tileMap:new Map([['liveA',{querySelector:()=>frame}],['vod',{querySelector:()=>frame}]]),showNotice(){},escapeHtml:x=>x,displayChannelName:x=>x.uid});
 sync.adjustSync('liveA','latest');assert.equal(commands.length,1);assert.equal(commands[0].latest,true);assert.equal(commands[0].delta,0);
 sync.adjustSync('vod','latest');sync.adjustSync('missing','latest');sync.adjustSync('liveA',NaN);assert.equal(commands.length,1);
 sync.adjustSync('liveA',0.5);assert.equal(commands[1].latest,false);assert.equal(commands[1].delta,0.5);
});
