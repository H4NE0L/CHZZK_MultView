// Read only explicit message props owned by a chat row. No sockets or React hooks.
(() => {
 if(globalThis.__CZChatRolesReader)return;globalThis.__CZChatRolesReader=true;document.documentElement.setAttribute('data-cz-role-reader','profile-roles-2');
 const rows='[data-chat-message],[class*="live_chatting_list_item"],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
 const own=(value,key)=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
 let observer=null,enabled=false,disposed=false;const retries=new Map();
 function clearRetry(row){const state=retries.get(row);if(state)clearTimeout(state.timer);retries.delete(row);}
 function retry(row){let state=retries.get(row);if(state?.timer||state?.attempt>=3||(!state&&retries.size>=128))return;if(!state){state={attempt:0,timer:null};retries.set(row,state);}state.timer=setTimeout(()=>{state.timer=null;if(enabled)inspect(row);if(state.attempt>=3)retries.delete(row);},[50,150,400][state.attempt++]);}
 function profileRole(message){
  let profile=own(message,'profile');if(typeof profile==='string'&&profile.length<=16000){try{profile=JSON.parse(profile);}catch(_){return '';}}
  const rawCode=own(profile,'userRoleCode'),code=typeof rawCode==='string'?rawCode.toLowerCase():'';
  const rawBadge=own(own(profile,'badge'),'imageUrl'),badge=typeof rawBadge==='string'?rawBadge:'';
  if(/operator|admin|staff/.test(code)||/\/icon\/owner\.png(?:[?#]|$)/.test(badge))return '';
  if(/streamer|broadcaster|owner/.test(code)||/\/icon\/streamer\.png(?:[?#]|$)/.test(badge))return 'streamer';
  if(/manager/.test(code)||/\/icon\/manager\.png(?:[?#]|$)/.test(badge))return 'manager';
  return own(profile,'verifiedMark')===true?'partner':'';
 }
 function read(row){
  if(!row.isConnected){clearRetry(row);return;}if([...row.querySelectorAll(rows)].filter(node=>!node.querySelector(rows)&&node.querySelector('[data-chat-nickname],[class*=nickname],[class*=name_text]')).length>1)return;
  const nativeId=row.getAttribute('data-message-id')||row.getAttribute('data-chat-id');
  const nickname=[...row.querySelectorAll('[data-chat-nickname],[class*="name_text"],[class*="live_chatting_username_nickname"],[class^="_nickname_"],[class*=" _nickname_"]')].find(node=>!node.querySelector('[data-chat-nickname],[class*="name_text"],[class*="nickname"]'));
  const copy=nickname?.cloneNode(true);copy?.querySelectorAll('img,svg,[hidden],[aria-hidden="true"],[class*=blind i],[class*=badge i],time').forEach(node=>node.remove());
  const author=String(copy?.textContent||'').normalize('NFC').trim();
  let found=null,ambiguous=false,budget=400;
  const visit=props=>{
   const queue=[{value:props,depth:0}],seen=new Set();let nearest=Infinity;
   while(queue.length&&budget-->0){const {value,depth}=queue.shift();if(!value||typeof value!=='object'||seen.has(value)||depth>nearest)continue;seen.add(value);
    if(Array.isArray(value)){if(depth<5)for(let i=0;i<Math.min(value.length,12);i++)queue.push({value:own(value,String(i)),depth:depth+1});continue;}
    for(const key of ['chatMessage','chattingMessage','message','messageData']){const message=own(value,key);if(!message||typeof message!=='object'||own(message,'profile')===undefined)continue;nearest=depth;const rawId=own(message,'messageId')??own(message,'msgId'),id=['string','number'].includes(typeof rawId)?String(rawId):null;
     if(nativeId&&id!=null&&String(id)!==nativeId){ambiguous=true;continue;}
     if(found&&found!==message){const priorId=own(found,'messageId')??own(found,'msgId');if(id&&String(priorId)===id&&profileRole(found)===profileRole(message))continue;ambiguous=true;continue;}found=message;
    }
    // Some nickname components receive profile directly rather than a message.
    if(!found&&author){let profile=own(value,'profile');if(typeof profile==='string'&&profile.length<=16000){try{profile=JSON.parse(profile);}catch(_){profile=null;}}const name=own(profile,'nickname');if(typeof name==='string'&&name.normalize('NFC').trim()===author){found={profile};nearest=depth;}}
    if(depth<5)for(const key of ['props','children','data'])queue.push({value:own(value,key),depth:depth+1});
   }
  };
  const nodes=[row,...[...row.querySelectorAll('*')].slice(0,64)];
  for(const node of nodes){
   const keys=Object.getOwnPropertyNames(node);
   for(const key of keys.filter(key=>key.startsWith('__reactProps$')))visit(own(node,key));
   if(found||ambiguous)break;
  }
  if(!found&&!ambiguous)for(const node of nodes){
   for(const key of Object.getOwnPropertyNames(node).filter(key=>key.startsWith('__reactFiber$'))){let fiber=own(node,key);for(let depth=0;fiber&&depth<40&&budget>0;depth++,fiber=own(fiber,'child')){
    const host=own(fiber,'stateNode');if(host instanceof Element&&host!==row&&!row.contains(host))break;
    visit(own(fiber,'memoizedProps'));if(found||ambiguous)break;
   }}if(found||ambiguous)break;
  }
  if(!found&&!ambiguous)retry(row);else clearRetry(row);
  const role=!ambiguous&&found?profileRole(found):'';
  if(role){if(row.getAttribute('data-cz-source-role-id')!==(nativeId||''))row.setAttribute('data-cz-source-role-id',nativeId||'');if(row.getAttribute('data-cz-source-role')!==role)row.setAttribute('data-cz-source-role',role);}
  else{row.removeAttribute('data-cz-source-role');row.removeAttribute('data-cz-source-role-id');}
 }
 function inspect(row){try{read(row);}catch(_){clearRetry(row);row.removeAttribute('data-cz-source-role');row.removeAttribute('data-cz-source-role-id');}}
 function scan(node){if(node.nodeType!==1)node=node.parentElement;if(!node)return;const row=node.closest(rows);if(row)inspect(row);else node.querySelectorAll(rows).forEach(inspect);}
 function configure(){
  observer?.disconnect();observer=null;for(const row of retries.keys())clearRetry(row);enabled=!disposed&&document.documentElement.getAttribute('data-cz-roles-enabled')==='true';
  if(!enabled){document.querySelectorAll('[data-cz-source-role],[data-cz-source-role-id]').forEach(row=>{row.removeAttribute('data-cz-source-role');row.removeAttribute('data-cz-source-role-id');});return;}
  observer=new MutationObserver(records=>{const pending=new Set();for(const record of records){pending.add(record.target);for(const node of record.addedNodes||[])pending.add(node);}pending.forEach(scan);});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-message-id','data-chat-id','class']});scan(document.body);
 }
 document.addEventListener('cz-chat-roles-config',configure);
 window.addEventListener('pagehide',()=>{disposed=true;configure();document.removeEventListener('cz-chat-roles-config',configure);},{once:true});configure();
})();
