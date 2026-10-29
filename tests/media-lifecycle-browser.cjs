const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://media.invalid/**',route=>{
   const file=new URL(route.request().url()).pathname.slice(1);
   if(file==='src/viewer/recording-export-worker.js')return route.fulfill({body:"self.onmessage=()=>{setInterval(()=>self.postMessage({type:'progress',percent:1}),25);};",contentType:'application/javascript'});
   if(file==='src/shared/recordings-store.js')return route.fulfill({body:"window.CZRecordings={get:async()=>({blob:new Blob(['test'],{type:'video/webm'}),duration:1,name:'test'})};",contentType:'application/javascript'});
   return route.fulfill({body:fs.readFileSync(path.resolve(file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript'});
  });
  await page.addInitScript(()=>{
   window.chrome={tabs:{getCurrent:async()=>({id:1})},runtime:{sendMessage:async()=>({ok:true})}};
   window.__urls=new Set();window.__workers=[];window.__active=0;window.__beats=0;
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=blob=>{const url=create(blob);__urls.add(url);return url;};URL.revokeObjectURL=url=>{__urls.delete(url);revoke(url);};
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.active=true;__active++;__workers.push(this);this.addEventListener('message',()=>__beats++);}terminate(){if(this.active){this.active=false;__active--;}super.terminate();}};
   HTMLAnchorElement.prototype.click=function(){};
  });
  await page.goto('https://media.invalid/src/viewer/recording.html?id=test');await page.waitForFunction(()=>!document.querySelector('#save').disabled);
  assert.equal(await page.evaluate(()=>__active),0,'worker must remain lazy');assert.equal(await page.evaluate(()=>__urls.size),1);
  await page.locator('#save').click();assert.equal(await page.evaluate(()=>__active),0,'same-format full save does not create Worker');
  await page.locator('#trim').click();assert.equal(await page.evaluate(()=>__active),1);await page.waitForFunction(()=>__beats>0);await page.locator('#cancel').click();await page.waitForFunction(()=>!document.querySelector('#trim').disabled);assert.equal(await page.evaluate(()=>__active),0);
  const beats=await page.evaluate(()=>__beats);await page.locator('#trim').click();await page.waitForFunction(previous=>__beats>previous,beats);await page.evaluate(()=>{const late=__workers.at(-1).onmessage;window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));late({data:{type:'done',buffer:new Uint8Array([1]).buffer,mime:'video/webm'}});});
  await page.waitForFunction(()=>__active===0);assert.equal(await page.evaluate(()=>__urls.size),0);assert.equal(await page.locator('#preview').getAttribute('src'),null);
  const stopped=await page.evaluate(()=>__beats);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>__beats),stopped,'terminated native Worker must stop emitting');
  assert.deepEqual(errors,[]);console.log('PASS: recording Worker is lazy, cancel/close terminate it, late output is ignored and all preview/download URLs are revoked.');
  await page.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
