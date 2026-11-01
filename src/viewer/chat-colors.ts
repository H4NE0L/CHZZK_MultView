/** Preserve readable native colors, lifting dark colors against the chat surface. */
export function readableChatColor(input: string,fallback='#c7ddff'){
 let rgb: number[]|null=null,alpha=1;
 if(/^#[a-f\d]{3,8}$/i.test(input)){
  const hex=input.slice(1);if(hex.length===4)alpha=parseInt(hex[3]!+hex[3]!,16)/255;else if(hex.length===8)alpha=parseInt(hex.slice(6),16)/255;if(hex.length===3||hex.length===4)rgb=[...hex.slice(0,3)].map(value=>parseInt(value+value,16));else if(hex.length===6||hex.length===8)rgb=[0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));
 }else if(/^rgba?\(/i.test(input)){
  const values=input.match(/[\d.]+%?/g);if(values&&values.length>=3)rgb=values.slice(0,3).map(value=>value.endsWith('%')?parseFloat(value)*2.55:Number(value));
  if(values?.[3])alpha=values[3].endsWith('%')?parseFloat(values[3])/100:Number(values[3]);
  if(alpha<=0)return fallback;
 }
 if(!rgb||rgb.some(value=>!Number.isFinite(value))||!Number.isFinite(alpha))return fallback;
 alpha=Math.max(0,Math.min(1,alpha));
 rgb=rgb.map((value,index)=>Math.max(0,Math.min(255,value))*alpha+[27,29,32][index]!*(1-alpha));
 const luminance=(values: number[])=>values.map(value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index]!,0);
 const background=luminance([27,29,32]),contrast=(values: number[])=>(Math.max(luminance(values),background)+.05)/(Math.min(luminance(values),background)+.05);
 if(contrast(rgb)>=4.5)return alpha===1?input:`rgb(${rgb.map(Math.round).join(', ')})`;
 let low=0,high=1;
 for(let i=0;i<12;i++){const fraction=(low+high)/2,candidate=rgb.map(value=>value+(255-value)*fraction);if(contrast(candidate)>=4.5)high=fraction;else low=fraction;}
 return `rgb(${rgb.map(value=>Math.ceil(value+(255-value)*high)).join(', ')})`;
}
