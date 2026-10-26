globalThis.CZImportantChatPanel = {create({chatPanel,getFrame,getState,notify}) {
  const model=CZImportantChat.create();let filter=CZImportantChat.settings(),ready=false;const configured=new WeakMap();
  const panel=document.createElement('details');panel.className='important-chat-panel';panel.open=true;
  panel.innerHTML='<summary>주요 채팅 <span class="ic-count">(0)</span></summary><div class="ic-body"><div class="ic-tabs" role="tablist" aria-label="주요 채팅 보기"><button class="ic-list-tab" id="icListTab" type="button" role="tab" aria-selected="true" aria-controls="icMessages">채팅 목록</button><button class="ic-settings-tab" id="icSettingsTab" type="button" role="tab" aria-selected="false" aria-controls="icSettings" tabindex="-1">설정</button></div><div id="icMessages" role="tabpanel" aria-labelledby="icListTab"><div class="ic-list"></div></div><div id="icSettings" class="ic-settings" role="tabpanel" aria-labelledby="icSettingsTab" hidden><div class="ic-options"><label><input class="ic-enabled" type="checkbox">사용</label><label><input class="ic-streamers" type="checkbox">스트리머</label><label><input class="ic-managers" type="checkbox">관리자</label></div><form class="ic-form"><input class="ic-name" maxlength="40" placeholder="추가할 닉네임" aria-label="주요 채팅 사용자 닉네임"><button type="submit">추가</button></form><div class="ic-names"></div><button class="ic-clear" type="button">수집된 내용 초기화</button></div><div class="ic-bottom"><small class="ic-status"></small></div></div>';
  chatPanel.insertBefore(panel,chatPanel.querySelector('.chat-frame-wrap'));
  const $=selector=>panel.querySelector(selector);
  function selectTab(name,focus=false){
    for(const current of ['list','settings']){
      const tab=$('.ic-'+current+'-tab'),selected=current===name;
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      $('#'+tab.getAttribute('aria-controls')).hidden=!selected;
      if(selected && focus)tab.focus();
    }
  }
  for(const name of ['list','settings']){
    const tab=$('.ic-'+name+'-tab');tab.onclick=()=>selectTab(name);
    tab.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      selectTab(event.key==='Home'?'list':event.key==='End'?'settings':name==='list'?'settings':'list',true);
    };
  }
  $('summary').addEventListener('click',()=>{if(!panel.open)selectTab('list');});
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
