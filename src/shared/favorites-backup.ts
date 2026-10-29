/** Portable favorites only: no cookies, login data, chat history or media. */
export interface BackupFavorite {uid: string; name: string; title: string; groups: string[]; order: number}
export interface BackupData {
  favorites: BackupFavorite[]; groups: string[];
  groupOptions: Record<string,{color: string; showOffline: boolean}>;
}
export interface BackupDocument {format: 'cz-control-room-favorites'; version: 1; exportedAt: string; data: BackupData}
interface Store {
  FAVORITES_KEY: string; GROUPS_KEY: string; GROUP_OPTIONS_KEY: string;
  read(): Promise<{favorites: Record<string,unknown>[]; groups: string[]}>;
  snapshot(favorites: Record<string,unknown>[], groups: string[]): {favorites: Record<string,unknown>[]; groups: string[]};
}
const FORMAT='cz-control-room-favorites', PREVIOUS_KEY='chzzkFavoritesBeforeRestoreV1';
export const MAX_BYTES=5*1024*1024;
const store=()=>(globalThis as unknown as {CZFavoritesStore: Store}).CZFavoritesStore;
const object=(value: unknown): Record<string,unknown>=>value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
function names(value: unknown, label: string): string[] {
  if(!Array.isArray(value) || value.length>2000)throw Error(`${label} 형식이 올바르지 않습니다.`);
  return [...new Set(value.map(item=>{
    if(typeof item!=='string' || !item.trim() || item.length>200)throw Error(`${label} 이름을 확인해주세요.`);
    return item.trim();
  }))];
}
export function parse(input: unknown): BackupDocument {
  const source=object(input);
  let data: Record<string,unknown>;
  if(source.format===FORMAT){
    if(source.version!==1)throw Error('지원하지 않는 백업 버전입니다.');
    data=object(source.data);
  }else if('format' in source)throw Error('치지직 통합관제실 즐겨찾기 백업이 아닙니다.');
  else if(Array.isArray(source.favorites))data=source;
  else {
    const api=store();
    const favorites=source[api.FAVORITES_KEY]??source.chzzkMultiviewFavoritesV07;
    const groups=source[api.GROUPS_KEY]??source.chzzkMultiviewFavoriteGroupsV01;
    if(!Array.isArray(favorites))throw Error('즐겨찾기 데이터가 없는 파일입니다.');
    data={favorites,groups:groups??[],groupOptions:source[api.GROUP_OPTIONS_KEY]};
  }
  if(!Array.isArray(data.favorites) || data.favorites.length>10000)throw Error('즐겨찾기 목록 형식이 올바르지 않습니다.');
  const groups=names(data.groups??[],'그룹');
  const byUid=new Map<string,BackupFavorite>();
  for(const raw of data.favorites){
    const entry=object(raw);
    if(typeof entry.uid!=='string' || entry.uid.length>160 || !/^(?:[A-Za-z0-9_-]{6,}|video:[A-Za-z0-9_-]+)$/.test(entry.uid))throw Error('방송 UID 형식이 올바르지 않습니다.');
    const name=entry.name??entry.title??entry.uid,title=entry.title??entry.name??entry.uid;
    if(typeof name!=='string' || typeof title!=='string' || name.length>1000 || title.length>1000)throw Error('방송 이름 형식이 올바르지 않습니다.');
    const memberships=names(entry.groups??(entry.group?[entry.group]:['기본 그룹']),'그룹');
    const existing=byUid.get(entry.uid);
    if(existing){existing.groups=[...new Set([...existing.groups,...memberships])];continue;}
    byUid.set(entry.uid,{uid:entry.uid,name,title,groups:memberships.length?memberships:['기본 그룹'],order:typeof entry.order==='number' && Number.isFinite(entry.order) && entry.order>0?entry.order:byUid.size+1});
  }
  const favorites=[...byUid.values()].sort((a,b)=>a.order-b.order);
  favorites.forEach((favorite,index)=>favorite.order=index+1);
  const allGroups=[...new Set([...groups,'기본 그룹',...favorites.flatMap(f=>f.groups)])];
  const options=object(data.groupOptions),groupOptions: BackupData['groupOptions']=Object.create(null);
  for(const group of allGroups){
    const option=object(options[group]);
    if(typeof option.color==='string' && /^#[0-9a-f]{6}$/i.test(option.color))groupOptions[group]={color:option.color,showOffline:true};
  }
  return {format:FORMAT,version:1,exportedAt:typeof source.exportedAt==='string'?source.exportedAt.slice(0,80):new Date().toISOString(),data:{favorites,groups:allGroups,groupOptions}};
}
export async function create(): Promise<BackupDocument> {
  const api=store(),state=await api.read(),values=await chrome.storage.local.get(api.GROUP_OPTIONS_KEY);
  return parse({...state,groupOptions:values[api.GROUP_OPTIONS_KEY]});
}
export async function previous(): Promise<BackupDocument | null> {
  const values=await chrome.storage.local.get(PREVIOUS_KEY);
  return values[PREVIOUS_KEY]?parse(values[PREVIOUS_KEY]):null;
}
export async function restore(input: unknown, mode: 'merge' | 'replace'='merge') {
  if(mode!=='merge' && mode!=='replace')throw Error('불러오기 방식을 확인해주세요.');
  const incoming=parse(input),api=store();
  const current=await api.read(),values=await chrome.storage.local.get(api.GROUP_OPTIONS_KEY);
  const before=parse({...current,groupOptions:values[api.GROUP_OPTIONS_KEY]});
  let favorites: Record<string,unknown>[]=incoming.data.favorites.map(f=>({...f})),groups=incoming.data.groups;
  let groupOptions=incoming.data.groupOptions;
  if(mode==='merge'){
    const merged: (Record<string,unknown> & {groups: unknown[]})[]=current.favorites.map(f=>({...f,groups:Array.isArray(f.groups)?[...f.groups]:[f.group||'기본 그룹']}));
    for(const favorite of incoming.data.favorites){
      const existing=merged.find(f=>f.uid===favorite.uid);
      if(existing)existing.groups=[...new Set([...existing.groups,...favorite.groups])];
      else merged.push({...favorite,order:merged.length+1});
    }
    favorites=merged;groups=[...new Set([...current.groups,...groups])];
    groupOptions={...groupOptions,...before.data.groupOptions};
  }
  const result=api.snapshot(favorites,groups);
  // Persist the recovery snapshot and restored data together. A failed write leaves both unchanged.
  await chrome.storage.local.set({[PREVIOUS_KEY]:before,[api.FAVORITES_KEY]:result.favorites,[api.GROUPS_KEY]:result.groups,[api.GROUP_OPTIONS_KEY]:groupOptions});
  return result;
}
export const favoritesBackup=Object.freeze({MAX_BYTES,parse,create,previous,restore});
globalThis.CZFavoritesBackup=favoritesBackup;
