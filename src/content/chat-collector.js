import {create as createDOM} from './chat/dom-adapter.js';
import {create as createHistory,hash} from '../shared/chat/history';
import {ResourceScope} from '../shared/runtime/scope';
// Observe visible markup only; parsing, role rules and bounded history are separate.
globalThis.CZChatCollector = {create({send,status=()=>{}}) {
  let filter=CZImportantChat.settings({enabled:false}),observer=null,timer=null,sequence=0;
  const history=createHistory();let identities=new WeakMap(),liveTails=new WeakMap();let liveInserts=new WeakSet();let replacements=new WeakMap();let seen=new WeakMap(),observed=new WeakSet(),ownerName='',statusTimer=null;let counts={scanned:0,parsed:0,matched:0,sent:0,restored:0};let structure=null;const pending=new Map();
  const scope=new ResourceScope();let releaseObserver=null;
  const dom=createDOM({getOwnerName:()=>ownerName});
  const {rows,names,leafNames,rowForName}=dom;
  const readingHistory=row=>dom.readingHistory(row);
  function report(){if(!statusTimer)statusTimer=scope.timeout(()=>{statusTimer=null;status({...counts,revision:'refactor-stage3-1',historyEntries:history.size,ownerKnown:!!ownerName,enabled:filter.enabled,structure,roleSample:dom.roleSample,dom:dom.summary(counts.scanned)});},500);}
  function flush(){timer=null;if(pending.size){const batch=Array.from(pending.values());send(batch);counts.sent+=batch.length;pending.clear();report();}}
  function read(row) {
    row=dom.normalizeRow(row);
    if(leafNames(row).length>1){for(const child of [...row.querySelectorAll(rows)].slice(-200))if(leafNames(child).length===1)read(child);return;}
    if(!observed.has(row)){observed.add(row);counts.scanned++;report();}
    if(dom.aboveHeader(row))return;
    const parsed=dom.read(row);structure=parsed.structure;report();
    if(!parsed.message)return;
    const {name,text,segments,nativeTime,sourceId,badges,role}=parsed.message;
    const fingerprint=JSON.stringify([name,text]),hint=replacements.get(row);
    const historyKey=sourceId?'native:'+sourceId:hash(JSON.stringify([name,text,segments,nativeTime]));
    const existing=identities.get(row),sameExisting=existing?.fingerprint===fingerprint && (!sourceId || existing.id===sourceId);
    const cached=history.get(historyKey),restored=cached && !sameExisting && (sourceId || !liveInserts.has(row) && readingHistory(row))?cached:null;
    const previous=(sameExisting?existing:null)||((hint?.fingerprint===fingerprint && (!sourceId || sourceId===hint.id))?hint:null)||(restored?{...restored,fingerprint}:null);
    const id=String(sourceId || (previous?.fingerprint===fingerprint?previous.id:++sequence)).slice(0,160);
    const item=CZImportantChat.message({id,name,text,segments,badges,role,time:CZImportantChat.timestamp(nativeTime)??(previous?.fingerprint===fingerprint?previous.time:null)});
    if(!item)return;
    if(existing?.historical && !liveInserts.has(row))item.updateOnly=true;
    if(liveInserts.has(row) || !readingHistory(row))liveTails.set(row.parentElement,new WeakRef(row));
    const signature=JSON.stringify(item);
    if(sameExisting && existing.historical && cached?.matched && !liveInserts.has(row)){
      const identity={...existing,signature};identities.set(row,identity);seen.set(row,identity);return;
    }
    if(restored && restored.id===id && (restored.matched || restored.signature===hash(signature))){
      const identity={fingerprint,id,time:item.time,signature,historical:true};identities.set(row,identity);seen.set(row,identity);counts.restored++;history.remember(historyKey,identity,signature,restored.matched || CZImportantChat.matches(item,filter));report();return;
    }
    if(replacements.has(row) && previous?.signature===signature){identities.set(row,previous);seen.set(row,previous);return;}
    if(seen.get(row)?.signature===signature)return;
    counts.parsed++;report();
    const identity={fingerprint,id,time:item.time,signature};identities.set(row,identity);seen.set(row,identity);
    const matched=CZImportantChat.matches(item,filter);history.remember(historyKey,identity,signature,matched);
    if(!matched)return;
    counts.matched++;
    pending.set(id,item);if(pending.size>CZImportantChat.LIMIT)pending.delete(pending.keys().next().value);
    if(!timer)timer=scope.timeout(flush,250);
  }
  function scan(node) {
    const el=node.nodeType===1?node:node.parentElement;if(!el)return;
    const closest=el.closest(rows);if(closest){read(closest);return;}
    else Array.from(el.querySelectorAll(rows)).slice(-200).forEach(read);
    // CSS module changes can remove every known row marker. Seed discovery
    // from nicknames instead, including mutations to an unknown message body.
    const candidates=new Set([...el.querySelectorAll(names)].slice(-200).filter(nickname=>!nickname.closest(rows)));
    const own=el.closest(names);if(own)candidates.add(own);
    let ancestor=el;
    for(let depth=0;ancestor && ancestor!==document.body && depth<5;depth++,ancestor=ancestor.parentElement){
      const found=leafNames(ancestor);if(found.length===1){candidates.add(found[0]);break;}if(found.length>1)break;
    }
    for(const nickname of candidates){const row=rowForName(nickname);if(row)read(row);}
    if(!counts.scanned)report();
  }
  function stop(){releaseObserver?.();releaseObserver=null;observer=null;timer?.();timer=null;pending.clear();seen=new WeakMap();observed=new WeakSet();statusTimer?.();statusTimer=null;}
  function configure(value,identity={}) {
    if(scope.isDisposed)return;
    stop();dom.resetScroll();structure=null;counts={scanned:0,parsed:0,matched:0,sent:0,restored:0};ownerName=typeof identity.streamerName==='string'?identity.streamerName.slice(0,80):'';filter=CZImportantChat.settings(value);report();if(!filter.enabled)return;
    observer=new MutationObserver(records=>{
      dom.resetScroll();replacements=new WeakMap();
      const messageRows=node=>node.nodeType===1?[...(node.matches(rows)?[node]:[]),...node.querySelectorAll(rows)].slice(0,200):[];
      liveInserts=new WeakSet();
      for(const record of records){
        if(record.type!=='childList' || !record.addedNodes.length || record.nextSibling!==null || record.previousSibling!==liveTails.get(record.target)?.deref())continue;
        const added=[...record.addedNodes].flatMap(messageRows);added.forEach(row=>liveInserts.add(row));if(added.length)liveTails.set(record.target,new WeakRef(added.at(-1)));
      }
      // Reuse identity only for an observed replacement in the same mutation,
      // never merely because two independently posted messages have equal text.
      for(const record of records){
        if(record.type!=='childList' || !record.removedNodes.length || record.removedNodes.length!==record.addedNodes.length)continue;
        const oldRows=[...record.removedNodes].flatMap(messageRows),newRows=[...record.addedNodes].flatMap(messageRows);
        if(oldRows.length!==newRows.length)continue;
        oldRows.forEach((old,index)=>{const identity=identities.get(old);if(identity)replacements.set(newRows[index],identity);});
      }
      const removals=new Map();
      for(const record of records){
        if(record.type!=='childList' || record.removedNodes.length!==1 || record.addedNodes.length)continue;
        if(!removals.has(record.target))removals.set(record.target,new Map());const byPrev=removals.get(record.target);
        if(!byPrev.has(record.previousSibling))byPrev.set(record.previousSibling,new Map());byPrev.get(record.previousSibling).set(record.nextSibling,record.removedNodes[0]);
      }
      for(const record of records){
        if(record.type!=='childList' || record.addedNodes.length!==1 || record.removedNodes.length)continue;
        const old=removals.get(record.target)?.get(record.previousSibling)?.get(record.nextSibling);if(!old)continue;
        const oldRows=messageRows(old),newRows=messageRows(record.addedNodes[0]);if(oldRows.length!==newRows.length)continue;
        oldRows.forEach((row,index)=>{const identity=identities.get(row);if(identity)replacements.set(newRows[index],identity);});
      }
      const candidates=new Set();
      for(const record of records){if(record.type==='childList' && record.addedNodes.length && [...record.addedNodes].every(node=>node.nodeType===1 && node.matches('.cz-native-chat-time')))continue;if(record.type==='childList' && !record.addedNodes.length && !record.target.closest(rows))continue;if(record.type==='attributes' && ['class','style'].includes(record.attributeName) && !record.target.closest(rows))continue;if(record.type!=='childList' || !record.addedNodes.length)candidates.add(record.target);for(const node of record.addedNodes)candidates.add(node);}
      for(const node of candidates)scan(node);
    });
    releaseObserver=scope.observe(observer);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['alt','title','aria-label','data-role','data-user-role','data-user-type','href','xlink:href','src','srcset','class','style','data-cz-message-time','data-message-time','data-timestamp','data-created-at']});
    scan(document.body);
  }
  function dispose(){stop();history.clear();identities=new WeakMap();liveTails=new WeakMap();liveInserts=new WeakSet();replacements=new WeakMap();structure=null;ownerName='';dom.resetScroll();scope.dispose();}
  scope.listen(window,'pagehide',event=>{if(!event.persisted)dispose();});
  return {configure,stop,dispose};
}};
