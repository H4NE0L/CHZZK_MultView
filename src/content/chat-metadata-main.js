import {sourceTimes} from '../shared/chat/source-times.js';
// Read row-owned source data or the passive socket time index. No new
// connections, network requests, React hooks or changes to site handlers.
(() => {
  if(window.__CZ_CHAT_METADATA_V1__)return;
  window.__CZ_CHAT_METADATA_V1__=true;document.documentElement.setAttribute('data-cz-time-reader','20261030-1');
  const rows='[class*="live_chatting_list_item"],[data-chat-message],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
  const names='[data-chat-nickname],[class*="live_chatting_username_nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
  const own=(object,key)=>object && typeof object==='object'?Object.getOwnPropertyDescriptor(object,key)?.value:undefined;
  const clean=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
  const time=value=>{if(!['string','number'].includes(typeof value)||value==='')return null;const number=Number(value),ms=Number.isFinite(number)?number*(number<1e11?1000:1):Date.parse(value);return Number.isFinite(ms)&&ms>=946684800000&&ms<=Date.now()+60000?ms:null;};
  function sourceMessage(object,author,body){
    const raw=own(object,'messageTime')??own(object,'messageTimestamp')??own(object,'msgTime')??own(object,'createdAt')??own(object,'createTime')??own(object,'ctime');
    const timestamp=time(raw);if(timestamp===null)return null;
    let profile=own(object,'profile')??own(object,'user')??own(object,'sender');
    if(typeof profile==='string'&&profile.length<16000){try{profile=JSON.parse(profile);}catch(_){profile=null;}}
    const name=own(profile,'nickname')??own(profile,'nickName')??own(object,'nickname')??own(object,'nickName');
    const content=own(object,'content')??own(object,'msg')??own(object,'message')??own(object,'text');
    if(typeof name!=='string'||typeof content!=='string'||!clean(content)||clean(name)!==author || !body.includes(clean(content)))return null;
    return timestamp;
  }
  function search(props,author,body,fields,seen,budget){
    const queue=[{value:props,depth:0}];
    while(queue.length && budget.remaining-->0){
      const {value,depth}=queue.shift();if(!value||typeof value!=='object'||Array.isArray(value)||seen.has(value))continue;seen.add(value);
      for(const key of Object.keys(value).slice(0,12))if(fields.size<24)fields.add(key.slice(0,40));
      const timestamp=sourceMessage(value,author,body);if(timestamp!==null)return timestamp;
      if(depth>=4)continue;
      for(const key of ['message','messageData','chatMessage','chattingMessage','chatting','chat','item','data','props','children']){const child=own(value,key);if(child&&typeof child==='object'&&!Array.isArray(child))queue.push({value:child,depth:depth+1});}
    }
    return null;
  }
  function inspect(row){
    if(!row.isConnected)return;
    const nickname=[...row.querySelectorAll(names)].find(node=>!node.querySelector(names));if(!nickname)return;
    const walker=document.createTreeWalker(nickname,NodeFilter.SHOW_TEXT),parts=[];let textNode;
    while((textNode=walker.nextNode()) && parts.length<40){
      const parent=textNode.parentElement;if(!parent || parent.closest('svg,[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[hidden],[aria-hidden="true"]'))continue;
      const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.clip&&style.clip!=='auto'||style.clipPath&&style.clipPath!=='none')continue;parts.push(textNode.textContent);
    }
    const author=clean(parts.join('')),body=clean(row.textContent),fields=new Set(),seen=new Set(),budget={remaining:160};if(!author)return;
    let timestamp=null;
    const nodes=[row,...row.querySelectorAll('[class*="button_chatting"],'+names)].slice(0,3);
    for(const node of nodes){
      for(const key of Object.getOwnPropertyNames(node).sort((a,b)=>Number(b.startsWith('__reactProps$'))-Number(a.startsWith('__reactProps$')))){
        if(key.startsWith('__reactProps$'))timestamp=search(own(node,key),author,body,fields,seen,budget);
        else if(key.startsWith('__reactFiber$')){let fiber=own(node,key);for(let depth=0;fiber&&depth<7&&timestamp===null;depth++,fiber=own(fiber,'return'))timestamp=search(own(fiber,'memoizedProps'),author,body,fields,seen,budget);}
        if(timestamp!==null)break;
      }
      if(timestamp!==null)break;
    }
    if(timestamp===null){
      const explicit=row.querySelector('[data-chat-text],[class*="live_chatting_message_text"]');
      let content=explicit?.textContent;
      if(content==null){
        let boundary=nickname;while(boundary.parentElement && boundary.parentElement!==row && /nickname|username/i.test(String(boundary.parentElement.className)))boundary=boundary.parentElement;
        const range=document.createRange();range.selectNodeContents(row);range.setStartAfter(boundary);const fragment=range.cloneContents();
        fragment.querySelectorAll('svg,time,[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[hidden],[aria-hidden="true"]').forEach(node=>node.remove());
        content=fragment.textContent;
      }
      timestamp=sourceTimes.lookup(author,clean(content),row.getAttribute('data-message-id')||row.getAttribute('data-chat-id'));
      if(timestamp!==null && fields.size<24)fields.add('socket:source-time');
    }
    if(timestamp!==null){const iso=new Date(timestamp).toISOString();if(row.getAttribute('data-cz-message-time')!==iso)row.setAttribute('data-cz-message-time',iso);}
    else row.removeAttribute('data-cz-message-time');
    const schema=[...fields].join(',').slice(0,600);if(row.getAttribute('data-cz-time-fields')!==schema)row.setAttribute('data-cz-time-fields',schema);
  }
  const pending=new Set();let timer=null;
  function queue(node){
    if(node.nodeType!==1)node=node.parentElement;if(!node||node.matches('.cz-native-chat-time'))return;
    const closest=node.closest(rows);if(closest)pending.add(closest);else [...node.querySelectorAll(rows)].slice(-200).forEach(row=>pending.add(row));
    if(!timer&&pending.size)timer=setTimeout(()=>{timer=null;const batch=[...pending].slice(-200);pending.clear();batch.forEach(row=>{try{inspect(row);}catch(_){row.removeAttribute('data-cz-message-time');row.setAttribute('data-cz-time-fields','reader-error');}});},50);
  }
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData'||record.type==='attributes')queue(record.target);else for(const node of record.addedNodes)queue(node);}});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-index','data-item-index']});
  queue(document.documentElement);
  window.addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(timer);pending.clear();},{once:true});
})();
