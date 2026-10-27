const assert=require('node:assert/strict');
module.exports=async function checkImportantChat(page){
 const settings=page.locator('.ic-dialog');
 const panel=page.locator('.important-chat-panel');await panel.waitFor();
 await page.waitForFunction(()=>!document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-name').disabled);
 assert.equal(await panel.evaluate(el=>el.tagName),'SECTION');
 assert(await panel.locator('.ic-list').isVisible());
 assert.equal(await settings.isVisible(),false);
 assert.equal(await settings.locator('.ic-clear').isVisible(),false);
 assert.equal(await settings.locator('.ic-clear').textContent(),'수집된 내용 초기화');
 const handle=await page.locator('.chat-frame').elementHandle(),frame=await handle.contentFrame();await handle.dispose();
 await frame.waitForFunction(()=>!!globalThis.CZChatCollector);
 await frame.evaluate(()=>{let host=document.querySelector('aside.live_chat');if(!host){host=document.createElement('aside');host.className='live_chat';host.style.cssText='height:100%;width:100%';document.body.appendChild(host);}const toolbar=document.createElement('div');toolbar.dataset.chatToolbar='';toolbar.className='live_chatting_header__test';toolbar.innerHTML='<h2>채팅</h2><div class="live_chatting_font_size">100%</div><button id="native-chat-menu">⋮</button>';host.prepend(toolbar);});
 await frame.locator('#cz-chat-settings').waitFor();
 assert.equal(await page.locator('.ic-settings-open').count(),0);
 assert.equal(await page.locator('#chatSettingsBtn').count(),0);
 assert(await frame.locator('#native-chat-menu').isVisible());
 assert.equal(await frame.locator('.live_chatting_font_size').isVisible(),false);
 assert.equal(await frame.locator('.cz-channel-name').textContent(),'테스트 방송');
 await frame.evaluate(()=>{document.querySelector('.cz-channel-name').remove();CZChatLayout.setPresentation({name:'테스트 방송',height:200});CZChatLayout.setPresentation({name:'테스트 방송',height:200});});
 assert.equal(await frame.locator('.cz-channel-name').count(),1,'fallback title is reused across layout updates');
 await frame.locator('#native-chat-menu').click();await panel.waitFor({state:'hidden'});assert.equal(await panel.isVisible(),false,'native settings must not be covered by collection');
 await frame.locator('#native-chat-menu').click();await panel.waitFor({state:'visible'});assert(await panel.isVisible());
 const start=await panel.boundingBox();
 const separator=panel.locator('.ic-resizer'),grip=await separator.boundingBox();
 const reserved=await frame.locator('#cz-important-chat-space').evaluate(el=>el.getBoundingClientRect().height);
 await separator.hover();await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+40,{steps:8});await page.mouse.up();
 assert((await panel.boundingBox()).height>=start.height+30);
 assert((await frame.locator('#cz-important-chat-space').evaluate(el=>el.getBoundingClientRect().height))>reserved);
 const grown=(await panel.boundingBox()).height;await separator.press('ArrowUp');assert((await panel.boundingBox()).height<grown);
 const openSettings=async()=>{if(!await settings.evaluate(el=>el.open)){await frame.locator('#cz-chat-settings').click();await settings.waitFor({state:'visible'});}};
 const closeSettings=async()=>{if(await settings.isVisible())await settings.locator('.ic-settings-close').click();};
 const setEnabled=async value=>{await openSettings();await settings.locator('#importantChatEnabled').setChecked(value);await closeSettings();};
 const add=async(name,text,role='',id='')=>frame.evaluate(({name,text,role,id})=>{
   let host=document.querySelector('aside.live_chat');if(!host){host=document.createElement('aside');host.className='live_chat';host.style.cssText='height:100%;width:100%';document.body.appendChild(host);}
   if(!host.querySelector('[data-chat-toolbar]')){const toolbar=document.createElement('div');toolbar.dataset.chatToolbar='';toolbar.className='live_chatting_header__test';toolbar.textContent='채팅 - 100% + ⋮';host.prepend(toolbar);}
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
 await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-chat-toolbar]')).display!=='none');
 assert.equal(await page.locator('#chatOriginalBtn').count(),0);
 assert.equal(await page.locator('#settingsManager #importantChatEnabled').count(),0);
 assert.equal(await panel.locator('.ic-message').count(),2,'nested containers must not duplicate messages');
 await openSettings();
 assert.equal(await settings.locator('.ic-chat-side,.ic-chat-open').count(),0);
 await page.locator('.ic-name').fill('지정 사용자');await page.locator('.ic-form button').click();
 await add('지정 사용자','<img src=x onerror=alert(1)>','','manual-1');await add('지정 사용자2','접두어는 불일치','','manual-2');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('onerror'));
 assert.equal(await panel.locator('.ic-message img').count(),0,'message markup must be rendered as text');
 assert(!(await panel.locator('.ic-list').textContent()).includes('접두어는 불일치'));
 await closeSettings();
 assert(await panel.locator('.ic-message').first().isVisible());
 await add('지정 사용자','목록은 항상 표시','','visible-1');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('항상 표시'));
 await openSettings();await page.keyboard.press('Escape');assert.equal(await settings.isVisible(),false);
 await setEnabled(false);assert.equal(await panel.isVisible(),false);
 await add('지정 사용자','수집 중지 확인','','disabled-1');await page.waitForTimeout(350);
 assert.equal(await panel.locator('.ic-message').count(),0);
 await setEnabled(true);assert(await panel.isVisible());await page.waitForTimeout(350);await openSettings();
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
 await settings.locator('.ic-clear').click();
 assert.equal(await panel.locator('.ic-message').count(),0);
 assert.equal(await settings.locator('.ic-names button').count(),1);
 assert(await page.locator('#importantChatEnabled').isChecked());
 // Disable automatic roles, then reset choices for the rest of the smoke suite.
 await page.locator('.ic-streamers').uncheck();await page.locator('.ic-managers').uncheck();await page.waitForTimeout(350);await page.locator('.ic-clear').click();
 await add('방송인','자동 역할 꺼짐','스트리머','owner-off');await add('관리자A','자동 역할 꺼짐','채널 관리자','manager-off');await page.waitForTimeout(350);
 assert.equal(await panel.locator('.ic-message').count(),0);
 await page.locator('.ic-streamers').check();await page.locator('.ic-managers').check();
 await page.locator('.ic-names button').click();await page.locator('.ic-clear').click();
 await closeSettings();await page.locator('#chatToggleBtn').click();assert.equal(await settings.isVisible(),false);
 assert.equal(await page.locator('.chat-frame').count(),0);assert.equal(await panel.locator('.ic-message').count(),0);
 await page.locator('#chatToggleBtn').click();
 console.log('PASS: important chat roles, exact nicknames, safe text, vertical resize, settings dialog, global toggle, 100-message cap and chat teardown.');
};
