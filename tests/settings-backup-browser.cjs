const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:900,height:720}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://settings.invalid/**',route=>{const file=path.resolve('.','.'+new URL(route.request().url()).pathname);return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});});
  await page.addInitScript(()=>{
   window.__writes=0;
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
  const waiting=page.waitForEvent('download');await page.locator('.cg-backup-export').click();const download=await waiting;
  assert(download.suggestedFilename().startsWith('CZ-settings-'));
  const document=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(document.data.session.masterVolume,.5);assert.equal(document.data.chat.names[0],'사용자');assert.equal(await page.evaluate(()=>__writes),0);
  document.data.session.masterVolume=.8;document.data.session.shortcutsEnabled=false;document.data.chat.excludedNames=['제외'];document.data.recordingProfile='original';
  const file={name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))};
  await page.locator('.cg-backup-file').setInputFiles(file);await page.locator('.cg-backup-preview').waitFor();assert.equal(await page.locator('.cg-backup-mode').isVisible(),false);assert.equal(await page.evaluate(()=>__writes),0);
  await page.locator('.cg-backup-cancel').click();assert.equal(await page.evaluate(()=>__writes),0);
  await page.locator('.cg-backup-file').setInputFiles(file);await page.locator('.cg-backup-preview').waitFor();await page.locator('.cg-backup-apply').click();await page.locator('.cg-backup-status').filter({hasText:'새로고침하면 적용'}).waitFor();
  assert.equal(await page.evaluate(()=>__data.chzzkMultiviewV09.masterVolume),.8);assert.equal(await page.evaluate(()=>__data.chzzkRecordingProfileV1),'original');
  await page.locator('.cg-backup-undo').click();await page.locator('.cg-backup-preview').waitFor();await page.locator('.cg-backup-apply').click();await page.waitForFunction(()=>__data.chzzkMultiviewV09.masterVolume===.5);
  document.data.chatHeight='bad';const writes=await page.evaluate(()=>__writes);await page.locator('.cg-backup-file').setInputFiles({...file,buffer:Buffer.from(JSON.stringify(document))});await page.locator('.cg-backup-status').filter({hasText:'높이를 확인'}).waitFor();assert.equal(await page.evaluate(()=>__writes),writes);
  await page.setViewportSize({width:420,height:720});assert(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  console.log('PASS: settings download, preview/cancel, validated replacement, rollback, reload notice and narrow layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
