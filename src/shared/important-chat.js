globalThis.CZImportantChat = (() => {
  const KEY='chzzkImportantChatV1', LIMIT=100;
  const clean=value=>typeof value==='string'?value.normalize('NFC').trim():'';
  const nameKey=value=>clean(value).toLocaleLowerCase('ko-KR');
  const nameList=value=>[...new Map((Array.isArray(value)?value:[]).filter(n=>typeof n==='string').map(n=>clean(n).slice(0,40)).filter(Boolean).map(n=>[nameKey(n),n])).values()].slice(0,50);
  function settings(value={}) {
    if(!value || typeof value!=='object')value={};
    return {enabled:value.enabled!==false,streamers:value.streamers!==false,managers:value.managers!==false,partners:value.partners!==false,
      names:nameList(value.names),excludedNames:nameList(value.excludedNames)};
  }
  function imageUrl(value){
    if(typeof value!=='string' || value.length>2048)return '';
    try{const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && !url.port && (url.hostname==='pstatic.net' || url.hostname.endsWith('.pstatic.net'))?url.href:'';}catch(_){return '';}
  }
  function segments(value,fallback){
    if(!Array.isArray(value))return [{type:'text',text:fallback}];
    const result=[];let remaining=1000,images=0;
    for(const part of value.slice(0,64)){
      if(!part || remaining<=0)continue;
      if(part.type==='image'){
        const alt=clean(part.alt).slice(0,80)||'[이모티콘]',src=imageUrl(part.src);
        if(src && images<8){result.push({type:'image',src,alt});images++;remaining-=alt.length;continue;}
        result.push({type:'text',text:alt.slice(0,remaining)});remaining-=alt.length;
      }else if(part.type==='text' && typeof part.text==='string'){
        const text=part.text.slice(0,remaining);if(text)result.push({type:'text',text});remaining-=text.length;
      }
    }
    return result.length?result:[{type:'text',text:fallback}];
  }
  function timestamp(value){
    if(value==null || value==='')return null;
    const numeric=Number(value),time=Number.isFinite(numeric)?numeric*(numeric<1e11?1000:1):Date.parse(value);
    return Number.isFinite(time)&&time>=946684800000&&time<=Date.now()+60000?time:null;
  }
  function message(value) {
    if(!value || typeof value.id!=='string' || !value.id || value.id.length>160 || typeof value.name!=='string' || typeof value.text!=='string')return null;
    const name=clean(value.name).slice(0,80),text=clean(value.text).slice(0,1000);
    if(!name || !text)return null;
    const badges=(Array.isArray(value.badges)?value.badges:[]).slice(0,4).map(badge=>({src:imageUrl(badge?.src),alt:clean(badge?.alt).slice(0,80)})).filter(badge=>badge.src);
    return {id:value.id,name,text,updateOnly:value.updateOnly===true,segments:segments(value.segments,text),badges,role:['streamer','manager','partner'].includes(value.role)?value.role:'',time:Number.isFinite(value.time) && Math.abs(value.time)<=8640000000000000?value.time:null};
  }
  function matches(item,filter) {
    return filter.enabled && !(filter.excludedNames||[]).some(n=>nameKey(n)===nameKey(item.name)) && ((item.role==='streamer' && filter.streamers) || (item.role==='manager' && filter.managers) || (item.role==='partner' && filter.partners) || filter.names.some(n=>nameKey(n)===nameKey(item.name)));
  }
  function create() {
    let uid=null,items=[];
    return {reset(next){uid=next;items=[];},get uid(){return uid;},get items(){return items.slice();},clear(){items=[];},applySettings(filter){items=items.filter(item=>!(filter.excludedNames||[]).some(name=>nameKey(name)===nameKey(item.name)));},
      add(channel,batch,filter){
        if(channel!==uid || !filter.enabled || !Array.isArray(batch))return false;
        let changed=false;
        for(const raw of batch.slice(0,LIMIT)){
          const item=message(raw);if(!item || !matches(item,filter))continue;
          const existing=items.findIndex(old=>old.id===item.id);
          if(existing<0 && item.updateOnly)continue;
          if(existing>=0){if(JSON.stringify(items[existing])===JSON.stringify(item))continue;items[existing]=item;}
          else items.push(item);
          if(items.length>LIMIT)items.shift();changed=true;
        }
        return changed;
      }};
  }
  return {KEY,LIMIT,settings,message,matches,create,imageUrl,timestamp};
})();
