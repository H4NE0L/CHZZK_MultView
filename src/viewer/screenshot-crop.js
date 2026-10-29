export const screenshotCrop = {attach(img, host, onChange=()=>{},initial={}) {
  const box=document.createElement('div');box.className='screenshot-crop';box.setAttribute('aria-label','저장할 이미지 영역');
  for(const corner of ['nw','n','ne','w','e','sw','s','se']){const handle=document.createElement('span');handle.className='crop-handle '+corner;handle.dataset.corner=corner;box.appendChild(handle);}
  const size=document.createElement('span');size.className='crop-size';box.appendChild(size);
  const grid=document.createElement('div');grid.className='crop-grid';box.appendChild(grid);
  host.appendChild(box);
  let selection={x:0,y:0,width:1,height:1,...initial.selection},drag=null,enabled=initial.enabled===true;
  box.hidden=!enabled;
  function render() {box.style.left=selection.x*100+'%';box.style.top=selection.y*100+'%';box.style.width=selection.width*100+'%';box.style.height=selection.height*100+'%';size.textContent=`${Math.round(selection.width*img.naturalWidth)} × ${Math.round(selection.height*img.naturalHeight)}`;onChange(selection);}
  const point=event=>{const r=host.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))};};
  host.onpointerdown=event=>{
    if(!enabled || event.button!==0)return;event.preventDefault();
    const p=point(event);drag={start:p,original:{...selection},corner:event.target.dataset.corner,move:(event.target===box || event.target===size) && !(selection.width===1 && selection.height===1)};
    if(!drag.corner && !drag.move){selection={x:p.x,y:p.y,width:0,height:0};}
    host.setPointerCapture(event.pointerId);render();
  };
  host.onpointermove=event=>{
    if(!drag)return;const p=point(event),o=drag.original;
    if(drag.move){selection={...o,x:Math.max(0,Math.min(1-o.width,o.x+p.x-drag.start.x)),y:Math.max(0,Math.min(1-o.height,o.y+p.y-drag.start.y))};}
    else {
      if(drag.corner){
        let left=o.x,right=o.x+o.width,top=o.y,bottom=o.y+o.height;
        if(drag.corner.includes('w'))left=p.x;if(drag.corner.includes('e'))right=p.x;
        if(drag.corner.includes('n'))top=p.y;if(drag.corner.includes('s'))bottom=p.y;
        selection={x:Math.min(left,right),y:Math.min(top,bottom),width:Math.abs(right-left),height:Math.abs(bottom-top)};
      }else{const anchor=drag.start;selection={x:Math.min(anchor.x,p.x),y:Math.min(anchor.y,p.y),width:Math.abs(p.x-anchor.x),height:Math.abs(p.y-anchor.y)};}
    }
    render();
  };
  const end=()=>{drag=null;if(selection.width*img.naturalWidth<1 || selection.height*img.naturalHeight<1){selection={x:0,y:0,width:1,height:1};render();}};
  host.onpointerup=end;host.onpointercancel=end;
  img.onload=render;render();
  return {getState(){return {selection:{...selection},enabled};},isEnabled(){return enabled;},reset(){selection={x:0,y:0,width:1,height:1};render();},setEnabled(value){enabled=value;box.hidden=!enabled;onChange(selection);},async blob() {
    await img.decode();
    const area=enabled?selection:{x:0,y:0,width:1,height:1};
    const x=Math.min(img.naturalWidth-1,Math.round(area.x*img.naturalWidth)),y=Math.min(img.naturalHeight-1,Math.round(area.y*img.naturalHeight));
    const width=Math.max(1,Math.min(img.naturalWidth-x,Math.round(area.width*img.naturalWidth))),height=Math.max(1,Math.min(img.naturalHeight-y,Math.round(area.height*img.naturalHeight)));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    try{canvas.getContext('2d').drawImage(img,x,y,width,height,0,0,width,height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('이미지를 저장할 수 없습니다.');return blob;
    }finally{canvas.width=canvas.height=0;}
  }};
}};
