(async()=>{
  const $=id=>document.getElementById(id),id=new URL(location.href).searchParams.get('id');
  let result, url, working=false, cancelWork=()=>{};
  function status(text){$('status').textContent=text;}
  function download(blob,name){const target=URL.createObjectURL(blob),a=document.createElement('a');a.href=target;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(target),60000);}
  function setWorking(value){working=value;['save','trim','format','start','end'].forEach(id=>$(id).disabled=value);$('cancel').hidden=!value;}
  $('cancel').onclick=()=>cancelWork();
  window.addEventListener('beforeunload',event=>{if(working){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
  try {
    const tab=await chrome.tabs.getCurrent();
    const registration=await chrome.runtime.sendMessage({type:'REGISTER_RECORDING_RESULT',resultId:id,tabId:tab?.id});
    if(!registration?.ok)throw Error('결과 창의 정리 처리를 등록하지 못했습니다. 창을 다시 열어주세요.');
    result=await CZRecordings.get(id);if(!result?.blob?.size)throw Error('녹화 결과를 찾을 수 없습니다.');
    const video=$('preview');url=URL.createObjectURL(result.blob);video.src=url;$('warning').textContent=result.warning || '';$('end').value=Number(result.duration).toFixed(1);
    video.onloadedmetadata=()=>{if(Number.isFinite(video.duration))$('end').value=video.duration.toFixed(1);};
    const choices=[['WebM',['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus']],['MP4',['video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1.42E01E,mp4a.40.2']]];
    const original=result.blob.type.includes('mp4')?'MP4':'WebM';
    choices.forEach(([label,mimes])=>{const mime=mimes.find(type=>MediaRecorder.isTypeSupported(type));const option=new Option(mime || label===original?label:`${label} (미지원)`,mime || '');option.disabled=!mime && label!==original;option.dataset.container=label.toLowerCase();if(label===original)option.selected=true;$('format').add(option);});
    $('save').disabled=false;$('trim').disabled=false;status('저장 형식과 영상 길이를 선택하세요.');
    async function exportVideo(trim) {
      const option=$('format').selectedOptions[0],container=option.dataset.container,mime=option.value;
      const duration=Number.isFinite(video.duration)?video.duration:result.duration;
      const start=trim?Number($('start').value):0,end=trim?Number($('end').value):duration;
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration){status('유효한 시작·종료 시각을 입력하세요.');return;}
      if(!trim && container===original.toLowerCase()){download(result.blob,`${result.name}.${container}`);status('원본 영상을 저장했습니다.');return;}
      if(!mime || !video.captureStream){status('이 환경에서는 선택한 형식으로 구간 저장·변환할 수 없습니다.');return;}
      let recorder,timer,cancelled=false,parts=[],bytes=0;
      try {
        setWorking(true);cancelWork=()=>{cancelled=true;if(recorder?.state==='recording')recorder.stop();};
        video.pause();video.currentTime=start;
        if(video.seeking)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('시작 위치로 이동하지 못했습니다.')),10000);video.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});});
        if(cancelled)return;
        await video.play();recorder=new MediaRecorder(video.captureStream(),{mimeType:mime});
        const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data.size){parts.push(event.data);bytes+=event.data.size;if(bytes>256*1024*1024){cancelled=true;if(recorder.state==='recording')recorder.stop();status('결과가 256MB를 초과해 처리를 취소했습니다.');}}};recorder.onstop=resolve;recorder.onerror=()=>reject(Error('영상 저장 처리에 실패했습니다.'));});
        recorder.start(500);status('선택한 영상을 재생하며 처리하는 중…');
        timer=setInterval(()=>{status(`처리 ${Math.min(100,Math.floor((video.currentTime-start)/(end-start)*100))}%`);if(video.currentTime>=end || video.ended){video.pause();if(recorder.state==='recording')recorder.stop();}},50);
        await finished;
        if(!cancelled)download(new Blob(parts,{type:recorder.mimeType}),`${result.name}${trim?`_${start}-${end}s`:''}.${container}`);
        status(cancelled?'처리를 취소했습니다.':'영상을 저장했습니다.');
      }catch(error){status(error.message);}
      finally{clearInterval(timer);if(recorder?.state==='recording')recorder.stop();video.pause();setWorking(false);cancelWork=()=>{};}
    }
    $('save').onclick=()=>exportVideo(false);$('trim').onclick=()=>exportVideo(true);
  }catch(error){status(error.message);}
})();
