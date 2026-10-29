const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('layout coalesces resize work, reads current layout and cancels pending frames at disposal',()=>{
 const frames=new Map();let id=0,reads=0;
 const context=vm.createContext({console,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 for(const file of ['src/shared/runtime/scope.js','src/viewer/layout.js'])vm.runInContext(require('./support/modules.cjs').read(path.join(process.env.CZ_TEST_ROOT || path.resolve(__dirname,'../dist'),file),'utf8'),context);
 const scope=new context.CZRuntime.ResourceScope(),style={};
 const grid={style,getBoundingClientRect(){reads++;return {width:800,height:600};}};
 const state={layout:'grid',chatSide:'left',channels:[{uid:'a'}]};
 const layout=context.CZLayout.create({get state(){return state;},videoGrid:grid,ui:null,scope,tileMap:new Map()});
 for(let i=0;i<100;i++)layout.resizeFixedAspectGrid();assert.equal(frames.size,1);assert.equal(scope.size,1);
 state.layout='main-sub';[...frames.values()][0](0);assert.equal(reads,1);assert.equal(scope.size,0);
 assert.equal(style.gridTemplateRows.startsWith('repeat(3,'),true,'reads current layout rather than stale requested layout');
 layout.resizeFixedAspectGrid();scope.dispose();assert.equal(frames.size,0);assert.equal(scope.size,0);
 layout.resizeFixedAspectGrid();assert.equal(frames.size,0);
});
