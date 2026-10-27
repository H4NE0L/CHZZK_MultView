// The viewer owns desired audio. Site initialization/storage echoes are not user edits.
globalThis.CZPlayerAudio = {create({findVideo,report}) {
  let desired=null,intentUntil=0,pointer=null,timer=null;
  const recoveries=[];
  const matches=video=>desired && Math.abs(video.volume-desired.volume)<0.00001 && video.muted===desired.muted;
  function apply(video){
    if(!video || !desired)return;
    if(desired.muted && !video.muted)video.muted=true;
    if(Math.abs(video.volume-desired.volume)>0.00001)video.volume=desired.volume;
    if(video.muted!==desired.muted)video.muted=desired.muted;
  }
  function recover(){
    if(timer)return;
    const now=Date.now();while(recoveries.length && now-recoveries[0]>=1000)recoveries.shift();
    // Coalesce hydration events and bound preference fights with the host player.
    const delay=recoveries.length>=4?Math.max(50,1000-(now-recoveries[0])):30;
    timer=setTimeout(()=>{timer=null;const video=findVideo();if(video && desired && !matches(video)){recoveries.push(Date.now());apply(video);}},delay);
  }
  function setVolume(volume,muted){
    if(!Number.isFinite(volume))return false;
    desired={volume:Math.max(0,Math.min(1,volume)),muted:typeof muted==='boolean'?muted:volume<=0};
    intentUntil=0;pointer=null;clearTimeout(timer);timer=null;
    const video=findVideo();if(!video)return false;apply(video);report(video,'command');return true;
  }
  function setMuted(muted){
    const video=findVideo(),volume=desired?.volume ?? video?.volume ?? 1;
    return setVolume(!muted && volume<=0?0.01:volume,!!muted);
  }
  const bound=new WeakSet();
  document.addEventListener('volumechange',event=>{
    const video=event.target;
    if(video!==findVideo() || !bound.has(video) || !desired)return;
    if(!matches(video) && Date.now()<intentUntil){
      desired={volume:video.volume,muted:video.muted};report(video,'player');
      return;
    }
    // Do not let extension commands/automatic echoes become shared site preferences.
    // Capture runs before the site's media listeners, regardless of bind order.
    event.stopImmediatePropagation();
    if(matches(video))report(video,'command');else recover();
  },true);
  function bind(video){bound.add(video);apply(video);}
  const controls='[class*="volume" i],[class*="sound" i],[class*="mute" i],[aria-label*="음소거"],[aria-label*="볼륨"],[aria-label*="소리"],[aria-label*="mute" i],[aria-label*="volume" i],[title*="음소거"],[title*="볼륨"],[title*="소리"]';
  function gesture(event){
    if(!event.isTrusted)return;
    const target=event.target;
    if(event.type==='keydown' || event.type==='keyup'){
      if(event.altKey || event.ctrlKey || event.metaKey || target.closest?.('textarea,[contenteditable="true"],input:not([type="range"])'))return;
      if(!['m','M','ArrowUp','ArrowDown'].includes(event.key) && !target.closest?.(controls))return;
    }else if(!target.closest?.(controls) && !(target.tagName==='VIDEO' && target.controls))return;
    intentUntil=Date.now()+800;
    if(event.type==='pointerdown')pointer=event.pointerId;
  }
  for(const type of ['pointerdown','click','input','change','keydown','keyup'])document.addEventListener(type,gesture,true);
  document.addEventListener('pointermove',event=>{if(event.isTrusted && event.pointerId===pointer)intentUntil=Date.now()+800;},true);
  document.addEventListener('pointerup',event=>{if(event.pointerId===pointer){pointer=null;intentUntil=Date.now()+250;}},true);
  document.addEventListener('pointercancel',()=>{pointer=null;intentUntil=0;},true);
  window.addEventListener('pagehide',()=>{clearTimeout(timer);timer=null;});
  return {bind,setMuted,setVolume};
}};
