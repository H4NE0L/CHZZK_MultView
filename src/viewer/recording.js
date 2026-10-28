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
    const original=result.blob.type.includes('mp4')?'MP4':'WebM';
    for(const label of ['WebM','MP4']){const option=new Option(label,label.toLowerCase());option.dataset.container=label.toLowerCase();option.selected=label===original;$('format').add(option);}
    $('save').disabled=false;$('trim').disabled=false;status('저장 형식과 영상 길이를 선택하세요.');
    async function exportVideo(trim) {
      const option=$('format').selectedOptions[0],container=option.dataset.container;
      const duration=Number.isFinite(video.duration)?video.duration:result.duration;
      const start=trim?Number($('start').value):0,end=trim?Number($('end').value):duration;
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration){status('유효한 시작·종료 시각을 입력하세요.');return;}
      if(!trim && container===original.toLowerCase()){download(result.blob,`${result.name}.${container}`);status('원본 영상을 저장했습니다.');return;}
      let worker,cancelled=false;
      try {
        setWorking(true);video.pause();
        worker=new Worker(new URL('recording-export-worker.js',location.href),{type:'module'});
        const exported=await new Promise((resolve,reject)=>{
          cancelWork=()=>{cancelled=true;worker.terminate();resolve(null);};
          worker.onerror=()=>reject(Error('영상 데이터 처리 Worker를 실행하지 못했습니다.'));
          worker.onmessage=({data})=>{
            if(data.type==='progress')status(`재인코딩 없이 저장 중… ${data.percent}%`);
            else if(data.type==='error')reject(Error(data.error));
            else if(data.type==='done')resolve(new Blob([data.buffer],{type:data.mime}));
          };
          worker.postMessage({blob:result.blob,container,trim,start,end,transcode:container!==original.toLowerCase()});
        });
        if(exported)download(exported,`${result.name}${trim?`_${start}-${end}s`:''}.${container}`);
        status(cancelled?'처리를 취소했습니다.':trim?'구간을 저장했습니다. 키프레임 경계에 따라 요청 구간 앞뒤가 포함될 수 있습니다.':'영상을 저장했습니다.');
      }catch(error){status(error.message);}
      finally{worker?.terminate();setWorking(false);cancelWork=()=>{};}

    }
    $('save').onclick=()=>exportVideo(false);$('trim').onclick=()=>exportVideo(true);
  }catch(error){status(error.message);}
})();
