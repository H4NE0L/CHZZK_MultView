import {sourceContent,imageToken} from '../shared/chat/message-content.js';
import {sourceEpoch} from '../shared/chat/source-epoch.js';
import {sourceTimes} from '../shared/chat/source-times.js';
// Read row-owned source data or the passive socket time index. No new
// connections, network requests, React hooks or changes to site handlers.
(() => {
  if(window.__CZ_CHAT_METADATA_V1__)return;
  window.__CZ_CHAT_METADATA_V1__=true;document.documentElement.setAttribute('data-cz-time-reader','20261102-2');
  const rows='[class*="live_chatting_list_item"],[data-chat-message],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
  const names='[data-chat-nickname],[class*="live_chatting_username_nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
  const own=(object,key)=>object && typeof object==='object'?Object.getOwnPropertyDescriptor(object,key)?.value:undefined;
  const clean=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
  function sourceMessage(object,author,body,id){
    const timestamp=sourceEpoch(object);if(timestamp===null)return null;
    let profile=own(object,'profile')??own(object,'user')??own(object,'sender');
    if(typeof profile==='string'&&profile.length<16000){try{profile=JSON.parse(profile);}catch(_){profile=null;}}
    const name=own(profile,'nickname')??own(profile,'nickName')??own(object,'nickname')??own(object,'nickName');
    const content=own(object,'content')??own(object,'msg')??own(object,'message')??own(object,'text');
    if(typeof name!=='string'||typeof content!=='string'||!clean(content)||clean(name)!==author || !(body===clean(sourceContent(content,own(object,'extras')))||(id&&String(own(object,'messageId')??own(object,'msgId'))===id)))return null;
    return timestamp;
  }
  function search(props,author,body,fields,seen,budget,id){
    const queue=[{value:props,depth:0}],matches=new Set();
    while(queue.length && budget.remaining-->0){
      const {value,depth}=queue.shift();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
      if(Array.isArray(value)){if(depth<4)for(let i=0;i<Math.min(value.length,8);i++){const child=own(value,String(i));if(child&&typeof child==='object')queue.push({value:child,depth:depth+1});}continue;}
      for(const key of Object.keys(value).slice(0,12))if(fields.size<24)fields.add(key.slice(0,40));
      const timestamp=sourceMessage(value,author,body,id);if(timestamp!==null)matches.add(timestamp);
      if(depth>=4)continue;
      for(const key of ['message','messageData','chatMessage','chattingMessage','chatting','chat','item','data','props','children']){const child=own(value,key);if(child&&typeof child==='object')queue.push({value:child,depth:depth+1});}
    }
    return matches.size===1?[...matches][0]:null;
  }
  const retryTimers=new Map(),retryState=new WeakMap(),retryDelays=[80,200,450,900];
  function cancelRetry(row){clearTimeout(retryTimers.get(row));retryTimers.delete(row);}
  function retry(row,identity){
    let state=retryState.get(row);
    if(!state||state.identity!==identity){cancelRetry(row);state={identity,attempt:0};retryState.set(row,state);}
    if(retryTimers.has(row)||state.attempt>=retryDelays.length)return;
    const delay=retryDelays[state.attempt++];
    retryTimers.set(row,setTimeout(()=>{retryTimers.delete(row);if(row.isConnected)queue(row);},delay));
    while(retryTimers.size>128)cancelRetry(retryTimers.keys().next().value);
  }
  function clearRetries(){for(const row of retryTimers.keys())cancelRetry(row);}
  const waiting=new Map(),waitingKeys=new WeakMap();let unsubscribe=null;
  function unwatch(row){const previous=waitingKeys.get(row);if(!previous)return;const refs=waiting.get(previous);if(refs){for(const ref of refs)if(!ref.deref()||ref.deref()===row)refs.delete(ref);if(!refs.size)waiting.delete(previous);}waitingKeys.delete(row);}
  function watch(row,key){unwatch(row);if(!waiting.has(key))waiting.set(key,new Set());const refs=waiting.get(key);refs.add(new WeakRef(row));while(refs.size>8)refs.delete(refs.values().next().value);while(waiting.size>128)waiting.delete(waiting.keys().next().value);waitingKeys.set(row,key);}
  function bodyText(row,nickname){
    const explicit=row.querySelector('[data-chat-text],[class*="live_chatting_message_text"]');let fragment,originalImages;
    if(explicit){fragment=explicit.cloneNode(true);originalImages=[...explicit.querySelectorAll('img')];}else{let boundary=nickname;while(boundary.parentElement&&boundary.parentElement!==row&&/nickname|username/i.test(String(boundary.parentElement.className)))boundary=boundary.parentElement;const range=document.createRange();range.selectNodeContents(row);range.setStartAfter(boundary);fragment=range.cloneContents();originalImages=[...row.querySelectorAll('img')].filter(image=>!boundary.contains(image)&&!!(boundary.compareDocumentPosition(image)&Node.DOCUMENT_POSITION_FOLLOWING));}
    [...fragment.querySelectorAll('img')].forEach((image,index)=>{const original=originalImages[index];const source=original?.currentSrc||original?.getAttribute('data-src')||original?.src;if(source)image.setAttribute('src',source);});
    fragment.querySelectorAll('svg,time,[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[hidden]').forEach(node=>node.remove());
    for(const image of fragment.querySelectorAll('img'))image.replaceWith(document.createTextNode(imageToken(image.getAttribute('data-src')||image.src)||image.alt||''));
    return clean(fragment.textContent);
  }
  function inspect(row){
    if(!row.isConnected)return;
    const nickname=[...row.querySelectorAll(names)].find(node=>!node.querySelector(names));if(!nickname)return;
    const walker=document.createTreeWalker(nickname,NodeFilter.SHOW_TEXT),parts=[];let textNode;
    while((textNode=walker.nextNode()) && parts.length<40){
      const parent=textNode.parentElement;if(!parent || parent.closest('svg,[class*="badge" i],[class*="blind" i],[class*="sr_only" i],[hidden],[aria-hidden="true"]'))continue;
      const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.clip&&style.clip!=='auto'||style.clipPath&&style.clipPath!=='none')continue;parts.push(textNode.textContent);
    }
    const author=clean(parts.join('')),content=bodyText(row,nickname),body=content,id=row.getAttribute('data-message-id')||row.getAttribute('data-chat-id'),fields=new Set(),seen=new Set(),budget={remaining:160};if(!author)return;
    let timestamp=null;
    const nodes=[row,...row.querySelectorAll('[class*="button_chatting"],'+names)].slice(0,3);
    for(const node of nodes){
      for(const key of Object.getOwnPropertyNames(node).sort((a,b)=>Number(b.startsWith('__reactProps$'))-Number(a.startsWith('__reactProps$')))){
        if(key.startsWith('__reactProps$'))timestamp=search(own(node,key),author,body,fields,seen,budget,id);
        else if(key.startsWith('__reactFiber$')){
          const root=own(node,key),visited=new Set();let child=root;
          // Stay on this row's child chain; never follow siblings into other rows.
          for(let depth=0;child&&depth<32&&timestamp===null&&budget.remaining>0;depth++,child=own(child,'child')){
            if(visited.has(child))break;visited.add(child);
            timestamp=search(own(child,'memoizedProps'),author,body,fields,seen,budget,id);
          }
          let parent=own(root,'return');
          for(let depth=0;parent&&depth<7&&timestamp===null&&budget.remaining>0;depth++,parent=own(parent,'return')){
            if(visited.has(parent))break;visited.add(parent);
            timestamp=search(own(parent,'memoizedProps'),author,body,fields,seen,budget,id);
          }
        }
        if(timestamp!==null)break;
      }
      if(timestamp!==null)break;
    }
    if(timestamp===null){
      timestamp=sourceTimes.lookup(author,content,id);
      if(timestamp!==null && fields.size<24)fields.add('socket:source-time');
    }
    if(timestamp===null){watch(row,id?'id:'+id:'body:'+sourceTimes.key(author,content));retry(row,sourceTimes.key(author,content)+':'+(id||''));}else{unwatch(row);cancelRetry(row);retryState.delete(row);}
    if(timestamp!==null){const iso=new Date(timestamp).toISOString();if(row.getAttribute('data-cz-message-time')!==iso)row.setAttribute('data-cz-message-time',iso);}
    else row.removeAttribute('data-cz-message-time');
    const schema=[...fields].join(',').slice(0,600);if(row.getAttribute('data-cz-time-fields')!==schema)row.setAttribute('data-cz-time-fields',schema);
  }
  const pending=new Set();let timer=null,enabled=false,disposed=false;
  function queue(node){
    if(!enabled||disposed)return;
    if(node.nodeType!==1)node=node.parentElement;if(!node||node.matches('.cz-native-chat-time'))return;
    const closest=node.closest(rows);if(closest)pending.add(closest);else [...node.querySelectorAll(rows)].slice(-200).forEach(row=>pending.add(row));
    if(!timer&&pending.size)timer=setTimeout(()=>{timer=null;const batch=[...pending].slice(-200);pending.clear();batch.forEach(row=>{try{inspect(row);}catch(_){row.removeAttribute('data-cz-message-time');row.setAttribute('data-cz-time-fields','reader-error');}});},50);
  }
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData'||record.type==='attributes')queue(record.target);else for(const node of record.addedNodes)queue(node);}});
  function configure(){
    observer.disconnect();clearTimeout(timer);timer=null;pending.clear();clearRetries();unsubscribe?.();unsubscribe=null;waiting.clear();
    enabled=!disposed && (document.documentElement.hasAttribute('data-cz-timestamps-enabled')?document.documentElement.getAttribute('data-cz-timestamps-enabled')==='true':new URLSearchParams(location.search).get('cz_timestamps')==='1');
    if(enabled){
      unsubscribe=sourceTimes.subscribe?.(({key,id})=>{for(const token of ['body:'+key,...(id?['id:'+id]:[])])for(const ref of waiting.get(token)||[]){const row=ref.deref();if(row?.isConnected)queue(row);}});
      observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-index','data-item-index','data-message-id','data-chat-id','src','srcset','alt']});
      queue(document.documentElement);
    }else{
      sourceTimes.clear();
      document.querySelectorAll('[data-cz-message-time],[data-cz-time-fields]').forEach(row=>{row.removeAttribute('data-cz-message-time');row.removeAttribute('data-cz-time-fields');});
    }
  }
  const imageLoaded=event=>{if(event.target instanceof HTMLImageElement)queue(event.target);};
  document.addEventListener('load',imageLoaded,true);
  document.addEventListener('cz-chat-timestamps-config',configure);configure();
  window.addEventListener('pagehide',()=>{disposed=true;clearRetries();document.removeEventListener('load',imageLoaded,true);unsubscribe?.();waiting.clear();observer.disconnect();clearTimeout(timer);pending.clear();document.removeEventListener('cz-chat-timestamps-config',configure);},{once:true});
})();
