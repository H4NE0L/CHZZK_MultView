import type {ChatMessage,ChatBadge} from '../shared/contracts/chat';
/** Displays validated messages only; DOM scraping and collection rules live elsewhere. */
export function create(list: HTMLElement) {
  const rendered=new Map<string,{node: HTMLDivElement; signature: string}>();
  function image(src: string,alt: string,className: string) {
    const img=document.createElement('img');img.src=src;img.alt=alt;img.title=alt;
    img.className=className;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.draggable=false;
    img.onerror=()=>{const label=document.createElement('span');label.textContent=alt;img.replaceWith(label);};
    return img;
  }
  function render(items: ChatMessage[],hideBadges=false) {
    const scrollTop=list.scrollTop,atBottom=list.scrollHeight-scrollTop-list.clientHeight<16;
    const ids=new Set(items.map(item=>item.id));
    for(const [id,entry] of rendered)if(!ids.has(id)){entry.node.remove();rendered.delete(id);}
    list.querySelector('.ic-empty')?.remove();
    items.forEach((item,index)=>{
      const signature=JSON.stringify([item,hideBadges]);let entry=rendered.get(item.id);
      if(!entry || entry.signature!==signature){
        const row=document.createElement('div');row.className='ic-message';row.dataset.role=item.role;
        const time=document.createElement('time');
        if(item.time!==null && Number.isFinite(item.time)){
          time.dateTime=new Date(item.time).toISOString();
          time.textContent=new Date(item.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
        }else{time.hidden=true;time.title='원본 작성 시각 확인 불가';}
        const author=document.createElement('strong');author.className='ic-author';author.textContent=item.name;
        if(item.nameColor)author.style.color=item.nameColor;
        const text=document.createElement('span');text.className='ic-message-text';if(item.bodyColor)text.style.color=item.bodyColor;
        for(const part of item.segments)text.appendChild(part.type==='image'?image(part.src,part.alt,'ic-emote'):document.createTextNode(part.text));
        const badge=(value: ChatBadge)=>{if(value.src)return image(value.src,value.alt,'ic-badge');if(value.svg){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.classList.add('ic-badge');icon.setAttribute('viewBox',value.svg.viewBox);icon.setAttribute('role','img');icon.setAttribute('aria-label',value.alt);icon.style.color=value.svg.color;for(const shape of value.svg.shapes){const child=document.createElementNS('http://www.w3.org/2000/svg',shape.tag);for(const [key,input]of Object.entries(shape.attrs))child.setAttribute(key,input);icon.appendChild(child);}return icon;}const label=document.createElement('span');label.className='ic-badge-label';label.textContent=value.alt;return label;};
        row.append(time,...(hideBadges?[]:item.badges.map(badge)),author,...(hideBadges?[]:item.badgesAfter.map(badge)),document.createTextNode(' '),text);
        entry?.node.replaceWith(row);entry={node:row,signature};rendered.set(item.id,entry);
      }
      if(list.children[index]!==entry.node)list.insertBefore(entry.node,list.children[index]||null);
    });
    list.scrollTop=atBottom?list.scrollHeight:scrollTop;
  }
  function clear(){for(const entry of rendered.values())entry.node.remove();rendered.clear();}
  return {render,clear};
}
