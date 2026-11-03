const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('audio context observation preserves constructor semantics, retains at most 16 weak entries and closes only explicitly',async()=>{
 let closed=0,resumed=0;class Native{constructor(){this.state='running';this.currentTime=1;this.sampleRate=48000;}resume(){resumed++;}close(){closed++;this.state='closed';return Promise.resolve();}}
 const ctx=vm.createContext({window:{top:{}},document:{documentElement:{getAttribute:()=>null},addEventListener:()=>{}},AudioContext:Native,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(process.env.CZ_TEST_ROOT||path.resolve(__dirname,'../dist'),'src/content/audio-runtime-main.js'),'utf8'),ctx);
 const instances=Array.from({length:20},()=>new ctx.AudioContext());assert(instances.every(context=>context instanceof Native));assert.equal(closed,0);assert.equal(resumed,0);assert.equal(ctx.__CZAudioRuntime.snapshot().contexts.length,16);
 await ctx.__CZAudioRuntime.close();assert.equal(closed,16);assert.equal(resumed,0);assert(ctx.__CZAudioRuntime.snapshot().contexts.every(context=>context.state==='closed'));
});
