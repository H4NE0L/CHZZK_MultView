import {nameKey,colorRole,evidence,strongest} from '../../shared/chat/roles';
// All CHZZK selectors and layout-sensitive markup interpretation live here.
export function create({getOwnerName}) {
  const rows='[class*="live_chatting_list_item"],[class*="live_chatting_message_container"],[data-chat-message],[class*="live_chatting_message_item"],[role="listitem"],[class*="live_chatting_message_wrapper"],[class*="live_chatting_chat_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
  const names='[class*="live_chatting_username_nickname"],[class*="name_text"],[data-chat-nickname],[class*="username"] [class*="nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
  const texts='[class*="live_chatting_message_text"],[data-chat-text]';
  let scrollModes=new WeakMap();
  function readingHistory(row){
    const parent=row.parentElement;if(!parent)return false;if(scrollModes.has(parent))return scrollModes.get(parent);
    let past=false;
    for(let node=parent;node;node=node.parentElement){
      if(/auto|scroll|overlay/.test(getComputedStyle(node).overflowY) && node.scrollHeight>node.clientHeight+4){past=node.scrollHeight-node.clientHeight-node.scrollTop>32;break;}
    }
    scrollModes.set(parent,past);return past;
  }
  function domSummary(scanned){
    let socketTimeSource=null;try{const raw=document.documentElement.getAttribute('data-cz-socket-time-state')||'';if(raw.length<600)socketTimeSource=JSON.parse(raw);}catch(_){}
    return {socketTimeSource,sourceRoleReader:document.documentElement.getAttribute('data-cz-role-reader')||'',sourceTimeReader:document.documentElement.getAttribute('data-cz-time-reader')||'',rowCandidates:document.querySelectorAll(rows).length,nicknameCandidates:document.querySelectorAll(names).length,
      classes:scanned?[]:[...new Set([...document.querySelectorAll('[class*="chat"],[class*="name"]')].slice(-100).map(el=>String(el.className||'').slice(0,160)))].slice(-40)};
  }
  const leafNames=node=>{const found=[...node.querySelectorAll(names)].filter(el=>!el.querySelector(names));
    // A scoped message has one author; later nickname components may be mentions.
    const messageRows='[data-chat-message],[class*="live_chatting_list_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
    return node.matches?.(messageRows)&&!node.querySelector(messageRows)?found.slice(0,1):found;};
  const decorations='[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[class*="screen_reader" i],[class*="visually_hidden" i],svg,script,style,time,[data-role="streamer"],[data-role="manager"],[data-role="partner"],[data-user-role],[data-user-type]';
  const isDecoration=node=>node.matches?.(decorations) && !node.matches('button[class*="button_chatting"]');
  function authorBoundary(row,nickname){
    let boundary=nickname;
    while(boundary.parentElement && boundary.parentElement!==row && (boundary.parentElement.matches(names) || /username|nickname/i.test(String(boundary.parentElement.className))))boundary=boundary.parentElement;
    return boundary;
  }
  const nameDecorations=decorations.split(',').filter(selector=>selector!=='button'&&!selector.startsWith('[data-')).join(',')+',img,[hidden],[aria-hidden="true"]';
  function authorName(nickname){
    const copy=nickname.cloneNode(true),originals=[...nickname.querySelectorAll('*')],clones=[...copy.querySelectorAll('*')];
    originals.forEach((el,index)=>{const style=getComputedStyle(el);if(el.matches(nameDecorations) || style.display==='none' || style.visibility==='hidden' || style.clip && style.clip!=='auto' || style.clipPath && style.clipPath!=='none')clones[index].remove();});
    return copy.textContent.trim().slice(0,80);
  }
  function markImage(el){
    if(!el.matches?.('img,svg,[role="img"]'))return false;
    const label=['alt','title','aria-label'].map(key=>el.getAttribute(key)||'').join(' ')+' '+(el.querySelector?.('title')?.textContent||'');
    const asset=el.getAttribute('src')||'';
    return /인증\s*(?:마크|배지)|공식\s*(?:마크|배지)|(?:파트너|스트리머|관리자)\s*(?:마크|배지)|verified|verification|certified|certification|official\s*(?:mark|badge)/i.test(label) || /(?:^|[/_.-])(?:badge|verified|verification|certified)(?:[/_.-]|$)/i.test(asset.split('?')[0]);
  }
  const bodyIgnored=node=>node.matches?.('script,style,time,[hidden],[class*="blind" i],[class*="sr_only" i],[class*="screen_reader" i],[class*="visually_hidden" i]');
  const imageSource=image=>{
    const candidates=[image.getAttribute('data-src'),image.getAttribute('data-srcset')?.split(/[\s,]+/)[0],image.currentSrc,image.getAttribute('src'),image.getAttribute('srcset')?.split(/[\s,]+/)[0]];
    for(const candidate of candidates){if(!candidate?.trim())continue;try{const url=new URL(candidate.startsWith('//')?'https:'+candidate:candidate,document.baseURI);if(url.protocol==='https:')return url.href;}catch(_){}}
    return '';
  };
  function copyImageSources(originals,copies){originals.forEach((image,index)=>{const source=imageSource(image);if(copies[index]){copies[index].removeAttribute('srcset');copies[index].removeAttribute('sizes');if(source)copies[index].setAttribute('src',source);else copies[index].removeAttribute('src');}});}
  function cloneBody(node){const copy=node.cloneNode(true);copyImageSources(node.matches?.('img')?[node]:[...node.querySelectorAll('img')],copy.matches?.('img')?[copy]:[...copy.querySelectorAll('img')]);return cleanBody(copy,false);}
  function cleanBody(fragment,authorSuffix=true){
    fragment.querySelectorAll('script,style,time,[hidden],[class*=blind i],[class*=sr_only i],[class*=screen_reader i],[class*=visually_hidden i]').forEach(el=>el.remove());
    // Only inspect the author suffix: an ordinary leading emote or any body
    // text ends this pass, preserving identical emotes used in the message.
    const prefix=node=>{for(const child of [...node.childNodes]){
      if(child.nodeType===3){if(child.textContent.trim())return false;continue;}
      if(child.nodeType!==1)continue;
      if(markImage(child)||child.matches('svg,[class*="badge" i],[data-user-role],[data-user-type]')){child.remove();continue;}
      if(child.matches('img,br,svg'))return false;
      if(!prefix(child))return false;
    }return true;};
    if(authorSuffix)prefix(fragment);return fragment;
  }
  function afterName(row,nickname){
    const range=document.createRange();range.selectNodeContents(row);range.setStartAfter(authorBoundary(row,nickname));
    const fragment=range.cloneContents(),boundary=authorBoundary(row,nickname);
    copyImageSources([...row.querySelectorAll('img')].filter(image=>!boundary.contains(image)&&!!(boundary.compareDocumentPosition(image)&Node.DOCUMENT_POSITION_FOLLOWING)),[...fragment.querySelectorAll('img')]);
    return cleanBody(fragment);
  }
  function textAfter(row,nickname){return content(afterName(row,nickname)).trim();}
  function richParts(node,parts=[]){
    if(parts.length>=64)return parts;
    if(node.nodeType===3){parts.push({type:'text',text:node.textContent});return parts;}
    if(node.nodeType!==1 && node.nodeType!==11)return parts;
    if(bodyIgnored(node))return parts;
    if(node.tagName==='IMG'){parts.push({type:'image',src:node.currentSrc||node.src||'',alt:node.getAttribute('alt')||'[이모티콘]'});return parts;}
    if(node.tagName?.toLowerCase()==='svg'){parts.push({type:'text',text:node.getAttribute('aria-label')||node.querySelector('title')?.textContent||'[이모티콘]'});return parts;}
    if(node.tagName==='BR'){parts.push({type:'text',text:'\n'});return parts;}
    for(const child of node.childNodes)richParts(child,parts);return parts;
  }
  function rowForName(nickname){
    if(nickname.closest('.cz-native-chat-header,[role="menu"],[role="dialog"],[data-cz-collection-profile],#cz-chat-settings'))return null;
    // Profile headings reuse nickname classes but are not posted messages.
    for(let panel=nickname.parentElement,depth=0;panel&&panel!==document.body&&depth<6;depth++,panel=panel.parentElement){
      if(panel.matches(rows)||panel.querySelector(rows)||leafNames(panel).length>1)break;
      const actions=[...panel.querySelectorAll('button,a,[role=button],[role=menuitem]')].map(node=>String(node.textContent||'').replace(/\s+/g,''));
      if(actions.includes('메시지신고')&&actions.includes('사용자차단'))return null;
    }
    const known=nickname.closest(rows);if(known)return known;
    let row=nickname.parentElement;
    for(let depth=0;row && row!==document.body && depth<7;depth++,row=row.parentElement){
      const found=leafNames(row);if(found.length>1)return null;
      if(found.length!==1 || row.matches('button,a,[role=button]') || /username|nickname|button_chatting/.test(String(row.className)))continue;
      if(row.querySelector(texts) || textAfter(row,nickname))return row;
    }
    return null;
  }
  function bodyColor(row,nickname,parts){
    for(const part of parts){const role=colorRole(getComputedStyle(part).color);if(role)return {role,color:getComputedStyle(part).color};}
    const boundary=authorBoundary(row,nickname),walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      if(boundary.contains(node) || !String(node.textContent).trim() || !(boundary.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      const parent=node.parentElement;if(!parent)continue;const decoration=parent.closest(decorations);if(decoration && isDecoration(decoration))continue;
      const style=getComputedStyle(parent);if(style.display==='none' || style.visibility==='hidden')continue;
      return {role:colorRole(style.color),color:style.color};
    }
    for(const image of row.querySelectorAll('img')){if(boundary.contains(image)||markImage(image)||!(boundary.compareDocumentPosition(image)&Node.DOCUMENT_POSITION_FOLLOWING))continue;const color=getComputedStyle(image).color;if(colorRole(color))return {role:colorRole(color),color};}
    const color=getComputedStyle(row).color;return {role:colorRole(color),color};
  }
  let roleSample=[];
  function role(row,textElements,nickname,suffix=new Set()) {
    const source=row.getAttribute('data-cz-source-role'),nativeId=row.getAttribute('data-message-id')||row.getAttribute('data-chat-id');const sourceRole=['streamer','manager','partner'].includes(source)&&(!nativeId||row.getAttribute('data-cz-source-role-id')===nativeId)?source:'';
    if(getOwnerName() && nameKey(authorName(nickname))===nameKey(getOwnerName()))return 'streamer';
    let author=authorBoundary(row,nickname);
    for(let node=author,depth=0;node && node!==row && depth<4;node=node.parentElement,depth++)if(/username|nickname|author/.test(String(node.className)))author=node;
    let detected=sourceRole;roleSample=sourceRole?[{tag:'SOURCE_PROFILE',labels:[sourceRole],markers:[]}]:[];
    const candidates=[row,...row.querySelectorAll('img,svg,svg use,[data-role],[data-user-role],[data-user-type],[aria-label],[title],[class*="badge"],[class*="Badge"]')];
    for(const badge of candidates){
      if(textElements.some(el=>el===badge || el.contains(badge)))continue;
      const beforeName=!!(badge.compareDocumentPosition(nickname)&Node.DOCUMENT_POSITION_FOLLOWING);
      if(!beforeName && !badge.contains(nickname) && !author.contains(badge) && !suffix.has(badge) && !suffix.has(badge.closest('svg')))continue;
      const raw=['alt','title','aria-label','data-role','data-user-role','data-user-type'].map(key=>{const value=badge.getAttribute(key);return badge.contains(nickname) && ['alt','title','aria-label'].includes(key) && nameKey(value)===nameKey(nickname.textContent)?'':value;});
      if(badge.matches('svg'))raw.push(...[...badge.querySelectorAll('title')].map(el=>el.textContent));
      const semantic=[badge.getAttribute('class'),badge.getAttribute('id')];
      if(badge.matches('use'))semantic.push(badge.getAttribute('href'),badge.getAttribute('xlink:href'));
      if(badge.matches('img')){try{semantic.push(new URL(badge.currentSrc||badge.src).pathname.split('/').at(-1));}catch(_){}}
      const parsed=evidence(raw,semantic);
      if(roleSample.length<8)roleSample.push({tag:badge.tagName,labels:parsed.labels.filter(Boolean).slice(0,4).map(value=>value.slice(0,80)),markers:parsed.markers.filter(Boolean).slice(0,3).map(value=>value.slice(0,120))});
      detected=strongest(detected,parsed.role);
    }
    if(detected)return detected;
    const body=bodyColor(row,nickname,textElements);roleSample.unshift({tag:'BODY_COLOR',labels:[body.color],markers:[]});return body.role;
  }
  function content(node) {
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1 && node.nodeType!==11)return '';
    if(bodyIgnored(node))return '';
    if(node.tagName==='IMG')return node.getAttribute('alt') || '[이모티콘]';
    if(node.tagName?.toLowerCase()==='svg')return node.getAttribute('aria-label')||node.querySelector('title')?.textContent||'[이모티콘]';
    if(node.tagName==='BR')return '\n';
    return Array.from(node.childNodes,content).join('');
  }
  function normalizeRow(row){
    row=row.closest(rows)||row;
    const outer=row.closest('[class*="live_chatting_list_item"],[data-chat-message]');
    return outer && leafNames(outer).length===1?outer:row;
  }
  function aboveHeader(row){
    const header=document.querySelector('.cz-native-chat-header');
    if(header && !(header.compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING)){
      const box=row.getBoundingClientRect(),toolbar=header.getBoundingClientRect();
      return box.height>0 && box.bottom<=toolbar.top;
    }
    return false;
  }
  function badgeSVG(element){
    if(!element.matches('svg'))return null;
    let nodes=[...element.querySelectorAll('path,circle,rect,ellipse,line,polygon,polyline')];
    if(!nodes.length){const href=element.querySelector('use')?.getAttribute('href')||element.querySelector('use')?.getAttribute('xlink:href');if(href?.startsWith('#'))nodes=[...(document.getElementById(href.slice(1))?.querySelectorAll('path,circle,rect,ellipse,line,polygon,polyline')||[])];}
    return {viewBox:element.getAttribute('viewBox')||'0 0 24 24',color:getComputedStyle(element).color,shapes:nodes.slice(0,8).map(node=>{const attrs={};for(const name of ['d','cx','cy','r','x','y','width','height','rx','ry','x1','x2','y1','y2','points','stroke-width']){const value=node.getAttribute(name);if(value)attrs[name]=value.slice(0,2048);}attrs.fill=getComputedStyle(node).fill;attrs.stroke=getComputedStyle(node).stroke;return {tag:node.tagName.toLowerCase(),attrs};})};
  }
  function read(row){
    const nickname=leafNames(row)[0],parts=Array.from(row.querySelectorAll(texts));
    const structure={row:String(row.className||row.tagName).slice(0,180),nickname:nickname?String(nickname.className||nickname.tagName).slice(0,180):'찾지 못함',text:parts[0]?String(parts[0].className||parts[0].tagName).slice(0,180):'찾지 못함'};
    if(!nickname)return {structure,message:null};
    structure.timestampSource=row.hasAttribute('data-cz-message-time')?'source-message':(row.hasAttribute('data-message-time')||row.hasAttribute('data-timestamp')||row.hasAttribute('data-created-at'))?'dom-attribute':'unavailable';structure.timestampFields=(row.getAttribute('data-cz-time-fields')||'').slice(0,600);
    structure.authorDecorations=[...row.querySelectorAll('img,svg,[role=img],[class*=blind i],[class*=sr_only i]')].slice(0,8).map(el=>({tag:el.tagName,class:String(el.className?.baseVal??el.className??'').slice(0,120),alt:(el.getAttribute('alt')||el.getAttribute('aria-label')||'').slice(0,80),asset:(el.getAttribute('src')||'').split('?')[0].split('/').pop().slice(0,100)}));
    const topParts=parts.filter(part=>!parts.some(other=>other!==part && other.contains(part)));
    let fallbackFragment=null;
    const bodyFragments=topParts.map(cloneBody);
    let body=bodyFragments.map(content).join(' ').trim();
    if(!body){
      // Preserve inline text/emotes when CHZZK changes the body CSS module name.
      fallbackFragment=afterName(row,nickname);body=content(fallbackFragment).trim();
      if(body)structure.text='이름 뒤 DOM (대체 경로)';
    }
    const name=authorName(nickname),text=body.slice(0,1000);
    if(!name || !text)return {structure,message:null};
    const segments=[];if(bodyFragments.some(fragment=>content(fragment).trim())){for(const part of bodyFragments)richParts(part,segments);}else richParts(fallbackFragment||afterName(row,nickname),segments);
    const nativeTime=row.getAttribute('data-cz-message-time')||row.getAttribute('data-message-time')||row.getAttribute('data-timestamp')||row.getAttribute('data-created-at')||row.querySelector('time:not(.cz-native-chat-time)')?.getAttribute('datetime')||'';
    const before=[],after=[],boundary=authorBoundary(row,nickname),suffix=new Set();
    const walker=document.createTreeWalker(row,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let candidate;
    while((candidate=walker.nextNode())){
      if(boundary.contains(candidate)||!(boundary.compareDocumentPosition(candidate)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      if(candidate.nodeType===3){if(candidate.textContent.trim()&&!candidate.parentElement.closest(decorations))break;continue;}
      if(candidate.matches('img,svg')){if(candidate.matches('svg')||markImage(candidate)||candidate.closest('[class*="badge" i]'))suffix.add(candidate);else break;}
    }
    for(const element of [...row.querySelectorAll('img,svg')]){
      if(topParts.some(part=>part===element||part.contains(element)))continue;
      const preceding=!!(element.compareDocumentPosition(nickname)&Node.DOCUMENT_POSITION_FOLLOWING);
      const following=!!(boundary.compareDocumentPosition(element)&Node.DOCUMENT_POSITION_FOLLOWING);
      if(!preceding && !boundary.contains(element) && !(following&&suffix.has(element)))continue;
      const badge={svg:badgeSVG(element),src:element.matches('img')?(element.currentSrc||element.src||''):'',alt:element.getAttribute('alt')||element.getAttribute('aria-label')||element.querySelector('title')?.textContent||'배지'};
      (preceding?before:after).push(badge);
    }
    const badges=before.slice(0,8),badgesAfter=after.slice(0,8),nameColor=getComputedStyle(nickname).color,bodyColor=topParts[0]?getComputedStyle(topParts[0]).color:getComputedStyle(row).color;
    return {structure,message:{name,text,segments,nativeTime,badgesAfter,nameColor,bodyColor,sourceId:row.getAttribute('data-message-id')||row.getAttribute('data-chat-id'),badges,role:role(row,topParts,nickname,suffix)}};
  }
  return {rows,names,texts,leafNames,rowForName,normalizeRow,aboveHeader,read,readingHistory,summary:domSummary,
    resetScroll(){scrollModes=new WeakMap();},get roleSample(){return roleSample;}};
}
