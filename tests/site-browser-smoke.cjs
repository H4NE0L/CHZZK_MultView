// Chromium same-origin DOM/media test. CHZZK HTTP and Chrome APIs are mocked.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const files=['src/content/site-context.js',...Array.from(read('src/viewer/viewer.html').matchAll(/<script src="([^"]+)"/g),m=>path.posix.normalize('src/viewer/'+m[1]))];
 await page.exposeFunction('__launch',async()=>{for(const file of files)await page.addScriptTag({content:read(file)});return {ok:true};});
 await page.route('https://viewer.invalid/**',route=>{const file=new URL(route.request().url()).pathname.slice(1);return route.fulfill({contentType:'text/css',body:read(file)});});
 await page.route('https://api.chzzk.naver.com/**',route=>route.fulfill({json:{code:200,content:{status:'OPEN',channelId:'aaaaaa',channelName:'테스트 방송',liveTitle:'테스트',channel:{channelId:'aaaaaa',channelName:'테스트 방송'}}}}));
 await page.addInitScript(()=>{
   // Wait for encoded data instead of racing a fixed 500ms stop timer.
   const NativeRecorder=window.MediaRecorder;
   window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);this.addEventListener('dataavailable',event=>{window.__recordedBytes=(window.__recordedBytes || 0)+event.data.size;});}};
   const data={chzzkMultiviewFavoritesV08:[{uid:'aaaaaa',name:'테스트 방송',group:'기본 그룹',online:true},{uid:'bbbbbb',name:'다른 방송',group:'기본 그룹',online:true}],chzzkFollowingCacheV2:{channels:[{uid:'aaaaaa',name:'테스트 방송',online:true},{uid:'bbbbbb',name:'다른 방송',online:true}]},chzzkMultiviewV09:{channels:[{uid:'aaaaaa',name:'테스트 방송',url:'https://chzzk.naver.com/live/aaaaaa',muted:true,volume:1}],selectedUid:'aaaaaa'}};
   window.__messages=[];
   window.chrome={runtime:{id:'mock',getURL:p=>'https://viewer.invalid/'+p,onMessage:{addListener(){}},sendMessage:async m=>{window.__messages.push(m);if(m.type==='OPEN_MULTIVIEW_ON_SITE')return window.__launch();return {ok:true,tabId:1};}},storage:{local:{get:async keys=>data,set:async values=>Object.assign(data,values)},onChanged:{addListener(){}}}};
 });
 await page.route('https://chzzk.naver.com/**',route=>{
   const frame=new URL(route.request().url()).pathname.startsWith('/live/');
   let body='<h1>CHZZK 원본 페이지</h1>';
   if(frame)body=`<video autoplay muted></video><script>const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');setInterval(()=>{ctx.fillStyle='green';ctx.fillRect(0,0,1920,1080)},40);document.querySelector('video').srcObject=canvas.captureStream(25);</script>`+['src/shared/messages.js','src/content/chat-layout.js','src/content/media-frame.js','src/content/chzzk-frame.js'].map(f=>'<script>'+read(f)+'</script>').join('');
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>'+body+'</body></html>'});
 });
 await page.goto('https://chzzk.naver.com/');await page.addScriptTag({content:read('src/content/site-launcher.js')});
 assert.equal(await page.locator('.mv-root').count(),0);
 const launcher=page.locator('#cz-site-launcher'),launchButton=page.getByRole('button',{name:'멀티뷰 열기',exact:true});
 await page.mouse.move(0,400);
 assert.equal(await launchButton.evaluate(el=>getComputedStyle(el).opacity),'0');
 const launchArea=await launcher.boundingBox();assert.equal(launchArea.y,0);assert(launchArea.height<=12);
 await launchButton.focus();await page.waitForTimeout(180);
 assert.equal(await launchButton.evaluate(el=>getComputedStyle(el).opacity),'1');
 await launchButton.evaluate(el=>el.blur());await page.waitForTimeout(180);
 assert.equal(await launchButton.evaluate(el=>getComputedStyle(el).opacity),'0');
 await launcher.hover();await page.waitForTimeout(180);
 assert.equal(await launchButton.evaluate(el=>getComputedStyle(el).opacity),'1');
 await launchButton.click();
 await page.locator('.mv-root').waitFor();
 await page.waitForFunction(()=>document.getElementById('__chzzk_multiview_v09__').shadowRoot.querySelector('#videoGrid iframe')?.dataset.playerReady==='true');
 assert.equal(page.url(),'https://chzzk.naver.com/');
 assert.equal(await page.locator('.tile-volume-row input').inputValue(),'10');
 assert(await page.locator('.tile-volume-row .tile-mute-btn').evaluate(el=>el.classList.contains('is-muted')));
 await page.locator('#centerControls').hover();
 assert(await page.getByRole('button',{name:'치지직으로 돌아가기'}).isVisible());
 assert(await page.locator('#siteReturnBtn').evaluate(el=>el.previousElementSibling.id==='collapseBtn'));
 await page.locator('#collapseBtn').click();await page.locator('#centerControls').hover();
 assert(await page.locator('#siteReturnBtn').evaluate(el=>getComputedStyle(el).pointerEvents==='auto'));
 await page.locator('#collapseBtn').click();
 assert.equal(await page.locator('#shortcutsEnabled').getAttribute('aria-label'),'멀티뷰 단축키 사용');
 for(const selector of ['.favorite-list-row','.cf-row']){
   await page.locator(selector+'[data-uid="aaaaaa"].in-multiview').waitFor({state:'attached'});
   assert.equal(await page.locator(selector+'[data-uid="bbbbbb"].in-multiview').count(),0);
 }

 await page.locator('.tile-screenshot').click();await page.locator('.screenshot-gallery img').waitFor();await page.locator('.screenshot-gallery img').evaluate(img=>img.decode());
 assert.equal(await page.locator('.gallery-crop-toggle').getAttribute('aria-pressed'),'false');
 await page.locator('.gallery-crop-toggle').click();assert.equal(await page.locator('.gallery-crop-toggle').getAttribute('aria-pressed'),'true');
 // Full-size captures must fit before/after cropping, including short windows.
 for(const height of [800,540]){
   await page.setViewportSize({width:1280,height});
   await page.waitForTimeout(100);
   const geometry=await page.locator('.screenshot-gallery').evaluate(el=>{
     const body=el.querySelector('.media-body'),image=el.querySelector('img'),handle=el.querySelector('.crop-handle.se');
     const b=body.getBoundingClientRect(),i=image.getBoundingClientRect(),h=handle.getBoundingClientRect();
     return {scroll:body.scrollHeight>body.clientHeight || body.scrollWidth>body.clientWidth || el.scrollHeight>el.clientHeight || el.scrollWidth>el.clientWidth,gutter:i.left-b.left,inside:h.right<=b.right && h.bottom<=b.bottom,naturalWidth:image.naturalWidth};
   });
   assert.equal(geometry.scroll,false);assert(geometry.gutter>=9 && geometry.inside);assert.equal(geometry.naturalWidth,1920);
   await page.locator('.gallery-crop-toggle').click();
   const size=await page.locator('.screenshot-gallery img').boundingBox();
   await page.locator('.gallery-crop-toggle').click();
   assert.deepEqual(await page.locator('.screenshot-gallery img').boundingBox(),size);
 }
 await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(100);
 const alignment=await page.locator('.screenshot-gallery').evaluate(el=>{
   const rect=sel=>el.querySelector(sel).getBoundingClientRect(),panel=el.getBoundingClientRect(),nav=rect('.gallery-navigation'),footer=rect('footer'),tool=rect('.gallery-tools'),close=rect('.gallery-close'),box=rect('.screenshot-crop'),handle=rect('.crop-handle.nw');
   return {center:Math.abs(nav.x+nav.width/2-(footer.x+footer.width/2)),bottom:tool.y>panel.y+panel.height/2,top:close.y<panel.y+60,handle:Math.abs(handle.x+handle.width/2-(box.x+1))+Math.abs(handle.y+handle.height/2-(box.y+1))};
 });
 assert(alignment.center<2);assert(alignment.bottom && alignment.top);assert(alignment.handle<2);
 await page.locator('.gallery-close').click();await page.locator('.tile-record').click();
 const recordingFrame=page.frames().find(frame=>new URL(frame.url()).pathname==='/live/aaaaaa');
 await recordingFrame.waitForFunction(()=>window.__recordedBytes>0);await page.locator('.tile-record').click();
 await page.waitForFunction(()=>window.__messages.some(m=>m.type==='SITE_OPEN_RECORDING'));
 const types=await page.evaluate(()=>window.__messages.map(m=>m.type));assert(types.includes('SITE_RECORDING_BEGIN') && types.includes('SITE_RECORDING_CHUNK') && types.includes('SITE_RECORDING_FINISH'));
 await page.locator('.remove-btn').click();
 assert.equal(await page.locator('.favorite-list-row.in-multiview,.cf-row.in-multiview').count(),0);
 await page.locator('#favoriteManager > summary').click();
 await page.locator('.favorite-list-row[data-uid="aaaaaa"] .favorite-list-add').click();
 for(const selector of ['.favorite-list-row','.cf-row'])assert.equal(await page.locator(selector+'[data-uid="aaaaaa"].in-multiview').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: CHZZK top-level launcher, same-origin frame readiness, screenshot capture/layout/crop and recording transfer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
