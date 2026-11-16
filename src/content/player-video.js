// A page can keep idle/ad/preview videos ahead of the actual player in the DOM.
export function findPlaybackVideo(root=document){
 const candidates=[...root.querySelectorAll('video')].filter(video=>video.isConnected);
 const rank=video=>{
  const box=video.getBoundingClientRect(),style=getComputedStyle(video);
  const visible=box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&!video.closest('[hidden],[aria-hidden="true"]');
  const scoped=!!video.closest('.pzp-pc,.webplayer-internal-core,[data-player]');
  return [Number(visible),Number(video.readyState>=2&&!video.ended),Number(scoped),Number(video.matches('.webplayer-internal-video')),Number(!video.paused&&!video.ended),box.width*box.height];
 };
 let selected=null,best=null;
 for(const video of candidates){
  const score=rank(video);let better=!best;
  if(best)for(let i=0;i<score.length;i++){if(score[i]===best[i])continue;better=score[i]>best[i];break;}
  if(better){selected=video;best=score;}
 }
 return selected;
}
