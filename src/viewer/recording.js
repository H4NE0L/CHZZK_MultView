import {DOWNLOAD_URL_MS} from '../shared/media/limits';
import {ResourceScope} from '../shared/runtime/scope';
import {ObjectURLs} from '../shared/media/object-urls';
import {create as createExportJob} from './media/export-job';
(async()=>{
  const $=id=>document.getElementById(id),id=new URL(location.href).searchParams.get('id');
  let result, url, working=false,closed=false,cancelWork=()=>{};
  const urls=new ObjectURLs(),scope=new ResourceScope();
  function status(text){$('status').textContent=text;}
  function download(blob,name){const target=urls.create(blob,DOWNLOAD_URL_MS),a=document.createElement('a');a.href=target.url;a.download=name;a.click();}
  function setWorking(value){working=value;['save','trim','format','start','end'].forEach(id=>$(id).disabled=value);$('cancel').hidden=!value;}
  $('cancel').onclick=()=>cancelWork();
  scope.listen(window,'beforeunload',event=>{if(working){event.preventDefault();event.returnValue='';}});
  scope.listen(window,'pagehide',event=>{if(event.persisted)return;closed=true;cancelWork();working=false;scope.dispose();for(const id of ['save','trim','cancel'])$(id).onclick=null;const video=$('preview');video.pause();video.onloadedmetadata=null;video.removeAttribute('src');video.load();urls.dispose();result=null;});
  try {
    const tab=await chrome.tabs.getCurrent();
    const registration=await chrome.runtime.sendMessage({type:'REGISTER_RECORDING_RESULT',resultId:id,tabId:tab?.id});
    if(!registration?.ok)throw Error('결과 창의 정리 처리를 등록하지 못했습니다. 창을 다시 열어주세요.');
    result=await CZRecordings.get(id);if(closed){result=null;return;}if(!result?.blob?.size)throw Error('녹화 결과를 찾을 수 없습니다.');
    const video=$('preview');url=urls.create(result.blob);video.src=url.url;$('warning').textContent=result.warning || '';$('end').value=Number(result.duration).toFixed(1);
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
      let job,cancelled=false;
      try {
        setWorking(true);video.pause();
        job=createExportJob(result.blob,{container,trim,start,end,transcode:container!==original.toLowerCase()},percent=>{if(!closed)status(`재인코딩 없이 저장 중… ${percent}%`);});
        cancelWork=()=>{cancelled=true;job.cancel();};
        const exported=await job.result;
        if(closed)return;
        if(exported)download(exported,`${result.name}${trim?`_${start}-${end}s`:''}.${container}`);
        status(cancelled?'처리를 취소했습니다.':trim?'구간을 저장했습니다. 키프레임 경계에 따라 요청 구간 앞뒤가 포함될 수 있습니다.':'영상을 저장했습니다.');
      }catch(error){if(!closed)status(error.message);}
      finally{job?.cancel();if(!closed)setWorking(false);cancelWork=()=>{};}

    }
    $('save').onclick=()=>exportVideo(false);$('trim').onclick=()=>exportVideo(true);
  }catch(error){if(!closed)status(error.message);}
})();
