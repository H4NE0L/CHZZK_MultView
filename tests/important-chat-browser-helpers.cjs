const assert=require('node:assert/strict');
module.exports=async function checkImportantChat(page){
 const settings=page.locator('.ic-dialog');
 await page.locator('#settingsManager > summary').click();
 assert.equal(await page.locator('#chatTimestampsEnabled').isChecked(),false,'timestamps default OFF');
 await page.locator('#chatTimestampsEnabled').check({force:true});await page.locator('#settingsManager > summary').click();
 const panel=page.locator('.important-chat-panel');await panel.waitFor();
 await page.waitForFunction(()=>!document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-name').disabled);
 assert.equal(await panel.evaluate(el=>el.tagName),'SECTION');
 assert.equal(await panel.locator('.ic-toggle').getAttribute('aria-expanded'),'false');
 assert.equal(await panel.locator('.ic-list').isVisible(),false,'collection starts collapsed');
 await panel.locator('.ic-header-settings').click();await settings.waitFor();assert.equal(await panel.locator('.ic-toggle').getAttribute('aria-expanded'),'false');await settings.locator('.ic-settings-close').click();
 await panel.locator('.ic-toggle').click();assert(await panel.locator('.ic-list').isVisible());
 assert.equal(await settings.isVisible(),false);
 assert.equal(await settings.locator('.ic-clear').isVisible(),false);
 assert.equal(await settings.locator('.ic-clear').textContent(),'수집된 내용 초기화');
 const handle=await page.locator('.chat-frame').elementHandle(),frame=await handle.contentFrame();await handle.dispose();
 await frame.waitForFunction(()=>!!globalThis.CZChatCollector);
 await frame.evaluate(()=>{let host=document.querySelector('aside.live_chat');if(!host){host=document.createElement('aside');host.className='live_chat';host.style.cssText='height:100%;width:100%';document.body.appendChild(host);}const toolbar=document.createElement('div');toolbar.className='native-toolbar-test';toolbar.innerHTML='<h2 class="_title_native_12">채팅</h2><button class="native-font-svg-minus"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><span class="native-font-value">100%</span><button class="native-font-svg-plus"><svg viewBox="0 0 16 16"><path d="M3 8h10M8 3v10"/></svg></button><div id="native-action-wrap" style="display:flex;position:absolute;top:0;transform:translateY(-6px)"><button id="native-prediction">승부예측</button><button id="native-chat-menu" style="position:absolute;top:0;right:0;transform:translateY(-4px)">⋮</button></div>';window.__nativeTitle=toolbar.querySelector('h2').firstChild;const portal=document.createElement('div');portal.id='native-overlay-root';document.body.appendChild(portal);const shell=document.createElement('section');shell.id='native-width-shell';shell.style.cssText='height:100%;width:500px;min-width:500px;display:flex;flex-direction:column';host.before(shell);const foreign=document.createElement('div');foreign.className='live_chatting_header__foreign';foreign.innerHTML='<strong>배지 채팅 모아보기</strong><button class="foreign-filter">필터 펴기</button>';shell.append(foreign,toolbar,host);});
 await frame.locator('#cz-chat-channel').waitFor();
 assert.equal(await frame.locator('#cz-chat-settings').count(),0,'collection settings is outside native chat');
 assert.equal(await panel.locator('.ic-chevron').count(),0);
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(96, 101, 109)');
 await frame.waitForFunction(()=>document.querySelector('#native-width-shell').getBoundingClientRect().width<=innerWidth);
 assert(await frame.evaluate(()=>document.querySelector('.cz-chat-only').getBoundingClientRect().right<=innerWidth+1),'native chat fits the iframe despite a fixed/minimum-width shell');
 assert.equal(await page.locator('.ic-settings-open').count(),0);
 assert.equal(await page.locator('#chatSettingsBtn').count(),0);
 assert(await frame.locator('.cz-native-chat-header #native-chat-menu').isVisible());
 assert.equal(await frame.locator('.native-font-value').isVisible(),false);
 assert.equal(await frame.locator('.native-toolbar-test').getByText('채팅',{exact:true}).isVisible(),false);
 assert.equal(await frame.locator('.native-toolbar-test').getByRole('button',{name:'+',exact:true}).count(),0);
 assert(await frame.locator('#cz-chat-channel').evaluate(el=>el.nextElementSibling.id==='native-chat-menu'),'channel link precedes native settings');
 assert.equal(await frame.locator('.cz-channel-name').textContent(),'테스트 방송');
 assert.equal(await frame.locator('#cz-chat-power .cz-power-value').textContent(),'—');
 await frame.evaluate(()=>{const profile=document.createElement('div');profile.id='native-profile-check';profile.setAttribute('role','dialog');profile.style.cssText='position:fixed;top:60px;left:10px;width:260px;height:160px;background:#202328';profile.innerHTML='<p>사용 중인 프로필</p><button><span>내 통나무 파워</span><strong id="profile-balance">300</strong></button>';document.querySelector('#native-overlay-root').appendChild(profile);CZChatLayout.setPresentation({name:'테스트 방송'});});
 await frame.waitForFunction(()=>document.querySelector('#cz-chat-power .cz-power-value').textContent==='300');
 await frame.evaluate(()=>{document.querySelector('#profile-balance').textContent='1,234';CZChatLayout.setPresentation({name:'테스트 방송'});});
 await frame.waitForFunction(()=>document.querySelector('#cz-chat-power .cz-power-value').textContent==='1,234');
 await frame.evaluate(()=>{document.querySelector('#profile-balance').textContent='0';CZChatLayout.setPresentation({name:'테스트 방송'});});
 await frame.waitForFunction(()=>document.querySelector('#cz-chat-power .cz-power-value').textContent==='0');
 await frame.evaluate(()=>{document.querySelector('#profile-balance').textContent='300';CZChatLayout.setPresentation({name:'테스트 방송'});document.querySelector('#native-profile-check').remove();const row=document.createElement('div');row.dataset.chatMessage='';row.id='fake-power-message';row.textContent='내 통나무 파워 9999';document.querySelector('aside.live_chat').appendChild(row);CZChatLayout.setPresentation({name:'테스트 방송'});});
 assert.equal(await frame.locator('#cz-chat-power .cz-power-value').textContent(),'300','profile value is retained, never replaced by a chat number');
 assert.equal(await frame.locator('#cz-chat-power').getAttribute('data-fresh'),'false');
 await frame.evaluate(()=>{document.querySelector('#fake-power-message').remove();CZChatLayout.setPresentation({name:'아주 긴 스트리머 이름도 아이콘 영역을 침범하면 안 됩니다'});});
 const headerFit=await frame.locator('.cz-native-chat-header').evaluate(header=>{const title=header.querySelector('.cz-channel-name'),link=header.querySelector('#cz-chat-channel'),power=header.querySelector('#cz-chat-power'),settings=header.querySelector('.cz-native-settings');const bounds=header.getBoundingClientRect(),name=title.getBoundingClientRect(),points=power.getBoundingClientRect(),open=link.getBoundingClientRect(),menu=settings.getBoundingClientRect();return {fits:name.left>=bounds.left && name.right<=points.left && points.right<=open.left && menu.right<=bounds.right,open:[open.width,open.height],menu:[menu.width,menu.height]};});
 assert(headerFit.fits,'long names leave separate non-overlapping balance/link/settings areas');assert.deepEqual(headerFit.open,[32,32]);assert.deepEqual(headerFit.menu,[32,32]);
 await frame.evaluate(()=>CZChatLayout.setPresentation({name:'테스트 방송'}));

 const centers=await frame.evaluate(()=>['cz-chat-channel','native-chat-menu'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.y+r.height/2;}));
 assert(Math.max(...centers)-Math.min(...centers)<1,'header controls share the same vertical center despite native absolute positioning');
 const headerCenter=await frame.locator('.cz-native-chat-header').evaluate(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;});
 assert(centers.every(center=>Math.abs(center-headerCenter)<1),'icons are centered within the header itself');
 assert(await frame.evaluate(()=>window.__nativeTitle.isConnected && window.__nativeTitle.nodeValue==='채팅'),'native app title text node remains connected');
 assert.equal(await frame.locator('#native-overlay-root').evaluate(el=>getComputedStyle(el).display==='none'),false,'empty portal hosts are not hidden');
 assert(await frame.locator('.cz-native-chat-header #native-prediction').isVisible(),'native prediction control is retained');
 assert.equal(await frame.locator('.cz-native-chat-header #native-action-wrap').evaluate(el=>getComputedStyle(el).display),'flex','native positioning wrapper is not replaced with display:contents');

 assert.equal(await frame.locator('.live_chatting_header__foreign #cz-chat-settings').count(),0);
 assert.equal(await frame.locator('.foreign-filter').isVisible(),true);
 assert.equal(await frame.locator('.live_chatting_header__foreign strong').textContent(),'배지 채팅 모아보기');
 await frame.evaluate(()=>{const clone=document.querySelector('.cz-native-chat-header').cloneNode(true);clone.classList.add('foreign-clone');clone.querySelector('.cz-channel-name').textContent='다른 확장 수집 목록';document.querySelector('.cz-native-chat-header').before(clone);});
 await frame.waitForFunction(()=>!document.querySelector('.foreign-clone #cz-chat-channel'));
 assert.equal(await frame.locator('.foreign-clone.cz-native-chat-header').count(),0);
 assert.equal(await frame.locator('.foreign-clone').textContent().then(text=>text.includes('다른 확장 수집 목록')),true);
 const splitPanelBox=await panel.boundingBox(),splitFrameBox=await page.locator('.chat-frame').boundingBox();
 assert(Math.abs(splitPanelBox.y+splitPanelBox.height-splitFrameBox.y)<2,'collection and original chat occupy separate non-overlapping rows');
 assert.equal(await frame.locator('#cz-important-chat-space').count(),0,'native chat has no extension spacer');
 await frame.evaluate(()=>{window.__presentationCount=0;window.__countPresentation=event=>{if(event.data?.type==='CHAT_PRESENTATION')window.__presentationCount++;};window.addEventListener('message',window.__countPresentation);});
 await page.waitForTimeout(200);
 const presentations=await frame.evaluate(()=>{window.removeEventListener('message',window.__countPresentation);return window.__presentationCount;});
 assert(presentations<10,'unchanged header geometry must not cause a postMessage feedback loop');


 assert.equal(await frame.locator('.cz-native-chat-header .native-font-svg-minus').isVisible(),false);
 assert.equal(await frame.locator('.cz-native-chat-header .native-font-svg-plus').isVisible(),false);
 assert.equal(await frame.locator('.cz-channel-name').evaluate(el=>getComputedStyle(el).fontSize),'13px');
 assert.equal(await frame.locator('.cz-channel-name').evaluate(el=>getComputedStyle(el).textAlign),'left');
 // Simulate site rules that would turn ordinary inline SVGs into filled/clipped shapes.
 await frame.addStyleTag({content:'svg{width:80px!important;height:2px!important;fill:red!important;stroke:none!important;transform:scale(.1)!important}svg path,svg circle{fill:red!important;stroke:none!important}'});
 for(const id of ['cz-chat-channel']){
   assert(await frame.locator('#'+id).evaluate(el=>!!el.firstElementChild?.shadowRoot));
   const icon=frame.locator('#'+id+' svg');
   assert.equal(await icon.evaluate(el=>el.getBoundingClientRect().width),24);
   assert.equal(await icon.evaluate(el=>el.getBoundingClientRect().height),24);
   assert.notEqual(await icon.evaluate(el=>getComputedStyle(el).fill),'none');
   assert.equal(await icon.locator('path').first().evaluate(el=>getComputedStyle(el).stroke),'none');
 }

 assert.equal(await panel.locator('.ic-header-settings').evaluate(el=>el.getBoundingClientRect().width),32);
 assert(await frame.locator('#cz-chat-channel').evaluate(el=>el.nextElementSibling.id==='native-chat-menu'));
 assert.equal(await frame.locator('#cz-chat-channel').getAttribute('href'),'https://chzzk.naver.com/live/aaaaaa');
 assert.equal(await frame.locator('#cz-chat-channel').getAttribute('target'),'_blank');
 assert(await page.locator('#shortcutsEnabled').evaluate(el=>el.closest('.settings-feature').querySelector('p').id===el.getAttribute('aria-describedby')));
 assert(await page.locator('#importantChatEnabled').evaluate(el=>el.closest('.settings-feature').querySelector('p').id===el.getAttribute('aria-describedby')));

 assert.equal(await panel.locator('.ic-header,.ic-count,.ic-status,.ic-empty').count(),0,'collection contains no heading or placeholder notices');
 await frame.evaluate(()=>{document.querySelector('.cz-channel-name').remove();CZChatLayout.setPresentation({name:'테스트 방송',height:200});CZChatLayout.setPresentation({name:'테스트 방송',height:200});});
 assert.equal(await frame.locator('.cz-channel-name').count(),1,'fallback title is reused across layout updates');
 await frame.locator('.cz-native-chat-header #native-chat-menu').click();assert(await panel.isVisible(),'opening native settings keeps collection visible');
 await frame.locator('.cz-native-chat-header #native-chat-menu').click();await panel.waitFor({state:'visible'});assert(await panel.isVisible());
 await frame.evaluate(()=>{
   const portal=document.getElementById('native-overlay-root');
   window.__nativeActions=[];
   window.__openNativeMenu=kind=>{portal.replaceChildren();const layer=document.createElement('div');layer.className='_layer_native_88 _is_popup_chat_native_91';layer.setAttribute('role',kind==='block'?'menu':'dialog');layer.style.cssText='position:fixed;top:48px;left:4px;z-index:1000;background:#24262b;padding:12px';layer.style.top=(document.querySelector('.cz-native-chat-header').getBoundingClientRect().bottom+12)+'px';const button=document.createElement('button');button.textContent=kind==='block'?'이 사용자 차단':'승부예측 참여';button.id='native-confirm';button.onclick=()=>{window.__nativeActions.push(kind);window.__nativeTitle.nodeValue='채팅';portal.replaceChildren();};const nested=document.createElement('div');nested.setAttribute('role','menu');nested.append(button);layer.append(nested);portal.append(layer);};
   document.querySelector('.cz-native-chat-header #native-prediction').onclick=()=>window.__openNativeMenu('prediction');
   const nickname=document.createElement('button');nickname.id='native-user-name';nickname.textContent='사용자 메뉴';nickname.onclick=()=>window.__openNativeMenu('block');document.querySelector('aside.live_chat').append(nickname);
 });
 await frame.locator('#native-user-name').click();assert(await panel.isVisible());assert(await panel.isVisible(),'collection remains visible around native popup');
 await frame.locator('#native-confirm').click();assert(await panel.isVisible());
 await frame.locator('.cz-native-chat-header #native-prediction').click();assert(await panel.isVisible());
 await frame.locator('#native-confirm').click();assert(await panel.isVisible());
 assert.deepEqual(await frame.evaluate(()=>window.__nativeActions),['block','prediction'],'native popup buttons receive clicks and execute their handlers');
 await frame.locator('#native-user-name').evaluate(el=>el.remove());
 const start=await panel.boundingBox();
 const separator=panel.locator('.ic-resizer'),grip=await separator.boundingBox();
 const originalFrameHeight=(await page.locator('.chat-frame').boundingBox()).height;
 await separator.hover();await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+40,{steps:8});await page.mouse.up();
 assert((await panel.boundingBox()).height>=start.height+30);
 assert((await page.locator('.chat-frame').boundingBox()).height<originalFrameHeight,'resizing the collection reduces the actual iframe viewport');
 assert.equal(await frame.locator('#cz-important-chat-space').count(),0);
 const grown=(await panel.boundingBox()).height;await separator.press('ArrowUp');assert((await panel.boundingBox()).height<grown);
 const openSettings=async()=>{if(!await settings.evaluate(el=>el.open)){await panel.locator('.ic-header-settings').click();await settings.waitFor({state:'visible'});}};
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
   const row=document.createElement('div');row.className='_chatting_message_w9pvh_21';row.innerHTML='<span class="_nickname_w9pvh_33"><button class="_nickname_1mc5x_80">테스트 방송<svg><title>인증 배지</title></svg><span class="_blind_abcdef_1">마크</span><span style="display:none">인증마크</span></button><span class="_trailing_decoration_1"><img alt="파트너 배지"></span></span><span class="_unknown_icon_wrap"><img alt="인증마크" src="https://ssl.pstatic.net/unknown-mark.png"></span>새 CSS 모듈의 스트리머 채팅 <img alt="웃음"> @<span class="_nickname_mention_80">다른 사용자</span>';document.querySelector('aside.live_chat').appendChild(row);
 });
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('새 CSS 모듈의 스트리머 채팅 웃음'));
 assert.equal(await panel.locator('.ic-message').count(),1,'nested nickname CSS modules must not duplicate the message');
 assert.equal(await panel.locator('.ic-author').textContent(),'테스트 방송','author excludes SVG titles and hidden accessibility mark captions');
 assert.equal(await frame.locator('._chatting_message_w9pvh_21 .cz-native-chat-time').count(),0,'missing send time must not be replaced with observation time');
 assert(!(await panel.locator('.ic-message-text').textContent()).includes('파트너 배지'),'badges after the inner nickname are outside the body');
 assert(!(await panel.locator('.ic-message-text').textContent()).includes('인증마크'),'unclassified certification image after the author is not message text');
 const expandedFrameHeight=(await page.locator('.chat-frame').boundingBox()).height;
 const collectedBeforeCollapse=await panel.locator('.ic-message').count();
 await panel.locator('.ic-toggle').click();
 await frame.evaluate(()=>{const row=document.createElement('div');row.dataset.chatMessage='';row.id='collapsed-collection-test';row.innerHTML='<span data-chat-nickname>테스트 방송</span><span data-chat-text>접힌 동안 수집 유지</span>';document.querySelector('aside.live_chat').append(row);});
 await page.waitForFunction(before=>Number(document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.important-chat-panel').dataset.collectedCount)>before,collectedBeforeCollapse);
 assert.equal(await panel.locator('.ic-message').count(),collectedBeforeCollapse,'collapsed collection updates the model without rendering hidden rows');
 assert((await page.locator('.chat-frame').boundingBox()).height>expandedFrameHeight,'collapse gives space back to native chat');
 await panel.locator('.ic-toggle').click();assert(await panel.locator('.ic-message').filter({hasText:'접힌 동안 수집 유지'}).isVisible());
 await frame.locator('#collapsed-collection-test').evaluate(el=>el.remove());

 await frame.evaluate(()=>document.querySelector('._chatting_message_w9pvh_21').remove());
 await openSettings();await settings.locator('.ic-clear').click();await closeSettings();
 await page.route('https://ssl.pstatic.net/emote*.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKf8AAAAASUVORK5CYII=','base64')}));
 await frame.evaluate(()=>{const row=document.createElement('div');row.dataset.chatMessage='';row.id='visible-body-regression';row.innerHTML='<span data-chat-nickname><button>테스트 방송</button><span class="_sr_only_123">인증마크</span></span><span data-chat-text><img alt="웃음" src="https://ssl.pstatic.net/emote.png"> 일반 본문 <img alt="인증마크" src="https://ssl.pstatic.net/emote-other.png"></span>';document.querySelector('aside.live_chat').append(row);});
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('일반 본문'));
 const visibleBody=panel.locator('.ic-message').filter({hasText:'일반 본문'});
 assert.equal(await visibleBody.locator('.ic-author').textContent(),'테스트 방송');
 assert.equal(await visibleBody.locator('.ic-emote').count(),2,'ordinary leading emote stops prefix stripping; body images stay intact');
 await frame.locator('#visible-body-regression').evaluate(el=>el.remove());await openSettings();await settings.locator('.ic-clear').click();await closeSettings();
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
 assert.equal(await panel.locator('.ic-message[data-role=streamer] .ic-author').textContent(),'방송인','streamer badge is recognized without adding a role label');
 assert(!(await panel.locator('.ic-list').textContent()).includes('일반 사용자'),'message-body badge must not grant a role');
 const stableIds=await frame.evaluate(async()=>{
   const row=document.querySelector('[data-message-id="owner-1"]');row.removeAttribute('data-message-id');
   const batches=[],collector=CZChatCollector.create({send:batch=>batches.push(batch)});
   collector.configure({enabled:true});await new Promise(resolve=>setTimeout(resolve,300));
   collector.configure({enabled:true},{streamerName:'테스트 방송'});await new Promise(resolve=>setTimeout(resolve,300));collector.stop();row.dataset.messageId='owner-1';
   return batches.map(batch=>batch.find(item=>item.name==='방송인')?.id);
 });
 assert.equal(stableIds.length,2);assert.equal(stableIds[0],stableIds[1],'API identity refresh must not duplicate existing chat rows');
 const replacementResult=await frame.evaluate(async()=>{
   const captured=[],collector=CZChatCollector.create({send:batch=>captured.push(...batch)}),host=document.querySelector('aside.live_chat');
   collector.configure({enabled:true,streamers:false,managers:false,partners:false,names:['중복 검사']});
   const first=document.createElement('div');first.dataset.chatMessage='';first.dataset.timestamp='2026-10-28T12:34:00Z';first.innerHTML='<span data-chat-nickname>중복 검사</span><span data-chat-text>똑같은 내용</span>';host.append(first);await new Promise(resolve=>setTimeout(resolve,300));
   const replacement=first.cloneNode(true);first.replaceWith(replacement);await new Promise(resolve=>setTimeout(resolve,300));const afterReplacement=captured.length;
   const reinserted=replacement.cloneNode(true),next=replacement.nextSibling;replacement.remove();host.insertBefore(reinserted,next);await new Promise(resolve=>setTimeout(resolve,300));const afterReinsert=captured.length;
   const genuinelyNew=reinserted.cloneNode(true);host.append(genuinelyNew);await new Promise(resolve=>setTimeout(resolve,300));collector.stop();reinserted.remove();genuinelyNew.remove();
   return {collectedTime:captured[0]?.time,originalTime:reinserted.querySelector('time')?.dateTime,afterReplacement,afterReinsert,total:captured.length,ids:captured.map(item=>item.id)};
 });
 assert.equal(replacementResult.originalTime,'2026-10-28T12:34:00.000Z','original send timestamp survives DOM replacement');
 assert.equal(replacementResult.collectedTime,Date.parse('2026-10-28T12:34:00Z'),'collected timestamps use original send time too');
 assert.equal(replacementResult.afterReplacement,1,'replacing a message DOM node is not a new chat');
 assert.equal(replacementResult.afterReinsert,1,'separate removal and insertion at the same DOM position is a replacement');
 assert.equal(replacementResult.total,2,'a separately posted identical message remains a separate chat');
 assert.notEqual(replacementResult.ids[0],replacementResult.ids[1]);
 const scrollingResult=await frame.evaluate(async()=>{
   const captured=[],statuses=[],collector=CZChatCollector.create({send:batch=>captured.push(...batch),status:value=>statuses.push(value)});
   const viewport=document.createElement('div');viewport.style.cssText='height:80px;overflow-y:auto';const list=document.createElement('div'),filler=document.createElement('div');filler.style.height='400px';list.append(filler);viewport.append(list);document.querySelector('aside.live_chat').append(viewport);
   const make=()=>{const row=document.createElement('div');row.className='_chatting_message_history_1';row.style.height='24px';row.innerHTML='<img src="https://ssl.pstatic.net/old-badge.png" alt="구독 배지"><button class="_button_chatting_1cgzf_35"><span class="_nickname_1mc5x_80">스크롤 검사</span>동일 메시지</button>';return row;};
   collector.configure({enabled:true,streamers:false,managers:false,partners:false,names:['스크롤 검사']});
   let row=make();list.append(row);viewport.scrollTop=viewport.scrollHeight;await new Promise(resolve=>setTimeout(resolve,300));const initial=captured.length;
   row.remove();await new Promise(resolve=>setTimeout(resolve,0));viewport.scrollTop=0;row=make();row.querySelector('img').src='https://ssl.pstatic.net/updated-badge.png';list.prepend(row);await new Promise(resolve=>setTimeout(resolve,600));row.querySelector('img').src='https://ssl.pstatic.net/lazily-loaded-badge.png';await new Promise(resolve=>setTimeout(resolve,300));const afterHistory=captured.length;
   row.remove();await new Promise(resolve=>setTimeout(resolve,0));const live=make();list.append(live);viewport.scrollTop=viewport.scrollHeight;await new Promise(resolve=>setTimeout(resolve,300));const afterLive=captured.length;
   viewport.scrollTop=0;const whileReading=make();list.append(whileReading);await new Promise(resolve=>setTimeout(resolve,300));const afterLiveWhileReading=captured.length;whileReading.remove();
   // Restore again after the new live message: neither historical occurrence is appended anew.
   live.remove();await new Promise(resolve=>setTimeout(resolve,0));viewport.scrollTop=0;list.prepend(make());await new Promise(resolve=>setTimeout(resolve,600));
   const result={initial,afterHistory,afterLive,afterLiveWhileReading,total:captured.length,restored:statuses.at(-1)?.restored,row:statuses.at(-1)?.structure?.row,ids:captured.map(item=>item.id)};collector.stop();viewport.remove();return result;
 });
 assert.equal(scrollingResult.initial,1);
 assert.equal(scrollingResult.afterHistory,1,'remounting a past message while scrolled up never appends it again');
 assert.equal(scrollingResult.afterLive,2,'the same text newly posted at the live edge is retained');
 assert.equal(scrollingResult.afterLiveWhileReading,3,'an observed live-tail append stays new even while reading history');
 assert.equal(scrollingResult.total,3);assert(scrollingResult.restored>=2);
 assert(scrollingResult.row.includes('_chatting_message_'),'nested button is canonicalized to the message row');
 assert.notEqual(scrollingResult.ids[0],scrollingResult.ids[1]);
 const reorderedCaptured=await frame.evaluate(async()=>{
   const row=document.createElement('div');row.dataset.chatMessage='';row.style.cssText='position:fixed;top:500px;height:24px';row.innerHTML='<span data-chat-nickname>범위 점검 사용자</span><span data-chat-text>DOM 순서와 화면 순서가 다른 채팅</span>';
   document.querySelector('.cz-native-chat-header').before(row);
   const captured=[],collector=CZChatCollector.create({send:batch=>captured.push(...batch)});collector.configure({enabled:true,names:['범위 점검 사용자']});await new Promise(resolve=>setTimeout(resolve,300));collector.stop();row.remove();
   return captured.some(item=>item.name==='범위 점검 사용자');
 });
 assert(reorderedCaptured,'a visually lower chat row must not be rejected just because it precedes the header in DOM order');


 await page.locator('#settingsManager > summary').click();
 const gearBox=await page.locator('#importantChatSettings').boundingBox(),toggleBox=await page.locator('#importantChatEnabled').locator('..').boundingBox();
 assert(gearBox.x+gearBox.width<=toggleBox.x && Math.abs(gearBox.y+gearBox.height/2-toggleBox.y-toggleBox.height/2)<1,'gear sits immediately left of and centered with the collection toggle');
 await page.locator('#importantChatSettings').click();assert(await settings.isVisible());assert(await page.locator('#importantChatEnabled').isChecked(),'opening collection settings does not switch collection off');
 assert.equal(await settings.locator('.ic-diagnostics').isVisible(),false,'detailed diagnostics is collapsed by default');
 await settings.locator('.ic-debug summary').click();
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-diagnostics').textContent.includes('스트리머 확인: 테스트 방송'));
 await page.waitForFunction(()=>{const text=document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-diagnostics').textContent;return /읽은 항목 [1-9]/.test(text)&&/수신 [1-9]/.test(text)&&/표시 2/.test(text);});
 const originalClipboard=await page.evaluateHandle(()=>Object.getOwnPropertyDescriptor(navigator,'clipboard'));
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__chatDiagnosticCopy=JSON.parse(text);}}}));
 await settings.locator('.ic-copy-diagnostics').click();
 const copiedDiagnostic=await page.evaluate(()=>window.__chatDiagnosticCopy);
 assert.equal(copiedDiagnostic.collectorRevision,'refactor-stage3-1');
 assert(copiedDiagnostic.counts.parsed>0);assert(copiedDiagnostic.received>0);assert.equal(copiedDiagnostic.displayed,2);
 assert(copiedDiagnostic.structure.row.length>0,'diagnostics identifies the latest parsed row');
 assert(!JSON.stringify(copiedDiagnostic).includes('스트리머 메시지'),'diagnostic copy omits chat content');
 await page.evaluate(descriptor=>{delete navigator.clipboard;if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);delete window.__chatDiagnosticCopy;},originalClipboard);await originalClipboard.dispose();
 assert.equal(await settings.locator('.ic-chat-side,.ic-chat-open').count(),0);
 assert(await settings.locator('.ic-streamers').isChecked());assert(await settings.locator('.ic-managers').isChecked());assert(await settings.locator('.ic-partners').isChecked());
 await frame.evaluate(()=>{
   const host=document.querySelector('aside.live_chat');
   const fixtures=[['streamer','주황스트리머','<svg class="_badge_x_1"><use href="#icon_chat_badge_streamer"></use></svg>'],['manager','파랑관리자','<span class="_badge_x_1" data-user-role="manager"></span>'],['partner','초록파트너','<svg class="_badge_partner_x_1"></svg>']];
   for(const [role,name,badge] of fixtures){const row=document.createElement('div');row.className='_chatting_message_role_21';row.dataset.messageId='role-'+role;row.innerHTML=badge+'<span class="_nickname_role_33"><span class="_nickname_leaf_80">'+name+'</span></span><span>역할 필터 '+role+'</span>';host.appendChild(row);}
   const row=document.createElement('div');row.className='_chatting_message_role_21';row.innerHTML='<span class="_nickname_role_33"><span class="_nickname_leaf_80" style="color:orange">일반 시청자</span></span>색상만 같은 일반 채팅';host.appendChild(row);
 });
 await page.waitForFunction(()=>{const root=document.querySelector('#__chzzk_multiview_v09__').shadowRoot;return ['streamer','manager','partner'].every(role=>[...root.querySelectorAll('.ic-message[data-role="'+role+'"]')].some(row=>row.textContent.includes('역할 필터')));});
 assert(!(await panel.locator('.ic-list').textContent()).includes('색상만 같은 일반 채팅'));
 await frame.evaluate(()=>{const host=document.querySelector('aside.live_chat');for(const [role,color] of [['streamer','#ff9900'],['manager','#409cff'],['partner','#00d58a']]){const row=document.createElement('div');row.className='_chatting_message_color_21';row.dataset.messageId='role-color-'+role;row.style.color=color;row.innerHTML='<span class="_nickname_color_33"><span class="_nickname_leaf_80" style="color:#dddddd">본문색상 '+role+'</span></span> 본문색상 역할 '+role;host.appendChild(row);}});
 await page.waitForFunction(()=>{const root=document.querySelector('#__chzzk_multiview_v09__').shadowRoot;return ['streamer','manager','partner'].every(role=>[...root.querySelectorAll('.ic-message[data-role="'+role+'"]')].some(row=>row.textContent.includes('본문색상 역할')));});

 await frame.evaluate(()=>{const row=document.createElement('div');row.className='_chatting_message_late_21';row.dataset.messageId='role-late';row.style.color='#dddddd';row.innerHTML='<span class="_nickname_late_33"><span class="_nickname_leaf_80">늦은역할색</span></span> 늦게 적용된 역할 색상';document.querySelector('aside.live_chat').appendChild(row);});
 await page.waitForTimeout(300);
 assert(!(await panel.locator('.ic-list').textContent()).includes('늦게 적용된 역할 색상'));
 await frame.evaluate(()=>document.querySelector('[data-message-id="role-late"]').style.color='#00d58a');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('늦게 적용된 역할 색상'));
 const partnerHistoryCount=await panel.locator('.ic-message[data-role=partner]').count();await settings.locator('.ic-partners').uncheck();
 assert.equal(await panel.locator('.ic-message[data-role=partner]').count(),partnerHistoryCount,'turning a collection rule off does not erase collected history');
 await settings.locator('.ic-partners').check();
 await page.waitForFunction(()=>!!document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-message[data-role="partner"]'));
 await frame.evaluate(()=>document.querySelectorAll('[data-message-id^="role-"]').forEach(row=>row.remove()));await settings.locator('.ic-clear').click();
 await page.locator('.ic-name').fill('지정 사용자');await page.locator('.ic-form button').click();
 await add('방송인','설정 후에도 보존할 기록','스트리머','settings-retain');await add('지정 사용자','제외 대상의 기존 기록','','settings-exclude');
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('제외 대상의 기존 기록'));
 await frame.locator('[data-message-id=settings-retain],[data-message-id=settings-exclude]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
 await settings.locator('.ic-name').fill('임시 추가 사용자');await settings.locator('.ic-form button').click();
 assert((await panel.locator('.ic-list').textContent()).includes('설정 후에도 보존할 기록'),'adding a nickname retains records no longer present in source DOM');
 await settings.locator('.ic-names').first().getByRole('button',{name:'임시 추가 사용자 ×',exact:true}).click();
 assert((await panel.locator('.ic-list').textContent()).includes('제외 대상의 기존 기록'),'removing a manual inclusion is not a history reset');
 await settings.locator('.ic-exclude-name').fill('지정 사용자');await settings.locator('.ic-exclude-form button').click();
 assert.equal(await settings.locator('.ic-excluded-names button').count(),1);
 assert((await panel.locator('.ic-list').textContent()).includes('설정 후에도 보존할 기록'));
 assert(!(await panel.locator('.ic-list').textContent()).includes('제외 대상의 기존 기록'),'only explicitly excluded history is removed');
 await add('지정 사용자','제외 우선 검사','스트리머','excluded-manual-role');await page.waitForTimeout(350);
 assert(!(await panel.locator('.ic-list').textContent()).includes('제외 우선 검사'),'exclusion overrides manual inclusion and streamer role');
 await settings.locator('.ic-excluded-names button').click();
 await page.waitForFunction(()=>document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-list').textContent.includes('제외 우선 검사'));
 await frame.locator('[data-message-id=excluded-manual-role]').evaluate(el=>el.remove());await settings.locator('.ic-clear').click();

 const imageUrl='https://ssl.pstatic.net/__cz_collected_chat_test.png';
 await page.route(imageUrl,route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKf8AAAAASUVORK5CYII=','base64')}));
 await frame.evaluate(src=>{const row=document.createElement('div');row.className='_chatting_message_rich_21';row.innerHTML='<img alt="구독 배지"><span class="_nickname_rich_33"><span class="_nickname_leaf_80">지정 사용자</span></span><span>이모티콘 이미지 표시 <img alt="테스트 웃음"></span>';row.querySelectorAll('img').forEach(img=>img.src=src);document.querySelector('aside.live_chat').appendChild(row);},imageUrl);
 const emote=panel.locator('.ic-emote[alt="테스트 웃음"]');await emote.waitFor();
 await page.waitForFunction(()=>{const image=document.querySelector('#__chzzk_multiview_v09__').shadowRoot.querySelector('.ic-emote[alt="테스트 웃음"]');return image?.complete && image.naturalWidth>0;});
 assert.equal(await panel.locator('.ic-badge').count(),0,'compact messages omit sender badges');
 const compact=panel.locator('.ic-message').filter({hasText:'이모티콘 이미지 표시'});
 assert.deepEqual(await compact.evaluate(el=>[...el.children].map(child=>child.tagName)),['TIME','STRONG','SPAN']);
 assert.equal(await compact.locator('.ic-author').textContent(),'지정 사용자');
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
 const historyBeforeDisabled=await panel.locator('.ic-message').count();await setEnabled(false);assert.equal(await panel.isVisible(),false);
 await add('지정 사용자','수집 중지 확인','','disabled-1');await page.waitForTimeout(350);
 await page.locator('#settingsManager > summary').click();
 assert.equal(await page.locator('#chatTimestampsEnabled').isChecked(),true);
 await page.locator('#chatTimestampsEnabled').check({force:true});await page.locator('#settingsManager > summary').click();
 await frame.locator('[data-message-id=disabled-1]').evaluate(el=>el.setAttribute('data-message-time','2026-10-28T12:34:00Z'));
 await frame.waitForFunction(()=>document.querySelector('[data-message-id=disabled-1] .cz-native-chat-time')?.dateTime==='2026-10-28T12:34:00.000Z');
 await frame.locator('[data-message-id=disabled-1]').evaluate(el=>el.setAttribute('data-message-time','invalid'));
 await frame.waitForFunction(()=>!document.querySelector('[data-message-id=disabled-1] .cz-native-chat-time'));
 await page.locator('#settingsManager > summary').click();await page.locator('#chatTimestampsEnabled').uncheck({force:true});await page.locator('#settingsManager > summary').click();
 assert.equal(await panel.locator('.ic-message').count(),historyBeforeDisabled,'timestamp toggle and collection disabling retain existing history');
 assert(!(await panel.locator('.ic-list').textContent()).includes('수집 중지 확인'));
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
