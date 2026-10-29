const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setContent('<button id="normal" class="pzp-pc__viewmode-button" aria-label="기본 화면"></button><div data-player><video></video></div><aside class="live_chat"><button id="claim">통나무 파워 보너스 받기</button><button id="disabled" disabled>보너스 받기</button><button id="advert">광고 보너스 받기</button><button id="bet">통나무 승부예측 참여</button><div data-chat-message><button id="spam">통나무 보너스 받기</button></div></aside>');
  await page.addScriptTag({content:require('./support/modules.cjs').read('src/content/power-rewards.js','utf8')});
  const result=await page.evaluate(()=>{
   const pending=new Map(),clicks={},video=document.querySelector('video');let next=0;
   window.setTimeout=fn=>{pending.set(++next,fn);return next;};window.clearTimeout=id=>pending.delete(id);
   Object.defineProperties(video,{paused:{get:()=>false,configurable:true},ended:{get:()=>false,configurable:true},readyState:{get:()=>4}});
   for(const button of document.querySelectorAll('button'))button.onclick=()=>clicks[button.id]=(clicks[button.id]||0)+1;
   document.querySelector('#normal').onclick=()=>{clicks.normal=(clicks.normal||0)+1;document.querySelector('#normal').setAttribute('aria-label','넓은 화면');};
   const helper=CZPowerRewards.create({findVideo:()=>video});
   const flush=()=>{for(const [id,fn]of [...pending]){pending.delete(id);fn();}};
   helper.configure(true);flush();flush();
   if(clicks.claim!==1||clicks.bet||clicks.spam||clicks.disabled||clicks.advert)throw Error('Unexpected reward clicks');
   const retained=!!document.querySelector('.live_chat'),full=video.closest('[data-player]').classList.contains('cz-power-native-player');
   document.querySelector('#claim').disabled=true;flush();document.querySelector('#claim').disabled=false;flush();
   if(clicks.claim!==2)throw Error('New native bonus state did not re-arm');
   Object.defineProperty(video,'ended',{get:()=>true});flush();
   helper.configure(false);document.querySelector('#normal').setAttribute('aria-label','기본 화면');helper.configure(true);helper.configure(false);helper.dispose();helper.dispose();
   return {retained,full,clicks,timers:pending.size,styled:!!document.querySelector('.cz-power-native-player'),attribute:document.documentElement.hasAttribute('data-cz-power-rewards')};
  });
  assert.deepEqual(result,{retained:true,full:true,clicks:{normal:2,claim:2},timers:0,styled:false,attribute:false});
  console.log('PASS: native reward helper preserves chat, ignores predictions/messages/disabled buttons, latches each bonus and clears timers/styles. Native service success requires logged-in Chrome.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
