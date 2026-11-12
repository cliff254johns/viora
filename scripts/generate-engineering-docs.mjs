import fs from 'node:fs';
import path from 'node:path';
const roots=['web','workers','scripts'];
const files=[];
function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.name.startsWith('.')||['node_modules','dist','coverage'].includes(ent.name))continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())walk(full);else files.push(full.replaceAll('\\','/'));
  }
}
roots.forEach(walk);
const modules=files.filter(f=>/\.(?:m?js|ts)$/.test(f));
const inventory=modules.map(file=>{
  const source=fs.readFileSync(file,'utf8');
  return {
    file,bytes:Buffer.byteLength(source),
    imports:[...source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)].map(m=>m[2]),
    exports:[...source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]),
    workerRoutes:[...source.matchAll(/url\.pathname\s*===\s*['"]([^'"]+)/g)].map(m=>m[1])
  };
});
const docs='docs/generated';
fs.mkdirSync(docs,{recursive:true});
fs.writeFileSync(path.join(docs,'MODULE-INVENTORY.json'),JSON.stringify({generatedAt:new Date().toISOString(),moduleCount:inventory.length,modules:inventory},null,2)+'\n');
const lines=['# Generated module and API map','','Generated: '+new Date().toISOString(),'','Modules: '+inventory.length,'','## Modules'];
for(const item of inventory)lines.push('### '+item.file,'','- Size: '+item.bytes+' bytes','- Imports: '+(item.imports.join(', ')||'none detected'),'- Exports: '+(item.exports.join(', ')||'none detected'),'- Worker routes: '+(item.workerRoutes.join(', ')||'none detected'),'');
fs.writeFileSync(path.join(docs,'MODULE-AND-API-MAP.md'),lines.join('\n')+'\n');
console.log('Generated module inventory for '+inventory.length+' JS/TS files.');
