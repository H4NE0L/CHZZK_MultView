// Authored wall-clock time only. Generic fields must already be epoch milliseconds.
const own=(object,key)=>object&&typeof object==='object'?Object.getOwnPropertyDescriptor(object,key)?.value:undefined;
export function sourceEpoch(message){
 for(const key of ['messageTime','messageTimestamp','msgTime','createdAt','createTime','ctime','time','regTime','timestamp']){
  const value=own(message,key);if(!['string','number'].includes(typeof value)||value==='')continue;
  const number=Number(value),generic=['time','regTime','timestamp'].includes(key);
  if(generic&&(!Number.isFinite(number)||number<1e12))continue;
  const ms=Number.isFinite(number)?number*(number<1e11?1000:1):Date.parse(value);
  if(Number.isFinite(ms)&&ms>=946684800000&&ms<=Date.now()+60000)return ms;
 }
 return null;
}
