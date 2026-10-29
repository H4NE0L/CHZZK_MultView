import {MAX_TRANSFER_BYTES,TRANSFER_IDLE_MS} from '../shared/media/limits';
import runtime from '../../config/runtime.json';
(() => {
  const files=['src/content/site-context.js',...runtime.viewer];
  const transfers=new Map();
  function discard(key){const transfer=transfers.get(key);if(!transfer)return;clearTimeout(transfer.timer);transfer.chunks.length=0;transfers.delete(key);}
  function touch(key){const transfer=transfers.get(key);if(!transfer)return;clearTimeout(transfer.timer);transfer.timer=setTimeout(()=>discard(key),TRANSFER_IDLE_MS);transfer.timer.unref?.();}
  function siteSender(sender){try{return sender.id===chrome.runtime.id && sender.frameId===0 && Number.isInteger(sender.tab?.id) && new URL(sender.url).origin==='https://chzzk.naver.com';}catch(_){return false;}}
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!message?.type?.startsWith('SITE_') && message?.type!=='OPEN_MULTIVIEW_ON_SITE')return;
    if(!siteSender(sender))return;
    const tabId=sender.tab.id,key=id=>`${tabId}:${id}`;
    (async()=>{
      switch(message.type){
        case 'OPEN_MULTIVIEW_ON_SITE':
          await CZViewerTabs.remember(tabId);
          await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files});return {ok:true};
        case 'SITE_VIEWER_TAB':return {ok:true,tabId};
        case 'SITE_RECORDING_BEGIN':{
          const record=message.metadata;
          if(!/^[a-f0-9-]{36}$/.test(record?.id) || typeof record.name!=='string' || !/^video\/(webm|mp4)/.test(message.mime))throw Error('유효하지 않은 녹화');
          // At most one in-flight transfer per source tab; discard abandoned data.
          for(const k of transfers.keys())if(k.startsWith(tabId+':'))discard(k);
          transfers.set(key(record.id),{record:{...record,sourceTabId:tabId},mime:message.mime,chunks:[],bytes:0,timer:null});touch(key(record.id));return {ok:true};
        }
        case 'SITE_RECORDING_CHUNK':{
          const transfer=transfers.get(key(message.id));if(!transfer || typeof message.data!=='string' || message.data.length>90000)throw Error('녹화 전송이 만료되었습니다.');
          const chunk=Uint8Array.from(atob(message.data),ch=>ch.charCodeAt(0));
          if(transfer.bytes+chunk.byteLength>MAX_TRANSFER_BYTES){discard(key(message.id));throw Error('녹화 전송 안전 한도를 초과했습니다.');}
          transfer.bytes+=chunk.byteLength;transfer.chunks.push(new Blob([chunk]));touch(key(message.id));return {ok:true};
        }
        case 'SITE_RECORDING_FINISH':{
          const transfer=transfers.get(key(message.id));if(!transfer)throw Error('녹화 전송이 만료되었습니다.');
          const record={...transfer.record,blob:new Blob(transfer.chunks,{type:transfer.mime})};discard(key(message.id));
          await CZRecordings.put(record);return {ok:true};
        }
        case 'SITE_RECORDING_ABORT':discard(key(message.id));return {ok:true};
        case 'SITE_RECORDING_DISCARD':{
          const record=await CZRecordings.get(message.id);if(!record || record.sourceTabId!==tabId)throw Error('이 탭의 녹화 결과가 아닙니다.');
          await CZRecordings.remove(message.id);return {ok:true};
        }
        case 'SITE_OPEN_RECORDING':{
          if(!/^[a-f0-9-]{36}$/.test(message.id))throw Error('유효하지 않은 녹화');
          await chrome.windows.create({url:chrome.runtime.getURL(`src/viewer/recording.html?id=${message.id}`),type:'popup',width:900,height:780});return {ok:true};
        }
        default:throw Error('지원하지 않는 요청');
      }
    })().then(reply).catch(error=>reply({ok:false,error:String(error)}));return true;
  });
  chrome.tabs.onRemoved.addListener(tabId=>{for(const key of transfers.keys())if(key.startsWith(tabId+':'))discard(key);});
})();
