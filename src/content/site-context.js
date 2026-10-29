// Injected in the isolated world, never into the site's JavaScript world.
globalThis.CZ_SITE_VIEWER = true;
globalThis.CZSiteRecordings = {async put(record,{signal}={}) {
  const {blob,...metadata}=record;
  const aborted=()=>{if(signal?.aborted)throw new DOMException('녹화 전송을 취소했습니다.','AbortError');};
  const abort=()=>{chrome.runtime.sendMessage({type:'SITE_RECORDING_ABORT',id:record.id}).catch(()=>{});};
  aborted();
  const begin=await chrome.runtime.sendMessage({type:'SITE_RECORDING_BEGIN',metadata,mime:blob.type});
  if(!begin?.ok)throw Error(begin?.error || '녹화 보관 실패');
  signal?.addEventListener('abort',abort,{once:true});
  try{
  for(let offset=0;offset<blob.size;offset+=65536){
    aborted();
    const chunk=new Uint8Array(await blob.slice(offset,offset+65536).arrayBuffer());
    let binary='';for(let start=0;start<chunk.length;start+=4096)binary+=String.fromCharCode(...chunk.subarray(start,start+4096));
    const data=btoa(binary);
    const result=await chrome.runtime.sendMessage({type:'SITE_RECORDING_CHUNK',id:record.id,data});
    if(!result?.ok)throw Error(result?.error || '녹화 전송 실패');
  }
  aborted();
  const result=await chrome.runtime.sendMessage({type:'SITE_RECORDING_FINISH',id:record.id});
  if(!result?.ok)throw Error(result?.error || '녹화 보관 실패');
  }catch(error){abort();throw error;}finally{signal?.removeEventListener('abort',abort);}
},async remove(id){const result=await chrome.runtime.sendMessage({type:'SITE_RECORDING_DISCARD',id});if(!result?.ok)throw Error(result?.error||'녹화 결과 정리 실패');}};
