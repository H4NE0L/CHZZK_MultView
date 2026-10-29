globalThis.CZScreenshotGallery = {create({host,download,onClose}) {
  const saving=new WeakSet();
  const items=[];let index=-1,crop=null,url=null,drag=null,closed=false;
  const panel=document.createElement('section');panel.className='media-dialog screenshot-dialog screenshot-gallery';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','스크린샷 목록');
  panel.innerHTML='<header><strong>스크린샷 미리보기</strong><button class="gallery-close" type="button" aria-label="닫기">✕</button></header><div class="media-body"></div><footer class="media-footer"><div class="gallery-tools"><button class="gallery-crop-toggle" type="button" aria-pressed="false">자르기</button><button class="gallery-reset" type="button">영역 초기화</button><span class="screenshot-size"></span></div><div class="gallery-navigation"><button class="gallery-prev" type="button" aria-label="이전 이미지">‹</button><span class="gallery-index"></span><button class="gallery-next" type="button" aria-label="다음 이미지">›</button></div><div class="gallery-actions"><button class="media-copy" type="button">이미지 복사</button><button class="media-save" type="button">이미지 저장</button></div></footer><p class="gallery-status" role="status"></p>';
  host.appendChild(panel);const $=selector=>panel.querySelector(selector),body=$('.media-body'),status=$('.gallery-status');
  function update() {
    const item=items[index];if(!item)return;
    $('.media-save').disabled=saving.has(item);
    $('.gallery-index').textContent=`${index+1} / ${items.length}`;
    $('.gallery-prev').disabled=index===0;$('.gallery-next').disabled=index===items.length-1;
    const enabled=crop?.isEnabled()===true;$('.gallery-crop-toggle').setAttribute('aria-pressed',String(enabled));$('.gallery-reset').disabled=!enabled;
    $('.media-copy').textContent=enabled?'선택 영역 복사':'이미지 복사';$('.media-save').textContent=enabled?'선택 영역 저장':'이미지 저장';
    const img=body.querySelector('img');$('.screenshot-size').textContent=img?.naturalWidth?`${img.naturalWidth} × ${img.naturalHeight}px`:'';clamp();
  }
  function release() {body.querySelector('img')?.removeAttribute('src');if(url)URL.revokeObjectURL(url);url=null;}
  function show(next) {
    if(next<0 || next>=items.length || closed)return;
    if(index>=0 && crop)items[index].cropState=crop.getState();
    release();index=next;crop=null;body.replaceChildren();status.textContent='';
    const img=document.createElement('img');img.draggable=false;img.alt=`스크린샷 ${index+1}`;
    const area=document.createElement('div');area.className='screenshot-crop-host';area.appendChild(img);body.appendChild(area);
    crop=CZScreenshotCrop.attach(img,area,update,items[index].cropState);
    url=URL.createObjectURL(items[index].blob);img.src=url;update();
  }
  function close() {if(closed)return;closed=true;release();items.length=0;panel.remove();window.removeEventListener('resize',clamp);sizeObserver.disconnect();onClose();}
  function clamp() {
    // Reserve handle space before sizing the image, including short viewports.
    const img=body.querySelector('img'),area=body.firstElementChild;
    if(img?.naturalWidth && area){
      const style=getComputedStyle(body),paddingX=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),paddingY=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
      const chromeHeight=$('header').offsetHeight+$('footer').offsetHeight+status.getBoundingClientRect().height;
      const statusStyle=getComputedStyle(status),statusMargin=parseFloat(statusStyle.marginTop)+parseFloat(statusStyle.marginBottom);
      const availableHeight=Math.max(1,parseFloat(getComputedStyle(panel).maxHeight)-chromeHeight-statusMargin-paddingY-2);
      area.style.width=Math.max(1,Math.min(body.clientWidth-paddingX,availableHeight*img.naturalWidth/img.naturalHeight))+'px';
    }
    const r=panel.getBoundingClientRect();panel.style.right='auto';panel.style.left=`${Math.max(0,Math.min(r.left,innerWidth-r.width))}px`;panel.style.top=`${Math.max(0,Math.min(r.top,innerHeight-Math.min(r.height,innerHeight)))}px`;}
  const sizeObserver=new ResizeObserver(clamp);sizeObserver.observe(panel);
  const header=$('header');header.onpointerdown=event=>{
    if(event.button!==0 || event.target.closest('button,input,label'))return;
    event.preventDefault();const r=panel.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:r.left,top:r.top};header.setPointerCapture(event.pointerId);
  };
  header.onpointermove=event=>{if(!drag)return;panel.style.right='auto';panel.style.left=drag.left+event.clientX-drag.x+'px';panel.style.top=drag.top+event.clientY-drag.y+'px';clamp();};
  header.onpointerup=header.onpointercancel=()=>{drag=null;};window.addEventListener('resize',clamp);
  $('.gallery-close').onclick=close;$('.gallery-prev').onclick=()=>show(index-1);$('.gallery-next').onclick=()=>show(index+1);
  $('.gallery-crop-toggle').onclick=()=>{crop.setEnabled(!crop.isEnabled());update();};$('.gallery-reset').onclick=()=>crop.reset();
  $('.media-save').onclick=async()=>{
    const item=items[index],controller=crop;
    if(!item || !controller || saving.has(item))return;
    saving.add(item);update();
    try {
      const blob=await controller.blob();if(closed)return;
      await download(blob,item.name+'.png');if(closed)return;
      const current=items[index],position=items.indexOf(item);if(position<0)return;
      if(current===item){release();crop=null;}
      items.splice(position,1);
      if(!items.length){close();return;}
      if(current===item){index=-1;show(Math.min(position,items.length-1));}
      else {index=items.indexOf(current);update();}
      status.textContent='이미지를 저장했습니다.';
    }catch(error){if(!closed)status.textContent=error.message;}
    finally{saving.delete(item);if(!closed)update();}
  };
  $('.media-copy').onclick=async()=>{try {const blob=await crop.blob();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);status.textContent='이미지를 복사했습니다.';}catch(error){status.textContent='이미지 복사 실패: '+error.message;}};
  panel.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();close();}
    if(['ArrowLeft','ArrowRight'].includes(event.key) && !event.target.matches('input,select,textarea')){event.preventDefault();event.stopPropagation();show(index+(event.key==='ArrowLeft'?-1:1));}
  });
  return {hasUnsaved:()=>items.some(item=>!item.saved),add(item){items.push(item);show(items.length-1);},close,containsEvent:event=>event.composedPath().includes(panel)};
}};
