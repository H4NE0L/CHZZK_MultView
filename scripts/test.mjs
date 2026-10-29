import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
if(!existsSync(path.join(dist,'manifest.json')))throw Error('Run npm run build before testing.');
const mode=process.argv[2]||'unit';
const suites={browser:['browser-smoke.cjs','site-browser-smoke.cjs --chat-only'],chat:['chat-dom-browser.cjs','site-browser-smoke.cjs --chat-only','chat-source-time-browser.cjs','runtime-lifecycle-browser.cjs'],backup:['favorites-backup-browser.cjs','settings-backup-browser.cjs'],media:['screenshot-gallery-browser.cjs','recording-capture-browser.cjs','recording-export-browser.cjs']};
const commands=mode==='unit'?[['--test',...readdirSync(path.join(root,'tests')).filter(file=>file.endsWith('.test.cjs')).sort().map(file=>path.join(root,'tests',file))]]:suites[mode]?.map(command=>{const [file,...args]=command.split(' ');return [path.join(root,'tests',file),...args];});
if(!commands)throw Error(`Unknown test suite: ${mode}`);
for(const args of commands){const result=spawnSync(process.execPath,args,{cwd:dist,env:{...process.env,CZ_TEST_ROOT:dist},stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
