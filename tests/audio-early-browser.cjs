const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 for(const early of [false,true]){
  const page=await browser.newPage();await page.setContent('<video></video><button class="volume-control">볼륨 변경</button>');
  let session=null,contextId=null;
  if(early){session=await page.context().newCDPSession(page);const {frameTree}=await session.send('Page.getFrameTree');({executionContextId:contextId}=await session.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'CZAudioTest'}));}
  const run=async fn=>{
   if(!early)return page.evaluate(fn);
   const result=await session.send('Runtime.evaluate',{contextId,expression:'('+fn.toString()+')()',returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;
  };
  const load=async file=>{const source=fs.readFileSync(file,'utf8');if(early){const result=await session.send('Runtime.evaluate',{contextId,expression:source});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);}else await page.addScriptTag({content:source});};
  if(early)await load('src/content/player-audio-early.js');
  await page.evaluate(()=>{window.__nativeCalls=0;window.__fight=true;window.__reports=[];window.addEventListener('volumechange',()=>{__nativeCalls++;if(__fight){const video=document.querySelector('video');video.volume=0;video.muted=true;}},true);window.addEventListener('storage',event=>{if(event.key==='player-volume'){document.querySelector('video').volume=0;document.querySelector('video').muted=true;}},true);});
  await load('src/content/player-audio.js');
  await run(()=>{window.__reports=[];window.__audio=CZPlayerAudio.create({findVideo:()=>document.querySelector('video'),report:(video,reason)=>__reports.push({volume:video.volume,muted:video.muted,reason})});__audio.bind(document.querySelector('video'));__audio.setVolume(.4,false);});
  await page.waitForTimeout(350);
  if(!early){assert(await page.evaluate(()=>__nativeCalls>4),'late capture reproduces native preference fight');await page.close();continue;}
  assert.equal(await page.evaluate(()=>__nativeCalls),0,'early Window capture precedes native Window capture');
  await page.evaluate(()=>{window.dispatchEvent(new StorageEvent('storage',{key:'player-volume',newValue:'0'}));const video=document.querySelector('video');video.volume=0;video.muted=true;});
  await page.waitForFunction(()=>document.querySelector('video').volume===.4&&!document.querySelector('video').muted);
  await run(()=>{for(let i=0;i<80;i++)__audio.setVolume(.6,false);});await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>__nativeCalls),0);const snapshot=await run(()=>__audio.snapshot());assert.equal(snapshot.earlyCapture,true);assert.equal(snapshot.actual.volume,.6);assert.equal(snapshot.desired.volume,.6);assert(snapshot.counts.reports<10);assert((await run(()=>__reports.length))<10,'identical commands and queued events do not flood parent messages');
  await page.evaluate(()=>{__fight=false;document.querySelector('button').onclick=()=>document.querySelector('video').volume=.25;});await page.locator('button').click();
  await page.waitForTimeout(100);assert(await run(()=>__reports.some(report=>report.reason==='player'&&report.volume===.25)));
  assert(await page.evaluate(()=>__nativeCalls>0),'real native volume gesture still reaches site handlers');await page.close();
 }
 console.log('PASS: late native Window capture reproduces audio fight; isolated-world document-start capture prevents it, blocks sibling storage mute, bounds reports and preserves native gestures.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
