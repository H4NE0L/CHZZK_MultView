globalThis.CZAudibleTabs={async unmute(sender,requestedId){
  if(sender.id!==chrome.runtime.id)throw Error('허용되지 않은 요청');
  const viewer=chrome.runtime.getURL('src/viewer/viewer.html');
  const extensionSender=sender.url?.split(/[?#]/,1)[0]===viewer;
  const siteSender=sender.frameId===0 && sender.tab?.id!=null && new URL(sender.url).origin==='https://chzzk.naver.com';
  if(!extensionSender && !siteSender)throw Error('멀티뷰 페이지에서만 소리를 켤 수 있습니다.');
  const id=sender.tab?.id ?? requestedId;if(!Number.isInteger(id))throw Error('멀티뷰 탭을 찾을 수 없습니다.');
  const tab=await chrome.tabs.get(id);
  if(extensionSender?tab.url?.split(/[?#]/,1)[0]!==viewer:new URL(tab.url).origin!=='https://chzzk.naver.com')throw Error('멀티뷰 탭이 일치하지 않습니다.');
  if(tab.mutedInfo?.muted)await chrome.tabs.update(id,{muted:false});
  return {ok:true};
}};
