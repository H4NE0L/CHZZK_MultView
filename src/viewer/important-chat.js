globalThis.CZImportantChatPanel = {create({chatPanel,enabledControl,getFrame,getState,notify}) {
  const model=CZImportantChat.create();let filter=CZImportantChat.settings(),ready=false;const configured=new WeakMap();
  const owners=new Map();let stats=null,received=0;
  const HEIGHT_KEY='chzzkImportantChatHeightV1';let desiredHeight=200,drag=null;
  const panel=document.createElement('section');panel.className='important-chat-panel';panel.setAttribute('aria-label','주요 채팅');
  panel.innerHTML='<header class="ic-header"><strong>주요 채팅 <span class="ic-count">(0)</span></strong></header><div class="ic-body"><div class="ic-list"></div><div class="ic-bottom"><small class="ic-status"></small></div></div><div class="ic-resizer" role="separator" aria-label="주요 채팅 영역 높이" aria-orientation="horizontal" tabindex="0"></div><dialog class="ic-dialog" aria-labelledby="icSettingsTitle"><header><strong id="icSettingsTitle">채팅 설정</strong><button class="ic-settings-close" type="button" aria-label="채팅 설정 닫기">✕</button></header><div class="ic-settings"><strong class="ic-settings-heading">주요 채팅 모음</strong><div class="ic-options"></div><form class="ic-form"><input class="ic-name" maxlength="40" placeholder="추가할 닉네임" aria-label="주요 채팅 사용자 닉네임"><button type="submit">추가</button></form><div class="ic-names"></div><p class="ic-diagnostics" aria-live="polite"></p><button class="ic-clear" type="button">수집된 내용 초기화</button></div></dialog>';
  chatPanel.insertBefore(panel,chatPanel.querySelector('.chat-frame-wrap'));
  const dialog=panel.querySelector('.ic-dialog'),$=selector=>panel.querySelector(selector)||dialog.querySelector(selector),handle=$('.ic-resizer');
  chatPanel.appendChild(dialog);
  for(const [key,title] of [['streamers','스트리머 자동 포함'],['managers','관리자 자동 포함']]){
    const label=document.createElement('label');label.className='ic-option';
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
  handle.onpointermove=event=>{if(!drag)return;const {min,max}=bounds();desiredHeight=Math.round(Math.max(min,Math.min(max,drag.height+event.clientY-drag.y)));resize();};
  function endResize(){if(!drag)return;drag=null;chatPanel.classList.remove('ic-resizing');storeHeight();}
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=endResize;
  handle.onkeydown=event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const {min,max}=bounds(),step=event.shiftKey?50:10;desiredHeight=Math.max(min,Math.min(max,event.key==='Home'?min:event.key==='End'?max:Number(handle.getAttribute('aria-valuenow'))+(event.key==='ArrowDown'?step:-step)));resize();storeHeight();};
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(chatPanel);resize();
  window.addEventListener('pagehide',()=>{sizeObserver.disconnect();chatPanel.classList.remove('ic-resizing');});
  function present(){const frame=getFrame();if(!frame)return;const channel=getState().channels.find(c=>c.uid===getState().selectedUid);CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'CHAT_PRESENTATION',name:channel?.name||channel?.uid||'',height:filter.enabled?Math.round(panel.getBoundingClientRect().height):0});}
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
    list.scrollTop=atBottom?list.scrollHeight:scrollTop;diagnostics();
  }
  function controls(){
    [...panel.querySelectorAll('input,button'),...dialog.querySelectorAll('input,button,select')].forEach(el=>el.disabled=!ready);
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
  return {openSettings,setHeaderHeight(height,menuOpen){panel.style.visibility=menuOpen===true?'hidden':'';if(Number.isFinite(height)&&height>=24&&height<=100)chatPanel.style.setProperty('--chat-native-header',height+'px');},sync(force=false){if(getState().chatOpen===false && dialog.open)dialog.close();if(force && getFrame())configured.delete(getFrame());const uid=getState().chatOpen!==false?getState().selectedUid:null;if(model.uid!==uid){model.reset(uid);stats=null;received=0;}configure();render();},status(value){stats=value && typeof value==='object'?value:null;diagnostics();},receive(data){if(Array.isArray(data.messages))received+=Math.min(100,data.messages.length);if(ready && model.add(data.uid,data.messages,filter))render();else diagnostics();},panel};
}};
