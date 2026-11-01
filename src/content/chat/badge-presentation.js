// Presentation markers only: keep original badge DOM/attributes for collection.
export function createBadgePresentation(){
 const rows='[class*="live_chatting_list_item"],[data-chat-message],[class^="_chatting_message_"],[class*=" _chatting_message_"]';
 const names='[data-chat-nickname],[class*="live_chatting_username_nickname"],[class^="_nickname_"],[class*=" _nickname_"]';
 let enabled=false;
 function mark(row){
  row.querySelectorAll('[data-cz-native-badge]').forEach(node=>node.removeAttribute('data-cz-native-badge'));
  const nickname=[...row.querySelectorAll(names)].find(node=>!node.querySelector(names));if(!nickname)return;
  const bodies=[...row.querySelectorAll('[data-chat-text],[class*="live_chatting_message_text"]')];
  for(const node of row.querySelectorAll('img,svg,[class*="badge" i],[data-user-role],[data-user-type]')){
   if(node.contains(nickname)||bodies.some(body=>body.contains(node)))continue;
   const before=!!(node.compareDocumentPosition(nickname)&Node.DOCUMENT_POSITION_FOLLOWING);
   let leading=false;if(!before&&!nickname.contains(node)){try{const range=document.createRange();range.setStartAfter(nickname);range.setEndBefore(node);leading=!range.toString().trim();}catch(_){}}
   const known=node.matches('[class*="badge" i],[data-user-role],[data-user-type]')||/인증|공식|배지|verified|badge/i.test([node.getAttribute('alt'),node.getAttribute('aria-label'),node.getAttribute('src')].join(' '));
   if(before||nickname.contains(node)||known||(leading&&node.matches('svg')))node.setAttribute('data-cz-native-badge','');
  }
 }
 function scan(node){if(node.nodeType!==1)node=node.parentElement;if(!node||node.closest('.cz-native-chat-time'))return;const row=node.closest(rows);if(row)mark(row);else [...node.querySelectorAll(rows)].slice(-200).forEach(mark);}
 const observer=new MutationObserver(records=>{const nodes=new Set();for(const record of records){if(record.type==='childList'){for(const node of record.addedNodes)nodes.add(node);}else nodes.add(record.target);}for(const node of nodes)scan(node);});
 function set(value){const next=value===true;if(enabled===next)return;enabled=next;observer.disconnect();document.documentElement.setAttribute('data-cz-hide-chat-badges',String(enabled));if(enabled){scan(document.documentElement);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','src','alt','aria-label']});}}
 function dispose(){enabled=false;observer.disconnect();document.documentElement.removeAttribute('data-cz-hide-chat-badges');document.querySelectorAll('[data-cz-native-badge]').forEach(node=>node.removeAttribute('data-cz-native-badge'));}
 return {set,dispose};
}
