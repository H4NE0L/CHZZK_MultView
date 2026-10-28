// Read only visible chat markup. No socket interception or extra connection.
globalThis.CZChatCollector = {create({send,status=()=>{}}) {
  const rows='[class*="live_chatting_list_item"],[class*="live_chatting_message_container"],[data-chat-message],[class*="live_chatting_message_item"],[role="listitem"],[class*="live_chatting_message_wrapper"],[class*="live_chatting_chat_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
  const names='[class*="live_chatting_username_nickname"],[class*="name_text"],[data-chat-nickname],[class*="username"] [class*="nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
  const texts='[class*="live_chatting_message_text"],[data-chat-text]';
  let filter=CZImportantChat.settings({enabled:false}),observer=null,timer=null,sequence=0;
  const identities=new WeakMap();let seen=new WeakMap(),observed=new WeakSet(),ownerName='',statusTimer=null;let counts={scanned:0,parsed:0,matched:0,sent:0};let structure=null;const pending=new Map();
  const nameKey=value=>String(value||'').normalize('NFC').trim().toLocaleLowerCase('ko-KR');
  function domSummary(){
    return {rowCandidates:document.querySelectorAll(rows).length,nicknameCandidates:document.querySelectorAll(names).length,
      classes:counts.scanned?[]:[...new Set([...document.querySelectorAll('[class*="chat"],[class*="name"]')].slice(-100).map(el=>String(el.className||'').slice(0,160)))].slice(-40)};
  }
  function report(){if(!statusTimer)statusTimer=setTimeout(()=>{statusTimer=null;status({...counts,revision:'20261029-1',ownerKnown:!!ownerName,enabled:filter.enabled,structure,roleSample,dom:domSummary()});},500);}
  const leafNames=node=>{const found=[...node.querySelectorAll(names)].filter(el=>!el.querySelector(names));
    // A scoped message has one author; later nickname components may be mentions.
    return node.matches?.('[class^="_chatting_message_"],[class*=" _chatting_message_"]')?found.slice(0,1):found;};
  function afterName(row,nickname){
    const range=document.createRange();range.selectNodeContents(row);range.setStartAfter(nickname);
    const fragment=range.cloneContents();fragment.querySelectorAll('button,script,style,time,[class*="badge"],[class*="Badge"]').forEach(el=>el.remove());return fragment;
  }
  function textAfter(row,nickname){return content(afterName(row,nickname)).trim();}
  function richParts(node,parts=[]){
    if(parts.length>=64)return parts;
    if(node.nodeType===3){parts.push({type:'text',text:node.textContent});return parts;}
    if(node.nodeType!==1 && node.nodeType!==11)return parts;
    if(node.tagName==='IMG'){parts.push({type:'image',src:node.currentSrc||node.src||'',alt:node.getAttribute('alt')||'[이모티콘]'});return parts;}
    if(node.tagName==='BR'){parts.push({type:'text',text:'\n'});return parts;}
    if(node.matches?.('script,style,button'))return parts;
    for(const child of node.childNodes)richParts(child,parts);return parts;
  }
  function rowForName(nickname){
    if(nickname.closest('.cz-native-chat-header,[role="menu"],#cz-chat-settings'))return null;
    let row=nickname.parentElement;
    for(let depth=0;row && row!==document.body && depth<7;depth++,row=row.parentElement){
      const found=leafNames(row);if(found.length>1)return null;
      if(found.length!==1 || /username|nickname/.test(String(row.className)))continue;
      if(row.querySelector(texts) || textAfter(row,nickname))return row;
    }
    return null;
  }
  function colorRole(color){
    const values=String(color).match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);if(!values)return '';
    const [r,g,b]=values.slice(1,4).map(value=>Number(value)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    if(max<.5 || delta/max<.45)return '';
    let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;
    if(hue>=20 && hue<=60)return 'streamer';
    if(hue>=190 && hue<=250)return 'manager';
    if(hue>=90 && hue<185)return 'partner';
    return '';
  }
  function bodyColor(row,nickname,parts){
    for(const part of parts){const role=colorRole(getComputedStyle(part).color);if(role)return {role,color:getComputedStyle(part).color};}
    const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      if(nickname.contains(node) || !String(node.textContent).trim() || !(nickname.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      const parent=node.parentElement;if(!parent || parent.closest('button,svg,script,style,time,[class*="badge"],[class*="Badge"]'))continue;
      const style=getComputedStyle(parent);if(style.display==='none' || style.visibility==='hidden')continue;
      return {role:colorRole(style.color),color:style.color};
    }
    const color=getComputedStyle(row).color;return {role:colorRole(color),color};
  }
  let roleSample=[];
  function role(row,textElements,nickname) {
    if(ownerName && nameKey(nickname.textContent)===nameKey(ownerName))return 'streamer';
    let author=nickname.parentElement;
    for(let node=author,depth=0;node && node!==row && depth<4;node=node.parentElement,depth++)if(/username|nickname|author/.test(String(node.className)))author=node;
    let detected='';const priority={streamer:3,manager:2,partner:1};roleSample=[];
    const candidates=row.querySelectorAll('img,svg,svg use,[data-role],[data-user-role],[data-user-type],[aria-label],[title],[class*="badge"],[class*="Badge"]');
    for(const badge of candidates){
      if(textElements.some(el=>el===badge || el.contains(badge)))continue;
      const beforeName=!!(badge.compareDocumentPosition(nickname)&Node.DOCUMENT_POSITION_FOLLOWING);
      if(!beforeName && !badge.contains(nickname) && !(author && author!==nickname && author.contains(badge)))continue;
      const raw=['alt','title','aria-label','data-role','data-user-role','data-user-type'].map(key=>{const value=badge.getAttribute(key);return badge.contains(nickname) && ['alt','title','aria-label'].includes(key) && nameKey(value)===nameKey(nickname.textContent)?'':value;});
      if(badge.matches('svg'))raw.push(...[...badge.querySelectorAll('title')].map(el=>el.textContent));
      const semantic=[badge.getAttribute('class'),badge.getAttribute('id')];
      if(badge.matches('use'))semantic.push(badge.getAttribute('href'),badge.getAttribute('xlink:href'));
      if(badge.matches('img')){try{semantic.push(new URL(badge.currentSrc||badge.src).pathname.split('/').at(-1));}catch(_){}}
      const values=raw.map(value=>String(value||'').normalize('NFC').trim().toLowerCase().replace(/(?:\s*(?:배지|아이콘)|\s+(?:badge|icon))$/,'').trim());
      const markers=semantic.map(value=>String(value||'').toLowerCase());
      if(roleSample.length<8)roleSample.push({tag:badge.tagName,labels:values.filter(Boolean).slice(0,4).map(value=>value.slice(0,80)),markers:markers.filter(Boolean).slice(0,3).map(value=>value.slice(0,120))});
      let next='';
      if(values.some(v=>['스트리머','방송자','방송인','streamer','broadcaster','owner','streaming_channel_owner'].includes(v)) || markers.some(v=>!/(?:^|[._\s/#-])partner(?:$|[._\s/#-])/.test(v) && /(?:^|[._\s/#-])(?:streamer|broadcaster|streaming_channel_owner)(?:$|[._\s/#-])/.test(v)))next='streamer';
      else if(values.some(v=>['채널 관리자','채널관리자','채널 매니저','매니저','방송 관리자','관리자','manager','channel manager','channel_manager','streaming_channel_manager'].includes(v)) || markers.some(v=>/(?:^|[._\s/#-])(?:manager|channel_manager|streaming_channel_manager)(?:$|[._\s/#-])/.test(v)))next='manager';
      else if(values.some(v=>['파트너','파트너 스트리머','공식 파트너','partner','partner streamer','partner_streamer'].includes(v)) || markers.some(v=>/(?:^|[._\s/#-])partner(?:$|[._\s/#-])/.test(v)))next='partner';
      if((priority[next]||0)>(priority[detected]||0))detected=next;
    }
    if(detected)return detected;
    const body=bodyColor(row,nickname,textElements);roleSample.unshift({tag:'BODY_COLOR',labels:[body.color],markers:[]});return body.role;
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
    if(outer && leafNames(outer).length===1)row=outer;
    if(leafNames(row).length>1){for(const child of [...row.querySelectorAll(rows)].slice(-200))if(leafNames(child).length===1)read(child);return;}
    const header=document.querySelector('.cz-native-chat-header');
    if(!observed.has(row)){observed.add(row);counts.scanned++;report();}
    // DOM order can differ from visual order (flex order / injected toolbars).
    // Exclude only rows actually above the native header, not all earlier DOM nodes.
    if(header && !(header.compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING)){const box=row.getBoundingClientRect(),toolbar=header.getBoundingClientRect();if(box.height>0 && box.bottom<=toolbar.top)return;}
    const nickname=leafNames(row)[0],parts=Array.from(row.querySelectorAll(texts));
    structure={row:String(row.className||row.tagName).slice(0,180),nickname:nickname?String(nickname.className||nickname.tagName).slice(0,180):'찾지 못함',text:parts[0]?String(parts[0].className||parts[0].tagName).slice(0,180):'찾지 못함'};report();
    if(!nickname)return;
    const topParts=parts.filter(part=>!parts.some(other=>other!==part && other.contains(part)));
    let body=topParts.map(content).join(' ').trim();
    if(!body){
      // Preserve inline text/emotes when CHZZK changes the body CSS module name.
      body=textAfter(row,nickname);
      if(body)structure.text='이름 뒤 DOM (대체 경로)';
    }
    const name=nickname.textContent.trim().slice(0,80),text=body.slice(0,1000);
    if(!name || !text)return;
    const fingerprint=JSON.stringify([name,text]),previous=identities.get(row);
    const id=String(row.getAttribute('data-message-id') || row.getAttribute('data-chat-id') || (previous?.fingerprint===fingerprint?previous.id:++sequence)).slice(0,160);
    const segments=[];if(topParts.length){for(const part of topParts)richParts(part,segments);}else richParts(afterName(row,nickname),segments);
    const badges=[...row.querySelectorAll('img')].filter(img=>!!(img.compareDocumentPosition(nickname)&Node.DOCUMENT_POSITION_FOLLOWING) && !topParts.some(part=>part.contains(img))).slice(0,4).map(img=>({src:img.currentSrc||img.src||'',alt:img.getAttribute('alt')||''}));
    const item=CZImportantChat.message({id,name,text,segments,badges,role:role(row,topParts,nickname),time:previous?.fingerprint===fingerprint?previous.time:Date.now()});
    if(!item)return;
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
    const closest=el.closest(rows);if(closest)read(closest);
    else Array.from(el.querySelectorAll(rows)).slice(-200).forEach(read);
    // CSS module changes can remove every known row marker. Seed discovery
    // from nicknames instead, including mutations to an unknown message body.
    const candidates=new Set([...el.querySelectorAll(names)].slice(-200));
    const own=el.closest(names);if(own)candidates.add(own);
    let ancestor=el;
    for(let depth=0;ancestor && ancestor!==document.body && depth<5;depth++,ancestor=ancestor.parentElement){
      const found=leafNames(ancestor);if(found.length===1){candidates.add(found[0]);break;}if(found.length>1)break;
    }
    for(const nickname of candidates){const row=rowForName(nickname);if(row)read(row);}
    if(!counts.scanned)report();
  }
  function stop(){observer?.disconnect();observer=null;clearTimeout(timer);timer=null;pending.clear();seen=new WeakMap();observed=new WeakSet();clearTimeout(statusTimer);statusTimer=null;}
  function configure(value,identity={}) {
    stop();structure=null;counts={scanned:0,parsed:0,matched:0,sent:0};ownerName=typeof identity.streamerName==='string'?identity.streamerName.slice(0,80):'';filter=CZImportantChat.settings(value);report();if(!filter.enabled)return;
    observer=new MutationObserver(records=>{
      const candidates=new Set();
      for(const record of records){if(record.type==='attributes' && ['class','style'].includes(record.attributeName) && !record.target.closest(rows))continue;if(record.type!=='childList' || !record.addedNodes.length)candidates.add(record.target);for(const node of record.addedNodes)candidates.add(node);}
      for(const node of candidates)scan(node);
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['alt','title','aria-label','data-role','data-user-role','data-user-type','href','xlink:href','src','srcset','class','style']});
    scan(document.body);
  }
  window.addEventListener('pagehide',stop);
  return {configure,stop};
}};
