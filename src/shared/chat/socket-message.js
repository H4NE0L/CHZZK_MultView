import {sourceEpoch} from './source-epoch.js';
import {hash} from './history';
const object=value=>{if(typeof value==='string'&&value.length<=16000){try{return JSON.parse(value);}catch(_){return {};}}return value&&typeof value==='object'?value:{};};
export function socketMessage(value,fallbackId){
 if(!value||typeof value!=='object')return null;
 const profile=object(value.profile),name=profile.nickname,body=value.content??value.msg??value.message;
 if(typeof name!=='string'||!name.trim()||typeof body!=='string'||!body.trim()||body.length>16000)return null;
 const code=typeof profile.userRoleCode==='string'?profile.userRoleCode.toLowerCase():'';
 const badge=typeof profile.badge?.imageUrl==='string'?profile.badge.imageUrl:'';
 let role='';
 if(!/operator|admin|staff/.test(code)&&!badge.includes('/icon/owner.png')){
  if(/streamer|owner|broadcaster/.test(code)||badge.includes('/icon/streamer.png'))role='streamer';
  else if(/manager/.test(code)||badge.includes('/icon/manager.png'))role='manager';
  else if(profile.verifiedMark===true)role='partner';
 }
 const emojis=object(object(value.extras).emojis),segments=[];let offset=0;
 const tokens=/\{:[^{}]{1,100}:\}/g;let match;
 while((match=tokens.exec(body))&&segments.length<62){const key=match[0].slice(2,-2),src=emojis[key]??emojis[match[0]];if(typeof src!=='string'||!src.startsWith('https://'))continue;
  if(match.index>offset)segments.push({type:'text',text:body.slice(offset,match.index)});segments.push({type:'image',src,alt:match[0]});offset=match.index+match[0].length;
 }
 if(offset<body.length)segments.push({type:'text',text:body.slice(offset)});
 const time=sourceEpoch(value),nativeId=value.messageId??value.msgId??value.id;
 const id=['string','number'].includes(typeof nativeId)?String(nativeId):time!==null?'wire:'+hash(JSON.stringify([value.uid||name,time,body])):fallbackId;
 if(!id||id.length>160)return null;
 return {id,name,text:body.slice(0,1000),segments,role,time,nameColor:profile.title?.color||'',badges:badge?[{src:badge,alt:role||'배지'}]:[],badgesAfter:[],bodyColor:''};
}
