// Read only visible chat markup. No socket interception or extra connection.
globalThis.CZChatCollector = {create({send}) {
  const rows='[class*="live_chatting_list_item"],[class*="live_chatting_message_container"],[data-chat-message]';
  const names='[class*="live_chatting_username_nickname"],[class*="name_text"],[data-chat-nickname]';
  const texts='[class*="live_chatting_message_text"],[data-chat-text]';
  let filter=CZImportantChat.settings({enabled:false}),observer=null,timer=null,sequence=0;
  let seen=new WeakMap();const pending=new Map();
  function role(row,textElements) {
    const author=row.querySelector('[class*="live_chatting_username"],[data-chat-author]');
    if(!author)return '';
    let manager=false;
    for(const badge of author.querySelectorAll('img,[data-role],[aria-label],[title]')){
      if(textElements.some(el=>el.contains(badge)))continue;
      const values=['alt','title','aria-label','data-role'].map(key=>String(badge.getAttribute(key)||'').trim().toLowerCase().replace(/(?:\s*배지|\s+badge)$/,''));
      if(values.some(v=>['스트리머','방송자','streamer','owner','streaming_channel_owner'].includes(v)))return 'streamer';
      if(values.some(v=>['채널 관리자','채널관리자','채널 매니저','매니저','방송 관리자','manager','channel manager','channel_manager','streaming_channel_manager'].includes(v)))manager=true;
    }
    return manager?'manager':'';
  }
  function content(node) {
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1)return '';
    if(node.tagName==='IMG')return node.getAttribute('alt') || '[이모티콘]';
    if(node.tagName==='BR')return '\n';
    return Array.from(node.childNodes,content).join('');
  }
  function flush(){timer=null;if(pending.size){send(Array.from(pending.values()));pending.clear();}}
  function read(row) {
    row=row.closest('[class*="live_chatting_list_item"],[data-chat-message]') || row;
    const nickname=row.querySelector(names),parts=Array.from(row.querySelectorAll(texts));
    if(!nickname || !parts.length)return;
    const topParts=parts.filter(part=>!parts.some(other=>other!==part && other.contains(part)));
    const name=nickname.textContent.trim().slice(0,80),text=topParts.map(content).join(' ').trim().slice(0,1000);
    if(!name || !text)return;
    const fingerprint=JSON.stringify([name,text]),previous=seen.get(row);
    const id=String(row.getAttribute('data-message-id') || row.getAttribute('data-chat-id') || (previous?.fingerprint===fingerprint?previous.id:++sequence)).slice(0,160);
    const item={id,name,text,role:role(row,topParts),time:previous?.fingerprint===fingerprint?previous.time:Date.now()};
    const signature=JSON.stringify(item);
    if(previous?.signature===signature)return;
    seen.set(row,{fingerprint,id,time:item.time,signature});
    if(!CZImportantChat.matches(item,filter))return;
    pending.set(id,item);if(pending.size>CZImportantChat.LIMIT)pending.delete(pending.keys().next().value);
    if(!timer)timer=setTimeout(flush,250);
  }
  function scan(node) {
    const el=node.nodeType===1?node:node.parentElement;if(!el)return;
    const closest=el.closest(rows);if(closest){read(closest);return;}
    Array.from(el.querySelectorAll(rows)).slice(-200).forEach(read);
  }
  function stop(){observer?.disconnect();observer=null;clearTimeout(timer);timer=null;pending.clear();seen=new WeakMap();}
  function configure(value) {
    stop();filter=CZImportantChat.settings(value);if(!filter.enabled)return;
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
