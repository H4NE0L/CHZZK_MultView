const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://viewer.invalid/**',route=>route.fulfill({body:'<!doctype html><body><div id="host" class="mv-root"></div>'}));await page.goto('https://viewer.invalid/');
  await page.addStyleTag({content:require('./support/modules.cjs').read('src/viewer/viewer.css','utf8')});
  for(const file of ['src/viewer/screenshot-crop.js','src/viewer/screenshot-gallery.js'])await page.addScriptTag({content:require('./support/modules.cjs').read(file,'utf8')});
  await page.evaluate(()=>{
   window.__downloads=[];window.__closed=0;window.__copied=0;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{__copied++;}}});window.ClipboardItem=class{constructor(value){this.value=value;}};
   window.__newGallery=()=>{window.__gallery=CZScreenshotGallery.create({host:document.querySelector('#host'),download:async(blob,name)=>{if(window.__fail)throw Error('download failed');__downloads.push({size:blob.size,name});if(window.__waiting)await new Promise(resolve=>window.__release=resolve);},onClose:()=>__closed++});};
   window.__add=async name=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;canvas.getContext('2d').fillRect(0,0,120,80);const blob=await new Promise(resolve=>canvas.toBlob(resolve));__gallery.add({blob,name});};__newGallery();
  });
  const ready=async()=>page.locator('.media-body img').evaluate(img=>img.decode());
  await page.evaluate(()=>__add('A'));await ready();await page.locator('.gallery-crop-toggle').click();
  await page.evaluate(()=>__add('B'));await ready();await page.evaluate(()=>__add('C'));await ready();
  await page.locator('.media-copy').click();await page.waitForFunction(()=>__copied===1);assert.equal(await page.evaluate(()=>__copied),1);assert.equal(await page.locator('.gallery-index').textContent(),'3 / 3');
  await page.locator('.media-save').click();await page.waitForFunction(()=>document.querySelector('.gallery-index').textContent==='2 / 2');
  assert.equal(await page.evaluate(()=>__downloads[0].name),'C.png');await ready();
  await page.locator('.media-save').click();await page.waitForFunction(()=>document.querySelector('.gallery-index').textContent==='1 / 1');await ready();
  assert.equal(await page.locator('.gallery-crop-toggle').getAttribute('aria-pressed'),'true','remaining crop state is preserved');
  await page.evaluate(()=>window.__fail=true);await page.locator('.media-save').click();await page.waitForFunction(()=>document.querySelector('.gallery-status').textContent==='download failed');assert.equal(await page.locator('.gallery-index').textContent(),'1 / 1');
  await page.evaluate(()=>window.__fail=false);await page.locator('.media-save').click();await page.locator('.screenshot-gallery').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__closed),1);
  // An image arriving during async saving must remain selected and unsaved.
  await page.evaluate(async()=>{__newGallery();await __add('old');window.__waiting=true;});await ready();await page.locator('.media-save').click();
  await page.waitForFunction(()=>!!window.__release);await page.evaluate(()=>__add('new'));await ready();await page.evaluate(()=>{window.__waiting=false;__release();});
  await page.waitForFunction(()=>document.querySelector('.gallery-index').textContent==='1 / 1');assert(await page.evaluate(()=>__gallery.hasUnsaved()));
  await page.locator('.media-save').click();await page.locator('.screenshot-gallery').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__closed),2);
  await page.evaluate(async()=>{__newGallery();for(let i=0;i<12;i++)await __add('limit-'+i);});await ready();
  const limits=await page.evaluate(async()=>{let message='';try{await __add('overflow');}catch(error){message=error.message;}const size=__gallery.size;__gallery.close();__newGallery();let bytes='';try{__gallery.add({blob:{size:129*1024*1024},name:'too-large'});}catch(error){bytes=error.message;}__gallery.close();return {message,size,bytes};});
  assert.equal(limits.size,12);assert(limits.message.includes('12장'));assert(limits.bytes.includes('128MB'));
  assert.deepEqual(errors,[]);console.log('PASS: copy keeps images, save removes only its image, final save closes, crop state and async capture/failure are preserved.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
