const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.setContent('<aside id="chat" style="height:60px;overflow:auto"><div style="height:500px">과거 화면</div><div data-chat-message data-message-id="old"><span data-chat-nickname>매니저</span><span data-chat-text>수집 전</span></div></aside>');
 for(const file of ['src/shared/important-chat.js','src/content/chat-collector.js','src/content/chat-roles-main.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{
  document.documentElement.setAttribute('data-cz-roles-enabled','true');document.dispatchEvent(new Event('cz-chat-roles-config'));
  window.filter=CZImportantChat.settings({partners:false});window.model=CZImportantChat.create();model.reset('test');window.collector=CZChatCollector.create({send:batch=>model.add('test',batch,filter)});collector.configure(filter);
  window.make=(id,code,body,profileOverride)=>{const row=document.createElement('div');row.dataset.chatMessage='';row.dataset.messageId=id;row.innerHTML='<span data-chat-nickname style="color:rgb(0,200,120)"></span><span data-chat-text></span>';row.querySelector('[data-chat-nickname]').textContent=code;row.querySelector('[data-chat-text]').textContent=body;row.__reactProps$fixture={chatMessage:{msgId:id,profile:profileOverride||JSON.stringify({nickname:code,userRoleCode:code})}};document.querySelector('#chat').append(row);return row;};
  make('streamer','streamer','방송자 채팅');make('manager','streaming_chat_manager','매니저 채팅');make('normal','common_user','일반 채팅');
 });
 await page.waitForFunction(()=>model.size===2);
 assert.deepEqual(await page.evaluate(()=>model.items.map(item=>item.role)),['streamer','manager'],'source profiles work without timestamps or badges and while source scroll is above bottom');
 await page.evaluate(()=>{const row=make('late','late-profile','지연 프로필');delete row.__reactProps$fixture;setTimeout(()=>{row.__reactProps$fixture={chatMessage:{msgId:'late',profile:{userRoleCode:'manager'}}};},20);});await page.waitForFunction(()=>model.size===3);
 await page.evaluate(()=>{const row=document.querySelector('[data-message-id=manager]');row.dataset.messageId='recycled-normal';row.__reactProps$fixture={chatMessage:{msgId:'recycled-normal',profile:{userRoleCode:'common_user'}}};row.querySelector('[data-chat-text]').textContent='재활용된 일반 채팅';});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>model.size),3,'old role cannot leak into a recycled message ID');
 await page.evaluate(()=>{const row=make('wrong','manager','다른 ID');row.__reactProps$fixture.chatMessage.msgId='other';const profile={};Object.defineProperty(profile,'userRoleCode',{get(){window.getterRead=true;return 'streamer';}});make('getter','regular','getter',profile);});await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>model.size),3);assert.equal(await page.evaluate(()=>!!window.getterRead),false);
 await page.evaluate(()=>{
  const nested=make('nested','nested-owner','하위 프로필');delete nested.__reactProps$fixture;nested.querySelector('[data-chat-nickname]').__reactProps$fixture={profile:{nickname:'nested-owner',userRoleCode:'streamer'}};
  const wrapped=make('wrapped','wrapped-manager','다른 메시지 구조');wrapped.__reactProps$fixture={data:{messageData:{msgId:'wrapped',profile:{nickname:'wrapped-manager',userRoleCode:'manager'}}}};
 });await page.waitForFunction(()=>model.size===5);assert.deepEqual(await page.evaluate(()=>model.items.slice(-2).map(item=>item.role)),['streamer','manager']);
 await page.evaluate(()=>{document.documentElement.setAttribute('data-cz-roles-enabled','false');document.dispatchEvent(new Event('cz-chat-roles-config'));collector.dispose();});assert.equal(await page.locator('[data-cz-source-role]').count(),0);
 console.log('PASS: role profiles independent of timestamps/badges, live tail while reading history, delayed props, ID conflicts, getter safety and OFF cleanup.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
