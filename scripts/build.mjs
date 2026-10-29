import {build} from 'esbuild';
import {cp,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const runtime=JSON.parse(await readFile(path.join(root,'config/runtime.json'),'utf8'));
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const written=new Set();
async function compile(relative){
  if(relative.endsWith('.d.ts') || relative.includes('/contracts/'))return;
  const output=relative.replace(/\.ts$/,'.js');
  if(written.has(output))throw Error(`Duplicate build output: ${output}`);written.add(output);
  await mkdir(path.dirname(path.join(out,output)),{recursive:true});
  if(/\.[cm]?[jt]s$/.test(relative) && !relative.startsWith('src/vendor/')){
    await build({absWorkingDir:root,entryPoints:[relative],outfile:path.join(out,output),bundle:true,
      format:relative.endsWith('recording-export-worker.js')?'esm':'iife',
      external:relative.endsWith('recording-export-worker.js')?['../vendor/mediabunny/*']:[],
      target:'chrome119',platform:'browser',charset:'utf8',legalComments:'eof',sourcemap:false,logLevel:'warning'});
  }else if(relative==='src/viewer/viewer.html'||relative==='src/popup/popup.html'){
    const kind=relative.includes('/viewer/')?'viewer':'popup',marker=`<!-- ${kind}-scripts -->`;
    let html=await readFile(path.join(root,relative),'utf8');if(!html.includes(marker))throw Error(`Missing runtime marker in ${relative}`);
    const scripts=runtime[kind].map(file=>`<script src="${path.posix.relative(path.posix.dirname(relative),file)}"></script>`).join('\n  ');
    await writeFile(path.join(out,relative),html.replace(marker,scripts));
  }else await cp(path.join(root,relative),path.join(out,relative));
}
async function walk(relative){
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
    const file=path.posix.join(relative,entry.name);if(entry.isDirectory())await walk(file);else await compile(file);
  }
}
for(const directory of ['src','assets','docs'])await walk(directory);
for(const file of ['README.md','CHANGELOG.md'])await compile(file);
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
manifest.content_scripts[0].js=runtime.frame;
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const scripts of Object.values(runtime))for(const file of scripts)if(!written.has(file))throw Error(`Missing runtime script: ${file}`);
console.log(`Built unpacked extension: ${out}`);
