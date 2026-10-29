export interface Identity {id: string;time: number | null}
export interface HistoryEntry extends Identity {signature: string;matched: boolean}
  export function hash(value: string){let a=2166136261,b=5381;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b,33)^code;}return `${value.length}:${a>>>0}:${b>>>0}`;}
export function create(limit=2048) {
  if(!Number.isInteger(limit) || limit<1)throw Error('History limit must be positive');
  const entries=new Map<string,HistoryEntry>();
  return {get size(){return entries.size;},get(key: string){return entries.get(key);},clear(){entries.clear();},
    remember(key: string,identity: Identity,signature: string,matched: boolean){
      if(!matched)return;
      entries.delete(key);entries.set(key,{id:identity.id,time:identity.time,signature:hash(signature),matched});
      if(entries.size>limit)entries.delete(entries.keys().next().value!);
    }};
}
