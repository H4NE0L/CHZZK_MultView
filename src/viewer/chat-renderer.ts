import {nameKey} from '../shared/chat/roles';
import {readableChatColor} from './chat-colors';
import type {ChatMessage,ChatBadge} from '../shared/contracts/chat';
/** Displays validated messages only; DOM scraping and collection rules live elsewhere. */
export function create(list: HTMLElement) {
  const PAGE=300;
  let latest: ChatMessage[]=[],hiddenBadges=false,follow=true,end=0,anchor: string|null=null;
  let targetNames: readonly string[]=[];
  const pager=document.createElement('div');pager.className='ic-pagination';
  const older=document.createElement('button'),newer=document.createElement('button'),newest=document.createElement('button'),status=document.createElement('span');
  older.textContent='이전';newer.textContent='다음';newest.textContent='최신';for(const button of [older,newer,newest])button.type='button';pager.append(older,status,newer,newest);
  older.onclick=()=>{follow=false;end=Math.max(1,end-PAGE);anchor=null;render(latest,hiddenBadges,targetNames);list.scrollTop=0;};
  newer.onclick=()=>{end=Math.min(latest.length,end+PAGE);follow=end===latest.length;anchor=null;render(latest,hiddenBadges,targetNames);list.scrollTop=0;};
  newest.onclick=()=>{follow=true;anchor=null;render(latest,hiddenBadges,targetNames);list.scrollTop=list.scrollHeight;};
  const rendered=new Map<string,{node: HTMLDivElement; signature: string}>();
  function image(src: string,alt: string,className: string) {
    const img=document.createElement('img');img.src=src;img.alt=alt;img.title=alt;
    img.className=className;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.draggable=false;
    img.onerror=()=>{const label=document.createElement('span');label.textContent=alt;img.replaceWith(label);};
    return img;
  }
  function render(items: ChatMessage[],hideBadges=false,names: readonly string[]=[]) {
    targetNames=names;const targets=new Set(names.map(nameKey));
    latest=items;hiddenBadges=hideBadges;
    const scrollTop=list.scrollTop,atBottom=list.scrollHeight-scrollTop-list.clientHeight<16;
    if(!items.length){follow=true;end=0;anchor=null;}
    if(follow)end=items.length;else if(anchor){const index=items.findIndex(item=>item.id===anchor);if(index>=0)end=index+1;}
    end=Math.min(items.length,Math.max(0,end));const start=Math.max(0,end-PAGE),page=items.slice(start,end);anchor=page.at(-1)?.id||null;
    if(items.length>PAGE){if(!pager.isConnected)list.prepend(pager);older.disabled=start===0;newer.disabled=end===items.length;status.textContent=`${start+1}–${end} / ${items.length}`;}else pager.remove();
    const offset=pager.isConnected?1:0;
    const ids=new Set(page.map(item=>item.id));
    for(const [id,entry] of rendered)if(!ids.has(id)){entry.node.remove();rendered.delete(id);}
    list.querySelector('.ic-empty')?.remove();
    page.forEach((item,index)=>{
      const targeted=targets.has(nameKey(item.name));
      const signature=JSON.stringify([item,hideBadges,targeted]);let entry=rendered.get(item.id);
      if(!entry || entry.signature!==signature){
        const row=document.createElement('div');row.className='ic-message';row.dataset.role=item.role;
        const time=document.createElement('time');
        if(item.time!==null && Number.isFinite(item.time)){
          time.dateTime=new Date(item.time).toISOString();
          time.textContent=new Date(item.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
        }else{time.hidden=true;time.title='원본 작성 시각 확인 불가';}
        const author=document.createElement('strong');author.className='ic-author';author.textContent=item.name;
        if(item.nameColor)author.style.color=readableChatColor(item.nameColor);
        const text=document.createElement('span');text.className='ic-message-text';if(item.bodyColor)text.style.color=readableChatColor(item.bodyColor,'#e4e9ef');
        for(const part of item.segments)text.appendChild(part.type==='image'?image(part.src,part.alt,'ic-emote'):document.createTextNode(part.text));
        const badge=(value: ChatBadge)=>{if(value.src)return image(value.src,value.alt,'ic-badge');if(value.svg){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.classList.add('ic-badge');icon.setAttribute('viewBox',value.svg.viewBox);icon.setAttribute('role','img');icon.setAttribute('aria-label',value.alt);icon.style.color=value.svg.color;for(const shape of value.svg.shapes){const child=document.createElementNS('http://www.w3.org/2000/svg',shape.tag);for(const [key,input]of Object.entries(shape.attrs))child.setAttribute(key,input);icon.appendChild(child);}return icon;}const label=document.createElement('span');label.className='ic-badge-label';label.textContent=value.alt;return label;};
        const marker=document.createElement('span');marker.className='ic-target-dot';marker.title='자동 수집 대상';marker.setAttribute('role','img');marker.setAttribute('aria-label','자동 수집 대상');
        row.append(time,...(targeted?[marker]:[]),...(hideBadges?[]:item.badges.map(badge)),author,...(hideBadges?[]:item.badgesAfter.map(badge)),document.createTextNode(' '),text);
        entry?.node.replaceWith(row);entry={node:row,signature};rendered.set(item.id,entry);
      }
      if(list.children[index+offset]!==entry.node)list.insertBefore(entry.node,list.children[index+offset]||null);
    });
    list.scrollTop=atBottom?list.scrollHeight:scrollTop;
  }
  function clear(){latest=[];follow=true;end=0;anchor=null;pager.remove();for(const entry of rendered.values())entry.node.remove();rendered.clear();}
  return {render,clear};
}
