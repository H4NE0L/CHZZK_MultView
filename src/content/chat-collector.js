// Read only visible chat markup. No socket interception or extra connection.
globalThis.CZChatCollector = {create({send,status=()=>{}}) {
  const rows='[class*="live_chatting_list_item"],[class*="live_chatting_message_container"],[data-chat-message],[class*="live_chatting_message_item"],[role="listitem"]';
  const names='[class*="live_chatting_username_nickname"],[class*="name_text"],[data-chat-nickname],[class*="username"] [class*="nickname"]';
  const texts='[class*="live_chatting_message_text"],[data-chat-text]';
  let filter=CZImportantChat.settings({enabled:false}),observer=null,timer=null,sequence=0;
  const identities=new WeakMap();let seen=new WeakMap(),observed=new WeakSet(),ownerName='',statusTimer=null;let counts={scanned:0,parsed:0,matched:0,sent:0};let structure=null;const pending=new Map();
  const nameKey=value=>String(value||'').normalize('NFC').trim().toLocaleLowerCase('ko-KR');
  function report(){if(!statusTimer)statusTimer=setTimeout(()=>{statusTimer=null;status({...counts,revision:'20261028-2',ownerKnown:!!ownerName,enabled:filter.enabled,structure});},500);}
  function role(row,textElements,nickname) {
    if(ownerName && nameKey(nickname.textContent)===nameKey(ownerName))return 'streamer';
    // Role badges can be siblings of the username rather than its children.
    // Only inspect author markup before the nickname, never message content.
    const author=nickname.closest('[class*="live_chatting_username"],[data-chat-author]');
    let manager=false;
    const badges=[...row.querySelectorAll('img,svg title,[data-role],[aria-label],[title]')];
    for(const badge of badges){
      if(textElements.some(el=>el===badge || el.contains(badge)) || badge.contains(nickname))continue;
      const beforeName=!!(badge.compareDocumentPosition(nickname)&Node.DOCUMENT_POSITION_FOLLOWING);
      if(!beforeName && !(author && author!==nickname && author.contains(badge)))continue;
      const raw=['alt','title','aria-label','data-role'].map(key=>badge.getAttribute(key));
      if(badge.matches('svg title'))raw.push(badge.textContent);
      const values=raw.map(value=>String(value||'').normalize('NFC').trim().toLowerCase().replace(/(?:\s*(?:배지|아이콘)|\s+(?:badge|icon))$/,'').trim());
      if(values.some(v=>['스트리머','방송자','방송인','streamer','owner','streaming_channel_owner'].includes(v)))return 'streamer';
      if(values.some(v=>['채널 관리자','채널관리자','채널 매니저','매니저','방송 관리자','manager','channel manager','channel_manager','streaming_channel_manager'].includes(v)))manager=true;
    }
    return manager?'manager':'';
  }
  function content(node) {
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1 && node.nodeType!==11)return '';
    if(node.tagName==='IMG')return node.getAttribute('alt') || '[이모티콘]';
    if(node.tagName==='BR')return '\n';
    return Array.from(node.childNodes,content).join('');
  }
  function flush(){timer=null;if(pending.size){const batch=Array.from(pending.values());send(batch);counts.sent+=batch.length;pending.clear();report();}}
  function read(row) {
    const outer=row.closest('[class*="live_chatting_list_item"],[data-chat-message]');
    const leafNames=node=>[...node.querySelectorAll(names)].filter(el=>![...el.querySelectorAll(names)].length);
    if(outer && leafNames(outer).length===1)row=outer;
    if(leafNames(row).length>1){for(const child of [...row.querySelectorAll(rows)].slice(-200))if(leafNames(child).length===1)read(child);return;}
    const header=document.querySelector('.cz-native-chat-header');
    if(header && !(header.compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING))return;
    if(!observed.has(row)){observed.add(row);counts.scanned++;report();}
    const nickname=leafNames(row)[0],parts=Array.from(row.querySelectorAll(texts));
    structure={row:String(row.className||row.tagName).slice(0,180),nickname:nickname?String(nickname.className||nickname.tagName).slice(0,180):'찾지 못함',text:parts[0]?String(parts[0].className||parts[0].tagName).slice(0,180):'찾지 못함'};report();
    if(!nickname)return;
    const topParts=parts.filter(part=>!parts.some(other=>other!==part && other.contains(part)));
    let body=topParts.map(content).join(' ').trim();
    if(!body){
      // Preserve inline text/emotes when CHZZK changes the body CSS module name.
      const range=document.createRange();range.selectNodeContents(row);range.setStartAfter(nickname);
      const fragment=range.cloneContents();fragment.querySelectorAll('button,script,style,time,[class*="badge"],[class*="Badge"]').forEach(el=>el.remove());
      body=content(fragment).trim();
      if(body)structure.text='이름 뒤 DOM (대체 경로)';
    }
    const name=nickname.textContent.trim().slice(0,80),text=body.slice(0,1000);
    if(!name || !text)return;
    const fingerprint=JSON.stringify([name,text]),previous=identities.get(row);
    const id=String(row.getAttribute('data-message-id') || row.getAttribute('data-chat-id') || (previous?.fingerprint===fingerprint?previous.id:++sequence)).slice(0,160);
    const item={id,name,text,role:role(row,topParts,nickname),time:previous?.fingerprint===fingerprint?previous.time:Date.now()};
    const signature=JSON.stringify(item);
    if(seen.get(row)?.signature===signature)return;
    counts.parsed++;report();
    const identity={fingerprint,id,time:item.time,signature};identities.set(row,identity);seen.set(row,identity);
    if(!CZImportantChat.matches(item,filter))return;
    counts.matched++;
    pending.set(id,item);if(pending.size>CZImportantChat.LIMIT)pending.delete(pending.keys().next().value);
    if(!timer)timer=setTimeout(flush,250);
  }
  function scan(node) {
    const el=node.nodeType===1?node:node.parentElement;if(!el)return;
    const closest=el.closest(rows);if(closest){read(closest);return;}
    Array.from(el.querySelectorAll(rows)).slice(-200).forEach(read);
  }
  function stop(){observer?.disconnect();observer=null;clearTimeout(timer);timer=null;pending.clear();seen=new WeakMap();observed=new WeakSet();clearTimeout(statusTimer);statusTimer=null;}
  function configure(value,identity={}) {
    stop();structure=null;counts={scanned:0,parsed:0,matched:0,sent:0};ownerName=typeof identity.streamerName==='string'?identity.streamerName.slice(0,80):'';filter=CZImportantChat.settings(value);report();if(!filter.enabled)return;
    observer=new MutationObserver(records=>{
      const candidates=new Set();
      for(const record of records){candidates.add(record.target);for(const node of record.addedNodes)candidates.add(node);}
      for(const node of candidates)scan(node);
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['alt','title','aria-label','data-role']});
    scan(document.body);
  }
  window.addEventListener('pagehide',stop);
  return {configure,stop};
}};
