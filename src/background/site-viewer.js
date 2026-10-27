(() => {
  const files=['src/content/site-context.js','src/shared/chzzk-api.js','src/shared/favorites-store.js','src/shared/session-store.js','src/shared/messages.js','src/shared/followings-store.js','src/shared/group-manager.js','src/viewer/audio.js','src/shared/important-chat.js','src/viewer/important-chat.js','src/viewer/chat.js','src/viewer/players.js','src/viewer/sync.js','src/shared/recordings-store.js','src/viewer/screenshot-crop.js','src/viewer/screenshot-gallery.js','src/viewer/media-tools.js','src/viewer/viewer.js'];
  const transfers=new Map();
  function siteSender(sender){try{return sender.id===chrome.runtime.id && sender.frameId===0 && Number.isInteger(sender.tab?.id) && new URL(sender.url).origin==='https://chzzk.naver.com';}catch(_){return false;}}
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!message?.type?.startsWith('SITE_') && message?.type!=='OPEN_MULTIVIEW_ON_SITE')return;
    if(!siteSender(sender))return;
    const tabId=sender.tab.id,key=id=>`${tabId}:${id}`;
    (async()=>{
      switch(message.type){
        case 'OPEN_MULTIVIEW_ON_SITE':
          await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files});return {ok:true};
        case 'SITE_VIEWER_TAB':return {ok:true,tabId};
        case 'SITE_RECORDING_BEGIN':{
          const record=message.metadata;
          if(!/^[a-f0-9-]{36}$/.test(record?.id) || typeof record.name!=='string' || !/^video\/(webm|mp4)/.test(message.mime))throw Error('유효하지 않은 녹화');
          // At most one in-flight transfer per source tab; discard abandoned data.
          for(const k of transfers.keys())if(k.startsWith(tabId+':'))transfers.delete(k);
          transfers.set(key(record.id),{record,mime:message.mime,chunks:[]});return {ok:true};
        }
        case 'SITE_RECORDING_CHUNK':{
          const transfer=transfers.get(key(message.id));if(!transfer || typeof message.data!=='string' || message.data.length>90000)throw Error('녹화 전송이 만료되었습니다.');
          transfer.chunks.push(Uint8Array.from(atob(message.data),ch=>ch.charCodeAt(0)));return {ok:true};
        }
        case 'SITE_RECORDING_FINISH':{
          const transfer=transfers.get(key(message.id));if(!transfer)throw Error('녹화 전송이 만료되었습니다.');
          try{await CZRecordings.put({...transfer.record,blob:new Blob(transfer.chunks,{type:transfer.mime})});}finally{transfers.delete(key(message.id));}return {ok:true};
        }
        case 'SITE_OPEN_RECORDING':{
          if(!/^[a-f0-9-]{36}$/.test(message.id))throw Error('유효하지 않은 녹화');
          await chrome.windows.create({url:chrome.runtime.getURL(`src/viewer/recording.html?id=${message.id}`),type:'popup',width:900,height:780});return {ok:true};
        }
        default:throw Error('지원하지 않는 요청');
      }
    })().then(reply).catch(error=>reply({ok:false,error:String(error)}));return true;
  });
  chrome.tabs.onRemoved.addListener(tabId=>{for(const key of transfers.keys())if(key.startsWith(tabId+':'))transfers.delete(key);});
})();
