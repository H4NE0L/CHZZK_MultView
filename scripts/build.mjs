import {build} from 'esbuild';
import {cp,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist'),testOut=path.join(root,'.test-build');
const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const runtime=await json('config/runtime.json'),styles=await json('config/styles.json'),testModules=await json('config/testing.json');
const manifest=await json('manifest.json'),dynamicEntries=await json('config/entries.json');
const pages={'src/viewer/viewer.html':'viewer','src/popup/popup.html':'popup','src/settings/backup.html':'backup'};
const styleInputs=new Set(Object.values(styles).flat());
const files=[];
async function walk(relative){for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){const file=path.posix.join(relative,entry.name);if(entry.isDirectory())await walk(file);else files.push(file);}}
for(const directory of ['src','assets','docs'])await walk(directory);
const sources=new Map();
for(const file of files){
  if(!/\.[cm]?[jt]s$/.test(file)||file.endsWith('.d.ts')||file.startsWith('src/vendor/'))continue;
  const output=file.replace(/\.ts$/,'.js');if(sources.has(output))throw Error(`Duplicate script output: ${output}`);sources.set(output,file);
}
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await rm(testOut,{recursive:true,force:true});
const written=new Set(),roots=new Set([...Object.values(runtime).flat(),manifest.background.service_worker,...manifest.content_scripts.flatMap(script=>script.js||[]),...dynamicEntries]);
async function write(relative,data){await mkdir(path.dirname(path.join(out,relative)),{recursive:true});await writeFile(path.join(out,relative),data);written.add(relative);}
// CSS fragments retain their original cascade order and stay out of the package.
for(const [output,inputs] of Object.entries(styles))await write(output,(await Promise.all(inputs.map(input=>readFile(path.join(root,input),'utf8')))).join(''));
for(const relative of files){
  if(sources.has(relative.replace(/\.ts$/,'.js'))||relative.endsWith('.d.ts')||styleInputs.has(relative))continue;
  if(relative.endsWith('.html')){
    const kind=pages[relative],marker=`<!-- ${kind}-scripts -->`;
    let html=await readFile(path.join(root,relative),'utf8');
    if(kind){
      if(!html.includes(marker))throw Error(`Missing runtime marker in ${relative}`);
      const scripts=runtime[kind].map(file=>`<script src="${path.posix.relative(path.posix.dirname(relative),file)}"></script>`).join('\n  ');
      html=html.replace(marker,scripts);
    }
    for(const [,file] of html.matchAll(/<script src="([^"]+)"/g))roots.add(path.posix.normalize(path.posix.join(path.posix.dirname(relative),file)));
    await write(relative,html);
  }else{await mkdir(path.dirname(path.join(out,relative)),{recursive:true});await cp(path.join(root,relative),path.join(out,relative));written.add(relative);}
}
const options={absWorkingDir:root,bundle:true,target:'chrome119',platform:'browser',charset:'utf8',legalComments:'eof',sourcemap:false,logLevel:'warning'};
// importScripts dependencies remain classic scripts; ES imports are bundled.
for(const output of roots){
  if(written.has(output))continue;
  const source=sources.get(output);if(!source)throw Error(`Missing runtime entry: ${output}`);
  const worker=output.endsWith('recording-export-worker.js');
  await build({...options,entryPoints:[source],outfile:path.join(out,output),format:worker?'esm':'iife',external:worker?['../vendor/mediabunny/*']:[]});written.add(output);
  const script=await readFile(path.join(out,output),'utf8');
  for(const [,args] of script.matchAll(/\bimportScripts\(([^)]*)\)/g)){
    const refs=[...args.matchAll(/["']([^"']+)["']/g)];
    if(args.replace(/["'][^"']+["']/g,'').replace(/[\s,]/g,''))throw Error(`Non-static importScripts in ${output}`);
    for(const [,file] of refs)roots.add(path.posix.normalize(path.posix.join(path.posix.dirname(output),file)));
  }
}
for(const file of ['README.md','CHANGELOG.md'])await write(file,await readFile(path.join(root,file)));
manifest.content_scripts[0].js=runtime.frame;
await write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
// Unit fixtures get module exports in a separate directory, never global test APIs in dist.
for(const output of Object.keys(testModules)){
  const source=sources.get(output);if(!source)throw Error(`Missing test module: ${output}`);
  await build({...options,entryPoints:[source],outfile:path.join(testOut,output),format:'iife',globalName:'__CZTestModule'});
}
console.log(`Built unpacked extension: ${out} (${roots.size} script entries; test modules isolated)`);
