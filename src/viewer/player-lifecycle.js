// Release only the removed frame. A bounded handshake lets its media pipeline
// release extension observers before detach; the browser releases the native
// media pipeline with its browsing context. Surviving frames are untouched.
const registry=globalThis.__CZPlayerLifecycleV1 ||= {sequence:0,pending:new WeakMap(),history:[]};
const {pending,history}=registry;
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function summarize(details){
 if(!details||typeof details!=='object')return null;
 const before=details.before,actual=before?.actual,desired=before?.desired;
 return {releaseMode:details.releaseMode==='frame-detach'?'frame-detach':null,before:before?{revision:typeof before.revision==='string'?before.revision.slice(0,64):null,earlyCapture:before.earlyCapture===true,desired:desired?{volume:number(desired.volume),muted:desired.muted===true}:null,actual:actual?{volume:number(actual.volume),muted:actual.muted===true,paused:actual.paused===true,ended:actual.ended===true,readyState:number(actual.readyState),errorCode:number(actual.errorCode)}:null,counts:Object.fromEntries(['commands','corrections','reports','nativeChanges'].map(key=>[key,number(before.counts?.[key])]))}:null,audio:details.audio?{observed:number(details.audio.observed),states:Array.isArray(details.audio.states)?details.audio.states.slice(0,16).map(context=>({id:number(context?.id),state:typeof context?.state==='string'?context.state.slice(0,24):null,currentTime:number(context?.currentTime)})):[]}:null,error:typeof details.error==='string'?details.error.slice(0,300):null};
}
export const recentPlayerTeardowns=()=>history.map(entry=>({...entry}));
export function releasePlayer(frame,scope,uid){
 if(!frame)return Promise.resolve();
 if(pending.has(frame))return pending.get(frame);
 const requestId=++registry.sequence,started=Date.now();let finish;
 const promise=new Promise(resolve=>{
  let completed=false,cancelTimer=()=>{},cancelListener=()=>{},cancelScope=()=>{};
  finish=(status,details=null)=>{
   if(completed)return;completed=true;cancelTimer();cancelListener();cancelScope();
   frame.dataset.playerReady='false';frame.remove();pending.delete(frame);
   history.push({uid,status,elapsedMs:Date.now()-started,details});if(history.length>8)history.shift();resolve();
  };
  cancelListener=scope.listen(window,'message',event=>{
   const data=event.data;
   if(event.origin!=='https://chzzk.naver.com'||event.source!==frame.contentWindow||data?.source!=='chzzk-multiview'||data.type!=='PLAYER_DISPOSED'||data.requestId!==requestId||data.uid!==uid)return;
   finish('acknowledged',summarize(data.details));
  });
  cancelTimer=scope.timeout(()=>finish('timeout'),750);
  cancelScope=scope.add(()=>finish('viewer-disposed'));
  if(completed)return;
  try{if(!CZMessages.postToPlayer(frame,{source:'chzzk-multiview',type:'PLAYER_DISPOSE',requestId}))finish('not-ready');}catch(_){finish('unavailable');}
 });
 pending.set(frame,promise);promise.then(()=>pending.delete(frame));return promise;
}
