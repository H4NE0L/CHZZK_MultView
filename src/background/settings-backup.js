importScripts('../shared/chzzk-api.js','../shared/favorites-store.js','../shared/important-chat.js','../shared/favorites-backup.js','../shared/settings-backup.js');
(() => {
  function authorized(sender){
    if(sender.id!==chrome.runtime.id || sender.frameId>0)return false;
    try{
      const url=new URL(sender.url||'');
      return url.origin==='https://chzzk.naver.com' && sender.frameId===0 || ['src/settings/backup.html','src/popup/popup.html','src/viewer/viewer.html'].some(path=>url.href.split(/[?#]/,1)[0]===chrome.runtime.getURL(path));
    }catch(_){return false;}
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!['OPEN_SETTINGS_BACKUP','SETTINGS_BACKUP_EXPORT','SETTINGS_BACKUP_PREVIOUS','SETTINGS_BACKUP_RESTORE'].includes(message?.type) || !authorized(sender))return;
    if(message.type==='OPEN_SETTINGS_BACKUP'){
      chrome.tabs.create({url:chrome.runtime.getURL('src/settings/backup.html'),active:true}).then(()=>reply({ok:true})).catch(error=>reply({ok:false,error:String(error)}));return true;
    }
    CZViewerTabs.transaction(async()=>{
      if(message.type==='SETTINGS_BACKUP_PREVIOUS')return {ok:true,document:await CZSettingsBackup.previous()};
      const incoming=message.type==='SETTINGS_BACKUP_RESTORE'?CZSettingsBackup.parse(message.document):null;
      await CZViewerTabs.snapshotLatest();
      if(!incoming)return {ok:true,document:await CZSettingsBackup.create()};
      const before=await CZSettingsBackup.create();
      const owner=(await chrome.storage.local.get(CZViewerTabs.OWNER_KEY))[CZViewerTabs.OWNER_KEY];
      await chrome.storage.local.set({...CZSettingsBackup.payload(incoming),[CZSettingsBackup.PREVIOUS_KEY]:before,
        ...(owner?{[CZViewerTabs.OWNER_KEY]:{...owner,restorePending:true}}:{})});
      return {ok:true};
    }).then(reply).catch(error=>reply({ok:false,error:String(error)}));return true;
  });
})();
