globalThis.CZImportantChatPanel = {create({chatPanel,onChatSideChange,onChatOpenChange,getFrame,getState,notify}) {
  const model=CZImportantChat.create();let filter=CZImportantChat.settings(),ready=false;const configured=new WeakMap();
  const HEIGHT_KEY='chzzkImportantChatHeightV1';let desiredHeight=200,drag=null;
  const panel=document.createElement('section');panel.className='important-chat-panel';panel.setAttribute('aria-label','주요 채팅');
  panel.innerHTML='<header class="ic-header"><strong>주요 채팅 <span class="ic-count">(0)</span></strong><button class="ic-settings-open" type="button" title="채팅 설정" aria-label="채팅 설정"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></svg></button></header><div class="ic-body"><div class="ic-list"></div><div class="ic-bottom"><small class="ic-status"></small></div></div><div class="ic-resizer" role="separator" aria-label="주요 채팅 영역 높이" aria-orientation="horizontal" tabindex="0"></div><dialog class="ic-dialog" aria-labelledby="icSettingsTitle"><header><strong id="icSettingsTitle">채팅 설정</strong><button class="ic-settings-close" type="button" aria-label="채팅 설정 닫기">✕</button></header><div class="ic-settings"><div class="ic-chat-options"><label><span>채팅 표시</span><span class="settings-switch"><input class="ic-chat-open" type="checkbox" role="switch" aria-label="채팅 표시"><span class="settings-switch-track" aria-hidden="true"></span></span></label><label><span>채팅창 위치</span><select class="ic-chat-side" aria-label="채팅창 위치"><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label></div><strong class="ic-settings-heading">주요 채팅 모음</strong><div class="ic-options"></div><form class="ic-form"><input class="ic-name" maxlength="40" placeholder="추가할 닉네임" aria-label="주요 채팅 사용자 닉네임"><button type="submit">추가</button></form><div class="ic-names"></div><button class="ic-clear" type="button">수집된 내용 초기화</button></div></dialog>';
  chatPanel.insertBefore(panel,chatPanel.querySelector('.chat-frame-wrap'));
  const dialog=panel.querySelector('.ic-dialog'),$=selector=>panel.querySelector(selector)||dialog.querySelector(selector),handle=$('.ic-resizer');
  chatPanel.appendChild(dialog);
  for(const [key,title] of [['enabled','주요 채팅 사용'],['streamers','스트리머 자동 포함'],['managers','관리자 자동 포함']]){
    const label=document.createElement('label');label.className='ic-option';
    const text=document.createElement('span');text.textContent=title;
    const toggle=document.createElement('span');toggle.className='settings-switch';
    const input=document.createElement('input');input.type='checkbox';input.className='ic-'+key;if(key==='enabled')input.id='importantChatEnabled';input.setAttribute('role','switch');input.setAttribute('aria-label',title);
    const track=document.createElement('span');track.className='settings-switch-track';track.setAttribute('aria-hidden','true');toggle.append(input,track);label.append(text,toggle);$('.ic-options').appendChild(label);
  }
  const enabledControl=$('.ic-enabled');
  function openSettings(){controls();if(!dialog.open)dialog.showModal();}
  $('.ic-settings-open').onclick=openSettings;
  $('.ic-chat-side').onchange=event=>onChatSideChange(event.target.value);
  $('.ic-chat-open').onchange=event=>onChatOpenChange(event.target.checked);
  $('.ic-settings-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();});
  function bounds(){const max=Math.max(64,chatPanel.clientHeight-160);return {min:Math.min(100,max),max};}
  function resize(){
    if(!chatPanel.clientHeight)return;
    const {min,max}=bounds(),height=Math.round(Math.max(min,Math.min(max,desiredHeight)));
    panel.style.setProperty('--ic-height',height+'px');
    handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(height));
  }
  function storeHeight(){chrome.storage.local.set({[HEIGHT_KEY]:desiredHeight}).catch(error=>notify('주요 채팅 높이 저장 실패: '+error.message));}
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={y:event.clientY,height:panel.getBoundingClientRect().height};chatPanel.classList.add('ic-resizing');handle.setPointerCapture(event.pointerId);};
  handle.onpointermove=event=>{if(!drag)return;const {min,max}=bounds();desiredHeight=Math.round(Math.max(min,Math.min(max,drag.height+event.clientY-drag.y)));resize();};
  function endResize(){if(!drag)return;drag=null;chatPanel.classList.remove('ic-resizing');storeHeight();}
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=endResize;
  handle.onkeydown=event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const {min,max}=bounds(),step=event.shiftKey?50:10;desiredHeight=Math.max(min,Math.min(max,event.key==='Home'?min:event.key==='End'?max:Number(handle.getAttribute('aria-valuenow'))+(event.key==='ArrowDown'?step:-step)));resize();storeHeight();};
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(chatPanel);resize();
  window.addEventListener('pagehide',()=>{sizeObserver.disconnect();chatPanel.classList.remove('ic-resizing');});
  function configure(){const frame=getFrame();if(!ready || !frame || frame.dataset.playerReady!=='true')return;const signature=JSON.stringify([frame.dataset.uid,filter]);if(configured.get(frame)===signature)return;if(CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'IMPORTANT_CHAT_CONFIG',settings:filter}))configured.set(frame,signature);}
  function render(){
    panel.hidden=ready && !filter.enabled;
    $('.ic-count').textContent=`(${model.items.length})`;
    $('.ic-status').textContent=!ready?'설정 불러오는 중':!filter.enabled?'수집 꺼짐':getState().chatOpen===false?'채팅 닫힘 · 수집 중지':'최근 100개 · 현재 방송';
    const list=$('.ic-list');const scrollTop=list.scrollTop,atBottom=list.scrollHeight-scrollTop-list.clientHeight<16;list.replaceChildren();
    for(const item of model.items){
      const row=document.createElement('div');row.className='ic-message';
      const author=document.createElement('strong');author.textContent=`${item.name}${item.role==='streamer'?' · 스트리머':item.role==='manager'?' · 관리자':''}`;
      const text=document.createElement('span');text.textContent=item.text;
      const time=document.createElement('time');time.textContent=new Date(item.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      row.append(time,author,text);list.appendChild(row);
    }
    if(!model.items.length){const empty=document.createElement('p');empty.className='ic-empty';empty.textContent='대상 사용자의 채팅이 이곳에 표시됩니다.';list.appendChild(empty);}
    list.scrollTop=atBottom?list.scrollHeight:scrollTop;
  }
  function controls(){
    [...panel.querySelectorAll('input,button'),...dialog.querySelectorAll('input,button,select')].forEach(el=>el.disabled=!ready);
    $('.ic-chat-open').checked=getState().chatOpen!==false;$('.ic-chat-side').value=getState().chatSide==='left'?'left':'right';
    enabledControl.checked=filter.enabled;enabledControl.disabled=!ready;
    for(const key of ['streamers','managers'])$('.ic-'+key).checked=filter[key];
    $('.ic-names').replaceChildren();
    filter.names.forEach((name,index)=>{const button=document.createElement('button');button.type='button';button.textContent=name+' ×';button.title='사용자 제외';button.onclick=()=>save({...filter,names:filter.names.filter((_,i)=>i!==index)});$('.ic-names').appendChild(button);});
  }
  function save(value){filter=CZImportantChat.settings(value);model.clear();controls();configure();render();chrome.storage.local.set({[CZImportantChat.KEY]:filter}).catch(error=>notify('채팅 설정 저장 실패: '+error.message));}
  enabledControl.onchange=event=>save({...filter,enabled:event.target.checked});
  for(const key of ['streamers','managers'])$('.ic-'+key).onchange=event=>save({...filter,[key]:event.target.checked});
  $('.ic-form').onsubmit=event=>{event.preventDefault();const input=$('.ic-name');if(!input.value.trim())return;if(filter.names.length>=50){notify('사용자는 최대 50명까지 지정할 수 있습니다.');return;}save({...filter,names:[...filter.names,input.value]});input.value='';};
  $('.ic-clear').onclick=()=>{model.clear();render();};
  chrome.storage.local.get([CZImportantChat.KEY,HEIGHT_KEY]).then(value=>{const height=Number(value[HEIGHT_KEY]);if(Number.isFinite(height) && height>=64 && height<=1600)desiredHeight=height;resize();filter=CZImportantChat.settings(value[CZImportantChat.KEY]);ready=true;controls();configure();render();}).catch(error=>{ready=true;controls();configure();render();notify('채팅 설정 불러오기 실패: '+error.message);});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes[HEIGHT_KEY]){const height=Number(changes[HEIGHT_KEY].newValue);if(Number.isFinite(height) && height>=64 && height<=1600){desiredHeight=height;resize();}}if(!changes[CZImportantChat.KEY])return;const next=CZImportantChat.settings(changes[CZImportantChat.KEY].newValue);if(JSON.stringify(next)===JSON.stringify(filter))return;filter=next;model.clear();controls();configure();render();});
  controls();render();
  return {openSettings,sync(force=false){if(getState().chatOpen===false && dialog.open)dialog.close();if(force && getFrame())configured.delete(getFrame());const uid=getState().chatOpen!==false?getState().selectedUid:null;if(model.uid!==uid)model.reset(uid);configure();render();},receive(data){if(ready && model.add(data.uid,data.messages,filter))render();},panel};
}};
