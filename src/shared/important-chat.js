globalThis.CZImportantChat = (() => {
  const KEY='chzzkImportantChatV1', LIMIT=100;
  const clean=value=>typeof value==='string'?value.normalize('NFC').trim():'';
  const nameKey=value=>clean(value).toLocaleLowerCase('ko-KR');
  function settings(value={}) {
    if(!value || typeof value!=='object')value={};
    return {enabled:value.enabled!==false,streamers:value.streamers!==false,managers:value.managers!==false,
      names:[...new Map((Array.isArray(value.names)?value.names:[]).filter(n=>typeof n==='string').map(n=>clean(n).slice(0,40)).filter(Boolean).map(n=>[nameKey(n),n])).values()].slice(0,50)};
  }
  function message(value) {
    if(!value || typeof value.id!=='string' || !value.id || value.id.length>160 || typeof value.name!=='string' || typeof value.text!=='string')return null;
    const name=clean(value.name).slice(0,80),text=clean(value.text).slice(0,1000);
    if(!name || !text)return null;
    return {id:value.id,name,text,role:['streamer','manager'].includes(value.role)?value.role:'',time:Number.isFinite(value.time)?value.time:Date.now()};
  }
  function matches(item,filter) {
    return filter.enabled && ((item.role==='streamer' && filter.streamers) || (item.role==='manager' && filter.managers) || filter.names.some(n=>nameKey(n)===nameKey(item.name)));
  }
  function create() {
    let uid=null,items=[];
    return {reset(next){uid=next;items=[];},get uid(){return uid;},get items(){return items.slice();},clear(){items=[];},
      add(channel,batch,filter){
        if(channel!==uid || !filter.enabled || !Array.isArray(batch))return false;
        let changed=false;
        for(const raw of batch.slice(0,LIMIT)){
          const item=message(raw);if(!item || !matches(item,filter))continue;
          const existing=items.findIndex(old=>old.id===item.id);
          if(existing>=0){if(JSON.stringify(items[existing])===JSON.stringify(item))continue;items[existing]=item;}
          else items.push(item);
          if(items.length>LIMIT)items.shift();changed=true;
        }
        return changed;
      }};
  }
  return {KEY,LIMIT,settings,message,matches,create};
})();
