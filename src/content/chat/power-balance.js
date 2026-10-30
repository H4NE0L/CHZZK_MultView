// Read a native balance display only. Never treat a bonus/prediction/chat number as a balance.
export function readPowerBalance(root){
 const rows='[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"],[role="listitem"]';
 const candidates=root.querySelectorAll('[data-log-power-balance],[data-log-power],[aria-label*="통나무"],[title*="통나무"],[class*="log_power"],[class*="logPower"]');
 const values=new Set();
 const number=text=>{const raw=String(text||'').trim();if(!/^\d+(?:,\d{3})*$/.test(raw))return null;const n=Number(raw.replaceAll(',',''));return Number.isSafeInteger(n)&&n>=0?n:null;};
 for(const node of [...candidates].slice(0,60)){
  if(node.closest('#cz-chat-power,'+rows))continue;
  const label=[node.getAttribute('aria-label'),node.getAttribute('title'),node.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  if(/보너스|받기|획득|적립|승부|예측|베팅|사용|후원|bonus|claim|prediction|bet/i.test(label))continue;
  const explicit=node.getAttribute('data-log-power-balance')??node.getAttribute('data-log-power');
  let balance=explicit===null?null:number(explicit);
  if(balance===null){
   const text=(node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||'').replace(/\s+/g,' ').trim();
   const match=text.match(/내\s*통나무(?:\s*파워)?\s*[:：]?\s*([\d,]+)\s*(?:개|점|포인트|보유)?$/);
   if(match)balance=number(match[1]);

  }
  if(balance!==null)values.add(balance);
 }
 // The native profile uses plain text, without stable power-specific classes.
 if(values.size===0){
  const doc=root.ownerDocument||root,found=doc.evaluate(".//text()[contains(.,'통나무')]",root,null,7,null);
  for(let i=0;i<Math.min(found.snapshotLength,512);i++){
   const node=found.snapshotItem(i);
   let parent=node.parentElement;
   for(let depth=0;parent&&depth<2;depth++,parent=parent.parentElement){
    if(parent.closest('#cz-chat-power,'+rows))break;
    const text=parent.textContent.replace(/\s+/g,' ').trim();
    if(text.length>100)break;
    const match=text.match(/^내\s*통나무\s*파워\s*[:：]?\s*([\d,]+)\s*(?:개|점|포인트)?$/);
    const balance=match?number(match[1]):null;if(balance!==null){values.add(balance);break;}
   }
  }
 }
 return values.size===1?[...values][0]:null;
}
