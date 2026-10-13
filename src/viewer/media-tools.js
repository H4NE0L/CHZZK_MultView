globalThis.CZMediaTools = {create(context) {
  const recordings=new Map(), pending=new Map(), positions=new Map(), results=[];
  let openingResult=false;
  let sequence=0, dialog=null, cleanup=()=>{};
  const formats=[['video/webm;codecs=vp9,opus','WebM'],['video/webm;codecs=vp8,opus','WebM'],['video/mp4;codecs=avc1,mp4a.40.2','MP4'],['video/mp4;codecs=avc1.42E01E,mp4a.40.2','MP4']].filter(([mime])=>typeof MediaRecorder!=='undefined' && MediaRecorder.isTypeSupported(mime));
  const uniqueFormats=formats.filter((f,i)=>formats.findIndex(x=>x[1]===f[1])===i);
  function frame(uid){return context.tileMap.get(uid)?.querySelector('iframe');}
  function request(uid,type,extra={}) {
    const requestId=++sequence;
    if(!CZMessages.postToPlayer(frame(uid),{source:'chzzk-multiview',type,requestId,...extra}))throw Error('방송이 준비된 뒤 다시 시도하세요.');
    return requestId;
  }
  function close() {cleanup();cleanup=()=>{};dialog?.remove();dialog=null;queueMicrotask(showNext);}
  function modal(title) {
    close();
    dialog=document.createElement('div');dialog.className='media-overlay';
    dialog.innerHTML='<section class="media-dialog screenshot-dialog" role="dialog" aria-modal="true"><header><strong></strong></header><div class="media-body"></div><footer class="media-footer"><span class="screenshot-size"></span><button class="media-cancel" type="button">취소</button><button class="media-copy" type="button">선택 영역 복사</button><button class="media-save" type="button">선택 영역 저장</button></footer></section>';

    dialog.querySelector('strong').textContent=title;dialog.querySelector('.media-cancel').onclick=close;
    dialog.onkeydown=event=>{if(event.key==='Escape')close();};
    context.ui.appendChild(dialog);dialog.querySelector('.media-cancel').focus();
    return dialog.querySelector('.media-body');
  }
  function download(blob,name) {
    const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function fileName(uid,date=new Date()) {
    const channel=context.state.channels.find(c=>c.uid===uid);
    let title='방송';
    try {
      const id=channel?.sourceId || uid;
      const path=channel?.type==='video'?`service/v1/videos/${encodeURIComponent(id)}`:`service/v3.3/channels/${encodeURIComponent(id)}/live-detail`;
      const response=await fetch(`https://api.chzzk.naver.com/${path}`,{credentials:'include',signal:AbortSignal.timeout(15000)});
      if(response.ok){const data=await response.json();if(data.code===200)title=data.content?.liveTitle || data.content?.videoTitle || title;}
    }catch(_){}
    const stamp=[date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes(),date.getSeconds()].map((n,i)=>i?String(n).padStart(2,'0'):String(n)).join('');
    const clean=value=>String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    return `${clean(channel?.name || uid).slice(0,70)}_${clean(title).slice(0,70)}_${stamp}`;
  }
  async function screenshot(uid) {
    try {const id=request(uid,'MEDIA_SCREENSHOT');pending.set(id,{uid,name:fileName(uid),kind:'screenshot'});setTimeout(()=>{if(pending.delete(id))context.showNotice('스크린샷 응답이 없습니다.');},20000);}catch(e){context.showNotice(e.message);}
  }
  function toggleRecording(uid) {
    try {
      if(recordings.has(uid)){request(uid,'MEDIA_STOP');return;}
      const mime=uniqueFormats.find(([,label])=>label==='MP4')?.[0] || uniqueFormats[0]?.[0];
      if(!mime)throw Error('이 환경에서는 녹화를 지원하지 않습니다.');
      const id=request(uid,'MEDIA_RECORD',{mime});pending.set(id,{uid,name:fileName(uid),kind:'recording'});
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
    if(dialog || openingResult || !results.length)return;
    openingResult=true;
    const next=results.shift();
    try {next.entry.name=await next.entry.name;if(dialog)results.unshift(next);else await preview(next.data,next.entry);}
    catch(error){context.showNotice(error.message);}
    finally{openingResult=false;if(!dialog && results.length)queueMicrotask(showNext);}
  }
  async function preview(data, entry) {
    if(!(data.blob instanceof Blob) || !data.blob.size){context.showNotice('저장할 영상/이미지가 없습니다.');return;}
    const name=await entry.name;
    if(data.kind==='recording') {
      const id=crypto.randomUUID();await CZRecordings.put({id,name,blob:data.blob,duration:data.duration,warning:data.warning,createdAt:Date.now()});
      const url=chrome.runtime.getURL(`src/viewer/recording.html?id=${encodeURIComponent(id)}`);
      try {await chrome.windows.create({url,type:'popup',width:900,height:780});}
      catch(error){context.showNotice('결과 창을 열지 못했습니다. 녹화 결과는 보관되어 있습니다.');throw error;}
      return;
    }
    const body=modal('스크린샷 미리보기'),url=URL.createObjectURL(data.blob),media=document.createElement('img');
    media.src=url;media.alt='스크린샷 미리보기';media.draggable=false;
    const host=document.createElement('div');host.className='screenshot-crop-host';host.appendChild(media);body.appendChild(host);
    const crop=CZScreenshotCrop.attach(media,host,()=>{dialog.querySelector('.screenshot-size').textContent=`${media.naturalWidth} × ${media.naturalHeight}px`;});
    const error=document.createElement('p');error.className='media-error';error.setAttribute('role','status');error.hidden=true;body.appendChild(error);
    cleanup=()=>{media.removeAttribute('src');URL.revokeObjectURL(url);};
    dialog.querySelector('.media-copy').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try {const blob=await crop.blob();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);button.textContent='복사됨';}
      catch(e){error.hidden=false;error.textContent='이미지 복사 실패: '+e.message;}
      finally{button.disabled=false;}
    };
    dialog.querySelector('.media-save').onclick=async event=>{
      event.target.disabled=true;
      try {download(await crop.blob(),`${name}.png`);close();}
      catch(e){error.hidden=false;error.textContent=e.message;event.target.disabled=false;}
    };
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
    if(data.type==='MEDIA_KEY'){if(data.action==='screenshot')screenshot(data.uid);else if(data.action==='record')toggleRecording(data.uid);else if([-3,3].includes(data.delta))context.adjustSync(data.uid,data.delta);return;}
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
      const entry=pending.get(data.requestId);if(!entry || entry.uid!==data.uid)return;pending.delete(data.requestId);
      if(data.error){if(entry.kind==='recording'){recordings.delete(data.uid);updateRecord(data.uid);}context.showNotice(data.error);return;}
      results.push({data,entry});showNext();
    }
  }
  window.addEventListener('keydown',event=>{
    const key=CZMessages.mediaShortcut(event);
    if(dialog || !key || CZMessages.isShortcutInput(event,key) || !context.state.selectedUid)return;
    event.preventDefault();
    if(key==='s')screenshot(context.state.selectedUid);
    else if(key==='r')toggleRecording(context.state.selectedUid);
    else context.adjustSync(context.state.selectedUid,key==='ArrowLeft'?-3:3);
  },true);
  window.addEventListener('beforeunload',event=>{if(recordings.size || results.length || dialog){event.preventDefault();event.returnValue='';}});
  setInterval(()=>recordings.forEach((_,uid)=>updateRecord(uid)),1000);
  return {screenshot,toggleRecording,attachTile,receive,hasRecordings:()=>recordings.size>0, isRecording:uid=>recordings.has(uid)};
}};
