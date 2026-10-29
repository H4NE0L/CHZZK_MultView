const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<div id="chat"><div class="chat-frame-wrap"></div></div><input id="enabled" type="checkbox">');
  await page.evaluate(()=>{
   window.__listeners=new Set();window.__observed=0;window.__pending=[];
   const Observer=ResizeObserver;
   window.ResizeObserver=class extends Observer{observe(target){super.observe(target);window.__observed++;}disconnect(){super.disconnect();window.__observed--;}};
   window.chrome={storage:{local:{get:()=>new Promise(resolve=>__pending.push(resolve)),set:async()=>{}},onChanged:{addListener:fn=>__listeners.add(fn),removeListener:fn=>__listeners.delete(fn)}}};
  });
  for(const file of ['src/shared/runtime/scope.js','src/shared/important-chat.js','src/viewer/chat-renderer.js','src/viewer/important-chat.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  const resources=await page.evaluate(async()=>{
   const host=document.getElementById('chat'),enabledControl=document.getElementById('enabled');
   const state={channels:[],selectedUid:null,chatOpen:false};
   for(let i=0;i<30;i++){
    const panel=CZImportantChatPanel.create({chatPanel:host,enabledControl,getFrame:()=>null,getState:()=>state,notify:()=>{throw Error('Disposed panel notified');}});
    if(__listeners.size!==1 || __observed!==1)throw Error('Missing owned resources');
    panel.dispose();panel.dispose();
    if(__listeners.size || __observed)throw Error('Panel retained a subscription or observer');
   }
   // Storage reads that finish after disposal must not revive a removed panel.
   __pending.splice(0).forEach(resolve=>resolve({}));await Promise.resolve();await Promise.resolve();
   return {listeners:__listeners.size,observers:__observed,panels:host.querySelectorAll('.important-chat-panel,.ic-dialog').length,enabledHandler:enabledControl.onchange};
  });
  assert.deepEqual(resources,{listeners:0,observers:0,panels:0,enabledHandler:null});assert.deepEqual(errors,[]);
  console.log('PASS: 30 chat panel create/dispose cycles release observers, storage subscriptions, DOM and late storage callbacks.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
