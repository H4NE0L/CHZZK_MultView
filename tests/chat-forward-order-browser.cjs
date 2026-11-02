const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),modules=require('./support/modules.cjs');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.setContent('<aside id="native"></aside><div class="ic-list" style="height:200px;overflow:auto"></div>');
 for(const file of ['src/shared/important-chat.js','src/content/chat-collector.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});await page.addScriptTag({content:modules.read('src/viewer/chat-renderer.js','utf8')});
 await page.evaluate(()=>{
  window.__make=(id,name,body)=>{const row=document.createElement('div');row.dataset.chatMessage='';row.dataset.messageId=id;row.innerHTML='<span data-chat-nickname></span><span data-chat-text></span>';row.querySelector('[data-chat-nickname]').textContent=name;row.querySelector('[data-chat-text]').textContent=body;document.querySelector('#native').append(row);return row;};
  __make('old','대상','예전 채팅');__make('old-later-target','나중 대상','추가 전 채팅');
  window.__filter=CZImportantChat.settings({streamers:false,managers:false,partners:false,names:['대상']});window.__model=CZImportantChat.create();__model.reset('channel');window.__renderer=CZChatRenderer.create(document.querySelector('.ic-list'));
  window.__batches=[];window.__collector=CZChatCollector.create({send:batch=>{__batches.push(batch);__model.add('channel',batch,__filter);__renderer.render(__model.items);}});__collector.configure(__filter);
 });
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>__model.items.length),0,'no initial backlog');
 await page.evaluate(()=>{__make('early','대상','');__make('later','대상','먼저 해석된 뒤 채팅');});
 await page.waitForFunction(()=>__model.items.length===1);await page.evaluate(()=>document.querySelector('[data-message-id=early] [data-chat-text]').textContent='늦게 해석된 앞 채팅');await page.waitForFunction(()=>__model.items.length===2);
 assert.deepEqual(await page.evaluate(()=>__model.items.map(item=>item.id)),['early','later']);assert.deepEqual(await page.locator('.ic-message-text').allTextContents(),['늦게 해석된 앞 채팅','먼저 해석된 뒤 채팅']);assert(await page.evaluate(()=>__model.items.every(item=>item.time===null)),'collection ordering never creates authored timestamps');
 await page.evaluate(()=>{__filter=CZImportantChat.settings({...__filter,names:['대상','나중 대상']});__collector.configure(__filter);document.querySelector('[data-message-id=old-later-target]').setAttribute('data-cz-message-time','2026-10-29T12:34:56Z');__make('new-target','나중 대상','추가 후');});
 await page.waitForFunction(()=>__model.items.length===3);assert.equal(await page.evaluate(()=>__model.items.some(item=>item.id==='old-later-target')),false,'late metadata cannot collect pre-registration messages');
 await page.evaluate(()=>{for(let i=0;i<650;i++)__make('bulk-'+i,'대상','채팅 '+i);});await page.waitForFunction(()=>__model.items.length===653);assert.equal(await page.locator('.ic-message').count(),300,'DOM paging never limits retained data');
 await page.locator('.ic-pagination button').first().click();await page.locator('.ic-pagination button').first().click();assert.equal(await page.locator('.ic-message-text').first().textContent(),'늦게 해석된 앞 채팅','the first retained message remains accessible');
 await page.locator('.ic-pagination button').last().click();assert.equal(await page.locator('.ic-message-text').last().textContent(),'채팅 649');
 assert(await page.evaluate(()=>__batches.every(batch=>batch.length<=200)),'transport chunks do not discard history');
 await page.evaluate(()=>{__model.clear();__renderer.render([]);__make('after-clear','대상','초기화 후');});await page.waitForFunction(()=>__model.items.length===1);assert.equal(await page.locator('.ic-message-text').last().textContent(),'초기화 후');
 await page.evaluate(()=>{__collector.dispose();__renderer.clear();});console.log('PASS: forward-only registration, late parse ordering, delayed old metadata, unlimited retention, 300-row paging, full-batch delivery and clear.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
