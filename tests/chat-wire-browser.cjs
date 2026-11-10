const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.route('https://chzzk.naver.com/**',route=>route.fulfill({contentType:'text/html',body:'<body><aside id="native"></aside>'}));await page.goto('https://chzzk.naver.com/live/test/chat?multiview=1');
 await page.evaluate(()=>{window.WebSocket=class extends EventTarget{constructor(){super();this.sent=0;}send(){this.sent++;}};});
 for(const file of ['src/content/chat-socket-main.js','src/shared/important-chat.js','src/content/chat-collector.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{window.socket=new WebSocket('wss://kr-ss1.chat.naver.com/chat');window.model=CZImportantChat.create();model.reset('channel');window.filter=CZImportantChat.settings({partners:false});window.collector=CZChatCollector.create({send:items=>model.add('channel',items,filter)});collector.configure(filter,{streamerName:'방송 주인',since:Date.now()});});
 await page.waitForTimeout(40);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
 await page.evaluate(()=>{const send=(cmd,messages)=>socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({cmd,bdy:messages})}));window.packet=send;
 packet(15101,{messageList:[{msgId:'old',profile:JSON.stringify({nickname:'방송 주인',userRoleCode:'streamer'}),msg:'과거 기록'}]});
 packet(93101,[{msgId:'owner',profile:JSON.stringify({nickname:'방송 주인',userRoleCode:'common_user',verifiedMark:true}),msg:'방송 주인 채팅',msgTime:Date.now()}, {msgId:'manager',profile:JSON.stringify({nickname:'매니저',userRoleCode:'streaming_chat_manager'}),msg:'관리자 {:smile:}',extras:JSON.stringify({emojis:{smile:'https://ssl.pstatic.net/emote.png'}}),msgTime:Date.now()}]);});
 await page.waitForFunction(()=>model.size===2);
 assert.equal(await page.locator('[data-chat-message]').count(),0,'source collection never needs DOM rows');
 assert.deepEqual(await page.evaluate(()=>model.items.map(item=>item.role)),['streamer','manager']);
 assert.equal(await page.evaluate(()=>model.items[1].segments.some(part=>part.type==='image')),true);assert(await page.evaluate(()=>model.items.every(item=>item.time===null)),'timestamp OFF remains OFF');
 await page.evaluate(()=>{const row=document.createElement('div');row.dataset.chatMessage='';row.innerHTML='<span data-chat-nickname>방송 주인</span><span data-chat-text>방송 주인 채팅</span>';document.body.append(row);packet(93101,[{msgId:'owner',profile:{nickname:'방송 주인',userRoleCode:'streamer'},msg:'방송 주인 채팅'}]);});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>model.size),2,'DOM and source echoes do not duplicate');
 await page.evaluate(()=>collector.configure({...filter,enabled:false}));await page.waitForTimeout(40);await page.evaluate(()=>packet(93101,[{msgId:'off',profile:{nickname:'방송 주인',userRoleCode:'streamer'},msg:'수집 꺼짐'}]));await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>model.size),2);assert.equal(await page.evaluate(()=>socket.sent),0,'never sends or opens an extra connection');await page.evaluate(()=>collector.dispose());
 console.log('PASS: source collection without DOM/timestamps, owner and manager roles, emotes, history exclusion, deduplication and OFF.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
