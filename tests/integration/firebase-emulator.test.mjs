import test from 'node:test';
import assert from 'node:assert/strict';

const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const dbHost=process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const apiKey=process.env.FIREBASE_API_KEY || 'fake-api-key';
const enabled=!!(authHost&&dbHost);

test('Firebase Auth emulator accepts a test sign-up and returns an ID token',{skip:!enabled&&'Set FIREBASE_AUTH_EMULATOR_HOST and FIREBASE_DATABASE_EMULATOR_HOST to run emulator integration tests'},async()=>{
 const email='ci-'+Date.now()+'@example.test',password='VioraTest!123456';
 const response=await fetch('http://'+authHost+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key='+apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const responseText=await response.text();
 assert.equal(response.status,200,responseText);
 const result=JSON.parse(responseText);
 assert.ok(result.localId);assert.ok(result.idToken);
 const signIn=await fetch('http://'+authHost+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 assert.equal(signIn.status,200,await signIn.clone().text());
 const signed=await signIn.json();assert.equal(signed.localId,result.localId);assert.ok(signed.idToken);
});
test('Firebase Realtime Database emulator isolates tenant-scoped paths',{skip:!enabled&&'Set Firebase emulator hosts and a CI auth token to run tenant tests'},async()=>{
 const token=process.env.FIREBASE_TEST_ID_TOKEN;
 if(!token) return assert.fail('FIREBASE_TEST_ID_TOKEN is required for authenticated RTDB isolation tests');
 const base='http://'+dbHost;
 const tenantA='ci-tenant-a-'+Date.now(),tenantB='ci-tenant-b-'+Date.now();
 const write=await fetch(base+'/viora_data/tenants/'+tenantA+'/isolation-probe.json?auth='+encodeURIComponent(token),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({owner:tenantA,probe:true})});
 assert.ok(write.ok,'tenant A fixture write failed');
 const readB=await fetch(base+'/viora_data/tenants/'+tenantA+'/isolation-probe.json?auth='+encodeURIComponent(process.env.FIREBASE_TENANT_B_ID_TOKEN||'invalid'));
 assert.ok([401,403].includes(readB.status),'Tenant B must not read Tenant A data');
 const writeB=await fetch(base+'/viora_data/tenants/'+tenantA+'/isolation-probe.json?auth='+encodeURIComponent(process.env.FIREBASE_TENANT_B_ID_TOKEN||'invalid'),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({owner:tenantB,probe:true})});
 assert.ok([401,403].includes(writeB.status),'Tenant B must not write Tenant A data');
});

test('Firebase authorization rules deny a non-privileged principal on a protected probe path',{skip:!(enabled&&process.env.FIREBASE_AUTHZ_PROBE_PATH&&process.env.FIREBASE_ADMIN_ID_TOKEN&&process.env.FIREBASE_NONADMIN_ID_TOKEN)&&'Configure an emulator protected path and separate admin/non-admin test identities'},async()=>{
 const path=process.env.FIREBASE_AUTHZ_PROBE_PATH.split('/').filter(Boolean).join('/');
 const base='http://'+dbHost+'/'+path+'/ci-authz-'+Date.now()+'.json';
 const adminWrite=await fetch(base+'?auth='+encodeURIComponent(process.env.FIREBASE_ADMIN_ID_TOKEN),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({probe:true})});
 assert.ok(adminWrite.ok,'Privileged identity should be authorized on the configured test path');
 const denied=await fetch(base+'?auth='+encodeURIComponent(process.env.FIREBASE_NONADMIN_ID_TOKEN),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({probe:'escalation'})});
 assert.ok([401,403].includes(denied.status),'Non-privileged identity must not write to protected path');
});
