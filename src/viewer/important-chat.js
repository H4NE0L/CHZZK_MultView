globalThis.CZImportantChatPanel = {create({chatPanel,enabledControl,getFrame,getState,notify}) {
  const model=CZImportantChat.create();let filter=CZImportantChat.settings(),ready=false;const configured=new WeakMap();
  const rendered=new Map(),owners=new Map();let stats=null,received=0;
  const HEIGHT_KEY='chzzkImportantChatHeightV1';let desiredHeight=200,drag=null;
  const panel=document.createElement('section');panel.className='important-chat-panel';panel.setAttribute('aria-label','주요 채팅');
  panel.innerHTML='<div class="ic-body"><div class="ic-list" tabindex="0" role="region" aria-label="수집된 채팅 목록"></div></div><div class="ic-resizer" role="separator" aria-label="주요 채팅 영역 높이" aria-orientation="horizontal" tabindex="0"></div><dialog class="ic-dialog" aria-labelledby="icSettingsTitle"><header><strong id="icSettingsTitle">채팅 설정</strong><button class="ic-settings-close" type="button" aria-label="채팅 설정 닫기">✕</button></header><div class="ic-settings"><strong class="ic-settings-heading">주요 채팅 모음</strong><div class="ic-options"></div><p class="ic-role-help">역할 배지·표식을 우선 확인하고, 채팅 본문의 주황·파랑·초록색을 보조 기준으로 사용합니다. 닉네임 색은 사용하지 않습니다.</p><form class="ic-form"><input class="ic-name" maxlength="40" placeholder="추가할 닉네임" aria-label="주요 채팅 사용자 닉네임"><button type="submit">추가</button></form><div class="ic-names"></div><p class="ic-diagnostics" aria-live="polite"></p><button class="ic-copy-diagnostics" type="button">점검 정보 복사</button><button class="ic-clear" type="button">수집된 내용 초기화</button></div></dialog>';
  chatPanel.insertBefore(panel,chatPanel.querySelector('.chat-frame-wrap'));
  const dialog=panel.querySelector('.ic-dialog'),$=selector=>panel.querySelector(selector)||dialog.querySelector(selector),handle=$('.ic-resizer');
  chatPanel.appendChild(dialog);
  for(const [key,title] of [['streamers','스트리머 자동 포함'],['managers','관리자 자동 포함'],['partners','파트너 자동 포함']]){
    const label=document.createElement('label');label.className='ic-option';label.dataset.role=key;
    const text=document.createElement('span');text.textContent=title;
    const toggle=document.createElement('span');toggle.className='settings-switch';
    const input=document.createElement('input');input.type='checkbox';input.className='ic-'+key;if(key==='enabled')input.id='importantChatEnabled';input.setAttribute('role','switch');input.setAttribute('aria-label',title);
    const track=document.createElement('span');track.className='settings-switch-track';track.setAttribute('aria-hidden','true');toggle.append(input,track);label.append(text,toggle);$('.ic-options').appendChild(label);
  }
  function openSettings(){controls();if(!dialog.open)dialog.showModal();}
  $('.ic-settings-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();});
  function bounds(){const max=Math.max(64,chatPanel.clientHeight-160);return {min:Math.min(100,max),max};}
  function resize(){
    if(!chatPanel.clientHeight)return;
    const {min,max}=bounds(),height=Math.round(Math.max(min,Math.min(max,desiredHeight)));
    panel.style.setProperty('--ic-height',height+'px');
    present();
    handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(height));
  }
  function storeHeight(){chrome.storage.local.set({[HEIGHT_KEY]:desiredHeight}).catch(error=>notify('주요 채팅 높이 저장 실패: '+error.message));}
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={y:event.clientY,height:panel.getBoundingClientRect().height};chatPanel.classList.add('ic-resizing');handle.setPointerCapture(event.pointerId);};
  handle.onpointermove=event=>{if(!drag)return;const {min,max}=bounds();desiredHeight=Math.round(Math.max(min,Math.min(max,drag.height+(event.clientY-drag.y))));resize();};
  function endResize(){if(!drag)return;drag=null;chatPanel.classList.remove('ic-resizing');storeHeight();}
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=endResize;
  handle.onkeydown=event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const {min,max}=bounds(),step=event.shiftKey?50:10;desiredHeight=Math.max(min,Math.min(max,event.key==='Home'?min:event.key==='End'?max:Number(handle.getAttribute('aria-valuenow'))+(event.key==='ArrowDown'?step:-step)));resize();storeHeight();};
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(chatPanel);resize();
  window.addEventListener('pagehide',()=>{sizeObserver.disconnect();chatPanel.classList.remove('ic-resizing');});
  function present(){const frame=getFrame();if(!frame)return;const channel=getState().channels.find(c=>c.uid===getState().selectedUid);CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'CHAT_PRESENTATION',name:channel?.name||channel?.uid||'',height:0});}
  function diagnostics(){
    const owner=owners.get(getState().selectedUid);
    const number=key=>Number.isFinite(stats?.[key])?Math.max(0,Math.floor(stats[key])):0;
    $('.ic-diagnostics').textContent=(filter.enabled?'수집 켜짐':'수집 꺼짐')+' · 스트리머 확인: '+(owner?.name|| (owner?.pending?'조회 중':'확인 안 됨'))+'\n'+(!stats?'수집 프레임 응답 대기':'읽은 항목 '+number('scanned')+' · 해석 '+number('parsed')+' · 대상 '+number('matched')+' · 전송 '+number('sent'))+' · 수신 '+received+' · 표시 '+model.items.length;
  }
  function resolveOwner(){
    const uid=getState().selectedUid;if(!ready || getState().chatOpen===false || !uid || owners.has(uid) || !filter.enabled)return;
    const channel=getState().channels.find(c=>c.uid===uid);if(!channel)return;
    owners.set(uid,{pending:true,name:''});
    const request=channel.type==='video'?CZChzzkApi.fetchVideoChannelName(channel.sourceId||uid.replace(/^video:/,'')):CZChzzkApi.fetchChannelName(channel.sourceId||uid);
    Promise.resolve(request).then(name=>{owners.set(uid,{pending:false,name:typeof name==='string'?name:''});if(getState().selectedUid===uid){configure();diagnostics();}}).catch(()=>{owners.set(uid,{pending:false,name:''});diagnostics();});
  }
  function configure(){present();resolveOwner();const frame=getFrame();if(!ready || !frame || frame.dataset.playerReady!=='true')return;const signature=JSON.stringify([frame.dataset.uid,filter,owners.get(frame.dataset.uid)?.name||'']);if(configured.get(frame)===signature)return;if(CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'IMPORTANT_CHAT_CONFIG',settings:filter,streamerName:owners.get(frame.dataset.uid)?.name||''}))configured.set(frame,signature);}
  function render(){
    panel.hidden=ready && !filter.enabled;
    present();
    const list=$('.ic-list');const scrollTop=list.scrollTop,atBottom=list.scrollHeight-scrollTop-list.clientHeight<16;
    const items=model.items,ids=new Set(items.map(item=>item.id));
    for(const [id,entry] of rendered)if(!ids.has(id)){entry.node.remove();rendered.delete(id);}
    list.querySelector('.ic-empty')?.remove();
    const image=(src,alt,className)=>{const img=document.createElement('img');img.src=src;img.alt=alt;img.title=alt;img.className=className;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.draggable=false;img.onerror=()=>{const label=document.createElement('span');label.textContent=alt;img.replaceWith(label);};return img;};
    items.forEach((item,index)=>{
      const signature=JSON.stringify(item);let entry=rendered.get(item.id);
      if(!entry || entry.signature!==signature){
        const row=document.createElement('div');row.className='ic-message';row.dataset.role=item.role;
        const time=document.createElement('time');time.dateTime=new Date(item.time).toISOString();time.textContent=new Date(item.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
        const badges=document.createElement('span');badges.className='ic-badges';for(const badge of item.badges)badges.appendChild(image(badge.src,badge.alt,'ic-badge'));
        const author=document.createElement('strong');author.className='ic-author';author.textContent=`${item.name}${item.role==='streamer'?' · 스트리머':item.role==='manager'?' · 관리자':item.role==='partner'?' · 파트너':''}`;
        const text=document.createElement('span');text.className='ic-message-text';for(const part of item.segments)text.appendChild(part.type==='image'?image(part.src,part.alt,'ic-emote'):document.createTextNode(part.text));
        row.append(time,badges,author,document.createTextNode(' '),text);entry?.node.replaceWith(row);entry={node:row,signature};rendered.set(item.id,entry);
      }
      if(list.children[index]!==entry.node)list.insertBefore(entry.node,list.children[index]||null);
    });
    list.scrollTop=atBottom?list.scrollHeight:scrollTop;diagnostics();
  }
  function controls(){
    [...panel.querySelectorAll('input,button'),...dialog.querySelectorAll('input,button,select')].forEach(el=>el.disabled=!ready);
    enabledControl.checked=filter.enabled;enabledControl.disabled=!ready;
    for(const key of ['streamers','managers','partners'])$('.ic-'+key).checked=filter[key];
    $('.ic-names').replaceChildren();
    filter.names.forEach((name,index)=>{const button=document.createElement('button');button.type='button';button.textContent=name+' ×';button.title='사용자 제외';button.onclick=()=>save({...filter,names:filter.names.filter((_,i)=>i!==index)});$('.ic-names').appendChild(button);});
  }
  function save(value){filter=CZImportantChat.settings(value);model.clear();controls();configure();render();chrome.storage.local.set({[CZImportantChat.KEY]:filter}).catch(error=>notify('채팅 설정 저장 실패: '+error.message));}
  enabledControl.onchange=event=>save({...filter,enabled:event.target.checked});
  for(const key of ['streamers','managers','partners'])$('.ic-'+key).onchange=event=>save({...filter,[key]:event.target.checked});
  $('.ic-form').onsubmit=event=>{event.preventDefault();const input=$('.ic-name');if(!input.value.trim())return;if(filter.names.length>=50){notify('사용자는 최대 50명까지 지정할 수 있습니다.');return;}save({...filter,names:[...filter.names,input.value]});input.value='';};
  $('.ic-copy-diagnostics').onclick=async()=>{
    const structure={};for(const key of ['row','nickname','text'])structure[key]=typeof stats?.structure?.[key]==='string'?stats.structure[key].slice(0,180):'';
    const counts={};for(const key of ['scanned','parsed','matched','sent'])counts[key]=Number.isFinite(stats?.[key])?Math.max(0,Math.floor(stats[key])):0;
    const dom={rowCandidates:Number(stats?.dom?.rowCandidates)||0,nicknameCandidates:Number(stats?.dom?.nicknameCandidates)||0,classes:Array.isArray(stats?.dom?.classes)?stats.dom.classes.filter(value=>typeof value==='string').map(value=>value.slice(0,160)).slice(-40):[]};
    const roleSample=Array.isArray(stats?.roleSample)?stats.roleSample.slice(0,8).map(value=>({tag:String(value?.tag||'').slice(0,20),labels:Array.isArray(value?.labels)?value.labels.filter(item=>typeof item==='string').slice(0,4).map(item=>item.slice(0,80)):[],markers:Array.isArray(value?.markers)?value.markers.filter(item=>typeof item==='string').slice(0,3).map(item=>item.slice(0,120)):[]})):[];
    const report={dom,roleSample,collectorRevision:typeof stats?.revision==='string'?stats.revision.slice(0,40):'응답 없음',version:chrome.runtime.getManifest?.().version||'2.0.3',enabled:filter.enabled,streamers:filter.streamers,managers:filter.managers,partners:filter.partners,ownerKnown:!!owners.get(getState().selectedUid)?.name,frameReady:getFrame()?.dataset.playerReady==='true',counts,received,displayed:model.items.length,structure};
    try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));notify('채팅 내용 없이 점검 정보를 복사했습니다.');}catch(_){notify('점검 정보 복사 실패: 아래 수치를 직접 복사해주세요.');}
  };
  $('.ic-clear').onclick=()=>{model.clear();render();};
  chrome.storage.local.get([CZImportantChat.KEY,HEIGHT_KEY]).then(value=>{const height=Number(value[HEIGHT_KEY]);if(Number.isFinite(height) && height>=64 && height<=1600)desiredHeight=height;resize();filter=CZImportantChat.settings(value[CZImportantChat.KEY]);ready=true;controls();configure();render();}).catch(error=>{ready=true;controls();configure();render();notify('채팅 설정 불러오기 실패: '+error.message);});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes[HEIGHT_KEY]){const height=Number(changes[HEIGHT_KEY].newValue);if(Number.isFinite(height) && height>=64 && height<=1600){desiredHeight=height;resize();}}if(!changes[CZImportantChat.KEY])return;const next=CZImportantChat.settings(changes[CZImportantChat.KEY].newValue);if(JSON.stringify(next)===JSON.stringify(filter))return;filter=next;model.clear();controls();configure();render();});
  controls();render();
  return {openSettings,sync(force=false){if(getState().chatOpen===false && dialog.open)dialog.close();if(force && getFrame())configured.delete(getFrame());const uid=getState().chatOpen!==false?getState().selectedUid:null;if(model.uid!==uid){model.reset(uid);stats=null;received=0;}configure();render();},status(value){stats=value && typeof value==='object'?value:null;diagnostics();},receive(data){if(Array.isArray(data.messages))received+=Math.min(100,data.messages.length);if(ready && model.add(data.uid,data.messages,filter))render();else diagnostics();},panel};
}};
