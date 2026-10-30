// ISOLATED world, document_start: precede native Window capture listeners.
// Inert on normal CHZZK pages; only the validated multiview frame controller
// supplies handlers. No media state is changed by this bootstrap itself.
(() => {
 if(globalThis.CZPlayerAudioEarly)return;
 const gate={volumechange:null,storage:null};
 globalThis.CZPlayerAudioEarly=gate;
 for(const type of ['volumechange','storage'])window.addEventListener(type,event=>gate[type]?.(event),true);
 window.addEventListener('pagehide',()=>{gate.volumechange=null;gate.storage=null;},{once:true});
})();
