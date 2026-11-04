const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),modules=require('./support/modules.cjs');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.setContent('<video id="idle" style="display:none"></video><div class="pzp-pc"><video id="live" style="width:640px;height:360px"></video><video id="preload" hidden></video></div>');
 await page.addScriptTag({content:modules.read('src/content/player-video.js','utf8')});await page.addScriptTag({content:fs.readFileSync('src/content/player-audio.js','utf8')});
 const result=await page.evaluate(()=>{
  const idle=document.querySelector('#idle'),live=document.querySelector('#live'),preload=document.querySelector('#preload');
  Object.defineProperty(live,'readyState',{get:()=>4});const reports=[];
  const audio=CZPlayerAudio.create({findVideo:()=>CZPlayerVideo.findPlaybackVideo(),report:(v,reason)=>reports.push({id:v.id,reason,volume:v.volume,muted:v.muted})});
  audio.setVolume(.2,false);for(const video of [idle,live,preload])audio.bind(video);
  const original=CZPlayerVideo.findPlaybackVideo().id,volume=live.volume,untouched=idle.volume===1&&preload.volume===1;
  const ad=document.createElement('video');ad.id='ad';ad.hidden=true;document.body.prepend(ad);audio.bind(ad);
  const afterAd=CZPlayerVideo.findPlaybackVideo().id;
  live.remove();preload.hidden=false;Object.defineProperty(preload,'readyState',{get:()=>4});audio.bind(preload);
  const replacement=CZPlayerVideo.findPlaybackVideo().id,replacementVolume=preload.volume;
  audio.dispose();return {original,volume,untouched,afterAd,replacement,replacementVolume};
 });
 assert.deepEqual(result,{original:'live',volume:.2,untouched:true,afterAd:'live',replacement:'preload',replacementVolume:.2});
 console.log('PASS: actual playback selection skips idle/ad videos, retains active audio and promotes replacement media.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
