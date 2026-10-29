import type {SessionChannel} from '../../shared/contracts/session';
interface Favorite {uid: string;name?: string;title?: string}
export function requestedChannels(inputs: readonly unknown[],current: readonly SessionChannel[],favorites: readonly Favorite[]) {
  const result: SessionChannel[]=[];
  for(const input of inputs){
    const parsed=CZSessionStore.parseInput(input),uid=parsed?.uid;
    if(!parsed || !uid || result.some(channel=>channel.uid===uid))continue;
    const previous=current.find(channel=>channel.uid===uid),favorite=favorites.find(channel=>channel.uid===uid);
    const favoriteName=favorite?.name||favorite?.title||'',fallback=`CHZZK ${uid}`;
    result.push({uid,type:parsed.type,sourceId:parsed.id,url:parsed.url,
      title:previous?.title||favoriteName||fallback,linkTitle:previous?.linkTitle||favoriteName||fallback,
      name:previous?.name||favoriteName||'',muted:previous?.muted??true,volume:previous?.volume??1});
  }
  return result;
}
