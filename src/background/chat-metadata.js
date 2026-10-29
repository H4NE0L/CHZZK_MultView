(() => {
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type!=='CHAT_METADATA_INIT')return;
    let url;try{url=new URL(sender.url);}catch(_){return;}
    const chat=/^\/live\/[\w-]+\/chat\/?$/.test(url.pathname)||/^\/video\/\d+/.test(url.pathname)&&url.searchParams.get('multiview')==='chat';
    if(sender.id!==chrome.runtime.id || url.origin!=='https://chzzk.naver.com' || !chat || !Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) || sender.frameId<=0)return;
    chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[sender.frameId]},world:'MAIN',files:['src/content/chat-metadata-main.js']}).then(()=>reply({ok:true})).catch(error=>reply({ok:false,error:String(error)}));
    return true;
  });
})();
