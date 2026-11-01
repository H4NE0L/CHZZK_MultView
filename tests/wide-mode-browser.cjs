const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.route('https://viewer.invalid/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<iframe src="https://chzzk.naver.com/live/aaaaaa"></iframe>'}));await page.route('https://chzzk.naver.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><div class="pzp-pc" data-player><video></video></div><aside class="live_chat"><button id="bonus">통나무 보너스 받기</button></aside>'}));await page.goto('https://viewer.invalid/');const frame=page.frames().find(frame=>frame.url().includes('chzzk.naver.com'));
 await frame.evaluate(()=>{
  window.chrome={runtime:{getURL:()=> 'https://viewer.invalid/',sendMessage:async()=>({ok:true})}};
  window.CZPlayerAudio={create:()=>({bind(){},setVolume(){},setMuted(){},dispose(){},snapshot(){return {};}})};window.CZMediaFrame={create:()=>({command(){},dispose(){}})};
  const video=document.querySelector('video');window.__ended=false;Object.defineProperties(video,{readyState:{get:()=>4},ended:{get:()=>__ended},paused:{get:()=>false}});
  window.__modeClicks=0;window.__claims=0;document.querySelector('#bonus').onclick=()=>__claims++;
  window.__starts=0;const interval=setInterval;window.setInterval=(callback,delay,...args)=>{if(delay===500)__starts++;return interval(callback,delay,...args);};
  window.__addMode=()=>{const tip=document.createElement('span');tip.id='modeTip';tip.textContent='넓은 화면 (t / alt + t)';const button=document.createElement('button');button.className='pzp-pc__viewmode-button';button.setAttribute('aria-describedby','modeTip');button.onclick=()=>{__modeClicks++;tip.textContent='기본 화면';document.querySelector('.pzp-pc').classList.add('pzp-pc--viewmode-wide');};document.querySelector('[data-player]').append(button,tip);};
 });
 for(const file of ['src/shared/messages.js','src/content/chzzk-frame.js'])await frame.addScriptTag({content:fs.readFileSync(file,'utf8')});
 const send=async data=>page.evaluate(data=>document.querySelector('iframe').contentWindow.postMessage({source:'chzzk-multiview',...data},'https://chzzk.naver.com'),data);
 await send({type:'PLAYER_OPTIONS',autoWide:false});await send({type:'ENTER_THEATER'});await frame.evaluate(()=>__addMode());await page.waitForTimeout(650);assert.equal(await frame.evaluate(()=>__modeClicks),0,'OFF prevents automatic clicks');
 await send({type:'POWER_REWARDS_CONFIG',enabled:true});await send({type:'PLAYER_OPTIONS',autoWide:true});await frame.waitForFunction(()=>__modeClicks===1);assert.equal(await frame.evaluate(()=>__claims),1,'native bonus can be claimed without leaving wide mode');
 for(let i=0;i<3;i++){await send({type:'PLAYER_OPTIONS',autoWide:true});await send({type:'POWER_REWARDS_CONFIG',enabled:false});await send({type:'ENTER_THEATER'});}
 await page.waitForTimeout(650);assert.equal(await frame.evaluate(()=>__modeClicks),1,'repeated configuration never toggles wide mode back');
 await send({type:'PLAYER_OPTIONS',autoWide:false});await frame.evaluate(()=>{document.querySelector('.pzp-pc__viewmode-button').remove();document.querySelector('#modeTip').remove();document.querySelector('.pzp-pc').classList.remove('pzp-pc--viewmode-wide');});
 await send({type:'PLAYER_OPTIONS',autoWide:true});await frame.evaluate(()=>__addMode());await frame.waitForFunction(()=>__modeClicks===2);
 await send({type:'PLAYER_OPTIONS',autoWide:false});await frame.evaluate(()=>{__ended=true;document.querySelector('.pzp-pc__viewmode-button').remove();});const starts=await frame.evaluate(()=>__starts);await send({type:'PLAYER_OPTIONS',autoWide:true});await send({type:'ENTER_THEATER'});await page.waitForTimeout(100);assert.equal(await frame.evaluate(()=>__starts),starts,'ended broadcasts without a mode button do not start wide polling');
 console.log('PASS: wide mode OFF/ON, described native button, late controls, reward independence, repeated config and ended broadcasts.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
