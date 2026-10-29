// MAIN-world bounded index: fingerprints and source time only, never raw messages.
const keyFor=(author,text)=>{
 const input=JSON.stringify([String(author).normalize('NFC').replace(/\s+/g,' ').trim(),String(text).normalize('NFC').replace(/\s+/g,' ').trim()]);
 let a=2166136261,b=5381;for(let i=0;i<input.length;i++){a=Math.imul(a^input.charCodeAt(i),16777619);b=Math.imul(b,33)^input.charCodeAt(i);}
 return `${input.length}:${a>>>0}:${b>>>0}`;
};
export const sourceTimes=globalThis.__CZChatSourceTimesV1 ||= (()=>{
 const entries=new Map(),byId=new Map();
 const valid=value=>{const n=Number(value),ms=Number.isFinite(n)?n*(n<1e11?1000:1):Date.parse(value);return Number.isFinite(ms)&&ms>=946684800000&&ms<=Date.now()+60000?ms:null;};
 function add(message){
  if(!message||typeof message!=='object')return;
  let profile=message.profile;if(typeof profile==='string' && profile.length<=16000){try{profile=JSON.parse(profile);}catch(_){return;}}
  const name=profile?.nickname??message.nickname,text=message.content??message.msg??message.message;
  const time=valid(message.messageTime??message.msgTime??message.ctime??message.createdAt);
  if(typeof name!=='string'||typeof text!=='string'||!text.trim()||text.length>16000||time===null)return;
  const key=keyFor(name,text),old=entries.get(key);
  // Identical messages with distinct source times cannot be safely assigned by text.
  entries.set(key,old && old!==time?-1:time);
  while(entries.size>2048)entries.delete(entries.keys().next().value);
  const id=message.messageId??message.msgId??message.id;
  if(['string','number'].includes(typeof id) && String(id).length<=160){byId.set(String(id),{key,time});while(byId.size>2048)byId.delete(byId.keys().next().value);}
 }
 return {add,lookup(name,text,id){const key=keyFor(name,text);if(id){const entry=byId.get(String(id));return entry?.key===key?entry.time:null;}const time=entries.get(key);return time>0?time:null;},clear(){entries.clear();byId.clear();},get size(){return entries.size;}};
})();
