const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({});vm.runInContext(require('./support/modules.cjs').read('src/viewer/chat-colors.js','utf8'),context);
const color=context.CZChatColors.readableChatColor;
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=value=>{const rgb=value.match(/[\d.]+/g).map(Number);return (luminance(rgb)+.05)/(luminance([27,29,32])+.05);};
test('native black, dark and translucent chat colors become readable on the dark surface',()=>{
 for(const input of ['rgb(0, 0, 0)','#000','#112233','rgba(255, 255, 255, .05)','#ffffff08','rgb(10%, 10%, 10%)'])assert(contrast(color(input))>=4.5,input);
});
test('readable original colors are kept and invalid/transparent values have a visible fallback',()=>{
 for(const input of ['#ffffff','rgb(91, 154, 240)','#00ff00'])assert.equal(color(input),input);
 for(const input of ['transparent','invalid','rgba(0,0,0,0)'])assert.equal(color(input),'#c7ddff');
});
