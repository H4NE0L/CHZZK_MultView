globalThis.CZRecordings = (() => {
  function open() {return new Promise((resolve,reject)=>{const request=indexedDB.open('chzzk-recording-results',1);request.onupgradeneeded=()=>request.result.createObjectStore('results',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function transact(mode, action) {
    const db=await open();
    return new Promise((resolve,reject)=>{const tx=db.transaction('results',mode),request=action(tx.objectStore('results'));let value;
      request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error || request.error);};
    });
  }
  return {put:result=>transact('readwrite',store=>{const cursor=store.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;if(item.value.createdAt<Date.now()-86400000)item.delete();item.continue();};return store.put(result);}),get:id=>transact('readonly',store=>store.get(id)),remove:id=>transact('readwrite',store=>store.delete(id))};
})();
