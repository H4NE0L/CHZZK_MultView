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
   const data={chzzkMultiviewV09:{channels:[{uid:'aaaaaa',name:'테스트 방송',url:'https://chzzk.naver.com/live/aaaaaa',muted:true,volume:1}],selectedUid:'aaaaaa'}};
   window.__messages=[];
   window.chrome={runtime:{id:'mock',getURL:p=>'https://viewer.invalid/'+p,onMessage:{addListener(){}},sendMessage:async m=>{window.__messages.push(m);if(m.type==='OPEN_MULTIVIEW_ON_SITE')return window.__launch();return {ok:true,tabId:1};}},storage:{local:{get:async keys=>data,set:async values=>Object.assign(data,values)},onChanged:{addListener(){}}}};
 });
 await page.route('https://chzzk.naver.com/**',route=>{
   const frame=new URL(route.request().url()).pathname.startsWith('/live/');
   let body='<h1>CHZZK 원본 페이지</h1>';
   if(frame)body=`<video autoplay muted></video><script>const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');setInterval(()=>{ctx.fillStyle='green';ctx.fillRect(0,0,320,180)},40);document.querySelector('video').srcObject=canvas.captureStream(25);</script>`+['src/shared/messages.js','src/content/chat-layout.js','src/content/media-frame.js','src/content/chzzk-frame.js'].map(f=>'<script>'+read(f)+'</script>').join('');
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>'+body+'</body></html>'});
 });
 await page.goto('https://chzzk.naver.com/');await page.addScriptTag({content:read('src/content/site-launcher.js')});
 assert.equal(await page.locator('.mv-root').count(),0);
 await page.getByRole('button',{name:'통합관제실 열기',exact:true}).click();
 await page.locator('.mv-root').waitFor();
 await page.waitForFunction(()=>document.getElementById('__chzzk_multiview_v09__').shadowRoot.querySelector('#videoGrid iframe')?.dataset.playerReady==='true');
 assert.equal(page.url(),'https://chzzk.naver.com/');
 assert(await page.getByRole('button',{name:'치지직으로 돌아가기'}).isVisible());
 await page.locator('.tile-screenshot').click();await page.locator('.screenshot-gallery img').waitFor();await page.locator('.screenshot-gallery img').evaluate(img=>img.decode());
 assert.equal(await page.locator('.gallery-crop-toggle').getAttribute('aria-pressed'),'false');
 await page.locator('.gallery-crop-toggle').click();assert.equal(await page.locator('.gallery-crop-toggle').getAttribute('aria-pressed'),'true');
 const alignment=await page.locator('.screenshot-gallery').evaluate(el=>{
   const rect=sel=>el.querySelector(sel).getBoundingClientRect(),panel=el.getBoundingClientRect(),nav=rect('.gallery-navigation'),footer=rect('footer'),tool=rect('.gallery-tools'),close=rect('.gallery-close'),box=rect('.screenshot-crop'),handle=rect('.crop-handle.nw');
   return {center:Math.abs(nav.x+nav.width/2-(footer.x+footer.width/2)),bottom:tool.y>panel.y+panel.height/2,top:close.y<panel.y+60,handle:Math.abs(handle.x+handle.width/2-(box.x+1))+Math.abs(handle.y+handle.height/2-(box.y+1))};
 });
 assert(alignment.center<2);assert(alignment.bottom && alignment.top);assert(alignment.handle<2);
 await page.locator('.gallery-close').click();await page.locator('.tile-record').click();
 await page.waitForTimeout(500);await page.locator('.tile-record').click();
 await page.waitForFunction(()=>window.__messages.some(m=>m.type==='SITE_OPEN_RECORDING'));
 const types=await page.evaluate(()=>window.__messages.map(m=>m.type));assert(types.includes('SITE_RECORDING_BEGIN') && types.includes('SITE_RECORDING_CHUNK') && types.includes('SITE_RECORDING_FINISH'));
 assert.deepEqual(errors,[]);
 console.log('PASS: CHZZK top-level launcher, same-origin frame readiness, screenshot capture/layout/crop and recording transfer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
