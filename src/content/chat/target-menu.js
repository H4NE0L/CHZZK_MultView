import {nameKey} from '../../shared/chat/roles';
// Extend only a native profile menu containing its report/block actions.
export function createTargetMenu({send}){
 let filter={names:[],excludedNames:[]},disposed=false,clicked='',clickedAt=0;
 const buttons=new Map();
 const text=node=>String(node?.textContent||'').normalize('NFC').replace(/\s+/g,' ').trim();
 const author=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('img,svg,[hidden],[aria-hidden=true],[class*=blind i],[class*=badge i]').forEach(node=>node.remove());return text(copy);};
 const tracked=name=>filter.names.some(value=>nameKey(value)===nameKey(name))&&!filter.excludedNames.some(value=>nameKey(value)===nameKey(name));
 function paint(button,name){button.disabled=false;const label=tracked(name)?'자동 수집 대상 삭제':'자동 수집 대상 추가';if(button.textContent!==label)button.textContent=label;button.title=name+' · 수동 수집 목록 관리';}
 function profileName(panel){const heading=[...panel.querySelectorAll('[data-profile-nickname],[class*=nickname],strong,h2,h3')].find(node=>text(node)&&!node.querySelector('[class*=nickname]'));return heading?author(heading):'';}
 function scan(node){
  if(disposed)return;for(const [button,entry]of buttons){if(!button.isConnected){buttons.delete(button);continue;}const current=profileName(entry.panel);if(current&&current.length<=40&&current!==entry.name){entry.name=current;paint(button,current);}}
  if(node.nodeType!==1)node=node.parentElement;if(!node||node.closest('[data-chat-message],[class*=chatting_message],[class*=live_chatting_list_item]'))return;
  const actions=[...(node.matches?.('button,a,[role=menuitem],[role=button]')?[node]:[]),...node.querySelectorAll('button,a,[role=menuitem],[role=button]')].filter(action=>/^(?:메시지\s*신고|사용자\s*차단)$/.test(text(action)));
  for(const action of actions){let panel=action.parentElement;
   for(let depth=0;panel&&panel!==document.body&&depth<7;depth++,panel=panel.parentElement){
    const existing=panel.querySelector('[data-cz-collection-target]');if(existing){if(buttons.has(existing))break;existing.remove();}
    if(panel.querySelector('[data-chat-message],[class*=chatting_message],[class*=live_chatting_list_item]'))break;
    const controls=[...panel.querySelectorAll('button,a,[role=menuitem],[role=button]')];if(!controls.some(node=>/^메시지\s*신고$/.test(text(node)))||!controls.some(node=>/^사용자\s*차단$/.test(text(node))))continue;
    const heading=[...panel.querySelectorAll('[data-profile-nickname],[class*=nickname],strong,h2,h3')].find(node=>text(node)&&!node.querySelector('[class*=nickname]'));
    const name=heading?author(heading):Date.now()-clickedAt<1500?clicked:'';if(!name||name.length>40)continue;
    // Wait for the profile heading rather than mounting into an action-only child.
    if(!heading&&panel.parentElement?.querySelector('strong,h2,h3,[class*=nickname]'))continue;
    const button=document.createElement('button');button.type='button';button.setAttribute('data-cz-collection-target','');button.style.cssText='display:flex;align-items:center;width:100%;box-sizing:border-box;padding:12px 16px;margin:0;border:0;border-top:1px solid #3b3d42;background:transparent;color:#fffafa;font:inherit;text-align:left;cursor:pointer';
    panel.setAttribute('data-cz-collection-profile','');const entry={name,panel};buttons.set(button,entry);paint(button,name);button.onclick=event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{send({type:'IMPORTANT_CHAT_TARGET_TOGGLE',name:entry.name,add:!tracked(entry.name)});}catch(_){paint(button,entry.name);}};
    let menu=action.parentElement;while(menu&&menu!==panel&&!controls.every(control=>menu.contains(control)))menu=menu.parentElement;menu=menu||panel;
    if(menu.matches('ul,ol')){const item=document.createElement('li');item.append(button);menu.append(item);}else menu.append(button);break;
   }
  }
 }
 const click=event=>{const nickname=event.target.closest?.('[data-chat-nickname],[class*="_nickname_"],[class*="live_chatting_username_nickname"]');if(nickname){clicked=author(nickname);clickedAt=Date.now();}};
 document.addEventListener('click',click,true);
 const observer=new MutationObserver(records=>{for(const [button]of buttons)if(!button.isConnected)buttons.delete(button);const nodes=new Set();for(const record of records){if(record.type==='childList')for(const node of record.addedNodes)nodes.add(node);else nodes.add(record.target);}for(let node of nodes){if(node.nodeType!==1)node=node.parentElement;if(!node||node.closest('[data-chat-message],[class*=chatting_message],[class*=live_chatting_list_item]'))continue;for(let depth=0;node&&node!==document.body&&depth<5;depth++,node=node.parentElement)scan(node);}});
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 function dispose(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('click',click,true);for(const [button,entry]of buttons){entry.panel.removeAttribute('data-cz-collection-profile');if(button.parentElement?.matches('li')&&button.parentElement.childNodes.length===1)button.parentElement.remove();else button.remove();}buttons.clear();}
 window.addEventListener('pagehide',dispose,{once:true});
 return {configure(settings){filter=settings;for(const [button,entry]of buttons){if(button.isConnected)paint(button,entry.name);else buttons.delete(button);}scan(document.body);},dispose};
}
