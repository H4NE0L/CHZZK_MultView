import {zipSync} from 'fflate';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const manifest=JSON.parse(await readFile(path.join(dist,'manifest.json'),'utf8'));
const output=path.resolve(root,process.argv[2]||`artifacts/CZ-Control-Room-v${manifest.version}-refactor.zip`);
if(output===dist||output.startsWith(dist+path.sep))throw Error('Package output must be outside dist/.');
const files={};
async function walk(dir){for(const entry of (await readdir(path.join(dist,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())await walk(file);else{if(/\.(?:ts|map|zip)$/.test(file)||file.includes('node_modules'))throw Error(`Development file in package: ${file}`);files[file]=[await readFile(path.join(dist,file)),{mtime:new Date('2020-01-01T00:00:00Z')}];}}}
await walk('');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,zipSync(files,{level:6}));console.log(`${output} (${Object.keys(files).length} files)`);
