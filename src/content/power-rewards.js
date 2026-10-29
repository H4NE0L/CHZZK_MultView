// Preserve native reward UI/state; use its own claim button, never guessed APIs.
export function create({findVideo}) {
 let enabled=false,disposed=false,timer=null,attempts=0;
 const pressed=new WeakMap(),styled=new Set();
 const style=document.createElement('style');style.textContent='.cz-power-native-player{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;z-index:2147483000!important}';
 function scan(){
  if(!enabled||disposed)return;
  for(const player of styled)if(!player.isConnected){player.classList.remove('cz-power-native-player');styled.delete(player);}
  const video=findVideo();
  if(video){
   const player=video.closest('.pzp-pc,[data-player]');
   if(player){player.classList.add('cz-power-native-player');styled.add(player);}
  }
  // A native "normal view" action exits theater without reloading the iframe.
  const normal=[...document.querySelectorAll('.pzp-pc__viewmode-button')].find(button=>/기본 화면|일반 화면|원래 화면|normal view/i.test(`${button.getAttribute('aria-label')||''} ${button.getAttribute('title')||''}`));
  if(normal && !pressed.has(normal)){pressed.set(normal,'normal');normal.click();}
  if(video && !video.paused && !video.ended && video.readyState>=2){
   for(const button of [...document.querySelectorAll('button,[role="button"]')].slice(-600)){
    if(button.closest('[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"]'))continue;
    const label=[button.getAttribute('aria-label'),button.getAttribute('title'),button.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const ready=!button.disabled && button.getAttribute('aria-disabled')!=='true' && !button.closest('[hidden],[aria-hidden="true"]') && /통나무|log.?power/i.test(label+' '+(button.closest('[class*="log_power"],[class*="logPower"],[data-log-power]')?.className||'')) && /받기|수령|획득|claim/i.test(label) && !/승부|예측|베팅|구매|사용|후원|참여|prediction|bet|buy/i.test(label);
    if(!ready){if(pressed.get(button)!=='normal')pressed.delete(button);continue;}
    const signature=button.getAttribute('data-reward-id')||label;
    if(pressed.get(button)===signature)continue;
    pressed.set(button,signature);attempts++;
    try{button.click();}catch(_){}
   }
  }
  document.documentElement.setAttribute('data-cz-power-rewards',JSON.stringify({enabled,attempts,chatMounted:!!document.querySelector('[class*="live_chat"],[class*="chat_area"],[class*="chatting"]')}));
  timer=setTimeout(()=>{timer=null;scan();},5000);
 }
 function configure(on){
  if(disposed)return;
  enabled=on===true;clearTimeout(timer);timer=null;
  if(enabled){if(!style.isConnected)(document.head||document.documentElement).appendChild(style);scan();}
  else{for(const button of document.querySelectorAll('.pzp-pc__viewmode-button'))if(pressed.get(button)==='normal')pressed.delete(button);for(const player of styled)player.classList.remove('cz-power-native-player');styled.clear();style.remove();document.documentElement.removeAttribute('data-cz-power-rewards');}
 }
 function dispose(){if(disposed)return;configure(false);disposed=true;}
 window.addEventListener('pagehide',dispose,{once:true});
 return {configure,dispose,get enabled(){return enabled;}};
}
