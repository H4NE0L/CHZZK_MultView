import {sourceTimes} from '../shared/chat/source-times.js';
// Passive listener on the site's existing socket, installed before it is opened.
// Does not send messages, create connections, change payloads or retain chat text.
(() => {
 if(!['1','chat'].includes(new URLSearchParams(location.search).get('multiview')) || window.__CZChatSocketReaderV1 || typeof WebSocket!=='function')return;
 window.__CZChatSocketReaderV1=true;
 const Native=window.WebSocket,sockets=new Map();let disposed=false,enabled=false;
 function receive(event){
  if(disposed || !enabled || typeof event.data!=='string' || event.data.length>1024*1024)return;
  let packet;try{packet=JSON.parse(event.data);}catch(_){return;}
  let body=packet?.bdy??packet?.body;
  if(typeof body==='string'){if(body.length>1024*1024)return;try{body=JSON.parse(body);}catch(_){return;}}
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
    sockets.set(socket,close);if(enabled)socket.addEventListener('message',receive);socket.addEventListener('close',close);
   }
  }catch(_){}
  return socket;
 }});
 function configure(){
  enabled=!disposed && document.documentElement?.getAttribute('data-cz-timestamps-enabled')==='true';
  for(const socket of sockets.keys()){socket.removeEventListener('message',receive);if(enabled)socket.addEventListener('message',receive);}
  if(!enabled)sourceTimes.clear();
 }
 document.addEventListener('cz-chat-timestamps-config',configure);configure();
 window.WebSocket=ProxySocket;
 window.addEventListener('pagehide',()=>{disposed=true;document.removeEventListener('cz-chat-timestamps-config',configure);for(const close of sockets.values())close();sockets.clear();sourceTimes.clear();if(window.WebSocket===ProxySocket)window.WebSocket=Native;},{once:true});
})();
