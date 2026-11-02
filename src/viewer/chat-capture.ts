import type {ChatMessage,ChatBadge} from '../shared/contracts/chat';
import {readableChatColor} from './chat-colors';
import {ObjectURLs} from '../shared/media/object-urls';
interface Context {host: HTMLElement;getItems(): ChatMessage[];hideBadges(): boolean;showTime(): boolean;notify(message: string): void}
/** Snapshot the current collection; selection/export never changes the live history. */
export function createChatCapture(context: Context){
 const urls=new ObjectURLs(),dialog=document.createElement('dialog');dialog.className='ic-capture-dialog';dialog.setAttribute('aria-label','모아보기 채팅 캡처');
 dialog.innerHTML='<header><strong>채팅 캡처</strong><button type="button" class="ic-capture-close" aria-label="캡처 닫기">✕</button></header><p>저장할 메시지를 선택하세요. 현재 수집된 목록을 기준으로 저장합니다.</p><div class="ic-capture-tools"><button type="button" class="ic-capture-all">전체 선택</button><button type="button" class="ic-capture-none">선택 해제</button></div><div class="ic-capture-list"></div><p class="ic-capture-status" role="status"></p><button type="button" class="ic-capture-save">PNG 저장</button>';
 context.host.appendChild(dialog);
 const query=<T extends HTMLElement>(selector: string)=>dialog.querySelector<T>(selector)!;
 const save=query<HTMLButtonElement>('.ic-capture-save'),list=query('.ic-capture-list'),status=query('.ic-capture-status');
 let snapshot: ChatMessage[]=[],disposed=false,busy=false,controller: AbortController|null=null;
 const checked=()=>[...list.querySelectorAll<HTMLInputElement>('input:checked')].map(input=>Number(input.value));
 function update(){const count=checked().length;status.textContent=`${snapshot.length}개 중 ${count}개 선택`;save.disabled=busy||!count;}
 function choose(on: boolean){list.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.checked=on);update();}
 query('.ic-capture-all').onclick=()=>choose(true);query('.ic-capture-none').onclick=()=>choose(false);list.onchange=update;
 query('.ic-capture-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>controller?.abort());
 async function image(source: string,signal: AbortSignal): Promise<HTMLImageElement|null>{
  return new Promise(resolve=>{const img=new Image();let finished=false;
   const finish=(value: HTMLImageElement|null)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);img.onload=img.onerror=null;if(!value)img.removeAttribute('src');resolve(value);};
   const abort=()=>finish(null),timer=setTimeout(abort,2500);signal.addEventListener('abort',abort,{once:true});
   img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.onload=()=>finish(img);img.onerror=()=>finish(null);if(signal.aborted)abort();else img.src=source;
  });
 }
 function svgSource(badge: ChatBadge){if(!badge.svg)return '';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',badge.svg.viewBox);svg.setAttribute('width','20');svg.setAttribute('height','20');svg.style.color=badge.svg.color;for(const shape of badge.svg.shapes){const node=document.createElementNS(svg.namespaceURI,shape.tag);for(const [key,value]of Object.entries(shape.attrs))node.setAttribute(key,value);svg.appendChild(node);}return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));}
 async function exportPNG(items: ChatMessage[],signal: AbortSignal){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지 생성을 지원하지 않습니다.');
  const width=640,padding=20,lineHeight=24;type Draw={text?: string;source?: string;color: string;bold: boolean;size: number;x: number;y: number;width: number};
  const draws: Draw[]=[];let y=56,x=padding;
  const font=(bold: boolean,size=13)=>`${bold?'700':'400'} ${size}px sans-serif`;
  function text(value: string,color: string,bold=false,size=13){ctx!.font=font(bold,size);for(const char of value){if(char==='\n'){x=padding;y+=lineHeight;continue;}const w=ctx!.measureText(char).width;if(x+w>width-padding){x=padding;y+=lineHeight;}draws.push({text:char,color,bold,size,x,y,width:w});x+=w;}}
  function picture(source: string,alt: string,size=20){if(!source){text(alt,'#c7d2df');return;}if(x+size>width-padding){x=padding;y+=lineHeight;}draws.push({source,text:alt,color:'#c7d2df',bold:false,size:13,x,y,width:size});x+=size+3;}
  for(const item of items){x=padding;
   if(context.showTime()&&item.time!==null)text(new Date(item.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})+' ','#fffafa',false,10.4);
   if(!context.hideBadges())for(const badge of item.badges)picture(badge.src||svgSource(badge),badge.alt,16);
   text(item.name,readableChatColor(item.nameColor||'#c7ddff'),true);
   if(!context.hideBadges())for(const badge of item.badgesAfter)picture(badge.src||svgSource(badge),badge.alt,16);
   text(' ','#fffafa');for(const part of item.segments)if(part.type==='image')picture(part.src,part.alt);else text(part.text,readableChatColor(item.bodyColor||'#e4e9ef'));
   y+=lineHeight+8;
  }
  const height=y+padding;if(height>16000)throw Error('선택한 내용이 너무 깁니다. 메시지를 나누어 저장해 주세요.');
  const sources=[...new Set(draws.flatMap(draw=>draw.source?[draw.source]:[]))].slice(0,80),images=new Map<string,HTMLImageElement>();
  // A few workers keep image decoding bounded for a large capture.
  await Promise.all(Array.from({length:Math.min(4,sources.length)},async()=>{while(sources.length&&!signal.aborted){const src=sources.shift()!,img=await image(src,signal);if(img)images.set(src,img);}}));
  if(signal.aborted)throw new DOMException('캡처 취소','AbortError');
  canvas.width=width;canvas.height=height;ctx.fillStyle='#1b1d20';ctx.fillRect(0,0,width,height);ctx.fillStyle='#fffafa';ctx.font='700 15px sans-serif';ctx.fillText(`주요 채팅 · ${items.length}개`,padding,30);
  let missing=false;
  for(const draw of draws){ctx.font=font(draw.bold,draw.size);ctx.fillStyle=draw.color;const img=draw.source?images.get(draw.source):null;if(img)ctx.drawImage(img,draw.x,draw.y-16,draw.width,draw.width);else if(draw.source){missing=true;ctx.save();ctx.beginPath();ctx.rect(draw.x,draw.y-16,draw.width,20);ctx.clip();ctx.fillText(draw.text||'◇',draw.x,draw.y);ctx.restore();}else ctx.fillText(draw.text||'',draw.x,draw.y);}
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG 생성에 실패했습니다.')),'image/png'));canvas.width=canvas.height=0;images.clear();return {blob,missing};
 }
 save.onclick=async()=>{if(busy)return;const items=checked().map(index=>snapshot[index]!).filter(Boolean);if(!items.length)return;busy=true;update();status.textContent='이미지 생성 중…';controller=new AbortController();
  try{const {blob,missing}=await exportPNG(items,controller.signal);if(disposed||controller.signal.aborted)return;const link=document.createElement('a');link.href=urls.create(blob,30000).url;link.download=`CHZZK-chat-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;link.click();context.notify(missing?'저장했습니다. 불러오지 못한 이미지는 대체 표시했습니다.':'채팅 캡처를 저장했습니다.');dialog.close();}
  catch(error){if(!disposed&&(error as Error).name!=='AbortError'){status.textContent=(error as Error).message;context.notify(status.textContent);}}
  finally{busy=false;if(!disposed)save.disabled=!checked().length;}
 };
 return {open(){if(disposed||busy)return;snapshot=context.getItems();list.replaceChildren();snapshot.forEach((item,index)=>{const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.value=String(index);input.checked=true;text.textContent=`${item.name}  ${item.text}`;label.append(input,text);list.append(label);});update();if(!dialog.open)dialog.showModal();},dispose(){disposed=true;controller?.abort();urls.dispose();dialog.remove();snapshot=[];}};
}
