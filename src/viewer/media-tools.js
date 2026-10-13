globalThis.CZMediaTools = {create(context) {
  const recordings=new Map(), pending=new Map(), positions=new Map(), results=[];
  let openingResult=false;
  let sequence=0, dialog=null, cleanup=()=>{}, trimming=false;
  const formats=[['video/webm;codecs=vp9,opus','WebM'],['video/webm;codecs=vp8,opus','WebM'],['video/mp4;codecs=avc1,mp4a.40.2','MP4'],['video/mp4;codecs=avc1.42E01E,mp4a.40.2','MP4']].filter(([mime])=>typeof MediaRecorder!=='undefined' && MediaRecorder.isTypeSupported(mime));
  const uniqueFormats=formats.filter((f,i)=>formats.findIndex(x=>x[1]===f[1])===i);
  function frame(uid){return context.tileMap.get(uid)?.querySelector('iframe');}
  function request(uid,type,extra={}) {
    const requestId=++sequence;
    if(!CZMessages.postToPlayer(frame(uid),{source:'chzzk-multiview',type,requestId,...extra}))throw Error('방송이 준비된 뒤 다시 시도하세요.');
    return requestId;
  }
  function close() {if(trimming)return;cleanup();cleanup=()=>{};dialog?.remove();dialog=null;queueMicrotask(showNext);}
  function modal(title) {
    close(); if(dialog)throw Error('구간 저장이 진행 중입니다.');
    dialog=document.createElement('div');dialog.className='media-overlay';
    dialog.innerHTML='<section class="media-dialog" role="dialog" aria-modal="true"><header><strong></strong><button class="media-close" type="button">닫기</button></header><div class="media-body"></div></section>';
    dialog.querySelector('strong').textContent=title;dialog.querySelector('.media-close').onclick=close;
    dialog.onkeydown=event=>{if(event.key==='Escape')close();};
    context.ui.appendChild(dialog);dialog.querySelector('.media-close').focus();
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
      const body=modal('녹화 시작');
      body.innerHTML='<p>지원되는 형식으로 영상과 음성을 녹화합니다. 256MB에 도달하면 자동 중지합니다.</p><label>형식 <select class="media-format"></select></label><button class="media-start" type="button">녹화 시작</button><p class="media-error" role="status"></p>';
      const select=body.querySelector('select');uniqueFormats.forEach(([mime,label])=>select.add(new Option(label,mime)));
      body.querySelector('.media-start').disabled=!uniqueFormats.length;
      body.querySelector('.media-start').onclick=()=>{
        try {const id=request(uid,'MEDIA_RECORD',{mime:select.value});pending.set(id,{uid,name:fileName(uid),kind:'recording'});recordings.set(uid,{startedAt:Date.now()});updateRecord(uid);close();}
        catch(e){body.querySelector('.media-error').textContent=e.message;}
      };
    }catch(e){context.showNotice(e.message);}
  }
  function updateRecord(uid) {
    const button=context.tileMap.get(uid)?.querySelector('.tile-record'), record=recordings.get(uid);
    if(!button)return;
    button.classList.toggle('recording',!!record);
    button.textContent=record?`■ ${Math.floor((Date.now()-record.startedAt)/1000)}초`:'● 녹화';
    button.title=record?'녹화 중지':'녹화 시작';
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
    const name=await entry.name, isImage=data.kind==='screenshot', body=modal(isImage?'스크린샷 미리보기':'녹화 결과');
    const url=URL.createObjectURL(data.blob), media=document.createElement(isImage?'img':'video');
    media.src=url;if(!isImage){media.controls=true;media.preload='metadata';}else media.alt='스크린샷 미리보기';
    body.appendChild(media);cleanup=()=>{media.pause?.();media.removeAttribute('src');media.load?.();URL.revokeObjectURL(url);};
    const save=document.createElement('button');save.type='button';save.textContent='전체 저장';save.onclick=()=>download(data.blob,`${name}.${isImage?'png':data.blob.type.includes('mp4')?'mp4':'webm'}`);body.appendChild(save);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.onclick=close;body.appendChild(cancel);
    if(data.warning){const p=document.createElement('p');p.textContent=data.warning;body.appendChild(p);}
    if(isImage)return;
    const tools=document.createElement('div');tools.className='media-trim';
    tools.innerHTML='<label>시작(초) <input class="trim-start" type="number" min="0" step="0.1" value="0"></label><label>종료(초) <input class="trim-end" type="number" min="0" step="0.1"></label><label>저장 형식 <select></select></label><button class="trim-save" type="button">구간 저장</button><button class="trim-cancel" type="button" hidden>처리 취소</button><p class="media-error" role="status"></p>';
    body.appendChild(tools);uniqueFormats.forEach(([mime,label])=>tools.querySelector('select').add(new Option(label,mime)));
    tools.querySelector('.trim-end').value=Number(data.duration || 0).toFixed(1);
    media.onloadedmetadata=()=>{if(Number.isFinite(media.duration))tools.querySelector('.trim-end').value=media.duration.toFixed(1);};
    tools.querySelector('.trim-save').onclick=async()=>{
      const start=Number(tools.querySelector('.trim-start').value), end=Number(tools.querySelector('.trim-end').value), duration=Number.isFinite(media.duration)?media.duration:data.duration;
      const status=tools.querySelector('.media-error');
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration){status.textContent='유효한 시작·종료 시각을 입력하세요.';return;}
      if(!media.captureStream){status.textContent='이 환경에서는 구간 저장을 지원하지 않습니다.';return;}
      let recorder,timer,cancelled=false,parts=[];
      try {
        trimming=true;save.disabled=true;cancel.disabled=true;tools.querySelector('.trim-save').disabled=true;
        dialog.querySelector('.media-close').disabled=true;
        const abort=tools.querySelector('.trim-cancel');abort.hidden=false;abort.onclick=()=>{cancelled=true;if(recorder?.state==='recording')recorder.stop();};
        media.pause();media.currentTime=start;
        if(media.seeking)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('구간 시작 위치로 이동하지 못했습니다.')),10000);media.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});});
        if(cancelled)return;
        await media.play();
        const stream=media.captureStream(), mime=tools.querySelector('select').value;
        recorder=new MediaRecorder(stream,{mimeType:mime});
        const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.onstop=resolve;recorder.onerror=()=>reject(Error('구간 녹화에 실패했습니다.'));});
        recorder.start(500);
        status.textContent='선택한 구간을 재생하며 저장하는 중…';
        timer=setInterval(()=>{status.textContent=`구간 저장 ${Math.min(100,Math.floor((media.currentTime-start)/(end-start)*100))}%`;if(media.currentTime>=end || media.ended){media.pause();if(recorder.state==='recording')recorder.stop();}},50);
        await finished;
        if(!cancelled)download(new Blob(parts,{type:recorder.mimeType}),`${name}_${start}-${end}.${mime.includes('mp4')?'mp4':'webm'}`);
        status.textContent=cancelled?'구간 저장을 취소했습니다.':'구간 저장을 완료했습니다.';
      }catch(error){status.textContent=error.message;}
      finally{clearInterval(timer);if(recorder?.state==='recording')recorder.stop();media.pause();trimming=false;save.disabled=false;cancel.disabled=false;tools.querySelector('.trim-save').disabled=false;tools.querySelector('.trim-cancel').hidden=true;dialog.querySelector('.media-close').disabled=false;}
    };
  }
  function attachTile(uid,tile) {
    const bar=document.createElement('div');bar.className='media-transport';
    bar.innerHTML='<button type="button" class="seek-back" title="3초 뒤로">◀ 3초</button><input type="range" class="media-range" step="0.1" aria-label="방송 재생 위치" disabled><button type="button" class="seek-forward" title="3초 앞으로">3초 ▶</button><span class="media-position">재생 위치 조회 중</span>';
    tile.appendChild(bar);bar.querySelector('.seek-back').onclick=()=>context.adjustSync(uid,-3);bar.querySelector('.seek-forward').onclick=()=>context.adjustSync(uid,3);
    const range=bar.querySelector('input');range.onpointerdown=()=>{range.dataset.dragging='true';};range.onchange=()=>{range.dataset.dragging='false';try{request(uid,'MEDIA_SEEK',{time:Number(range.value)});}catch(e){context.showNotice(e.message);}};range.onpointerup=()=>{range.dataset.dragging='false';};
  }
  function receive(data) {
    if(data.type==='MEDIA_KEY'){if([-3,3].includes(data.delta))context.adjustSync(data.uid,data.delta);return;}
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
  document.addEventListener('keydown',event=>{
    if(dialog || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    if(event.composedPath().some(el=>el?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.cg-dialog')))return;
    if(!context.state.selectedUid)return;event.preventDefault();context.adjustSync(context.state.selectedUid,event.key==='ArrowLeft'?-3:3);
  });
  window.addEventListener('beforeunload',event=>{if(recordings.size || trimming || results.length || dialog){event.preventDefault();event.returnValue='';}});
  setInterval(()=>recordings.forEach((_,uid)=>updateRecord(uid)),1000);
  return {screenshot,toggleRecording,attachTile,receive,hasRecordings:()=>recordings.size>0, isRecording:uid=>recordings.has(uid)};
}};
