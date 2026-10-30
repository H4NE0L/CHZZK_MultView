const assert=require('node:assert/strict');
module.exports=async function checkAudioIsolation(page){
 const row=page.locator('.tile-volume-row').first(),uid=await row.getAttribute('data-uid');
 const initialVolume=await row.locator('input').inputValue(),initialMuted=await row.locator('.tile-mute-btn').getAttribute('data-state'),initialMaster=await page.locator('#masterVolume').inputValue();
 const frameHandle=await page.locator(`.video-tile[data-uid="${uid}"] iframe`).elementHandle(),frame=await frameHandle.contentFrame();await frameHandle.dispose();
 await frame.waitForFunction(()=>document.querySelector('video')?.dataset.chzzkMvBound==='1');
 const earlyPreferenceCount=await frame.evaluate(()=>window.__earlyPreferenceCount);
 await frame.evaluate(()=>{window.__preferenceWrites=0;document.querySelector('video').addEventListener('volumechange',()=>window.__preferenceWrites++);});
 await page.locator('#volumeManager > summary').click();
 const slider=async(locator,value)=>locator.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await slider(page.locator('#masterVolume'),'50');await slider(row.locator('input'),'60');
 const playing=()=>frame.waitForFunction(()=>Math.abs(document.querySelector('video').volume-.3)<.001 && !document.querySelector('video').muted);
 await playing();
 // Reproduce a site preference/hydration event without a user volume gesture.
 await frame.evaluate(()=>{document.querySelector('video').volume=0;document.querySelector('video').muted=true;});await playing();
 assert.equal(await row.locator('input').inputValue(),'60');assert.equal(await page.locator('#masterVolume').inputValue(),'50');
 await page.locator('#volumeManager > summary').click();
 const routed=await page.evaluate(async()=>{
   if(!window.__messageListeners?.length)return false;
   const root=document.querySelector('#__chzzk_multiview_v09__').shadowRoot;
   const inputs=[...root.querySelectorAll('#videoGrid iframe')].map(frame=>frame.src).concat('audiotest');
   const original=chrome.storage.local.get;let reads=0;
   chrome.storage.local.get=keys=>{if(keys==='chzzkMultiviewV09'){reads++;return Promise.resolve({chzzkMultiviewV09:{channels:[],masterVolume:0}});}return original(keys);};
   try{const result=await new Promise(resolve=>window.__messageListeners[0]({type:'VIEWER_SET_INPUTS',tabId:1,initialInputs:inputs},{id:'mock-extension'},resolve));if(!result?.ok)throw Error('Popup routing failed');if(reads)throw Error('An open viewer reread stale saved audio');}finally{chrome.storage.local.get=original;}
   return true;
 });
 if(!routed){await page.locator('#uidInput').fill('audiotest');await page.locator('#addBtn').click();}
 await page.locator('.video-tile[data-uid="audiotest"]').waitFor();await playing();
 const endingHandle=await page.locator('.video-tile[data-uid="audiotest"] iframe').elementHandle(),ending=await endingHandle.contentFrame();await endingHandle.dispose();
 await ending.waitForFunction(()=>!!document.querySelector('video'));
 await ending.evaluate(()=>{const video=document.querySelector('video');Object.defineProperty(video,'ended',{get:()=>true});video.pause();video.volume=0;video.muted=true;});
 await frame.evaluate(()=>{window.__nativeAudioStorage=0;window.__otherStorage=0;window.addEventListener('storage',event=>{if(event.key==='player-volume'){window.__nativeAudioStorage++;document.querySelector('video').muted=true;}if(event.key==='theme-test')window.__otherStorage++;});window.dispatchEvent(new StorageEvent('storage',{key:'theme-test',newValue:'dark'}));window.dispatchEvent(new StorageEvent('storage',{key:'player-volume',newValue:'0'}));document.querySelector('video').volume=0;document.querySelector('video').muted=true;});

 await frame.evaluate(()=>{window.__removalCommands=[];window.addEventListener('message',event=>{if(['SET_VOLUME','SET_CHAT_VISIBLE'].includes(event.data?.type))window.__removalCommands.push(event.data.type);});});
 await page.locator('.video-tile[data-uid="audiotest"] .remove-btn').click();await playing();assert(!frame.isDetached());
 assert.equal(await frame.evaluate(()=>window.__nativeAudioStorage),0,'sibling preference changes cannot reach native audio storage handlers');
 assert.equal(await frame.evaluate(()=>window.__otherStorage),1,'unrelated native storage events still work');
 assert.deepEqual(await frame.evaluate(()=>window.__removalCommands),[],'unrelated tile removal sends no volume or chat reset commands to surviving player');
 await page.locator('#volumeManager > summary').click();
 await page.locator('#masterMuteBtn').click();
 await frame.waitForFunction(()=>document.querySelector('video').volume===0 && document.querySelector('video').muted);
 await frame.evaluate(()=>{document.querySelector('video').volume=.9;document.querySelector('video').muted=false;});
 await frame.waitForFunction(()=>document.querySelector('video').volume===0 && document.querySelector('video').muted);
 assert.equal(await row.locator('input').inputValue(),'60');
 await page.locator('#masterMuteBtn').click();await playing();
 assert.equal(await frame.evaluate(()=>window.__preferenceWrites),0,'extension commands must not reach site preference listeners');
 if(typeof earlyPreferenceCount==='number')assert.equal(await frame.evaluate(()=>window.__earlyPreferenceCount),earlyPreferenceCount,'pre-existing native listeners must also be isolated');
 await frame.evaluate(()=>{const button=document.createElement('button');button.id='audioMuteTest';button.textContent='직접 음소거 검사';button.style.cssText='position:fixed;top:60px;left:12px;z-index:2147483647';button.onclick=()=>{const video=document.querySelector('video');const muted=video.muted || video.volume===0;video.volume=muted?1:0;video.muted=!muted;};document.body.appendChild(button);});
 await frame.locator('#audioMuteTest').click({force:true});
 await page.waitForFunction(channel=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector(`.tile-volume-row[data-uid="${channel}"] .tile-mute-btn`).dataset.state==='m',uid);
 assert.equal(await row.locator('input').inputValue(),'60','native mute must retain the tile volume');
 await frame.locator('#audioMuteTest').click({force:true});await playing();
 assert.equal(await row.locator('input').inputValue(),'60','native unmute must not replace the remembered volume');
 await row.locator('.tile-mute-btn').click();await row.locator('.tile-mute-btn').click();await playing();await frame.evaluate(()=>document.querySelector('#audioMuteTest').remove());
 await slider(page.locator('#masterVolume'),initialMaster);await slider(row.locator('input'),initialVolume);
 if(initialMuted==='m')await row.locator('.tile-mute-btn').click();
 await page.locator('#volumeManager > summary').click();
 console.log('PASS: external zero/mute echoes, add/remove and master mute preserve independent tile volume.');
};
