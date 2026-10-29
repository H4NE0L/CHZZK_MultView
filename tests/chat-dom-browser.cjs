const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./support/browser.cjs').executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<body>');await page.addScriptTag({content:fs.readFileSync('src/content/chat/dom-adapter.js','utf8')});
  const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/chat/markup.json'),'utf8'));
  for(const fixture of fixtures){
   const actual=await page.evaluate(fixture=>{
    document.body.innerHTML=fixture.html;const before=document.body.innerHTML;
    const adapter=CZChatDOM.create({getOwnerName:()=>fixture.owner||''}),row=document.querySelector('#message');
    const result=adapter.read(row).message;
    return {message:result,unchanged:document.body.innerHTML===before,discovered:!fixture.discovery || adapter.rowForName(row.querySelector('[data-chat-nickname]'))===row};
   },fixture);
   assert(actual.unchanged,fixture.id+' mutated native markup');assert(actual.message,fixture.id);
   for(const [key,value] of Object.entries(fixture.expected))assert.equal(actual.message[key],value,fixture.id+' '+key);
   if(fixture.discovery)assert(actual.discovered,fixture.id);
  }
  assert.deepEqual(errors,[]);console.log(`PASS: ${fixtures.length} native chat markup fixtures preserve author/body/role/time and do not mutate native DOM.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
