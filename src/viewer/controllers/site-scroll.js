// Lock the host page only. Shadow DOM lists and chat retain their own scrolling.
export function lockPageScroll(doc){
 const names=['overflow','overflow-x','overflow-y','scrollbar-gutter','scrollbar-width','overscroll-behavior','overscroll-behavior-x','overscroll-behavior-y'];
 const required=[['overflow','hidden'],['overflow-x','hidden'],['overflow-y','hidden'],['scrollbar-gutter','auto'],['scrollbar-width','none'],['overscroll-behavior','none'],['overscroll-behavior-x','none'],['overscroll-behavior-y','none']];
 const saved=new Map();let disposed=false;
 const marker='data-cz-site-scroll-lock',html=doc.documentElement,previous=html.getAttribute(marker);
 html.setAttribute(marker,'');
 const sheet=doc.createElement('style');
 sheet.textContent=`html[${marker}],html[${marker}] body { scrollbar-width:none!important; } html[${marker}]::-webkit-scrollbar,html[${marker}] body::-webkit-scrollbar { display:none!important; width:0!important; height:0!important; }`;
 (doc.head||html).append(sheet);
 function enforce(){
  if(disposed)return;
  for(const element of [doc.documentElement,doc.body].filter(Boolean)){
   if(!saved.has(element)){
    saved.set(element,names.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]));
    observer.observe(element,{attributes:true,attributeFilter:['style','class'],childList:element===doc.documentElement});
   }
   for(const [name,value]of required)if(element.style.getPropertyValue(name)!==value||element.style.getPropertyPriority(name)!=='important')element.style.setProperty(name,value,'important');
  }
 }
 const observer=new MutationObserver(enforce);enforce();
 return ()=>{
  if(disposed)return;disposed=true;observer.disconnect();sheet.remove();
  if(previous===null)html.removeAttribute(marker);else html.setAttribute(marker,previous);
  for(const [element,values]of saved){for(const name of names)element.style.removeProperty(name);for(const [name,value,priority]of values)if(value)element.style.setProperty(name,value,priority);}
 };
}
