const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();await page.setContent('<video id="source" muted autoplay></video>');
  await page.addScriptTag({content:fs.readFileSync('src/shared/messages.js','utf8')});await page.addScriptTag({content:fs.readFileSync('src/content/media-frame.js','utf8')});
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');
   const timer=setInterval(()=>{ctx.fillStyle=`hsl(${Date.now()%360} 80% 50%)`;ctx.fillRect(0,0,1920,1080);},16);
   const sourceStream=canvas.captureStream(60),source=document.querySelector('#source');const audio=new AudioContext();await audio.resume();const oscillator=audio.createOscillator(),destination=audio.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();sourceStream.addTrack(destination.stream.getAudioTracks()[0]);source.srcObject=sourceStream;await source.play();
   await new Promise(resolve=>{if(source.videoWidth)resolve();else source.onloadeddata=resolve;});
   let draws=0;const nextFrame=source.requestVideoFrameCallback.bind(source);source.requestVideoFrameCallback=fn=>nextFrame((...args)=>{draws++;fn(...args);});
   const messages=[];let finish;const done=new Promise(resolve=>finish=resolve);
   const media=CZMediaFrame.create({uid:'test',findVideo:()=>source,send:message=>{messages.push(message);if(message.kind==='recording' && message.requestId===1)finish(message);},seekRange:()=>null,seekBy:()=>({ok:false})});
   await media.command({type:'MEDIA_RECORD',requestId:1,mime:'video/webm;codecs=vp8',profile:'balanced'});
   await new Promise(resolve=>setTimeout(resolve,700));await media.command({type:'MEDIA_RECORD',requestId:2,mime:'video/webm;codecs=vp8',profile:'balanced'});if(!messages.some(message=>message.requestId===2 && message.error))throw Error('duplicate recording was not rejected');await new Promise(resolve=>setTimeout(resolve,700));await media.command({type:'MEDIA_STOP'});const recording=await done;
   if(recording.error)throw Error(recording.error);
   const output=document.createElement('video');output.muted=true;output.src=URL.createObjectURL(recording.blob);document.body.append(output);await new Promise((resolve,reject)=>{output.onloadeddata=resolve;output.onerror=reject;});
   await output.play();
   const result={audioTracks:output.captureStream().getAudioTracks().length,sourceAudio:sourceStream.getAudioTracks()[0].readyState,draws,width:output.videoWidth,height:output.videoHeight,size:recording.blob.size,sourcePlaying:!source.paused,sourceTrack:sourceStream.getVideoTracks()[0].readyState};
   clearInterval(timer);sourceStream.getTracks().forEach(track=>track.stop());oscillator.stop();await audio.close();return result;
  });
  assert(result.draws>15,'capture continues receiving source frames');assert.equal(result.audioTracks,1,'balanced recording retains audio');assert.equal(result.sourceAudio,'live');assert.equal(result.width,1280);assert.equal(result.height,720);assert(result.size>0 && result.sourcePlaying);assert.equal(result.sourceTrack,'live');console.log('PASS: balanced recording outputs 720p and stopping never stops the source player.',result);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
