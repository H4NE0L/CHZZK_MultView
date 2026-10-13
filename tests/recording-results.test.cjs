const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('result tab registration survives reload and deletion happens only on close',async()=>{
  const data={},removed=[],listeners={};
  const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.message=fn}},storage:{session:{set:async value=>Object.assign(data,value),get:async key=>({[key]:data[key]}),remove:async key=>{delete data[key];}}},tabs:{get:async tabId=>({id:tabId,url:'chrome-extension://test/src/viewer/recording.html?id=result1'}),onRemoved:{addListener:fn=>listeners.close=fn}}};
  vm.runInNewContext(fs.readFileSync('src/background/recording-results.js','utf8'),{chrome,URL,console,CZRecordings:{remove:async id=>removed.push(id)}});
  const sender={id:'test',tab:{id:12},url:'chrome-extension://test/src/viewer/recording.html?id=result1'};
  for(let i=0;i<2;i++)assert.equal((await new Promise(resolve=>listeners.message({type:'REGISTER_RECORDING_RESULT',resultId:'result1'},sender,resolve))).ok,true);
  assert.equal((await new Promise(resolve=>listeners.message({type:'REGISTER_RECORDING_RESULT',resultId:'result1',tabId:12},{id:sender.id,url:sender.url},resolve))).ok,true);
  assert.equal(removed.length,0);
  await listeners.close(99);assert.equal(removed.length,0);
  await listeners.close(12);assert.deepEqual(removed,['result1']);assert.equal(data['recordingResultTab:12'],undefined);
  assert.equal(listeners.message({type:'REGISTER_RECORDING_RESULT',resultId:'other'},sender,()=>assert.fail()),undefined);
});
