import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Build once, then run sequentially so video encoders do not compete for resources.
const commands=[
 [process.execPath,['node_modules/typescript/bin/tsc','--noEmit']],
 [process.execPath,['scripts/build.mjs']],
 ...['unit','browser','backup','media','chat'].map(suite=>[process.execPath,['scripts/test.mjs',suite]])
];
for(const [command,args] of commands){
 const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log('PASS: complete automated verification (live logged-in Chrome verification remains separate).');
