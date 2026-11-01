const own=(object,key)=>object&&typeof object==='object'?Object.getOwnPropertyDescriptor(object,key)?.value:undefined;
export function imageToken(value){try{const url=new URL(value);return url.protocol==='https:'?`[[image:${url.origin}${url.pathname}]]`:'';}catch(_){return '';}}
export function sourceContent(value,extras){
 let text=typeof value==='string'?value:'';
 if(typeof extras==='string'&&extras.length<=16000){try{extras=JSON.parse(extras);}catch(_){extras=null;}}
 let emojis=own(extras,'emojis');if(typeof emojis==='string'&&emojis.length<=16000){try{emojis=JSON.parse(emojis);}catch(_){emojis=null;}}
 if(emojis&&typeof emojis==='object')for(const key of Object.keys(emojis).slice(0,32)){
  const token=imageToken(own(emojis,key));if(!token)continue;
  const forms=key.startsWith('{:')?[key]:[`{:${key}:}`,...(key.startsWith(':')&&key.endsWith(':')?[key]:[])];
  for(const form of forms)text=text.split(form).join(token);
 }
 return text;
}
