const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=process.env.CZ_TEST_ROOT||path.resolve(__dirname,'../dist');
test('object URL leases release on timeout, explicit release and disposal exactly once',()=>{
 const created=[],revoked=[],timers=new Map();let id=0;
 const ctx=vm.createContext({console,URL:{createObjectURL:blob=>{created.push(blob.size);return 'blob:'+created.length;},revokeObjectURL:url=>revoked.push(url)},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(require('./support/modules.cjs').read(path.join(root,'src/shared/media/object-urls.js'),'utf8'),ctx);
 const urls=new ctx.CZObjectURLs.ObjectURLs(),first=urls.create(new Blob(['one']),10);assert.equal(urls.size,1);first.release();first.release();assert.equal(timers.size,0);
 urls.create(new Blob(['two']),10);[...timers.values()][0]();assert.equal(urls.size,0);
 urls.create(new Blob(['three']));urls.dispose();urls.dispose();assert.deepEqual(revoked,['blob:1','blob:2','blob:3']);assert.equal(urls.size,0);assert.throws(()=>urls.create(new Blob()));
});
test('export jobs terminate workers on success, cancellation, malformed result and posting failure',async()=>{
 const ctx=vm.createContext({Blob,ArrayBuffer,console});vm.runInContext(require('./support/modules.cjs').read(path.join(root,'src/viewer/media/export-job.js'),'utf8'),ctx);
 const workers=[];function factory(){const worker={terminated:0,postMessage(){},terminate(){this.terminated++;}};workers.push(worker);return worker;}
 const options={container:'webm',trim:true,start:0,end:1,transcode:false};
 const complete=ctx.CZExportJobs.create(new Blob(['source']),options,()=>{},factory),worker=workers.at(-1);
 worker.onmessage({data:{type:'done',buffer:new Uint8Array([1,2]).buffer,mime:'video/webm'}});assert.equal((await complete.result).size,2);complete.cancel();assert.equal(worker.terminated,1);assert.equal(worker.onmessage,null);
 const cancelled=ctx.CZExportJobs.create(new Blob(),options,()=>{},factory),active=workers.at(-1),late=active.onmessage;cancelled.cancel();late({data:{type:'done',buffer:new Uint8Array([1]).buffer,mime:'video/webm'}});assert.equal(await cancelled.result,null);assert.equal(active.terminated,1);
 const bad=ctx.CZExportJobs.create(new Blob(),options,()=>{},factory);workers.at(-1).onmessage({data:{type:'done',buffer:new ArrayBuffer(0),mime:'video/webm'}});await assert.rejects(bad.result);assert.equal(workers.at(-1).terminated,1);
 const failed=ctx.CZExportJobs.create(new Blob(),options,()=>{},()=>({postMessage(){throw Error('cannot post');},terminate(){}}));await assert.rejects(failed.result,/cannot post/);
});
