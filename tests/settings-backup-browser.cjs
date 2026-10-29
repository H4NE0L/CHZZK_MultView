const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:900,height:720}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://settings.invalid/**',route=>{const file=path.resolve('.','.'+new URL(route.request().url()).pathname);return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});});
  await page.addInitScript(()=>{
   window.__writes=0;
   window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('CHZZK-test-project',{create:true});};
   window.__data={chzzkMultiviewFavoritesV08:[{uid:'aaaaaa',name:'방송인',groups:['기본 그룹'],order:1}],chzzkMultiviewFavoriteGroupsV02:['기본 그룹'],chzzkMultiviewV09:{channels:[{uid:'aaaaaa',volume:.2,muted:true}],layout:'grid',chatOpen:true,screenLocked:false,mainOnly:false,masterVolume:.5,chatSide:'right',shortcutsEnabled:true},chzzkImportantChatV1:{enabled:true,streamers:true,managers:true,partners:true,names:['사용자'],excludedNames:[]},chzzkImportantChatHeightV1:220,chzzkRecordingProfileV1:'balanced'};
   window.chrome={storage:{local:{get:async()=>structuredClone(__data),set:async values=>{Object.assign(__data,structuredClone(values));__writes++;}}},runtime:{sendMessage:async message=>{
    if(message.type==='SETTINGS_BACKUP_EXPORT')return {ok:true,document:await CZSettingsBackup.create()};
    if(message.type==='SETTINGS_BACKUP_PREVIOUS')return {ok:true,document:await CZSettingsBackup.previous()};
    if(message.type==='SETTINGS_BACKUP_RESTORE'){
     const document=CZSettingsBackup.parse(message.document),before=await CZSettingsBackup.create();
     await chrome.storage.local.set({...CZSettingsBackup.payload(document),[CZSettingsBackup.PREVIOUS_KEY]:before});return {ok:true};
    }
    return {ok:false,error:'unsupported'};
   }}};
  });
  await page.goto('https://settings.invalid/src/settings/backup.html');
  assert.equal(await page.locator('.cg-backup-export').textContent(),'설정 내보내기');
  await page.locator('.cg-backup-export').click();await page.locator('.cg-backup-status').filter({hasText:'먼저 프로젝트 폴더를 선택'}).waitFor();
  await page.locator('#chooseProject').click();await page.locator('#projectFolder').filter({hasText:'CHZZK-test-project/.backup'}).waitFor();
  await page.locator('.cg-backup-export').click();await page.locator('.cg-backup-status').filter({hasText:'백업 파일을 저장했습니다'}).waitFor();
  const exported=await page.evaluate(async()=>{const project=await (await navigator.storage.getDirectory()).getDirectoryHandle('CHZZK-test-project'),directory=await project.getDirectoryHandle('.backup');const files=[];for await(const [name,handle] of directory.entries())files.push({name,text:await (await handle.getFile()).text()});return files;});
  assert.equal(exported.length,1);assert(exported[0].name.startsWith('CZ-settings-'));
  const document=JSON.parse(exported[0].text);assert.equal(document.data.session.masterVolume,.5);assert.equal(document.data.chat.names[0],'사용자');assert.equal(await page.evaluate(()=>__writes),0);
  document.data.session.masterVolume=.8;document.data.session.shortcutsEnabled=false;document.data.chat.excludedNames=['제외'];document.data.recordingProfile='original';
  const file={name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))};
  await page.locator('.cg-backup-file').setInputFiles(file);await page.locator('.cg-backup-preview').waitFor();assert.equal(await page.locator('.cg-backup-mode').isVisible(),false);assert.equal(await page.evaluate(()=>__writes),0);
  await page.locator('.cg-backup-cancel').click();assert.equal(await page.evaluate(()=>__writes),0);
  await page.locator('.cg-backup-file').setInputFiles(file);await page.locator('.cg-backup-preview').waitFor();await page.locator('.cg-backup-apply').click();await page.locator('.cg-backup-status').filter({hasText:'새로고침하면 적용'}).waitFor();
  assert.equal(await page.evaluate(()=>__data.chzzkMultiviewV09.masterVolume),.8);assert.equal(await page.evaluate(()=>__data.chzzkRecordingProfileV1),'original');
  await page.locator('.cg-backup-undo').click();await page.locator('.cg-backup-preview').waitFor();await page.locator('.cg-backup-apply').click();await page.waitForFunction(()=>__data.chzzkMultiviewV09.masterVolume===.5);
  document.data.chatHeight='bad';const writes=await page.evaluate(()=>__writes);await page.locator('.cg-backup-file').setInputFiles({...file,buffer:Buffer.from(JSON.stringify(document))});await page.locator('.cg-backup-status').filter({hasText:'높이를 확인'}).waitFor();assert.equal(await page.evaluate(()=>__writes),writes);
  await page.setViewportSize({width:420,height:720});assert(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  await page.reload();await page.locator('#projectFolder').filter({hasText:'CHZZK-test-project/.backup'}).waitFor();
  await page.goto('https://settings.invalid/src/settings/backup.html?kind=favorites');
  await page.locator('.cg-backup-export').click();await page.locator('.cg-backup-status').filter({hasText:'백업 파일을 저장했습니다'}).waitFor();
  const kinds=await page.evaluate(async()=>{const directory=await (await (await navigator.storage.getDirectory()).getDirectoryHandle('CHZZK-test-project')).getDirectoryHandle('.backup');const names=[];for await(const name of directory.keys())names.push(name);return names;});
  await page.evaluate(()=>{window.__queryPermission=FileSystemDirectoryHandle.prototype.queryPermission;window.__requestPermission=FileSystemDirectoryHandle.prototype.requestPermission;FileSystemDirectoryHandle.prototype.queryPermission=async()=> 'denied';FileSystemDirectoryHandle.prototype.requestPermission=async()=> 'denied';});
  await page.locator('.cg-backup-export').click();await page.locator('.cg-backup-status').filter({hasText:'저장할 권한이 없습니다'}).waitFor();
  await page.evaluate(()=>{FileSystemDirectoryHandle.prototype.queryPermission=__queryPermission;FileSystemDirectoryHandle.prototype.requestPermission=__requestPermission;window.__createWritable=FileSystemFileHandle.prototype.createWritable;FileSystemFileHandle.prototype.createWritable=async()=>{throw Error('test disk failure');};});
  await page.locator('.cg-backup-export').click();await page.locator('.cg-backup-status').filter({hasText:'test disk failure'}).waitFor();
  const afterFailure=await page.evaluate(async()=>{FileSystemFileHandle.prototype.createWritable=__createWritable;const directory=await (await (await navigator.storage.getDirectory()).getDirectoryHandle('CHZZK-test-project')).getDirectoryHandle('.backup');const names=[];for await(const name of directory.keys())names.push(name);return names;});
  assert.deepEqual(afterFailure.sort(),kinds.sort(),'denied permission and failed writes preserve existing files and leave no empty backup');
  assert.equal(kinds.length,2);assert(kinds.some(name=>name.startsWith('CZ-favorites-')));assert(kinds.some(name=>name.startsWith('CZ-settings-')));
  console.log('PASS: project .backup writes both settings/favorites without overwriting, handles permission/write failures, remembers folder across reload,  preview/cancel, validated replacement, rollback, reload notice and narrow layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
