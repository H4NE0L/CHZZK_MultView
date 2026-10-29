import {screenshotGallery} from './screenshot-gallery.js';
import {MAX_SCREENSHOTS,MAX_PENDING_SCREENSHOTS,MAX_SCREENSHOT_BYTES,DOWNLOAD_URL_MS} from '../shared/media/limits';
import {ResourceScope} from '../shared/runtime/scope';
import {ObjectURLs} from '../shared/media/object-urls';
export const mediaTools = {create(context) {
  const scope=new ResourceScope(),urls=new ObjectURLs(),transferAbort=new AbortController();scope.add(()=>urls.dispose());scope.add(()=>transferAbort.abort());
  const recordings=new Map(), pending=new Map(), positions=new Map(), results=[];
  let openingResult=false,activeResult=null;
  let recordingProfile='balanced',profileLoaded=false;
  let profileControl=null;
  function bindSettings(){profileControl=context.ui?.querySelector('#recordingProfile');if(!profileControl)return;profileControl.value=recordingProfile;profileControl.disabled=!profileLoaded;profileControl.onchange=()=>{recordingProfile=profileControl.value==='original'?'original':'balanced';chrome.storage.local.set({chzzkRecordingProfileV1:recordingProfile}).catch(error=>context.showNotice(error.message));};}
  chrome.storage.local.get('chzzkRecordingProfileV1').then(value=>{if(scope.isDisposed)return;recordingProfile=value.chzzkRecordingProfileV1==='original'?'original':'balanced';profileLoaded=true;if(profileControl){profileControl.value=recordingProfile;profileControl.disabled=false;}}).catch(()=>{if(scope.isDisposed)return;profileLoaded=true;if(profileControl)profileControl.disabled=false;});

  let sequence=0;
  const formats=[['video/webm;codecs=vp8,opus','WebM'],['video/webm;codecs=vp9,opus','WebM'],['video/mp4;codecs=avc1,mp4a.40.2','MP4'],['video/mp4;codecs=avc1.42E01E,mp4a.40.2','MP4']].filter(([mime])=>typeof MediaRecorder!=='undefined' && MediaRecorder.isTypeSupported(mime));
  const uniqueFormats=formats.filter((f,i)=>formats.findIndex(x=>x[1]===f[1])===i);
  function frame(uid){return context.tileMap.get(uid)?.querySelector('iframe');}
  function request(uid,type,extra={}) {
    if(scope.isDisposed)throw Error('미디어 화면이 종료됐습니다.');
    const requestId=++sequence;
    if(!CZMessages.postToPlayer(frame(uid),{source:'chzzk-multiview',type,requestId,...extra}))throw Error('방송이 준비된 뒤 다시 시도하세요.');
    return requestId;
  }
  let gallery=null;
  function download(blob,name){const lease=urls.create(blob,DOWNLOAD_URL_MS),a=document.createElement('a');a.href=lease.url;a.download=name;a.click();}
  async function fileName(uid,date=new Date(),kind='screenshot',controller=new AbortController()) {
    const channel=context.state.channels.find(c=>c.uid===uid);
    let title='방송';
    const release=scope.add(()=>controller.abort()),cancelTimeout=scope.timeout(()=>controller.abort(),15000);
    try {
      const id=channel?.sourceId || uid;
      const path=channel?.type==='video'?`service/v1/videos/${encodeURIComponent(id)}`:`service/v3.3/channels/${encodeURIComponent(id)}/live-detail`;
      const response=await fetch(`https://api.chzzk.naver.com/${path}`,{credentials:'include',signal:controller.signal});
      if(response.ok){const data=await response.json();if(data.code===200)title=data.content?.liveTitle || data.content?.videoTitle || title;}
    }catch(_){}finally{cancelTimeout();release();}
    const stamp=[date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes(),date.getSeconds()].map((n,i)=>i?String(n).padStart(2,'0'):String(n)).join('');
    const clean=value=>String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    if(kind==='recording')return `[${String(date.getFullYear()).slice(-2)}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}]${clean(channel?.name || uid).slice(0,70)}_${clean(title).slice(0,70)}`;
    return `${clean(channel?.name || uid).slice(0,70)}_${clean(title).slice(0,70)}_${stamp}`;
  }
  async function screenshot(uid) {
    if(scope.isDisposed)return;
    if([...pending.values()].filter(entry=>entry.kind==='screenshot').length>=MAX_PENDING_SCREENSHOTS){context.showNotice('스크린샷 처리 중입니다. 잠시 후 다시 촬영해주세요.');return;}
    const shots=[...pending.values(),...results.map(result=>result.entry),...(activeResult?[activeResult.entry]:[])].filter(entry=>entry.kind==='screenshot').length+(gallery?.size||0);
    if(shots>=MAX_SCREENSHOTS){context.showNotice('스크린샷은 최대 12장까지 보관합니다. 저장 후 다시 촬영해주세요.');return;}
    try{const id=request(uid,'MEDIA_SCREENSHOT'),controller=new AbortController(),entry={uid,name:fileName(uid,undefined,undefined,controller),kind:'screenshot',controller};
      entry.cancel=scope.timeout(()=>{if(pending.delete(id))context.showNotice('스크린샷 응답이 없습니다.');},20000);pending.set(id,entry);
    }catch(e){context.showNotice(e.message);}
  }
  function recordingUids(){return new Set([...recordings.keys(),...[...pending.values()].filter(entry=>entry.kind==='recording').map(entry=>entry.uid)]);}
  function toggleRecording(uid) {
    if(scope.isDisposed)return;
    try {
      if(recordings.has(uid)){request(uid,'MEDIA_STOP');return;}
      if(recordingUids().has(uid)){context.showNotice('녹화 결과를 처리 중입니다. 잠시 기다려주세요.');return;}
      const mime=uniqueFormats.find(([,label])=>label==='MP4')?.[0] || uniqueFormats[0]?.[0];
      if(!mime)throw Error('이 환경에서는 녹화를 지원하지 않습니다.');
      const id=request(uid,'MEDIA_RECORD',{mime,profile:recordingProfile}),controller=new AbortController();pending.set(id,{uid,name:fileName(uid,new Date(),'recording',controller),kind:'recording',controller});
      recordings.set(uid,{startedAt:Date.now()});updateRecord(uid);
    }catch(e){context.showNotice(e.message);}
  }
  function updateRecord(uid) {
    const button=context.tileMap.get(uid)?.querySelector('.tile-record'), record=recordings.get(uid);
    if(!button)return;
    button.classList.toggle('recording',!!record);
    button.innerHTML='<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor"/><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>'+ (record?`<span>${Math.floor((Date.now()-record.startedAt)/1000)}초</span>`:'');
    button.title=record?'녹화 중지 (R)':'녹화 시작 (R)';
  }
  async function showNext() {
    if(scope.isDisposed || openingResult || !results.length)return;
    openingResult=true;
    const next=results.shift();activeResult=next;
    try {next.entry.name=await next.entry.name;if(!scope.isDisposed)await preview(next.data,next.entry);}
    catch(error){if(!scope.isDisposed)context.showNotice(error.message);}
    finally{next.data=null;activeResult=null;openingResult=false;if(results.length)queueMicrotask(showNext);}
  }
  async function preview(data, entry) {
    if(!(data.blob instanceof Blob) || !data.blob.size){context.showNotice('저장할 영상/이미지가 없습니다.');return;}
    const name=await entry.name;if(scope.isDisposed)return;
    if(data.kind==='recording') {
      const id=crypto.randomUUID();await (globalThis.CZ_SITE_VIEWER ? CZSiteRecordings : CZRecordings).put({id,name,blob:data.blob,duration:data.duration,warning:data.warning,createdAt:Date.now()},{signal:transferAbort.signal});
      if(scope.isDisposed){await (globalThis.CZ_SITE_VIEWER?CZSiteRecordings:CZRecordings).remove?.(id).catch(()=>{});return;}
      const url=chrome.runtime.getURL(`src/viewer/recording.html?id=${encodeURIComponent(id)}`);
      try {if(globalThis.CZ_SITE_VIEWER){const result=await chrome.runtime.sendMessage({type:'SITE_OPEN_RECORDING',id});if(!result?.ok)throw Error(result?.error || '결과 창 열기 실패');}else await chrome.windows.create({url,type:'popup',width:900,height:780});}
      catch(error){context.showNotice('결과 창을 열지 못했습니다. 녹화 결과는 보관되어 있습니다.');throw error;}
      return;
    }
    if(scope.isDisposed)return;
    if(!gallery)gallery=screenshotGallery.create({host:context.ui,download,onClose:()=>{gallery=null;}});
    gallery.add({blob:data.blob,name});
  }

  function attachTile(uid,tile) {
    const bar=document.createElement('div');bar.className='media-transport';
    bar.innerHTML='<input type="range" class="media-range" step="0.1" aria-label="방송 재생 위치" disabled><output class="media-seek-delta" hidden></output><span class="media-position" hidden>재생 위치 조회 중</span>';
    tile.appendChild(bar);
    const range=bar.querySelector('input'),hint=bar.querySelector('.media-seek-delta');let baseline=0;
    const showDelta=()=>{const delta=Number(range.value)-baseline;hint.textContent=`${delta>=0?'+':'−'}${Math.abs(delta).toFixed(1)}초`;hint.hidden=false;hint.style.left=`${Math.max(0,Math.min(100,(Number(range.value)-Number(range.min))/(Number(range.max)-Number(range.min))*100))}%`;};
    const endDrag=()=>{range.dataset.dragging='false';hint.hidden=true;};
    range.onpointerdown=()=>{baseline=positions.get(uid)?.time ?? Number(range.value);range.dataset.dragging='true';};
    range.oninput=()=>{if(range.dataset.dragging!=='true')baseline=positions.get(uid)?.time ?? Number(range.value);showDelta();};
    range.onchange=()=>{endDrag();try{request(uid,'MEDIA_SEEK',{time:Number(range.value)});}catch(e){context.showNotice(e.message);}};range.onpointerup=endDrag;range.onpointercancel=endDrag;range.onblur=endDrag;
  }
  function receive(data) {
    if(scope.isDisposed)return;
    if(data.type==='MEDIA_KEY'){if(data.action==='screenshot')screenshot(data.uid);else if(data.action==='record')toggleRecording(data.uid);else if(context.shortcutsEnabled!==false){if(data.action==='shortcut')context.onShortcut?.(data.key);else if([-3,3].includes(data.delta))context.adjustSync(data.uid,data.delta);}return;}
    if(data.type==='MEDIA_STATE'){if(data.recording)recordings.set(data.uid,{startedAt:data.startedAt});else recordings.delete(data.uid);updateRecord(data.uid);return;}
    if(data.type==='MEDIA_TIME') {
      if(data.canSeek===false){const bar=context.tileMap.get(data.uid)?.querySelector('.media-transport');if(bar){bar.querySelector('input').disabled=true;bar.querySelector('.media-position').textContent='탐색 가능한 구간 없음';}return;}
      if(![data.start,data.end,data.time].every(Number.isFinite)||data.end<=data.start)return;
      positions.set(data.uid,data);const bar=context.tileMap.get(data.uid)?.querySelector('.media-transport');if(!bar)return;
      const range=bar.querySelector('input');range.disabled=false;range.min=data.start;range.max=data.end; if(range.dataset.dragging!=='true')range.value=data.time;
      bar.querySelector('.media-position').textContent=`${Math.floor(data.time-data.start)} / ${Math.floor(data.end-data.start)}초`;return;
    }
    if(data.type==='MEDIA_RESULT') {
      if(data.kind==='seek'){if(data.ok)context.externalSeek(data.uid,data.applied);else context.showNotice('재생 위치를 이동할 수 없습니다.');return;}
      const entry=pending.get(data.requestId);if(!entry || entry.uid!==data.uid)return;pending.delete(data.requestId);entry.cancel?.();
      if(data.error){entry.controller?.abort();if(entry.kind==='recording'){recordings.delete(data.uid);updateRecord(data.uid);}context.showNotice(data.error);return;}
      if(data.kind!==entry.kind || !(data.blob instanceof Blob) || !data.blob.size){entry.controller?.abort();if(entry.kind==='recording'){recordings.delete(data.uid);updateRecord(data.uid);}context.showNotice('저장할 영상/이미지가 없습니다.');return;}
      if(entry.kind==='screenshot'){
        const queued=(gallery?.bytes||0)+results.filter(result=>result.entry.kind==='screenshot').reduce((bytes,result)=>bytes+(result.data.blob?.size||0),0)+(activeResult?.entry.kind==='screenshot'?(activeResult.data?.blob?.size||0):0);
        if(queued+(data.blob?.size||0)>MAX_SCREENSHOT_BYTES){entry.controller?.abort();context.showNotice('스크린샷 보관 한도 128MB에 도달했습니다. 기존 이미지를 저장한 뒤 다시 촬영해주세요.');return;}
      }
      results.push({data,entry});showNext();
    }
  }
  scope.listen(window,'keydown',event=>{
    const key=CZMessages.mediaShortcut(event);
    if(!key || CZMessages.isShortcutInput(event,key))return;
    if(gallery?.containsEvent(event) && key.startsWith('Arrow'))return;
    if(!['s','r'].includes(key) && context.shortcutsEnabled===false)return;
    if(['s','r','ArrowLeft','ArrowRight'].includes(key) && !context.state.selectedUid)return;
    event.preventDefault();
    if(key==='s')screenshot(context.state.selectedUid);
    else if(key==='r')toggleRecording(context.state.selectedUid);
    else if(['ArrowLeft','ArrowRight'].includes(key))context.adjustSync(context.state.selectedUid,key==='ArrowLeft'?-3:3);
    else context.onShortcut?.(key);
  },{capture:true});
  scope.listen(window,'beforeunload',event=>{if(recordings.size || pending.size || results.length || activeResult || gallery?.hasUnsaved()){event.preventDefault();event.returnValue='';}});
  scope.interval(()=>recordings.forEach((_,uid)=>updateRecord(uid)),1000);
  function detach(uid){positions.delete(uid);recordings.delete(uid);for(const [id,entry] of pending)if(entry.uid===uid){entry.cancel?.();entry.controller?.abort();pending.delete(id);}}
  function dispose(){if(scope.isDisposed)return;scope.dispose();gallery?.close();gallery=null;pending.clear();recordings.clear();positions.clear();results.length=0;if(profileControl)profileControl.onchange=null;profileControl=null;}
  scope.listen(window,'pagehide',event=>{if(!event.persisted)dispose();});
  return {dispose,detach,canDisplay(channels,layout){const visible=new Set(channels.slice(0,layout==='main-sub'?4:9).map(channel=>channel.uid));if([...recordingUids()].some(uid=>!visible.has(uid))){context.showNotice('녹화 중인 방송이 화면에서 제거되지 않도록 녹화를 종료한 뒤 배치를 변경해주세요.');return false;}return true;},bindSettings,screenshot,toggleRecording,attachTile,receive,hasRecordings:()=>recordingUids().size>0, isRecording:uid=>recordingUids().has(uid)};
}};
