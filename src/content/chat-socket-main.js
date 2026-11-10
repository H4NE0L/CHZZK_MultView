import {socketMessage} from '../shared/chat/socket-message';
import {sourceTimes} from '../shared/chat/source-times.js';
// Passive listener on the site's existing socket, installed before it is opened.
// Does not send messages, create connections, change payloads or retain chat text.
(() => {
 if(!['1','chat'].includes(new URLSearchParams(location.search).get('multiview')) || window.__CZChatSocketReaderV1 || typeof WebSocket!=='function')return;
 window.__CZChatSocketReaderV1=true;
 const Native=window.WebSocket,sockets=new Map();let disposed=false,enabled=new URLSearchParams(location.search).get('cz_timestamps')==='1';
 let collection=false,sourceReady=false,sequence=0,wireOrder=0;const session=Math.random().toString(36).slice(2);
 const notify=messages=>window.postMessage({source:'cz-live-chat-source-v1',active:collection&&sourceReady&&sockets.size>0,receivedAt:Date.now(),messages},location.origin);
 let packets=0,delivered=0,statsTimer=null;
 function report(){if(!statsTimer)statsTimer=setTimeout(()=>{statsTimer=null;document.documentElement?.setAttribute('data-cz-socket-time-state',JSON.stringify({revision:'20261111-1',enabled,collection,sourceReady,delivered,sockets:sockets.size,packets,indexed:sourceTimes.size}));},250);}
 function receive(event){
  if(disposed || (!enabled&&!collection) || typeof event.data!=='string' || event.data.length>1024*1024)return;
  packets++;report();
  let packet;try{packet=JSON.parse(event.data);}catch(_){return;}
  let body=packet?.bdy??packet?.body;
  if(typeof body==='string'){if(body.length>1024*1024)return;try{body=JSON.parse(body);}catch(_){return;}}
  const messages=Array.isArray(body)?body:body?.messageList??body?.messages??(body?.profile?[body]:[]);
  if(!Array.isArray(messages))return;
  if(enabled)messages.slice(-200).forEach(sourceTimes.add);
  if(collection&&[93101,93102].includes(Number(packet.cmd))){const parsed=messages.map(message=>socketMessage(message,'wire:'+session+':'+(++sequence))).filter(Boolean);parsed.forEach(item=>{wireOrder=Math.max(wireOrder+1,Date.now()*1000);item.order=wireOrder;if(!enabled)item.time=null;});delivered+=parsed.length;if(parsed.length)sourceReady=true;for(let i=0;i<parsed.length;i+=200)notify(parsed.slice(i,i+200));}
 }
 const ProxySocket=new Proxy(Native,{construct(target,args,newTarget){
  const socket=Reflect.construct(target,args,newTarget);
  try{
   const url=new URL(String(args[0]),location.href);
   if(!disposed && url.protocol==='wss:' && /(^|\.)chat\.naver\.com$/.test(url.hostname)){
    const close=()=>{socket.removeEventListener('message',receive);socket.removeEventListener('close',close);sockets.delete(socket);if(!sockets.size)sourceReady=false;if(collection)notify([]);};
    sockets.set(socket,close);if(collection)notify([]);if(enabled||collection)socket.addEventListener('message',receive);socket.addEventListener('close',close);
   }
  }catch(_){}
  return socket;
 }});
 function configure(){
  enabled=!disposed && (document.documentElement?.hasAttribute('data-cz-timestamps-enabled')?document.documentElement.getAttribute('data-cz-timestamps-enabled')==='true':new URLSearchParams(location.search).get('cz_timestamps')==='1');
  collection=!disposed&&document.documentElement?.getAttribute('data-cz-source-collection')==='true';if(!collection)sourceReady=false;
  for(const socket of sockets.keys()){socket.removeEventListener('message',receive);if(enabled||collection)socket.addEventListener('message',receive);}
  if(!enabled)sourceTimes.clear();notify([]);report();
 }
 document.addEventListener('cz-chat-timestamps-config',configure);document.addEventListener('cz-chat-source-config',configure);configure();
 window.WebSocket=ProxySocket;
 window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(statsTimer);statsTimer=null;document.removeEventListener('cz-chat-timestamps-config',configure);document.removeEventListener('cz-chat-source-config',configure);for(const close of sockets.values())close();sockets.clear();sourceTimes.clear();if(window.WebSocket===ProxySocket)window.WebSocket=Native;},{once:true});
})();
