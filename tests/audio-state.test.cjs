const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const state={masterVolume:.5,mainOnly:false,selectedUid:'A',channels:[{uid:'A',volume:.6,muted:false},{uid:'B',volume:.2,muted:false}]},sent=[];let audible=0;
 const ctx=vm.createContext({CZMessages:{postToPlayer:(frame,message)=>sent.push(message)}});
 vm.runInContext(require('./support/modules.cjs').read('src/viewer/audio.js','utf8'),ctx);
 const tileMap=new Map(state.channels.map(c=>[c.uid,{querySelector:()=>({})}]));
 const audio=ctx.CZAudio.create({state,tileMap,syncVolumeUI(){},saveState(){},saveStateSoon(){},ensureAudible(){audible++;}});
 return {state,sent,audio,audible:()=>audible};
}
test('master mute cycles and command echoes do not collapse individual stored volumes',()=>{
 const f=fixture();f.audio.sendAllTileVolumes();assert.equal(f.sent[0].volume,.3);assert.equal(f.sent[1].volume,.1);
 f.audio.receiveVideoState({uid:'A',reason:'command',volume:0,muted:true});assert.equal(f.state.channels[0].volume,.6);
 f.audio.toggleMasterMute();assert.equal(f.state.masterVolume,0);
 f.audio.receiveVideoState({uid:'A',reason:'player',volume:.9,muted:false});assert.equal(f.state.channels[0].volume,.6);assert.equal(f.sent.at(-1).volume,0);assert.equal(f.sent.at(-1).muted,true);
 f.audio.toggleMasterMute();assert.equal(f.state.masterVolume,.5);assert.equal(f.sent.at(-2).volume,.3);assert.equal(f.sent.at(-1).volume,.1);assert(f.audible()>0);
});
test('forced non-main playback cannot change the main or its own saved volume',()=>{
 const f=fixture();f.audio.setMainOnly(true);
 f.audio.receiveVideoState({uid:'B',reason:'player',volume:0,muted:true});assert.equal(f.state.channels[1].volume,.2);assert.equal(f.state.channels[1].muted,false);assert.equal(f.sent.at(-1).muted,true);
 f.state.channels.push({uid:'C',volume:1,muted:true});f.audio.sendAllTileVolumes();f.state.channels=f.state.channels.filter(c=>c.uid!=='C');f.audio.sendAllTileVolumes();
 assert.equal(f.state.channels[0].volume,.6);assert.equal(f.state.masterVolume,.5);
 f.audio.setMainOnly(false);assert.equal(f.sent.at(-1).muted,false);
});

test('native volume above master is clamped back without changing another tile',()=>{
 const f=fixture();f.audio.receiveVideoState({uid:'A',reason:'player',volume:.9,muted:false});
 assert.equal(f.state.channels[0].volume,1);assert.equal(f.state.channels[1].volume,.2);assert.equal(f.state.masterVolume,.5);assert.equal(f.sent.at(-1).volume,.5);
});

test('native mute represented as zero volume retains the tile volume for unmuting',()=>{
 const f=fixture();f.audio.receiveVideoState({uid:'A',reason:'player',operation:'mute',volume:0,muted:true});
 assert.equal(f.state.channels[0].volume,.6);assert.equal(f.state.channels[0].muted,true);assert.equal(f.sent.at(-1).volume,.3);assert.equal(f.sent.at(-1).muted,true);
});

test('native unmute restoring a site default volume keeps the existing tile level',()=>{
 const f=fixture();f.state.channels[0].muted=true;
 f.audio.receiveVideoState({uid:'A',reason:'player',operation:'mute',volume:1,muted:false});
 assert.equal(f.state.channels[0].volume,.6);assert.equal(f.state.channels[0].muted,false);assert.equal(f.sent.at(-1).volume,.3);
});


test('removal reconciliation keeps remaining audio and releases a tab-level mute only when audible',()=>{
 const f=fixture();f.state.channels=f.state.channels.filter(channel=>channel.uid==='A');
 f.audio.reconcile();assert.equal(f.audible(),1);assert.equal(f.sent.at(-1).volume,.3);assert.equal(f.sent.at(-1).muted,false);
 assert.equal(f.state.masterVolume,.5);assert.equal(f.state.channels[0].volume,.6);
 f.state.masterVolume=0;f.audio.reconcile();assert.equal(f.audible(),1);assert.equal(f.sent.at(-1).muted,true);
});
