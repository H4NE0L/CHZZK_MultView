// Real Chromium encoded audio/video -> worker stream-copy -> decoded output.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://viewer.invalid/**',route=>{const file=new URL(route.request().url()).pathname.slice(1);return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/javascript',body:fs.readFileSync(path.join(process.env.CZ_TEST_ROOT || path.join(__dirname,'..'),file))});});
  await page.goto('https://viewer.invalid/src/viewer/recording.html?id=test');
  // The page has no real Chrome registration; install the fixture then reload UI script.
  await page.evaluate(async()=>{
   window.__Recorder=MediaRecorder;
   window.__makeRecording=async mime=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
   const audio=new AudioContext();await audio.resume();const oscillator=audio.createOscillator(),destination=audio.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();
   const stream=canvas.captureStream(24);stream.addTrack(destination.stream.getAudioTracks()[0]);
   const recorder=new window.__Recorder(stream,{mimeType:mime,videoKeyFrameIntervalDuration:1000});
   const chunks=[];recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};const done=new Promise(resolve=>recorder.onstop=resolve);
   const timer=setInterval(()=>{ctx.fillStyle=`hsl(${Date.now()%360} 80% 50%)`;ctx.fillRect(0,0,320,180);},40);
   recorder.start(100);await new Promise(resolve=>setTimeout(resolve,3300));recorder.stop();await done;clearInterval(timer);stream.getTracks().forEach(track=>track.stop());oscillator.stop();await audio.close();
   return new Blob(chunks,{type:recorder.mimeType});};
   window.__fixture={blob:await window.__makeRecording('video/webm;codecs=vp8,opus'),duration:3.3,name:'[26.10.29]test_title'};
   window.chrome={tabs:{getCurrent:async()=>({id:1})},runtime:{sendMessage:async()=>({ok:true})}};
   window.CZRecordings={get:async()=>window.__fixture};
   window.__saved=[];
   HTMLAnchorElement.prototype.click=function(){window.__saved.push({name:this.download,promise:fetch(this.href).then(response=>response.blob())});};
   document.querySelector('#format').replaceChildren();
  });
  await page.addScriptTag({url:'https://viewer.invalid/src/viewer/recording.js'});
  await page.locator('#trim').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#trim').disabled);
  await page.evaluate(()=>{document.querySelector('#preview').play=()=>{throw Error('Export must not replay');};window.MediaRecorder=function(){throw Error('Export must not re-record');};});
  await page.locator('#save').click();assert.equal(await page.evaluate(async()=> (await __saved[0].promise).size),await page.evaluate(()=>__fixture.blob.size));
  await page.locator('#start').fill('1.2');await page.locator('#end').fill('2.2');await page.locator('#trim').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('구간을 저장했습니다.'));
  const details=await page.evaluate(async()=>{
   const saved=__saved.at(-1),blob=await saved.promise;
   const {Input,BlobSource,ALL_FORMATS}=await import('/src/vendor/mediabunny/mediabunny.min.mjs');
   const input=new Input({source:new BlobSource(blob),formats:ALL_FORMATS});const duration=await input.computeDuration();const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();input.dispose();return {name:saved.name,size:blob.size,duration,video:!!video,audio:!!audio};
  });
  assert(details.size>0);assert(details.video && details.audio,'trim preserves both audio and video');assert(details.duration>0 && details.duration<3.3);assert(details.name.endsWith('_1.2-2.2s.webm'));
  // Verify that the remuxed clip actually decodes, not just that a header exists.
  await page.evaluate(async()=>{const blob=await __saved.at(-1).promise,video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(blob);document.body.append(video);await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Trimmed clip cannot decode'));});window.__decoded={width:video.videoWidth,height:video.videoHeight};});
  assert.equal(await page.evaluate(()=>__decoded.width),320);
  const mp4=await page.evaluate(async()=>{
   const mime=['video/mp4;codecs=avc1,mp4a.40.2','video/mp4'].find(mime=>__Recorder.isTypeSupported(mime));if(!mime)return {unsupported:true};
   const blob=await __makeRecording(mime);
   const result=await new Promise((resolve,reject)=>{const worker=new Worker('/src/viewer/recording-export-worker.js',{type:'module'});worker.onmessage=({data})=>{if(data.type==='done'){worker.terminate();resolve(data);}if(data.type==='error'){worker.terminate();reject(Error(data.error));}};worker.onerror=reject;worker.postMessage({blob,container:'mp4',trim:true,start:1.2,end:2.2});});
   const {Input,BlobSource,ALL_FORMATS}=await import('/src/vendor/mediabunny/mediabunny.min.mjs');const input=new Input({source:new BlobSource(new Blob([result.buffer],{type:result.mime})),formats:ALL_FORMATS});const duration=await input.computeDuration();const audio=!!await input.getPrimaryAudioTrack();input.dispose();return {duration,audio,size:result.buffer.byteLength};
  });
  if(!mp4.unsupported){assert(mp4.audio && mp4.duration>0 && mp4.duration<3.3);console.log('PASS: real MP4 stream-copy trim preserves audio.',mp4);}
  assert(!errors.some(error=>!error.includes('chrome')&&!error.includes('undefined')));
  console.log('PASS: real WebM audio/video worker trim preserves tracks, decodes, keeps filename, and never plays or re-records.',details);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
