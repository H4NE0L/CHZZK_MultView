// One bounded sweep for mounted live tiles; never reload a healthy sibling.
export function createLiveTracker({scope,tileMap,isRecording=()=>false,notify=()=>{}}){
 const entries=new Map();let sweeping=false;
 const alive=entry=>!scope.isDisposed&&entry.tile.isConnected&&tileMap.get(entry.channel.uid)===entry.tile;
 async function check(entry,manual=false){
  if(entry.busy||!alive(entry))return;entry.busy=true;entry.button.disabled=true;
  try{
   const info=await CZChzzkApi.fetchLiveInfo(entry.channel.sourceId||entry.channel.uid,{throwOnError:true});if(!alive(entry))return;
   if(info.online){
    if(entry.online===false||manual){
     if(isRecording(entry.channel.uid)){entry.button.textContent='녹화 종료 후 다시 연결';return;}
     const frame=entry.tile.querySelector('iframe');if(frame){frame.dataset.playerReady='false';frame.src=entry.channel.url;}
    }
    entry.button.hidden=true;entry.online=true;
   }else{entry.online=false;entry.button.hidden=false;entry.button.textContent='↻ OFFLINE · 방송 상태 새로고침';entry.button.title='30초마다 확인합니다. 클릭하면 즉시 재확인합니다.';}
  }catch(error){if(alive(entry)){entry.button.title='방송 상태 확인 실패 · 클릭하여 다시 시도';if(manual)notify('방송 상태 확인 실패: '+error.message);}}
  finally{entry.busy=false;if(alive(entry))entry.button.disabled=false;}
 }
 async function sweep(){if(sweeping||scope.isDisposed)return;sweeping=true;try{const queue=[...entries.values()];await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{while(queue.length&&!scope.isDisposed){const entry=queue.shift();if(!alive(entry)){if(entries.get(entry.channel.uid)===entry)entries.delete(entry.channel.uid);continue;}await check(entry);}}));}finally{sweeping=false;}}
 scope.interval(sweep,30000);scope.add(()=>entries.clear());
 return {watch(channel,tile){if(channel.type==='video'||scope.isDisposed)return;const button=document.createElement('button');button.className='tile-offline-refresh';button.type='button';button.hidden=true;button.setAttribute('aria-label','방송 상태 새로고침');tile.append(button);const entry={channel,tile,button,online:null,busy:false};entries.set(channel.uid,entry);button.onclick=event=>{event.stopPropagation();check(entry,true);};check(entry);}};
}
