const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context=vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(process.env.CZ_TEST_ROOT || path.resolve(__dirname,'../dist'),'src/shared/runtime/scope.js'),'utf8'),context);
const {ResourceScope}=context.CZRuntime;
test('resource scope releases in reverse order once and continues after cleanup errors',()=>{
 const order=[],errors=[],scope=new ResourceScope(error=>errors.push(error));
 scope.add(()=>order.push(1));scope.add(()=>{throw Error('cleanup');});scope.add(()=>order.push(3));
 scope.dispose();scope.dispose();assert.deepEqual(order,[3,1]);assert.equal(errors.length,1);assert.equal(scope.size,0);
 scope.add(()=>order.push(4));assert.deepEqual(order,[3,1,4]);
});
test('scope removes listeners and disconnects observers without retaining released resources',()=>{
 const scope=new ResourceScope(),target=new EventTarget();let hits=0,disconnects=0;
 scope.listen(target,'change',()=>hits++);const release=scope.observe({disconnect(){disconnects++;}});
 target.dispatchEvent(new Event('change'));release();release();assert.equal(scope.size,1);
 scope.dispose();target.dispatchEvent(new Event('change'));assert.equal(hits,1);assert.equal(disconnects,1);
});
