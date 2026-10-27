const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const events={},reports=[],timers=new Map();let seq=0;
 let video={volume:1,muted:true,addEventListener(type,fn){this[type]=fn;}};
 const ctx=vm.createContext({Date,setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),document:{addEventListener(type,fn){events[type]=fn;}},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync('src/content/player-audio.js','utf8'),ctx);
 const audio=ctx.CZPlayerAudio.create({findVideo:()=>video,report:(v,reason,operation)=>reports.push({reason,operation,volume:v.volume,muted:v.muted})});const bind=audio.bind;audio.bind=v=>{v.volumechange=()=>events.volumechange({target:v,stopImmediatePropagation(){}});bind(v);};audio.bind(video);
 return {audio,reports,events,get video(){return video;},set video(v){video=v;},flush(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}}};
}
test('site initialization and zero-volume preference echoes cannot overwrite desired audio',()=>{
 const f=fixture();f.audio.setVolume(.3,false);f.video.volume=0;f.video.muted=true;f.video.volumechange();
 assert(!f.reports.some(r=>r.reason==='player'));f.flush();assert.equal(f.video.volume,.3);assert.equal(f.video.muted,false);
 assert.equal(f.audio.setVolume(NaN,false),false);assert.equal(f.video.volume,.3);
});
test('native volume controls report user changes but generic clicks do not grant audio intent',()=>{
 const f=fixture();f.audio.setVolume(.3,false);
 f.events.click({isTrusted:true,target:{closest:()=>false}});f.video.muted=true;f.video.volumechange();f.flush();assert.equal(f.video.muted,false);
 f.events.click({isTrusted:false,target:{closest:()=>true}});f.video.volume=.1;f.video.volumechange();f.flush();assert.equal(f.video.volume,.3);
 f.events.click({isTrusted:true,target:{closest:()=>true}});f.video.volume=.2;f.video.volumechange();assert.equal(f.reports.at(-1).reason,'player');assert.equal(f.reports.at(-1).volume,.2);
});
test('new media elements inherit desired audio and stale video events are ignored',()=>{
 const f=fixture();f.audio.setVolume(.25,false);const old=f.video;
 f.video={volume:0,muted:true,addEventListener(type,fn){this[type]=fn;}};f.audio.bind(f.video);
 assert.equal(f.video.volume,.25);assert.equal(f.video.muted,false);
 const count=f.reports.length;old.muted=true;old.volumechange();assert.equal(f.reports.length,count);
});
test('forced mute from the viewer wins over a recent native control gesture',()=>{
 const f=fixture();f.audio.setVolume(.4,false);f.events.click({isTrusted:true,target:{closest:()=>true}});
 f.audio.setVolume(0,true);f.video.volume=.7;f.video.muted=false;f.video.volumechange();f.flush();assert.equal(f.video.volume,0);assert.equal(f.video.muted,true);
 assert(!f.reports.some(r=>r.reason==='player'));
});

test('unlabelled native player buttons and identical layout commands preserve mute gestures',()=>{
 const f=fixture();f.audio.setVolume(.3,false);
 const button={tagName:'BUTTON',closest:()=>false,matches:selector=>selector.includes('button')};
 f.events.click({isTrusted:true,target:button,composedPath:()=>[button]});
 f.video.muted=true;f.audio.setVolume(.3,false);assert.equal(f.video.muted,true);
 f.video.volumechange();assert.equal(f.reports.at(-1).reason,'player');assert.equal(f.reports.at(-1).muted,true);
});

test('volume slider zero remains a volume adjustment rather than a mute button',()=>{
 const f=fixture();f.audio.setVolume(.3,false);
 const range={tagName:'INPUT',closest:()=>true,matches:selector=>selector.includes('input')};
 f.events.input({isTrusted:true,target:range,composedPath:()=>[range]});f.video.volume=0;f.video.muted=true;f.video.volumechange();
 assert.equal(f.reports.at(-1).operation,'volume');
});
