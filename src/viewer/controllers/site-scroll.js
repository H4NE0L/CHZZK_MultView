export function lockPageScroll(doc){
 const names=['overflow','overflow-x','overflow-y','scrollbar-gutter','overscroll-behavior','overscroll-behavior-x','overscroll-behavior-y'];
 const saved=[doc.documentElement,doc.body].filter(Boolean).map(element=>({style:element.style,values:names.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)])}));
 for(const {style}of saved)for(const [name,value]of [['overflow','hidden'],['scrollbar-gutter','auto'],['overscroll-behavior','none']])style.setProperty(name,value,'important');
 return ()=>{for(const {style,values}of saved){for(const name of names)style.removeProperty(name);for(const [name,value,priority]of values)if(value)style.setProperty(name,value,priority);}};
}
