import {ResourceScope} from '../../shared/runtime/scope';
export async function fetchBalance(uid,{signal,fetchImpl=fetch}={}){
 if(typeof uid!=='string'||!/^[-\w]{1,128}$/.test(uid))throw Error('채널 ID 확인 필요');
 const response=await fetchImpl(`https://api.chzzk.naver.com/service/v1/channels/${encodeURIComponent(uid)}/log-power`,{method:'GET',credentials:'include',headers:{Accept:'application/json','Front-Client-Platform-Type':'PC','Front-Client-Product-Type':'web'},signal});
 if(!response.ok)throw Error(response.status===401||response.status===403?'로그인 필요':`잔액 조회 HTTP ${response.status}`);
 const data=await response.json(),content=data?.content;
 if(data?.code!==200||content?.channelId!==uid||content?.active!==true||!Number.isSafeInteger(content?.amount)||content.amount<0)throw Error('잔액 응답 확인 필요');
 return content.amount;
}
export function create({getUid,onValue,onUnavailable=()=>{},fetchImpl=fetch,interval=30000}){
 const scope=new ResourceScope();let started=false,running=false,request=null,cancelWait=null;
 scope.add(()=>request?.abort());scope.listen(window,'pagehide',()=>scope.dispose(),{once:true});
 async function poll(){
  if(scope.isDisposed||running)return;
  const uid=getUid();if(!uid)return;
  running=true;request=new AbortController();
  const deadline=scope.timeout(()=>request?.abort(),15000);
  try{const amount=await fetchBalance(uid,{signal:request.signal,fetchImpl});if(!scope.isDisposed&&getUid()===uid)onValue(amount,uid);}
  catch(error){if(!scope.isDisposed&&getUid()===uid)onUnavailable(error,uid);}
  finally{deadline();running=false;request=null;if(!scope.isDisposed&&getUid())cancelWait=scope.timeout(poll,interval);}
 }
 return {start(){if(started||scope.isDisposed)return;started=true;void poll();},refresh(){cancelWait?.();cancelWait=null;void poll();},dispose(){scope.dispose();}};
}
