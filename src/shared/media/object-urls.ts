import {ResourceScope} from '../runtime/scope';
/** Owns only URLs created here; source-player URLs are never registered. */
export class ObjectURLs {
  private scope=new ResourceScope();
  private urls=new Map<string,()=>void>();
  get size(){return this.urls.size;}
  create(blob: Blob,lifetime?: number){
    if(this.scope.isDisposed)throw Error('이미 종료된 미디어 화면입니다.');
    const url=URL.createObjectURL(blob);let cancel=()=>{};
    const release=this.scope.add(()=>{cancel();URL.revokeObjectURL(url);this.urls.delete(url);});
    this.urls.set(url,release);
    if(lifetime!==undefined)cancel=this.scope.timeout(release,lifetime);
    return {url,release};
  }
  dispose(){this.scope.dispose();}
}
export const objectURLs=Object.freeze({ObjectURLs});
globalThis.CZObjectURLs=objectURLs;
