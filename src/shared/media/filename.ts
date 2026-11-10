export const DEFAULT_SCREENSHOT_NAME='{channel}_{title}_{YYYY}{MM}{DD}{HH}{mm}{ss}';
export const DEFAULT_RECORDING_NAME='[{YY}.{MM}.{DD}]{channel}_{title}';
export const NAME_TOKENS=['channel','title','uid','date','time','YYYY','YY','MM','DD','HH','mm','ss'] as const;
export function templateError(value:unknown):string{
 if(typeof value!=='string'||!value.trim())return '파일명 형식을 입력하세요.';
 if(value.length>200)return '파일명 형식은 200자 이하로 입력하세요.';
 if(/[{}]/.test(value.replace(/\{([^{}]+)\}/g,(token,key)=>NAME_TOKENS.includes(key)?'':token)))return '지원하는 치환 항목만 사용하세요.';
 if(/\.(png|mp4|webm)\s*$/i.test(value))return '확장자는 자동으로 붙습니다. 형식에서 확장자를 빼주세요.';
 return '';
}
export function normalizeTemplate(value:unknown,kind:'screenshot'|'recording'):string{
 return templateError(value)?kind==='recording'?DEFAULT_RECORDING_NAME:DEFAULT_SCREENSHOT_NAME:(value as string).trim();
}
export function formatMediaName(template:unknown,kind:'screenshot'|'recording',data:{channel?:unknown;title?:unknown;uid?:unknown;date?:Date}):string{
 const date=data.date||new Date(),pad=(n:number)=>String(n).padStart(2,'0');
 const values:Record<string,string>={channel:Array.from(String(data.channel||data.uid||'방송')).slice(0,70).join(''),title:Array.from(String(data.title||'방송')).slice(0,70).join(''),uid:String(data.uid||''),YYYY:String(date.getFullYear()),YY:pad(date.getFullYear()%100),MM:pad(date.getMonth()+1),DD:pad(date.getDate()),HH:pad(date.getHours()),mm:pad(date.getMinutes()),ss:pad(date.getSeconds())};
 values.date=`${values.YYYY}-${values.MM}-${values.DD}`;values.time=`${values.HH}-${values.mm}-${values.ss}`;
 const expanded=normalizeTemplate(template,kind).replace(/\{([^{}]+)\}/g,(_,key)=>values[key]||'');
 let name='';for(const char of expanded.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_')){if(name.length+char.length>180)break;name+=char;}name=name.replace(/[. ]+$/g,'').trim();
 if(!name||/^\.+$/.test(name))name='CHZZK';
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;
 return name;
}
