// Only generated fixtures, old extension ZIPs and optionally merged local branches.
import {rm,readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await rm(path.join(root,'.test-build'),{recursive:true,force:true});
const {version}=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
for(const entry of await readdir(path.join(root,'artifacts'),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
 if(entry.isFile() && /^CZ-Control-Room-v.*\.zip$/.test(entry.name) && entry.name!==`CZ-Control-Room-v${version}.zip`){await rm(path.join(root,'artifacts',entry.name));console.log('Removed old generated ZIP:',entry.name);}
}
if(process.argv.includes('--branches')){
 const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(result.error)throw result.error;if(result.status!==0)throw Error(result.stderr);return result.stdout.trim();};
 const current=git(['symbolic-ref','--short','HEAD']);
 const merged=git(['for-each-ref','--merged=refs/heads/main','--format=%(refname:short)','refs/heads']).split('\n').filter(Boolean);
 for(const branch of merged)if(branch!=='main' && branch!=='release' && branch!==current){git(['branch','-d','--',branch]);console.log('Removed merged local branch:',branch);}
}
console.log('Cleaned generated files. Kept dist, .backup, source, dependencies and unmerged branches.');
