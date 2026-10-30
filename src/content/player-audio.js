// The viewer owns desired audio. Site initialization/storage echoes are not user edits.
globalThis.CZPlayerAudio = {create({findVideo,report}) {
  const counts={commands:0,corrections:0,reports:0,nativeChanges:0};
  let lastReport='',desired=null,intentUntil=0,pointer=null,timer=null,intentKind='volume',disposed=false;
  function publish(video,reason,operation='volume'){
    const signature=JSON.stringify([video.volume,video.muted,reason,operation]);
    if(signature===lastReport)return;
    lastReport=signature;counts.reports++;if(reason==='player')counts.nativeChanges++;report(video,reason,operation);
  }
  const clearIntent=()=>{intentUntil=0;pointer=null;};
  const recoveries=[];
  const matches=video=>desired && Math.abs(video.volume-desired.volume)<0.00001 && video.muted===desired.muted;
  function apply(video){
    if(disposed || !video || (video.ended || video.error) || !desired)return;
    if(desired.muted && !video.muted)video.muted=true;
    if(Math.abs(video.volume-desired.volume)>0.00001)video.volume=desired.volume;
    if(video.muted!==desired.muted)video.muted=desired.muted;
  }
  function recover(){
    if(disposed || timer || findVideo()?.ended || findVideo()?.error)return;
    const now=Date.now();while(recoveries.length && now-recoveries[0]>=1000)recoveries.shift();
    // Coalesce hydration events and bound preference fights with the host player.
    const delay=recoveries.length>=4?Math.max(50,1000-(now-recoveries[0])):30;
    timer=setTimeout(()=>{timer=null;const video=findVideo();if(video && desired && !matches(video)){recoveries.push(Date.now());counts.corrections++;apply(video);}},delay);
  }
  function setVolume(volume,muted){
    if(disposed || !Number.isFinite(volume))return false;
    counts.commands++;
    const next={volume:Math.max(0,Math.min(1,volume)),muted:typeof muted==='boolean'?muted:volume<=0};
    const changed=!desired || next.volume!==desired.volume || next.muted!==desired.muted;
    desired=next;
    if(changed){intentUntil=0;pointer=null;}clearTimeout(timer);timer=null;
    const video=findVideo();if(!video)return false;if(changed || Date.now()>=intentUntil)apply(video);publish(video,'command');return true;
  }
  function setMuted(muted){
    const video=findVideo(),volume=desired?.volume ?? video?.volume ?? 1;
    return setVolume(!muted && volume<=0?0.01:volume,!!muted);
  }
  const bound=new WeakSet(),early=globalThis.CZPlayerAudioEarly;
  const onVolumeChange=event=>{
    const video=event.target;
    if(disposed || video!==findVideo() || !bound.has(video) || !desired)return;
    if(!video.ended && !matches(video) && Date.now()<intentUntil){
      const operation=intentKind==='mute' && (video.muted!==desired.muted || video.volume===0 || desired.muted)?'mute':'volume';
      desired={volume:video.volume,muted:video.muted};publish(video,'player',operation);
      return;
    }
    // Do not let extension commands/automatic echoes become shared site preferences.
    // The document-start Window gate precedes native capture listeners.
    event.stopImmediatePropagation();
    if(matches(video))publish(video,'command');else recover();
  };
  if(early)early.volumechange=onVolumeChange;else window.addEventListener('volumechange',onVolumeChange,true);
  function bind(video){bound.add(video);apply(video);}
  // A live stream may restart using the same video element after ending/error.
  // Restore its own preference once playback becomes available again.
  for(const type of ['loadedmetadata','playing'])document.addEventListener(type,event=>{
    if(event.target===findVideo() && bound.has(event.target))apply(event.target);
  },true);
  const controls='[class*="volume" i],[class*="sound" i],[class*="mute" i],[aria-label*="음소거"],[aria-label*="볼륨"],[aria-label*="소리"],[aria-label*="mute" i],[aria-label*="volume" i],[title*="음소거"],[title*="볼륨"],[title*="소리"]';
  function gesture(event){
    if(!event.isTrusted)return;
    const target=event.target,path=event.composedPath?.() || [target];
    const audioControl=path.some(el=>el.closest?.(controls)) || (target.tagName==='VIDEO' && target.controls);
    const genericControl=path.some(el=>el.matches?.('button,[role="button"],input[type="range"]'));
    if(event.type==='keydown' || event.type==='keyup'){
      if(event.altKey || event.ctrlKey || event.metaKey || target.closest?.('textarea,[contenteditable="true"],input:not([type="range"])'))return;
      if(!['m','M','ArrowUp','ArrowDown'].includes(event.key) && !audioControl && !(genericControl && ['Enter',' '].includes(event.key)))return;
    }else if(!audioControl && !genericControl)return;
    intentKind=['m','M'].includes(event.key) || path.some(el=>el.matches?.('button,[role="button"]'))?'mute':'volume';
    intentUntil=Date.now()+(audioControl?800:400);
    if(event.type==='pointerdown')pointer=event.pointerId;
  }
  for(const type of ['pointerdown','click','input','change','keydown','keyup'])document.addEventListener(type,gesture,true);
  document.addEventListener('pointermove',event=>{if(event.isTrusted && event.pointerId===pointer)intentUntil=Date.now()+800;},true);
  document.addEventListener('pointerup',event=>{if(event.pointerId===pointer){pointer=null;intentUntil=Date.now()+250;}},true);
  document.addEventListener('pointercancel',()=>{pointer=null;intentUntil=0;},true);
  // A shared-origin preference echo is never a native audio gesture, even
  // when it arrives just after a click in this frame. Capture precedes site listeners.
  const onStorage=event=>{
    // Native players share origin storage across tiles. An ending/unloaded
    // sibling must not overwrite this player's independent audio preference.
    clearIntent();
    if(typeof event.key!=='string' || !/(?:volume|muted?|sound)/i.test(event.key))return;
    event.stopImmediatePropagation();recover();
  };
  if(early)early.storage=onStorage;else window.addEventListener('storage',onStorage,true);
  window.addEventListener('pagehide',()=>{disposed=true;clearIntent();clearTimeout(timer);timer=null;});
  function snapshot(){
    const video=findVideo();
    return {revision:'early-window-capture-1',earlyCapture:!!early,desired:desired?{...desired}:null,actual:video?{volume:video.volume,muted:video.muted,paused:video.paused,ended:video.ended,readyState:video.readyState,errorCode:video.error?.code||null}:null,counts:{...counts},recoveryPending:timer!==null};
  }
  return {bind,setMuted,setVolume,snapshot};
}};
