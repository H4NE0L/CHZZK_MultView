const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  for(const shadow of [false,true]){
   const page=await browser.newPage({acceptDownloads:true,viewport:{width:shadow?1280:420,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://backup.invalid/**',route=>route.fulfill({body:'<!doctype html><body>'}));await page.goto('https://backup.invalid/');
   await page.evaluate(shadow=>{
    const F='chzzkMultiviewFavoritesV08',G='chzzkMultiviewFavoriteGroupsV02',O='chzzkFavoriteGroupOptionsV2';
    window.__data={[F]:[{uid:'aaaaaa',name:'원래 이름',groups:['기존'],online:true,order:1}],[G]:['기존'],[O]:{'기존':{color:'#112233'}}};window.__writes=0;const listeners=new Set();
    window.__openBackup=[];window.chrome={runtime:{sendMessage:async message=>{__openBackup.push(message);return {ok:true};}},storage:{local:{get:async()=>structuredClone(__data),set:async values=>{const changes={};for(const key in values)changes[key]={newValue:values[key],oldValue:__data[key]};Object.assign(__data,structuredClone(values));__writes++;for(const listener of listeners)listener(changes,'local');}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
    window.CZFollowings={KEY:'followings',read:async()=>({channels:[]})};
    window.__root=shadow?document.body.appendChild(document.createElement('div')).attachShadow({mode:'open'}):document;
   },shadow);
   for(const file of ['chzzk-api','favorites-store','favorites-backup','favorites-backup-ui','group-manager'])await page.addScriptTag({content:fs.readFileSync(`src/shared/${file}.js`,'utf8')});
   await page.evaluate(async()=>{window.__manager=CZGroupManager.attach({root:__root,onSaved:async()=>{},onAdd:()=>{}});await __manager.open();});
   await page.addStyleTag({content:fs.readFileSync('src/shared/group-manager.css','utf8')});
   assert(await page.locator('.cg-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'backup controls fit the dialog');
   await page.locator('.cg-backup-export').click();await page.waitForFunction(()=>__openBackup.length===1);
   assert.deepEqual(await page.evaluate(()=>__openBackup[0]),{type:'OPEN_SETTINGS_BACKUP',kind:'favorites'});
   const exported=await page.evaluate(()=>CZFavoritesBackup.create());assert.equal(exported.data.favorites[0].name,'원래 이름');assert.equal(await page.evaluate(()=>__writes),0);
   await page.locator('.cg-backup-file').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"other":1}')});
   await page.locator('.cg-backup-status').filter({hasText:'즐겨찾기 데이터가 없는 파일'}).waitFor();assert.equal(await page.evaluate(()=>__writes),0);
   await page.locator('.cg-backup-file').setInputFiles({name:'undefined.json',mimeType:'application/json',buffer:Buffer.from('undefined')});
   await page.locator('.cg-backup-status').filter({hasText:'undefined만'}).waitFor();assert.equal(await page.evaluate(()=>__writes),0);
   await page.locator('.cg-backup-file').setInputFiles({name:'invalid-utf8.json',mimeType:'application/json',buffer:Buffer.from([0xff,0x7b])});
   await page.locator('.cg-backup-status').filter({hasText:'인코딩'}).waitFor();assert.equal(await page.evaluate(()=>__writes),0);
   const legacy={chzzkMultiviewFavoritesV08:[{uid:'aaaaaa',name:'옛 이름',groups:['수입']},{uid:'bbbbbb',name:'복구 방송',groups:['수입']}],chzzkMultiviewFavoriteGroupsV02:['빈 그룹','수입'],chzzkFavoriteGroupOptionsV2:{'수입':{color:'#abcdef'}}};
   for(const buffer of [Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(legacy))]),Buffer.concat([Buffer.from([0xfe,0xff]),Buffer.from(JSON.stringify(legacy),'utf16le').swap16()])]){
    await page.locator('.cg-backup-file').setInputFiles({name:'encoded.json',mimeType:'application/json',buffer});
    await page.locator('.cg-backup-preview').waitFor();assert.equal(await page.evaluate(()=>__writes),0);
    await page.locator('.cg-backup-cancel').click();
   }
   // Windows Notepad Unicode (UTF-16LE BOM) must preserve Korean names.
   await page.locator('.cg-backup-file').setInputFiles({name:'legacy-utf16.json',mimeType:'application/json',buffer:Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(JSON.stringify(legacy),'utf16le')])});
   await page.locator('.cg-backup-preview').waitFor();assert.equal(await page.evaluate(()=>__writes),0);
   await page.locator('.cg-backup-apply').click();await page.waitForFunction(()=>__data.chzzkMultiviewFavoritesV08.length===2);
   await page.locator('.cg-backup-status').filter({hasText:'불러왔습니다'}).waitFor();
   assert.equal(await page.evaluate(()=>__data.chzzkMultiviewFavoritesV08[0].name),'원래 이름');
   assert.equal(await page.evaluate(()=>__data.chzzkMultiviewFavoritesV08[1].name),'복구 방송');
   await page.locator('.cg-backup-undo').click();await page.locator('.cg-backup-preview').waitFor();assert.equal(await page.locator('.cg-backup-mode').inputValue(),'replace');
   await page.locator('.cg-backup-apply').click();await page.waitForFunction(()=>__data.chzzkMultiviewFavoritesV08.length===1);await page.locator('.cg-backup-status').filter({hasText:'불러왔습니다'}).waitFor();
   assert.equal(await page.evaluate(()=>__data.chzzkMultiviewFavoritesV08[0].name),'원래 이름');assert.deepEqual(errors,[]);
   console.log(`PASS: ${shadow?'Shadow DOM viewer':'popup'} project-backup tab opening, malformed-file rejection, legacy preview/merge and previous-list recovery.`);await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
