// Publish a compiled-only installation branch using the existing Git transport.
import {spawnSync} from 'node:child_process';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dry=process.argv.includes('--dry-run'),branch='release';
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:root,encoding:'utf8',...options});if(result.error)throw result.error;if(result.status!==0)throw Error(result.stderr||`${command} failed (${result.status})`);return result.stdout?.trim()||'';}
const head=run('git',['rev-parse','HEAD']);
if(run('git',['status','--porcelain','--untracked-files=no']))throw Error('Commit tracked source changes before publishing.');
if(!dry){
 const current=run('git',['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
 if(current!==head){console.log('Skip publication: source is no longer origin/main.');process.exit(0);}
}
run(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
run(process.execPath,['scripts/package.mjs'],{stdio:'inherit'});
const manifest=JSON.parse(await readFile(path.join(root,'dist/manifest.json'),'utf8'));
const zipName=`CZ-Control-Room-v${manifest.version}.zip`;
const temp=await mkdtemp(path.join(os.tmpdir(),'cz-release-index-'));
try{
 const env={...process.env,GIT_INDEX_FILE:path.join(temp,'index')};
 const git=(args,options={})=>run('git',args,{env,...options});
 git(['read-tree','--empty']);
 const entries=[];
 async function add(file,bytes){const object=git(['hash-object','-w','--stdin'],{input:bytes});entries.push(`100644 ${object}\t${file}\n`);}
 async function walk(relative=''){for(const item of await readdir(path.join(root,'dist',relative),{withFileTypes:true})){const file=path.posix.join(relative,item.name);if(item.isDirectory())await walk(file);else await add(file,await readFile(path.join(root,'dist',file)));}}
 await walk();await add(zipName,await readFile(path.join(root,'artifacts',zipName)));
 await add('SOURCE_COMMIT',Buffer.from(head+'\n'));
 git(['update-index','--index-info'],{input:entries.join('')});const tree=git(['write-tree']);
 if(dry){console.log(`Validated installation tree ${tree}: ${entries.length} files, source ${head}`);process.exitCode=0;}
 else{
  const existing=run('git',['ls-remote','origin',`refs/heads/${branch}`]).split(/\s+/)[0];
  if(existing)run('git',['fetch','origin',`refs/heads/${branch}`]);
  if(existing && git(['rev-parse',existing+'^{tree}'])===tree){console.log('Installation branch already matches this source commit.');}
  else{
  const parents=existing?['-p',existing]:[];
  const commit=git(['-c','user.name=CHZZK release','-c','user.email=release@users.noreply.github.com','commit-tree',tree,...parents],{input:`Install v${manifest.version} from ${head}\n`});
  if(run('git',['ls-remote','origin','refs/heads/main']).split(/\s+/)[0]!==head)throw Error('origin/main changed during build; rerun publication.');
  const lease=`--force-with-lease=refs/heads/${branch}:${existing||''}`;
  run('git',['push',lease,'origin',`${commit}:refs/heads/${branch}`],{stdio:'inherit'});
  console.log(`Published ${branch}: ${commit}\nhttps://github.com/H4NE0L/CHZZK_MultView/raw/refs/heads/release/${zipName}`);
  }
 }
}finally{await rm(temp,{recursive:true,force:true});}
