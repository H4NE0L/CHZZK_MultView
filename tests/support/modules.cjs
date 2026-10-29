// Compatibility names exist only in isolated test fixtures, never production bundles.
const fs=require('node:fs'),path=require('node:path');
const repository=path.resolve(__dirname,'../..'),aliases=require('../../config/testing.json');
exports.read=(file,encoding)=>{
 const root=process.env.CZ_TEST_ROOT||path.join(repository,'dist');
 const key=path.isAbsolute(file)?path.relative(root,file).split(path.sep).join('/'):file.split(path.sep).join('/');
 const alias=aliases[key];if(!alias)return fs.readFileSync(file,encoding);
 const source=fs.readFileSync(path.join(repository,'.test-build',key),'utf8');
 const result=source+`\nglobalThis[${JSON.stringify(alias[0])}]=__CZTestModule${alias[1]?`[${JSON.stringify(alias[1])}]`:''};__CZTestModule=undefined;\n`;
 return encoding?result:Buffer.from(result);
};
