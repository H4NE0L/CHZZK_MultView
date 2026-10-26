globalThis.CZImportantChatPanel = {create({chatPanel,getFrame,getState,notify}) {
  const model=CZImportantChat.create();let filter=CZImportantChat.settings(),ready=false;const configured=new WeakMap();
  const panel=document.createElement('details');panel.className='important-chat-panel';panel.open=true;
  panel.innerHTML='<summary>주요 채팅 <span class="ic-count">(0)</span></summary><div class="ic-body"><div class="ic-options"><label><input class="ic-enabled" type="checkbox">사용</label><label><input class="ic-streamers" type="checkbox">스트리머</label><label><input class="ic-managers" type="checkbox">관리자</label></div><form class="ic-form"><input class="ic-name" maxlength="40" placeholder="추가할 닉네임" aria-label="주요 채팅 사용자 닉네임"><button type="submit">추가</button></form><div class="ic-names"></div><div class="ic-list"></div><div class="ic-bottom"><small class="ic-status"></small><button class="ic-clear" type="button">목록 비우기</button></div></div>';
  chatPanel.insertBefore(panel,chatPanel.querySelector('.chat-frame-wrap'));
  const $=selector=>panel.querySelector(selector);
  function configure(){const frame=getFrame();if(!ready || !frame || frame.dataset.playerReady!=='true')return;const signature=JSON.stringify([frame.dataset.uid,filter]);if(configured.get(frame)===signature)return;if(CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'IMPORTANT_CHAT_CONFIG',settings:filter}))configured.set(frame,signature);}
  function render(){
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
    panel.querySelectorAll('input,button').forEach(el=>el.disabled=!ready);
    for(const key of ['enabled','streamers','managers'])$('.ic-'+key).checked=filter[key];
    $('.ic-names').replaceChildren();
    filter.names.forEach((name,index)=>{const button=document.createElement('button');button.type='button';button.textContent=name+' ×';button.title='사용자 제외';button.onclick=()=>save({...filter,names:filter.names.filter((_,i)=>i!==index)});$('.ic-names').appendChild(button);});
  }
  function save(value){filter=CZImportantChat.settings(value);model.clear();controls();configure();render();chrome.storage.local.set({[CZImportantChat.KEY]:filter}).catch(error=>notify('주요 채팅 설정 저장 실패: '+error.message));}
  for(const key of ['enabled','streamers','managers'])$('.ic-'+key).onchange=event=>save({...filter,[key]:event.target.checked});
  $('.ic-form').onsubmit=event=>{event.preventDefault();const input=$('.ic-name');if(!input.value.trim())return;if(filter.names.length>=50){notify('사용자는 최대 50명까지 지정할 수 있습니다.');return;}save({...filter,names:[...filter.names,input.value]});input.value='';};
  $('.ic-clear').onclick=()=>{model.clear();render();};
  chrome.storage.local.get(CZImportantChat.KEY).then(value=>{filter=CZImportantChat.settings(value[CZImportantChat.KEY]);ready=true;controls();configure();render();}).catch(error=>{ready=true;controls();configure();render();notify('주요 채팅 설정 불러오기 실패: '+error.message);});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local' || !changes[CZImportantChat.KEY])return;const next=CZImportantChat.settings(changes[CZImportantChat.KEY].newValue);if(JSON.stringify(next)===JSON.stringify(filter))return;filter=next;model.clear();controls();configure();render();});
  controls();render();
  return {sync(force=false){if(force && getFrame())configured.delete(getFrame());const uid=getState().chatOpen!==false?getState().selectedUid:null;if(model.uid!==uid)model.reset(uid);configure();render();},receive(data){if(ready && model.add(data.uid,data.messages,filter))render();},panel};
}};
