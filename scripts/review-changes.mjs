import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const base=process.env.GITHUB_BASE_REF||'main';
const changed=execFileSync('git',['diff','--name-only','origin/'+base+'...HEAD'],{encoding:'utf8'}).trim().split('\\n').filter(Boolean);
const risks=[];
for(const file of changed){if(!fs.existsSync(file))continue;const text=fs.readFileSync(file,'utf8');const findings=[];
if(/firebase-admin|serviceAccount|private_key/i.test(text)&&!file.includes('backup-firebase-rtdb'))findings.push('Review privileged credential handling.');
if(/tenant|orgs\\//i.test(text))findings.push('Review tenant ownership and negative cross-tenant authorization tests.');
if(/auth|permission|role|claims/i.test(file+' '+text))findings.push('Review authentication, role escalation and permission regression coverage.');
if(/payment|invoice|finance|amount|currency/i.test(file))findings.push('Add or update money rounding, duplicate submission and reconciliation tests.');
if(/innerHTML|insertAdjacentHTML/.test(text))findings.push('Review untrusted data escaping and DOM XSS exposure.');
if(/\.rules$|firebase.*rules/i.test(file))findings.push('Require explicit security review and emulator authorization tests.');
risks.push({file,bytes:Buffer.byteLength(text),findings});
}
const report={generatedAt:new Date().toISOString(),base,changedFiles:changed.length,mode:'deterministic read-only change triage; not an AI model and not a substitute for code review',review:risks};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/engineering-change-review.json',JSON.stringify(report,null,2)+'\\n');
console.log(JSON.stringify(report,null,2));
