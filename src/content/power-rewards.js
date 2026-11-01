// Preserve native reward UI/state; use its own claim button, never guessed APIs.
export function create({findVideo}) {
 let enabled=false,disposed=false,timer=null,attempts=0;
 const pressed=new WeakMap();
 function scan(){
  if(!enabled||disposed)return;
  const video=findVideo();
  if(video && !video.paused && !video.ended && video.readyState>=2){
   for(const button of [...document.querySelectorAll('button,[role="button"]')].slice(-600)){
    if(button.closest('[data-chat-message],[class*="chatting_message"],[class*="live_chatting_list_item"]'))continue;
    const label=[button.getAttribute('aria-label'),button.getAttribute('title'),button.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const ready=!button.disabled && button.getAttribute('aria-disabled')!=='true' && !button.closest('[hidden],[aria-hidden="true"]') && /통나무|log.?power/i.test(label+' '+(button.closest('[class*="log_power"],[class*="logPower"],[data-log-power]')?.className||'')) && /받기|수령|획득|claim/i.test(label) && !/승부|예측|베팅|구매|사용|후원|참여|prediction|bet|buy/i.test(label);
    if(!ready){pressed.delete(button);continue;}
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
  if(disposed||enabled===(on===true))return;
  enabled=on===true;clearTimeout(timer);timer=null;
  if(enabled)scan();
  else document.documentElement.removeAttribute('data-cz-power-rewards');
 }

 function dispose(){if(disposed)return;configure(false);disposed=true;}
 window.addEventListener('pagehide',dispose,{once:true});
 return {configure,dispose,get enabled(){return enabled;}};
}
