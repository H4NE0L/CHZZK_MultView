const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.route('https://viewer.invalid/**',route=>route.fulfill({body:'<!doctype html><div id="host"></div>'}));
  await page.route('https://chzzk.naver.com/**',route=>route.fulfill({contentType:'text/html',body:`<script>addEventListener('message',event=>{const data=event.data;if(data.type==='POWER_DIAGNOSTICS')parent.postMessage({source:'chzzk-multiview',type:'POWER_DIAGNOSTICS_RESULT',uid:location.pathname.split('/').pop(),requestId:data.requestId,diagnostics:{video:{paused:false,readyState:4},routes:[],buttons:[]}},'https://viewer.invalid');});</script>`}));
  await page.goto('https://viewer.invalid/');for(const file of ['src/shared/messages.js','src/viewer/power-diagnostics.js'])await page.addScriptTag({content:require('./support/modules.cjs').read(file,'utf8')});
  await page.evaluate(()=>{window.chrome={runtime:{getManifest:()=>({version:'3.0.1'})},tabs:{getCurrent:async()=>({mutedInfo:{muted:true,reason:'extension'}})}};Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copied=JSON.parse(text)}});const host=document.querySelector('#host'),tileMap=new Map();for(const uid of ['a','b']){const tile=document.createElement('div'),frame=document.createElement('iframe');frame.onload=()=>{frame.dataset.ready='true';frame.dataset.playerReady='true';};frame.src='https://chzzk.naver.com/live/'+uid;tile.append(frame);host.append(tile);tileMap.set(uid,tile);}window.__power=CZPowerDiagnostics.create({ui:host,tileMap,state:{channels:[{uid:'a',name:'A'},{uid:'b',name:'B'},{uid:'video:1',type:'video',name:'Replay'}]}});addEventListener('message',event=>{const frame=tileMap.get(event.data?.uid)?.querySelector('iframe');if(CZMessages.isPlayerMessage(event,frame))__power.receive(event.data);});});
  await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].every(frame=>frame.dataset.ready==='true'));
  await page.evaluate(()=>__power.open());await page.waitForFunction(()=>[...document.querySelectorAll('.power-diagnostic-rows p')].every(row=>row.textContent.includes('점검 수집됨')));
  assert.equal(await page.locator('.power-diagnostic-rows p').count(),2);assert((await page.locator('.power-diagnostic-help').textContent()).includes('실제 적립 성공을 보장하지 않습니다'));
  await page.locator('.power-diagnostic-copy').click();await page.waitForFunction(()=>!!window.__copied);assert.equal(await page.evaluate(()=>__copied.channels.length),2);assert.deepEqual(await page.evaluate(()=>__copied.tabAudio),{muted:true,reason:'extension'});
  await page.locator('.power-diagnostic-close').click();assert.equal(await page.locator('dialog').isVisible(),false);
  console.log('PASS: on-demand power diagnostics queries every live tile, excludes replay, copies results and closes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
