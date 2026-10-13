// Track result tabs in session storage so worker suspension and page reloads
// do not lose cleanup. Closing the tab/window deletes its temporary Blob.
(() => {
  const prefix='recordingResultTab:';
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type!=='REGISTER_RECORDING_RESULT')return;
    const base=chrome.runtime.getURL('src/viewer/recording.html');
    const tabId=sender.tab?.id ?? message.tabId;
    if(sender.id!==chrome.runtime.id || !Number.isInteger(tabId) || !sender.url?.startsWith(base+'?'))return;
    if(new URL(sender.url).searchParams.get('id')!==message.resultId)return;
    Promise.resolve(sender.tab || chrome.tabs.get(tabId)).then(tab=>{if(tab.url && tab.url!==sender.url)throw Error('결과 탭이 일치하지 않습니다.');return chrome.storage.session.set({[prefix+tabId]:message.resultId});}).then(()=>reply({ok:true})).catch(error=>reply({ok:false,error:String(error)}));
    return true;
  });
  chrome.tabs.onRemoved.addListener(async tabId=>{
    const key=prefix+tabId;
    try {const id=(await chrome.storage.session.get(key))[key];if(id)await CZRecordings.remove(id);await chrome.storage.session.remove(key);}
    catch(error){console.warn('녹화 결과 정리 실패:',error);}
  });
})();
