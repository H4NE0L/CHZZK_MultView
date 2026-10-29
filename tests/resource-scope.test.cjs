const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context=vm.createContext({console});
vm.runInContext(require('./support/modules.cjs').read(path.join(process.env.CZ_TEST_ROOT || path.resolve(__dirname,'../dist'),'src/shared/runtime/scope.js'),'utf8'),context);
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
test('scope releases completed timer/frame registrations and cancels outstanding work',()=>{
 const timers=new Map(),frames=new Map();let id=0,hits=0;
 const fake=vm.createContext({console,
  setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),
  setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:id=>timers.delete(id),
  requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 vm.runInContext(require('./support/modules.cjs').read(path.join(process.env.CZ_TEST_ROOT || path.resolve(__dirname,'../dist'),'src/shared/runtime/scope.js'),'utf8'),fake);
 const scope=new fake.CZRuntime.ResourceScope();
 scope.timeout(()=>hits++,1);scope.frame(()=>hits++);assert.equal(scope.size,2);
 [...timers.values()][0]();[...frames.values()][0](0);assert.equal(scope.size,0);assert.equal(hits,2);
 scope.interval(()=>hits++,1);scope.timeout(()=>hits++,1);scope.frame(()=>hits++);
 scope.dispose();assert.equal(timers.size,0);assert.equal(frames.size,0);assert(scope.isDisposed);
 scope.timeout(()=>hits++,1);scope.frame(()=>hits++);assert.equal(timers.size,0);assert.equal(frames.size,0);
});
