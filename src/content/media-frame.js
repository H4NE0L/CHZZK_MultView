// Media work stays inside the CHZZK document that owns the video element.
globalThis.CZMediaFrame = {create({uid, findVideo, send, seekRange, seekBy, chatOnly=false}) {
  let shortcutsEnabled=true;
  let recorder = null, chunks = [], startedAt = 0, bytes = 0,stopCapture=()=>{};
  const reply = (requestId, kind, result) => send({type:'MEDIA_RESULT',uid,requestId,kind,...result});
  function position() {
    const video=findVideo(), range=video && seekRange(video);
    if (range && Number.isFinite(video.currentTime)) send({type:'MEDIA_TIME',uid,start:range[0],end:range[1],time:video.currentTime});
    else send({type:'MEDIA_TIME',uid,canSeek:false});
  }
  async function command(data) {
    if(data.type==='MEDIA_SHORTCUTS'){shortcutsEnabled=data.enabled!==false;return;}
    const video=findVideo();let initializing=false;
    try {
      if(data.type==='MEDIA_STOP') {
        if(recorder && recorder.state!=='inactive')recorder.stop();
        else throw Error('진행 중인 녹화가 없습니다.');
        return;
      }
      if (!video) throw Error('재생 중인 영상을 찾을 수 없습니다.');
      if (data.type==='MEDIA_SCREENSHOT') {
        if (!video.videoWidth || !video.videoHeight) throw Error('영상이 준비된 뒤 다시 시도하세요.');
        const canvas=document.createElement('canvas'); canvas.width=video.videoWidth;canvas.height=video.videoHeight;
        canvas.getContext('2d').drawImage(video,0,0);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if (!blob) throw Error('이미지를 추출할 수 없습니다.');
        reply(data.requestId,'screenshot',{blob});
      } else if (data.type==='MEDIA_RECORD') {
        if (recorder) throw Error('이미 녹화 중입니다.');
        initializing=true;
        if (!video.captureStream || !MediaRecorder.isTypeSupported(data.mime)) throw Error('이 환경에서는 선택한 녹화 형식을 지원하지 않습니다.');
        let stream=video.captureStream();
        if (!stream.getVideoTracks().length) throw Error('녹화할 영상 트랙이 없습니다.');
        const options={mimeType:data.mime,videoKeyFrameIntervalDuration:2000};
        if(data.profile==='balanced'){
          if(!video.videoWidth || !video.videoHeight)throw Error('영상이 준비된 뒤 다시 시도하세요.');
          const canvas=document.createElement('canvas'),scale=Math.min(1,1280/video.videoWidth,720/video.videoHeight);
          canvas.width=Math.max(2,Math.floor(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.floor(video.videoHeight*scale/2)*2);
          const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const captured=canvas.captureStream(30),owns=captured.getVideoTracks();
          let callback=null,last=-Infinity,stopped=false;
          const schedule=()=>{callback=video.requestVideoFrameCallback?video.requestVideoFrameCallback(draw):requestAnimationFrame(draw);};
          const draw=now=>{if(stopped)return;if(now-last>=1000/30){ctx.drawImage(video,0,0,canvas.width,canvas.height);last=now;}schedule();};
          stopCapture=()=>{stopped=true;if(video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(callback);else cancelAnimationFrame(callback);owns.forEach(track=>track.stop());canvas.width=canvas.height=0;};
          stream=new MediaStream([...owns,...(stream.getAudioTracks?.()||[])]);schedule();
          options.videoBitsPerSecond=2500000;options.audioBitsPerSecond=128000;
        }
        chunks=[]; bytes=0;startedAt=Date.now();
        const active=new MediaRecorder(stream,options);recorder=active;
        let failure='';
        active.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>256*1024*1024 && active.state!=='inactive'){failure='256MB 한도에 도달해 녹화를 중지했습니다.';active.stop();}}};
        active.onerror=()=>{failure='녹화 중 오류가 발생했습니다.';if(active.state!=='inactive')active.stop();};
        active.onstop=()=>{
          stopCapture();stopCapture=()=>{};
          const blob=new Blob(chunks,{type:active.mimeType});chunks=[];recorder=null;
          // captureStream tracks belong to the source player; never stop them.
          send({type:'MEDIA_STATE',uid,recording:false});
          reply(data.requestId,'recording',{blob,duration:(Date.now()-startedAt)/1000,warning:failure});
        };
        active.start(1000);initializing=false;send({type:'MEDIA_STATE',uid,recording:true,startedAt});
      } else if(data.type==='MEDIA_SEEK') {
        const result=Number.isFinite(data.time)?seekBy(data.time-video.currentTime):{ok:false,reason:'bad-time'};
        reply(data.requestId,'seek',result);position();
      }
    } catch(error) {if(initializing){stopCapture();stopCapture=()=>{};if(recorder?.state==='inactive')recorder=null;}reply(data.requestId,data.type==='MEDIA_RECORD'?'recording':data.type==='MEDIA_SCREENSHOT'?'screenshot':'command',{error:error.message});}
  }
  const timer=chatOnly?null:setInterval(position,1000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);if(recorder?.state==='recording')recorder.stop();});
  window.addEventListener('keydown',event=>{
    const key=CZMessages.mediaShortcut(event);
    if(!key || CZMessages.isShortcutInput(event,key) || !['s','r'].includes(key) && !shortcutsEnabled)return;
    event.preventDefault();event.stopImmediatePropagation();
    send({type:'MEDIA_KEY',uid,...(['s','r'].includes(key)?{action:key==='s'?'screenshot':'record'}:(['ArrowLeft','ArrowRight'].includes(key)?{delta:key==='ArrowLeft'?-3:3}:{action:'shortcut',key}))});
  },true);
  return {command};
}};
