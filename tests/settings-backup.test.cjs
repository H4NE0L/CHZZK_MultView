const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=process.env.CZ_TEST_ROOT || path.resolve(__dirname,'../dist');
const F='chzzkMultiviewFavoritesV08',G='chzzkMultiviewFavoriteGroupsV02',S='chzzkMultiviewV09',C='chzzkImportantChatV1',O='chzzkMultiviewLatestTabV1';
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(){
 const data={[F]:[{uid:'aaaaaa',name:'A',groups:['빈 그룹'],order:1}],[G]:['빈 그룹'],[S]:{channels:[{uid:'aaaaaa',volume:.2,muted:false,token:'never export'}],selectedUid:'aaaaaa',layout:'main-sub',chatOpen:true,screenLocked:false,mainOnly:true,masterVolume:.4,chatSide:'left',shortcutsEnabled:false},[C]:{enabled:true,streamers:true,managers:false,partners:true,names:['추가'],excludedNames:['제외']},chzzkImportantChatHeightV1:300,chzzkRecordingProfileV1:'original',[O]:{tabId:1},cookies:'never export'};
 const handlers=[];let fail=false,snapshots=0;
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:handler=>handlers.push(handler)},sendMessage:async()=>{snapshots++;return {ok:false};}},storage:{local:{get:async keys=>Object.fromEntries((typeof keys==='string'?[keys]:keys).filter(k=>k in data).map(k=>[k,structuredClone(data[k])])),set:async values=>{if(fail)throw Error('quota');Object.assign(data,structuredClone(values));}}},tabs:{get:async id=>({id,url:'chrome-extension://test/src/viewer/viewer.html'}),create:async()=>({id:2})}};
 const context=vm.createContext({chrome,URL,console});
 const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 context.importScripts=(...files)=>files.forEach(file=>load(path.posix.normalize('src/background/'+file)));
 load('src/shared/session-store.js');load('src/background/viewer-tabs.js');load('src/background/settings-backup.js');
 const sender={id:'test',url:'chrome-extension://test/src/settings/backup.html',frameId:0};
 const send=(type,document,from=sender)=>new Promise(resolve=>{if(handlers[0]({type,document},from,resolve)!==true)resolve(undefined);});
 return {data,send,api:context.CZSettingsBackup,tabs:context.CZViewerTabs,sender,setFail:()=>fail=true,snapshots:()=>snapshots};
}
test('settings export roundtrips declared settings and excludes cookies, metadata and ownership',async()=>{
 const f=setup(),result=await f.send('SETTINGS_BACKUP_EXPORT');assert(result.ok);
 const document=plain(result.document);assert.equal(document.data.session.masterVolume,.4);assert.equal(document.data.session.shortcutsEnabled,false);
 assert.equal(document.data.chat.names[0],'추가');assert.equal(document.data.recordingProfile,'original');assert.equal(document.data.chatHeight,300);
 assert(!JSON.stringify(document).includes('never export'));assert(!JSON.stringify(document).includes(O));
 assert.deepEqual(plain(f.api.parse(document)),document);assert.equal(f.snapshots(),1);
});
test('restoration saves previous settings, blocks stale saves/snapshots until owner re-registers',async()=>{
 const f=setup(),document=(await f.send('SETTINGS_BACKUP_EXPORT')).document;
 document.data.session.masterVolume=.8;document.data.session.layout='grid';document.data.chat.names=['새 설정'];
 assert.equal((await f.send('SETTINGS_BACKUP_RESTORE',document)).ok,true);
 assert.equal(f.data[S].masterVolume,.8);assert.equal(f.data[O].restorePending,true);
 const sender={id:'test',url:'chrome-extension://test/src/viewer/viewer.html',frameId:0,tab:{id:1}};
 const stale=await f.tabs.session({type:'VIEWER_SAVE_STATE',tabId:1,state:{masterVolume:0}},sender);assert.equal(stale.saved,false);assert.equal(f.data[S].masterVolume,.8);
 const snapshots=f.snapshots();await f.tabs.snapshotLatest();assert.equal(f.snapshots(),snapshots);
 const previous=(await f.send('SETTINGS_BACKUP_PREVIOUS')).document;assert.equal(previous.data.session.masterVolume,.4);
 await f.tabs.session({type:'VIEWER_REGISTER_SESSION',tabId:1},sender);assert(!f.data[O].restorePending);
 const saved=await f.tabs.session({type:'VIEWER_SAVE_STATE',tabId:1,state:document.data.session},sender);assert.equal(saved.saved,true);
 assert.equal((await f.send('SETTINGS_BACKUP_RESTORE',previous)).ok,true);assert.equal(f.data[S].masterVolume,.4);
});
test('invalid settings and failed storage writes preserve data; foreign/child senders are ignored',async()=>{
 const f=setup(),document=(await f.send('SETTINGS_BACKUP_EXPORT')).document;
 const before=plain(f.data),scans=f.snapshots();document.data.recordingProfile='bad';
 assert.equal((await f.send('SETTINGS_BACKUP_RESTORE',document)).ok,false);assert.deepEqual(plain(f.data),before);assert.equal(f.snapshots(),scans);
 assert.equal(await f.send('SETTINGS_BACKUP_EXPORT',null,{...f.sender,id:'foreign'}),undefined);
 assert.equal(await f.send('SETTINGS_BACKUP_EXPORT',null,{...f.sender,frameId:2}),undefined);
 assert.equal(await f.send('SETTINGS_BACKUP_EXPORT',null,{...f.sender,url:'https://evil.invalid/'}),undefined);
 const valid=(await f.send('SETTINGS_BACKUP_EXPORT')).document;f.setFail();assert.equal((await f.send('SETTINGS_BACKUP_RESTORE',valid)).ok,false);assert.deepEqual(plain(f.data),before);
});

test('timestamp setting defaults OFF for old backups and roundtrips explicit ON without changing chat filters',async()=>{
 const f=setup();let document=plain((await f.send('SETTINGS_BACKUP_EXPORT')).document);
 assert.equal(document.data.session.chatTimestamps,false);
 const filters=structuredClone(document.data.chat);
 delete document.data.session.chatTimestamps;assert.equal(f.api.parse(document).data.session.chatTimestamps,false);
 document.data.session.chatTimestamps=true;
 assert.equal((await f.send('SETTINGS_BACKUP_RESTORE',document)).ok,true);
 const restored=plain((await f.send('SETTINGS_BACKUP_EXPORT')).document);assert.equal(restored.data.session.chatTimestamps,true);assert.deepEqual(restored.data.chat,filters);
 document.data.session.chatTimestamps='true';assert.throws(()=>f.api.parse(document),/타임스탬프/);
});
