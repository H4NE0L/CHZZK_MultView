import {sourceEpoch} from './source-epoch.js';
import {sourceContent} from './message-content.js';
// MAIN-world bounded index: fingerprints and source time only, never raw messages.
const keyFor=(author,text)=>{
 const input=JSON.stringify([String(author).normalize('NFC').replace(/\s+/g,' ').trim(),String(text).normalize('NFC').replace(/\s+/g,' ').trim()]);
 let a=2166136261,b=5381;for(let i=0;i<input.length;i++){a=Math.imul(a^input.charCodeAt(i),16777619);b=Math.imul(b,33)^input.charCodeAt(i);}
 return `${input.length}:${a>>>0}:${b>>>0}`;
};
export const sourceTimes=globalThis.__CZChatSourceTimesV1 ||= (()=>{
 const entries=new Map(),byId=new Map(),listeners=new Set();
 function add(message){
  if(!message||typeof message!=='object')return;
  let profile=message.profile;if(typeof profile==='string' && profile.length<=16000){try{profile=JSON.parse(profile);}catch(_){return;}}
  const name=profile?.nickname??message.nickname,text=message.content??message.msg??message.message;
  const time=sourceEpoch(message);
  if(typeof name!=='string'||typeof text!=='string'||!text.trim()||text.length>16000||time===null)return;
  const key=keyFor(name,sourceContent(text,message.extras)),old=entries.get(key);
  // Identical messages with distinct source times cannot be safely assigned by text.
  entries.set(key,old && old!==time?-1:time);
  while(entries.size>2048)entries.delete(entries.keys().next().value);
  const id=message.messageId??message.msgId??message.id;
  if(['string','number'].includes(typeof id) && String(id).length<=160){byId.set(String(id),{key,author:keyFor(name,''),time});while(byId.size>2048)byId.delete(byId.keys().next().value);}
  for(const listener of listeners){try{listener({key,id:typeof id==='string'||typeof id==='number'?String(id):null});}catch(_){/* A display subscriber must not interrupt the native socket. */}}
 }
 return {key:keyFor,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},add,lookup(name,text,id){const key=keyFor(name,text);if(id){const entry=byId.get(String(id));return entry?.author===keyFor(name,'')?entry.time:null;}const time=entries.get(key);return time>0?time:null;},clear(){entries.clear();byId.clear();},get size(){return entries.size;}};
})();
