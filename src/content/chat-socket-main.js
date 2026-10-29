import {sourceTimes} from '../shared/chat/source-times.js';
// Passive listener on the site's existing socket, installed before it is opened.
// Does not send messages, create connections, change payloads or retain chat text.
(() => {
 if(!['1','chat'].includes(new URLSearchParams(location.search).get('multiview')) || window.__CZChatSocketReaderV1 || typeof WebSocket!=='function')return;
 window.__CZChatSocketReaderV1=true;
 const Native=window.WebSocket,sockets=new Map();let disposed=false;
 function receive(event){
  if(disposed || typeof event.data!=='string' || event.data.length>1024*1024)return;
  let packet;try{packet=JSON.parse(event.data);}catch(_){return;}
  const body=packet?.bdy??packet?.body;
  const messages=Array.isArray(body)?body:body?.messageList??body?.messages??(body?.profile?[body]:[]);
  if(!Array.isArray(messages))return;
  messages.slice(-200).forEach(sourceTimes.add);
 }
 const ProxySocket=new Proxy(Native,{construct(target,args,newTarget){
  const socket=Reflect.construct(target,args,newTarget);
  try{
   const url=new URL(String(args[0]),location.href);
   if(!disposed && url.protocol==='wss:' && /(^|\.)chat\.naver\.com$/.test(url.hostname)){
    const close=()=>{socket.removeEventListener('message',receive);socket.removeEventListener('close',close);sockets.delete(socket);};
    sockets.set(socket,close);socket.addEventListener('message',receive);socket.addEventListener('close',close);
   }
  }catch(_){}
  return socket;
 }});
 window.WebSocket=ProxySocket;
 window.addEventListener('pagehide',()=>{disposed=true;for(const close of sockets.values())close();sockets.clear();sourceTimes.clear();if(window.WebSocket===ProxySocket)window.WebSocket=Native;},{once:true});
})();
