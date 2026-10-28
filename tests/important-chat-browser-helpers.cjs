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
 await frame.evaluate(()=>{let host=document.querySelector('aside.live_chat');if(!host){host=document.createElement('aside');host.className='live_chat';host.style.cssText='height:100%;width:100%';document.body.appendChild(host);}const toolbar=document.createElement('div');toolbar.className='native-toolbar-test';toolbar.innerHTML='<span>채팅</span><button class="native-font-svg-minus"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><span class="native-font-value">100%</span><button class="native-font-svg-plus"><svg viewBox="0 0 16 16"><path d="M3 8h10M8 3v10"/></svg></button><button id="native-chat-menu">⋮</button>';const shell=document.createElement('section');shell.style.cssText='height:100%;width:100%;display:flex;flex-direction:column';host.before(shell);const foreign=document.createElement('div');foreign.className='live_chatting_header__foreign';foreign.innerHTML='<strong>배지 채팅 모아보기</strong><button class="foreign-filter">필터 펴기</button>';shell.append(foreign,toolbar,host);});
 await frame.locator('#cz-chat-settings').waitFor();
 assert.equal(await page.locator('.ic-settings-open').count(),0);
 assert.equal(await page.locator('#chatSettingsBtn').count(),0);
 assert(await frame.locator('.cz-native-chat-header #native-chat-menu').isVisible());
 assert.equal(await frame.locator('.native-font-value').isVisible(),false);
 assert.equal(await frame.locator('.native-toolbar-test').getByText('채팅',{exact:true}).isVisible(),false);
 assert.equal(await frame.locator('.native-toolbar-test').getByRole('button',{name:'+',exact:true}).count(),0);
 assert(await frame.locator('#cz-chat-settings').evaluate(el=>el.nextElementSibling.id==='native-chat-menu'),'custom settings precedes native settings');
 assert.equal(await frame.locator('.cz-channel-name').textContent(),'테스트 방송');
 assert.equal(await frame.locator('.live_chatting_header__foreign #cz-chat-settings').count(),0);
 assert.equal(await frame.locator('.foreign-filter').isVisible(),true);
 assert.equal(await frame.locator('.live_chatting_header__foreign strong').textContent(),'배지 채팅 모아보기');
 await frame.evaluate(()=>{const clone=document.querySelector('.cz-native-chat-header').cloneNode(true);clone.classList.add('foreign-clone');clone.querySelector('.cz-channel-name').textContent='다른 확장 수집 목록';document.querySelector('.cz-native-chat-header').before(clone);});
 await frame.waitForFunction(()=>!document.querySelector('.foreign-clone #cz-chat-settings'));
 assert.equal(await frame.locator('.foreign-clone.cz-native-chat-header').count(),0);
 assert.equal(await frame.locator('.foreign-clone').textContent().then(text=>text.includes('다른 확장 수집 목록')),true);
 const nativeRect=await frame.locator('.cz-native-chat-header').boundingBox();
 await page.waitForFunction(()=>{const panel=document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.important-chat-panel');return parseFloat(getComputedStyle(panel).top)>36;});
 assert(Math.abs((await panel.boundingBox()).y-(nativeRect.y+nativeRect.height))<2,'collection starts below native header, after third-party panels');
 await frame.evaluate(()=>{window.__presentationCount=0;window.__countPresentation=event=>{if(event.data?.type==='CHAT_PRESENTATION')window.__presentationCount++;};window.addEventListener('message',window.__countPresentation);});
 await page.waitForTimeout(200);
 const presentations=await frame.evaluate(()=>{window.removeEventListener('message',window.__countPresentation);return window.__presentationCount;});
 assert(presentations<10,'unchanged header geometry must not cause a postMessage feedback loop');


 assert.equal(await frame.locator('.cz-native-chat-header .native-font-svg-minus').isVisible(),false);
 assert.equal(await frame.locator('.cz-native-chat-header .native-font-svg-plus').isVisible(),false);
 assert.equal(await frame.locator('.cz-channel-name').evaluate(el=>getComputedStyle(el).fontSize),'14px');
 assert.equal(await frame.locator('.cz-channel-name').evaluate(el=>getComputedStyle(el).textAlign),'left');
 // Simulate site rules that would turn ordinary inline SVGs into filled/clipped shapes.
 await frame.addStyleTag({content:'svg{width:80px!important;height:2px!important;fill:red!important;stroke:none!important;transform:scale(.1)!important}svg path,svg circle{fill:red!important;stroke:none!important}'});
 for(const id of ['cz-chat-settings','cz-chat-channel']){
   assert(await frame.locator('#'+id).evaluate(el=>!!el.firstElementChild?.shadowRoot));
   const icon=frame.locator('#'+id+' svg');
   assert.equal(await icon.evaluate(el=>el.getBoundingClientRect().width),16);
   assert.equal(await icon.evaluate(el=>el.getBoundingClientRect().height),16);
   assert.notEqual(await icon.evaluate(el=>getComputedStyle(el).fill),'none');
   assert.equal(await icon.locator('path').first().evaluate(el=>getComputedStyle(el).stroke),'none');
 }

 assert.equal(await frame.locator('#cz-chat-settings').evaluate(el=>el.getBoundingClientRect().width),28);
 assert(await frame.locator('#cz-chat-channel').evaluate(el=>el.nextElementSibling.id==='cz-chat-settings'));
 assert.equal(await frame.locator('#cz-chat-channel').getAttribute('href'),'https://chzzk.naver.com/live/aaaaaa');
 assert.equal(await frame.locator('#cz-chat-channel').getAttribute('target'),'_blank');
 assert(await page.locator('#shortcutsEnabled').evaluate(el=>el.closest('.settings-feature').querySelector('p').id===el.getAttribute('aria-describedby')));
 assert(await page.locator('#importantChatEnabled').evaluate(el=>el.closest('.settings-feature').querySelector('p').id===el.getAttribute('aria-describedby')));

 await frame.evaluate(()=>{document.querySelector('.cz-channel-name').remove();CZChatLayout.setPresentation({name:'테스트 방송',height:200});CZChatLayout.setPresentation({name:'테스트 방송',height:200});});
 assert.equal(await frame.locator('.cz-channel-name').count(),1,'fallback title is reused across layout updates');
 await frame.locator('.cz-native-chat-header #native-chat-menu').click();await panel.waitFor({state:'hidden'});assert.equal(await panel.isVisible(),false,'native settings must not be covered by collection');
 await frame.locator('.cz-native-chat-header #native-chat-menu').click();await panel.waitFor({state:'visible'});assert(await panel.isVisible());
 const start=await panel.boundingBox();
 const separator=panel.locator('.ic-resizer'),grip=await separator.boundingBox();
 const reserved=await frame.locator('#cz-important-chat-space').evaluate(el=>el.getBoundingClientRect().height);
 await separator.hover();await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+40,{steps:8});await page.mouse.up();
 assert((await panel.boundingBox()).height>=start.height+30);
 assert((await frame.locator('#cz-important-chat-space').evaluate(el=>el.getBoundingClientRect().height))>reserved);
 const grown=(await panel.boundingBox()).height;await separator.press('ArrowUp');assert((await panel.boundingBox()).height<grown);
 const openSettings=async()=>{if(!await settings.evaluate(el=>el.open)){await frame.locator('#cz-chat-settings').click();await settings.waitFor({state:'visible'});}};
 const closeSettings=async()=>{if(await settings.isVisible())await settings.locator('.ic-settings-close').click();};
 const setEnabled=async value=>{await closeSettings();await page.locator('#settingsManager > summary').click();await page.locator('#importantChatEnabled').setChecked(value);await page.locator('#settingsManager > summary').click();};
 const add=async(name,text,role='',id='')=>frame.evaluate(({name,text,role,id})=>{
   let host=document.querySelector('aside.live_chat');if(!host){host=document.createElement('aside');host.className='live_chat';host.style.cssText='height:100%;width:100%';document.body.appendChild(host);}
   if(!document.querySelector('.native-toolbar-test')){const toolbar=document.createElement('div');toolbar.dataset.chatToolbar='';toolbar.className='live_chatting_header__test';toolbar.textContent='채팅 - 100% + ⋮';host.prepend(toolbar);}
   const row=document.createElement('div');row.className='live_chatting_list_item__test';if(id)row.dataset.messageId=id;
   const nested=document.createElement('div');nested.className='live_chatting_message_container__test';row.appendChild(nested);
   const author=document.createElement('span');author.className='live_chatting_username_container';
   if(role){const badge=document.createElement('img');badge.alt=role==='스트리머'?'스트리머 아이콘':role;if(role==='스트리머')nested.appendChild(badge);else author.appendChild(badge);}
   const nick=document.createElement('span');nick.className='name_text__test';nick.textContent=name;author.appendChild(nick);
   const body=document.createElement('span');body.className='live_chatting_message_text__test';body.textContent=text;
   nested.append(author,body);host.appendChild(row);
 },{name,text,role,id});
 await frame.evaluate(()=>{
   const row=document.createElement('div');row.className='_chatting_message_w9pvh_21';row.innerHTML='<span class="_nickname_w9pvh_33"><button class="_nickname_1mc5x_80">테스트 방송</button></span>새 CSS 모듈의 스트리머 채팅 <img alt="웃음"> @<span class="_nickname_mention_80">다른 사용자</span>';document.querySelector('aside.live_chat').appendChild(row);
 });
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('새 CSS 모듈의 스트리머 채팅 웃음'));
 assert.equal(await panel.locator('.ic-message').count(),1,'nested nickname CSS modules must not duplicate the message');
 await frame.evaluate(()=>document.querySelector('._chatting_message_w9pvh_21').remove());
 await openSettings();await settings.locator('.ic-clear').click();await closeSettings();
 await add('테스트 방송','배지 없는 실제 스트리머','','api-owner');
 await add('테스트 방송2','다른 닉네임은 제외','','not-owner');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('배지 없는 실제 스트리머'));
 await frame.evaluate(()=>document.querySelector('[data-message-id="api-owner"]').remove());
 await openSettings();await settings.locator('.ic-clear').click();await closeSettings();
 await add('방송인','스트리머 메시지','스트리머','owner-1');
 await add('관리자A','관리자 메시지','채널 관리자 배지','manager-1');
 await add('일반 사용자','수집되면 안 됨','','normal-1');
 await frame.evaluate(()=>{const image=document.createElement('img');image.alt='스트리머';document.querySelector('[data-message-id="normal-1"] [class*=live_chatting_message_text]').appendChild(image);});
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelectorAll('.ic-message').length===2);
 await frame.waitForFunction(()=>getComputedStyle(document.querySelector('.native-toolbar-test')).display!=='none');
 assert.equal(await page.locator('#chatOriginalBtn').count(),0);
 assert.equal(await page.locator('#settingsManager #importantChatEnabled').count(),1);
 assert.equal(await settings.locator('#importantChatEnabled').count(),0);
 assert.equal(await panel.locator('.ic-message').count(),2,'nested containers must not duplicate messages');
 assert((await panel.locator('.ic-list').textContent()).includes('방송인 · 스트리머'),'streamer badge outside username is recognized');
 assert(!(await panel.locator('.ic-list').textContent()).includes('일반 사용자'),'message-body badge must not grant a role');
 const stableIds=await frame.evaluate(async()=>{
   const row=document.querySelector('[data-message-id="owner-1"]');row.removeAttribute('data-message-id');
   const batches=[],collector=CZChatCollector.create({send:batch=>batches.push(batch)});
   collector.configure({enabled:true});await new Promise(resolve=>setTimeout(resolve,300));
   collector.configure({enabled:true},{streamerName:'테스트 방송'});await new Promise(resolve=>setTimeout(resolve,300));collector.stop();row.dataset.messageId='owner-1';
   return batches.map(batch=>batch.find(item=>item.name==='방송인')?.id);
 });
 assert.equal(stableIds.length,2);assert.equal(stableIds[0],stableIds[1],'API identity refresh must not duplicate existing chat rows');
 const reorderedCaptured=await frame.evaluate(async()=>{
   const row=document.createElement('div');row.dataset.chatMessage='';row.style.cssText='position:fixed;top:500px;height:24px';row.innerHTML='<span data-chat-nickname>범위 점검 사용자</span><span data-chat-text>DOM 순서와 화면 순서가 다른 채팅</span>';
   document.querySelector('.cz-native-chat-header').before(row);
   const captured=[],collector=CZChatCollector.create({send:batch=>captured.push(...batch)});collector.configure({enabled:true,names:['범위 점검 사용자']});await new Promise(resolve=>setTimeout(resolve,300));collector.stop();row.remove();
   return captured.some(item=>item.name==='범위 점검 사용자');
 });
 assert(reorderedCaptured,'a visually lower chat row must not be rejected just because it precedes the header in DOM order');


 await page.locator('#settingsManager > summary').click();await page.locator('#importantChatSettings').click();assert(await settings.isVisible());
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-diagnostics').textContent.includes('스트리머 확인: 테스트 방송'));
 await page.waitForFunction(()=>{const text=document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-diagnostics').textContent;return /읽은 항목 [1-9]/.test(text)&&/수신 [1-9]/.test(text)&&/표시 2/.test(text);});
 const originalClipboard=await page.evaluateHandle(()=>Object.getOwnPropertyDescriptor(navigator,'clipboard'));
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__chatDiagnosticCopy=JSON.parse(text);}}}));
 await settings.locator('.ic-copy-diagnostics').click();
 const copiedDiagnostic=await page.evaluate(()=>window.__chatDiagnosticCopy);
 assert.equal(copiedDiagnostic.collectorRevision,'20261028-5');
 assert(copiedDiagnostic.counts.parsed>0);assert(copiedDiagnostic.received>0);assert.equal(copiedDiagnostic.displayed,2);
 assert(copiedDiagnostic.structure.row.includes('live_chatting_list_item'));
 assert(!JSON.stringify(copiedDiagnostic).includes('스트리머 메시지'),'diagnostic copy omits chat content');
 await page.evaluate(descriptor=>{delete navigator.clipboard;if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);delete window.__chatDiagnosticCopy;},originalClipboard);await originalClipboard.dispose();
 assert.equal(await settings.locator('.ic-chat-side,.ic-chat-open').count(),0);
 await page.locator('.ic-name').fill('지정 사용자');await page.locator('.ic-form button').click();
 const imageUrl='https://ssl.pstatic.net/__cz_collected_chat_test.png';
 await page.route(imageUrl,route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKf8AAAAASUVORK5CYII=','base64')}));
 await frame.evaluate(src=>{const row=document.createElement('div');row.className='_chatting_message_rich_21';row.innerHTML='<img alt="구독 배지"><span class="_nickname_rich_33"><span class="_nickname_leaf_80">지정 사용자</span></span><span>이모티콘 이미지 표시 <img alt="테스트 웃음"></span>';row.querySelectorAll('img').forEach(img=>img.src=src);document.querySelector('aside.live_chat').appendChild(row);},imageUrl);
 const emote=panel.locator('.ic-emote[alt="테스트 웃음"]');await emote.waitFor();
 await page.waitForFunction(()=>{const image=document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-emote[alt="테스트 웃음"]');return image?.complete && image.naturalWidth>0;});
 assert.equal(await panel.locator('.ic-badge[alt="구독 배지"]').count(),1);
 assert.equal(await emote.getAttribute('referrerpolicy'),'no-referrer');
 const retainedEmote=await emote.elementHandle();
 await add('지정 사용자','새 채팅에도 기존 이미지 유지','','retain-rich');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('새 채팅에도 기존 이미지 유지'));
 assert(await retainedEmote.evaluate(image=>image.isConnected),'new messages retain existing image DOM');await retainedEmote.dispose();
 if(process.env.CZ_CHAT_PREVIEW){await closeSettings();await panel.screenshot({path:process.env.CZ_CHAT_PREVIEW});await openSettings();}

 await frame.evaluate(()=>{const row=document.createElement('div');row.className='other-class _chatting_message_abcde_99';row.innerHTML='<span class="_nickname_z9x8y_33"><span class="additional _nickname_xyz12_80">지정 사용자</span></span><span class="_body_unknown_10">새 CSS 모듈의 지정 시청자 채팅</span>';document.querySelector('aside.live_chat').appendChild(row);});
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('새 CSS 모듈의 지정 시청자 채팅'));

 await frame.evaluate(()=>{const row=document.createElement('div');row.className='unknown_virtual_row';row.innerHTML='<span class="new_username"><span class="new_nickname">지정 사용자</span></span><span class="changed_message_body">본문 CSS가 달라진 채팅 <img alt="웃음"></span>';document.querySelector('aside.live_chat').appendChild(row);});
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('본문 CSS가 달라진 채팅 웃음'));
 await add('지정 사용자','<img src=x onerror=alert(1)>','','manual-1');await add('지정 사용자2','접두어는 불일치','','manual-2');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('onerror'));
 assert.equal(await panel.locator('.ic-message').filter({hasText:'onerror'}).locator('img').count(),0,'message markup must be rendered as text');
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
