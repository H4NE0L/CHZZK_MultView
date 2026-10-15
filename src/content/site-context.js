// Injected in the isolated world, never into the site's JavaScript world.
globalThis.CZ_SITE_VIEWER = true;
globalThis.CZSiteRecordings = {async put(record) {
  const {blob,...metadata}=record;
  const begin=await chrome.runtime.sendMessage({type:'SITE_RECORDING_BEGIN',metadata,mime:blob.type});
  if(!begin?.ok)throw Error(begin?.error || '녹화 보관 실패');
  for(let offset=0;offset<blob.size;offset+=65536){
    const chunk=new Uint8Array(await blob.slice(offset,offset+65536).arrayBuffer());
    const data=btoa(Array.from(chunk,byte=>String.fromCharCode(byte)).join(''));
    const result=await chrome.runtime.sendMessage({type:'SITE_RECORDING_CHUNK',id:record.id,data});
    if(!result?.ok)throw Error(result?.error || '녹화 전송 실패');
  }
  const result=await chrome.runtime.sendMessage({type:'SITE_RECORDING_FINISH',id:record.id});
  if(!result?.ok)throw Error(result?.error || '녹화 보관 실패');
}};
