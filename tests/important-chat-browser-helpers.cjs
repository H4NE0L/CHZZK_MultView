const assert=require('node:assert/strict');
module.exports=async function checkImportantChat(page){
 const panel=page.locator('.important-chat-panel');await panel.waitFor();
 await page.waitForFunction(()=>!document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-name').disabled);
 assert.equal(await panel.locator('.ic-list-tab').getAttribute('aria-selected'),'true');
 assert.equal(await panel.locator('.ic-settings').isVisible(),false);
 assert.equal(await panel.locator('.ic-clear').isVisible(),false);
 assert.equal(await panel.locator('.ic-clear').textContent(),'수집된 내용 초기화');
 const handle=await page.locator('.chat-frame').elementHandle(),frame=await handle.contentFrame();await handle.dispose();
 await frame.waitForFunction(()=>!!globalThis.CZChatCollector);
 const add=async(name,text,role='',id='')=>frame.evaluate(({name,text,role,id})=>{
   let host=document.querySelector('aside.live_chat');if(!host){host=document.createElement('aside');host.className='live_chat';document.body.appendChild(host);}
   const row=document.createElement('div');row.className='live_chatting_list_item__test';if(id)row.dataset.messageId=id;
   const nested=document.createElement('div');nested.className='live_chatting_message_container__test';row.appendChild(nested);
   const author=document.createElement('span');author.className='live_chatting_username_container';
   if(role){const badge=document.createElement('img');badge.alt=role;author.appendChild(badge);}
   const nick=document.createElement('span');nick.className='name_text__test';nick.textContent=name;author.appendChild(nick);
   const body=document.createElement('span');body.className='live_chatting_message_text__test';body.textContent=text;
   nested.append(author,body);host.appendChild(row);
 },{name,text,role,id});
 await add('방송인','스트리머 메시지','스트리머','owner-1');
 await add('관리자A','관리자 메시지','채널 관리자 배지','manager-1');
 await add('일반 사용자','수집되면 안 됨','','normal-1');
 await frame.evaluate(()=>{const image=document.createElement('img');image.alt='스트리머';document.querySelector('[data-message-id="normal-1"] [class*=live_chatting_message_text]').appendChild(image);});
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.ic-message').length===2);
 assert.equal(await panel.locator('.ic-message').count(),2,'nested containers must not duplicate messages');
 await panel.locator('.ic-settings-tab').click();
 await page.locator('.ic-name').fill('지정 사용자');await page.locator('.ic-form button').click();
 await add('지정 사용자','<img src=x onerror=alert(1)>','','manual-1');await add('지정 사용자2','접두어는 불일치','','manual-2');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('onerror'));
 assert.equal(await panel.locator('.ic-message img').count(),0,'message markup must be rendered as text');
 assert(!(await panel.locator('.ic-list').textContent()).includes('접두어는 불일치'));
 await panel.locator('.ic-list-tab').click();
 assert(await panel.locator('.ic-message').first().isVisible());
 await panel.locator('.ic-settings-tab').click();
 await panel.locator('summary').click();assert.equal(await panel.getAttribute('open'),null);
 await add('지정 사용자','접힌 동안에도 수집','','collapsed-1');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('접힌 동안'));
 await panel.locator('summary').click();
 assert.equal(await panel.locator('.ic-list-tab').getAttribute('aria-selected'),'true');
 assert.equal(await panel.locator('.ic-settings').isVisible(),false);
 assert(await panel.locator('.ic-message').first().isVisible());
 await panel.locator('.ic-list-tab').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await panel.locator('.ic-settings-tab').getAttribute('aria-selected'),'true');
 await page.locator('.ic-enabled').uncheck();await add('지정 사용자','수집 중지 확인','','disabled-1');await page.waitForTimeout(350);
 assert.equal(await panel.locator('.ic-message').count(),0);
 await page.locator('.ic-enabled').check();await page.waitForTimeout(350);
 await page.locator('.ic-clear').click();
 await frame.evaluate(()=>{
   const host=document.querySelector('aside.live_chat');
   for(let i=0;i<125;i++){
     const row=document.createElement('div');row.dataset.chatMessage='';row.dataset.messageId='bulk'+i;
     const nick=document.createElement('span');nick.dataset.chatNickname='';nick.textContent='지정 사용자';
     const text=document.createElement('span');text.dataset.chatText='';text.textContent='제한 검사 '+i;row.append(nick,text);host.appendChild(row);
   }
 });
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.ic-message').length===100);
 assert((await panel.locator('.ic-message').last().textContent()).includes('제한 검사 124'));
 await panel.locator('.ic-clear').click();
 assert.equal(await panel.locator('.ic-message').count(),0);
 assert.equal(await panel.locator('.ic-names button').count(),1);
 assert(await panel.locator('.ic-enabled').isChecked());
 // Disable automatic roles, then reset choices for the rest of the smoke suite.
 await page.locator('.ic-streamers').uncheck();await page.locator('.ic-managers').uncheck();await page.waitForTimeout(350);await page.locator('.ic-clear').click();
 await add('방송인','자동 역할 꺼짐','스트리머','owner-off');await add('관리자A','자동 역할 꺼짐','채널 관리자','manager-off');await page.waitForTimeout(350);
 assert.equal(await panel.locator('.ic-message').count(),0);
 await page.locator('.ic-streamers').check();await page.locator('.ic-managers').check();
 await page.locator('.ic-names button').click();await page.locator('.ic-clear').click();
 await page.locator('#chatToggleBtn').click();assert.equal(await page.locator('.chat-frame').count(),0);assert.equal(await panel.locator('.ic-message').count(),0);
 await page.locator('#chatToggleBtn').click();
 console.log('PASS: important chat roles, exact nicknames, safe text, collapse, disable, 100-message cap and chat teardown.');
};
