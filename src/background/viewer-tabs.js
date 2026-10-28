globalThis.CZViewerTabs = (() => {
  const RULE_ID = 20001,OWNER_KEY='chzzkMultiviewLatestTabV1';
  const pageURL = () => chrome.runtime.getURL('src/viewer/viewer.html');
  let queue = Promise.resolve();
  function serialized(task) {
    const result = queue.catch(() => {}).then(task);
    queue = result;
    return result;
  }
  async function viewerTabs() {
    const url = pageURL();
    return (await chrome.tabs.query({})).filter(tab => (tab.pendingUrl || tab.url)?.split(/[?#]/, 1)[0] === url);
  }
  async function configureRules(tabIds) {
    // CHZZK restricts frame-ancestors to Naver. Relax only the response headers
    // of CHZZK subframes in our dedicated tabs, never normal CHZZK tabs or APIs.
    const addRules = tabIds.length ? [{id: RULE_ID, priority: 1,
      action: {type: 'modifyHeaders', responseHeaders: [
        {header: 'content-security-policy', operation: 'remove'},
        {header: 'x-frame-options', operation: 'remove'}]},
      condition: {initiatorDomains: [chrome.runtime.id], requestDomains: ['chzzk.naver.com'], resourceTypes: ['sub_frame'], tabIds}
    }] : [];
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [RULE_ID], addRules});
  }
  function refreshRules() {
    return serialized(async () => configureRules((await viewerTabs()).map(tab => tab.id)));
  }
  async function latest(){return (await chrome.storage.local.get(OWNER_KEY))[OWNER_KEY];}
  async function snapshotLatest(){
    const owner=await latest();if(!Number.isInteger(owner?.tabId))return;
    try{const tab=await chrome.tabs.get(owner.tabId),message={type:'VIEWER_GET_STATE',tabId:owner.tabId};const response=tab.url?.startsWith('https://chzzk.naver.com/')?await chrome.tabs.sendMessage(owner.tabId,message,{frameId:0}):await chrome.runtime.sendMessage(message);if(response?.ok && response.state && typeof response.state==='object')await CZSessionStore.write(response.state);}catch(_){/* Closed/unready viewers retain the last saved state. */}
  }
  function remember(tabId){return serialized(async()=>{await snapshotLatest();await chrome.storage.local.set({[OWNER_KEY]:{tabId}});});}
  function session(message,sender){return serialized(async()=>{
    if(sender.id!==chrome.runtime.id)throw Error('허용되지 않은 요청');
    const url=new URL(sender.url||'');
    const dedicated=url.href.split(/[?#]/,1)[0]===pageURL();
    const site=url.origin==='https://chzzk.naver.com' && sender.frameId===0;
    if(!dedicated && !site || sender.frameId>0)throw Error('멀티뷰 페이지에서만 저장할 수 있습니다.');
    let tabId=sender.tab?.id;
    if(!Number.isInteger(tabId) && dedicated && Number.isInteger(message.tabId)){
      try{const tab=await chrome.tabs.get(message.tabId);if((tab.pendingUrl||tab.url)?.split(/[?#]/,1)[0]===pageURL())tabId=tab.id;}
      catch(error){if((await latest())?.tabId===message.tabId)tabId=message.tabId;else throw error;}
    }
    if(!Number.isInteger(tabId) || message.tabId!=null && message.tabId!==tabId)throw Error('멀티뷰 탭을 확인할 수 없습니다.');
    const owner=await latest();
    if(message.type==='VIEWER_REGISTER_SESSION'){
      if(!owner)await chrome.storage.local.set({[OWNER_KEY]:{tabId}});
      return {ok:true,latest:!owner || owner.tabId===tabId};
    }
    if(owner && owner.tabId!==tabId)return {ok:true,saved:false};
    if(!owner)await chrome.storage.local.set({[OWNER_KEY]:{tabId}});
    await CZSessionStore.write(message.state);return {ok:true,saved:true};
  });}
  function open(initialInputs) {
    return serialized(async () => {
      const inputs=[...new Set((Array.isArray(initialInputs)?initialInputs:[]).map(value=>CZSessionStore.parseInput(value)?.url).filter(Boolean))];
      await snapshotLatest();
      const previous=await latest(),tabs=await viewerTabs();
      const win=await chrome.windows.create({url:'about:blank',type:'normal',focused:true});
      let tab;
      try{
        tab=win.tabs?.[0] || (await chrome.tabs.query({windowId:win.id}))[0];
        if(!Number.isInteger(tab?.id))throw Error('새 멀티뷰 창을 확인할 수 없습니다.');
        // Keep rules for every existing viewer and install the new rule before navigation.
        await configureRules([...tabs.map(item=>item.id),tab.id]);
        await chrome.storage.local.set({[OWNER_KEY]:{tabId:tab.id}});
        await chrome.tabs.update(tab.id,{url:inputs.length?`${pageURL()}?inputs=${encodeURIComponent(JSON.stringify(inputs))}`:pageURL()});
      }catch(error){
        if(previous)await chrome.storage.local.set({[OWNER_KEY]:previous});else await chrome.storage.local.remove(OWNER_KEY);
        await chrome.windows.remove(win.id).catch(()=>{});
        await configureRules(tabs.map(item=>item.id)).catch(()=>{});
        throw error;
      }
      return {ok:true,tabId:tab.id,windowId:win.id};
    });
  }
  return Object.freeze({open,refreshRules,remember,session,OWNER_KEY});
})();
