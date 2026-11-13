/* VIORA Investor Data Room — authenticated admin/exec workspace.
   Investor-facing material is private by default. Firebase RTDB/Storage rules must enforce
   the same admin/exec authorization; client-side role checks are not a security boundary. */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getState = () => window.state || {};
const CATEGORIES = [
  {id:'company',title:'Company & strategy',hint:'Legal identity, positioning, business model and market focus.',fields:[['legalName','Registered legal name'],['registrationNumber','Company registration number'],['jurisdiction','Country / jurisdiction'],['registeredAddress','Registered office address'],['website','Website'],['positioning','Company description / positioning'],['businessModel','Business model'],['targetMarkets','Target markets and customer segments'],['mission','Mission and long-term vision']]},
  {id:'ownership',title:'Ownership & governance',hint:'Shareholding and decision-making. Keep personal identity documents out of this room unless a verified investor process requires them.',fields:[['founders','Founders and roles'],['shareholding','Shareholding table / cap table summary'],['directors','Directors and governance'],['options','Options, convertibles and other promised equity'],['relatedParties','Related-party interests and conflicts']]},
  {id:'product',title:'Product & technology',hint:'Explain what is live today, what is in pilot, and what is only planned.',fields:[['productOverview','Product overview'],['liveModules','Live modules and portals'],['architecture','Architecture and integrations'],['roadmap','Product roadmap'],['security','Security controls and evidence'],['reliability','Availability, backups, recovery and monitoring'],['ipOwnership','Source-code and IP ownership summary']]},
  {id:'traction',title:'Customers & traction',hint:'Use permissioned references and measurable evidence only. Redact personal and confidential customer data.',fields:[['activeCustomers','Active paying customers'],['customerSegments','Customer segments and industries'],['caseStudies','Customer case studies and outcomes'],['retention','Retention, renewals and churn'],['pipeline','Qualified pipeline and sales stages'],['partnerships','Commercial partnerships']]},
  {id:'financials',title:'Financials & unit economics',hint:'Enter actual historical numbers separately from estimates. State accounting basis and reporting period.',fields:[['revenueHistory','Revenue history by month'],['mrr','Current recurring revenue / MRR'],['implementationRevenue','Implementation and services revenue'],['costs','Operating costs and cost of service'],['grossMargin','Gross margin and delivery economics'],['cashRunway','Cash position and runway'],['forecast','Forecast assumptions and scenarios'],['debts','Loans, liabilities and commitments']]},
  {id:'market',title:'Market & competition',hint:'Cite sources and disclose assumptions. Avoid unsupported market-size claims.',fields:[['marketProblem','Problem and customer pain'],['marketSize','Market sizing with sources and method'],['competitors','Competitors and alternatives'],['differentiation','Differentiation and defensibility'],['goToMarket','Go-to-market strategy'],['pricing','Pricing and packaging']]},
  {id:'legal',title:'Legal, contracts & IP',hint:'Upload executed agreements only where authorised. Mark drafts clearly.',fields:[['incorporation','Incorporation and statutory records'],['shareholderAgreements','Shareholder / founder agreements'],['customerContracts','Customer agreements and terms'],['employmentContracts','Employment and contractor agreements'],['trademarks','Trademark filings and registrations'],['copyright','Copyright and software records'],['patents','Patent / invention status (if applicable)'],['openSource','Open-source inventory and licence review']]},
  {id:'compliance',title:'Privacy, tax & compliance',hint:'Do not describe a draft policy as certification or regulatory approval.',fields:[['dataProtection','Data protection roles and registrations'],['privacyPolicies','Privacy notices, DPAs and retention'],['tax','Tax registration, filings and eTIMS status'],['licenses','Sector licences and regulatory obligations'],['securityReviews','Security reviews, penetration tests and remediation'],['insurance','Insurance and risk coverage']]},
  {id:'fundraise',title:'Fundraising & investor terms',hint:'Do not publish an unapproved valuation or offer. Keep negotiation documents restricted.',fields:[['capitalNeed','Capital sought and currency'],['useOfFunds','Use of funds and milestones'],['instrument','Proposed instrument / round structure'],['valuation','Valuation rationale (if approved)'],['existingInvestors','Existing investors and instruments'],['milestones','Milestones expected from funding']]},
  {id:'risks',title:'Risks & diligence',hint:'A credible data room includes material risks and mitigation plans, not just promotional material.',fields:[['keyRisks','Material commercial, technical and legal risks'],['dependencies','Key suppliers, platforms and dependencies'],['concentration','Customer / supplier concentration'],['mitigations','Mitigation plans and accountable owners'],['openIssues','Outstanding diligence questions']]
  }
];
const STATUS = ['Draft','Needs evidence','Under review','Verified','Not applicable'];
let dbApi, storageApi, roomData={}, filesData={}, loaded=false, roomUnsubscribe=null;

function authorized(){
  const s=getState(), u=window.VioraAuth?.currentUser || s.operator || s.user || s.currentUser;
  const role=String(s.operator?.role || s.role || s.user?.role || s.currentUser?.role || u?.role || '').toLowerCase();
  return !!u && (['admin','exec'].includes(role) || u.isAdmin===true || u.isExec===true);
}
async function ensureFirebase(){
  const [dbMod,appMod,storageMod]=await Promise.all([
    import('firebase/database'),import('firebase/app'),import('firebase/storage')
  ]);
  const app=appMod.getApp();
  dbApi={...dbMod,db:window.VioraDb};
  storageApi={...storageMod,storage:storageMod.getStorage(app)};
  if(!dbApi.db) throw new Error('The main Firebase database is not exposed in this session.');
}
const roomPath=()=>'viora_data/investorDataRoom';
const roomRef=()=>dbApi.ref(dbApi.db,roomPath());
function statusLabel(v){return STATUS.includes(v)?v:'Draft';}
function safeFileName(s){return String(s||'file').replace(/[^a-z0-9._-]/gi,'_').slice(0,100);}
function downloadBlob(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function renderShell(host){
  const sections=CATEGORIES.map(c=>`
    <section class="idr-category" data-category="${c.id}">
      <header><div><span class="idr-kicker">${esc(c.id.toUpperCase())}</span><h3>${esc(c.title)}</h3><p>${esc(c.hint)}</p></div><span class="idr-count" id="idr-count-${c.id}">0 / ${c.fields.length}</span></header>
      <div class="idr-fields">${c.fields.map(([key,label])=>`<label class="idr-field"><span>${esc(label)}</span><textarea rows="2" data-field="${key}" placeholder="Add accurate, evidence-backed information…"></textarea></label>`).join('')}
      <label class="idr-status">Evidence status<select data-status="${c.id}">${STATUS.map(x=>'<option>'+x+'</option>').join('')}</select></label>
      </div>
    </section>`).join('');
  host.innerHTML=`
  <div class="idr-wrap">
    <header class="idr-hero"><div><div class="idr-eyebrow">ENGINEERING COMMAND / INVESTOR READINESS</div><h1>Investor Data Room</h1><p>A controlled workspace for preparing, reviewing, downloading and sharing VIORA's investor due-diligence materials.</p></div><div class="idr-actions"><span class="idr-state" id="idr-sync">Connecting…</span><button class="idr-btn" id="idr-export"><i class="fa-solid fa-file-arrow-down"></i> Download data room</button><button class="idr-btn idr-primary" id="idr-save"><i class="fa-solid fa-floppy-disk"></i> Save changes</button></div></header>
    <div class="idr-notice"><i class="fa-solid fa-shield-halved"></i><div><strong>Private by default.</strong> Only authorised admin/exec accounts should access this area. Do not upload passwords, API keys, bank login details, customer personal data, or unredacted identity documents. A shareable pack must be reviewed and redacted first.</div></div>
    <div class="idr-summary"><article><span>Sections</span><b id="idr-sections">10</b></article><article><span>Evidence verified</span><b id="idr-verified">0%</b></article><article><span>Documents</span><b id="idr-doc-count">0</b></article><article><span>Last saved</span><b id="idr-last-saved">Not yet</b></article></div>
    <section class="idr-upload"><div><span class="idr-kicker">SUPPORTING EVIDENCE</span><h2>Upload documents</h2><p>Upload pitch decks, registration records, financial statements, contracts, IP evidence and technical reports. Files are stored in Firebase Storage; metadata is recorded in Realtime Database.</p></div><div class="idr-upload-controls"><select id="idr-file-category">${CATEGORIES.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('')}</select><input type="file" id="idr-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp" /><button class="idr-btn idr-primary" id="idr-upload"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button></div><div class="idr-files" id="idr-files"><p class="idr-muted">No documents uploaded yet.</p></div></section>
    <div class="idr-section-head"><div><span class="idr-kicker">DUE-DILIGENCE CHECKLIST</span><h2>Investor information</h2><p>Complete each section, attach supporting evidence and change its status only when the status is justified.</p></div><button class="idr-btn" id="idr-print"><i class="fa-solid fa-print"></i> Review / print</button></div>
    <div class="idr-grid">${sections}</div>
    <footer class="idr-foot">Evidence discipline: “Verified” is an internal review status, not an independent audit or legal certification. Investor access links are not public; share only approved, redacted copies.</footer>
  </div>`;
  host.querySelector('#idr-save').addEventListener('click',()=>saveRoom().catch(e=>alert(e.message||'Save failed.')));
  host.querySelector('#idr-export').addEventListener('click',exportRoom);
  host.querySelector('#idr-upload').addEventListener('click',()=>uploadFile().catch(e=>alert(e.message||'Upload failed.')));
  host.querySelector('#idr-print').addEventListener('click',()=>window.print());
}
function paintRoom(){
  const host=document.getElementById('engineeringCommandRoot');if(!host)return;
  for(const c of CATEGORIES){
    for(const [key] of c.fields){const el=host.querySelector('[data-field="'+key+'"]');if(el)el.value=roomData.fields?.[key]||'';}
    const status=host.querySelector('[data-status="'+c.id+'"]');if(status)status.value=statusLabel(roomData.status?.[c.id]);
    const count=c.fields.filter(([key])=>String(roomData.fields?.[key]||'').trim()).length;
    const counter=host.querySelector('#idr-count-'+c.id);if(counter)counter.textContent=count+' / '+c.fields.length;
  }
  const all=CATEGORIES.reduce((n,c)=>n+c.fields.length,0);
  const verified=CATEGORIES.filter(c=>statusLabel(roomData.status?.[c.id])==='Verified').length;
  const el=id=>host.querySelector('#'+id);
  if(el('idr-verified'))el('idr-verified').textContent=Math.round(verified/CATEGORIES.length*100)+'%';
  if(el('idr-doc-count'))el('idr-doc-count').textContent=String(Object.keys(filesData).length);
  if(el('idr-last-saved'))el('idr-last-saved').textContent=roomData.updatedAt?new Date(roomData.updatedAt).toLocaleString():'Not yet';
  renderFiles();
}
function renderFiles(){
  const host=document.getElementById('idr-files');if(!host)return;
  const files=Object.entries(filesData||{});
  host.innerHTML=files.length?files.map(([id,f])=>`<div class="idr-file"><i class="fa-solid fa-file-lines"></i><div><strong>${esc(f.name)}</strong><small>${esc(CATEGORIES.find(c=>c.id===f.category)?.title||'Other')} · ${esc(f.sizeLabel||'')} · ${esc(f.uploadedAt?new Date(f.uploadedAt).toLocaleDateString():'')}</small></div><div class="idr-file-actions"><button data-download="${esc(id)}" title="Download"><i class="fa-solid fa-download"></i></button><button data-share="${esc(id)}" title="Share"><i class="fa-solid fa-share-nodes"></i></button><button data-delete="${esc(id)}" title="Delete"><i class="fa-solid fa-trash"></i></button></div></div>`).join(''):'<p class="idr-muted">No documents uploaded yet.</p>';
  host.querySelectorAll('[data-download]').forEach(b=>b.addEventListener('click',()=>downloadFile(b.dataset.download).catch(e=>alert(e.message||'Download failed.'))));
  host.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',()=>shareFile(b.dataset.share).catch(e=>alert(e.message||'Share failed.'))));
  host.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteFile(b.dataset.delete).catch(e=>alert(e.message||'Delete failed.'))));
}
async function loadRoom(){
  await ensureFirebase();
  const snap=await dbApi.get(roomRef());
  const val=snap.exists()?snap.val():{};
  roomData=val.profile||{};filesData=val.files||{};
  loaded=true;paintRoom();
  const sync=document.getElementById('idr-sync');if(sync)sync.textContent='Live data connected';
  dbApi.onValue(roomRef(),s=>{const v=s.val()||{};roomData=v.profile||{};filesData=v.files||{};paintRoom();});
}
async function saveRoom(){
  if(!authorized())throw new Error('Admin or exec access is required.');
  const host=document.getElementById('engineeringCommandRoot');if(!host)return;
  const fields={...(roomData.fields||{})},status={...(roomData.status||{})};
  for(const c of CATEGORIES){for(const [key] of c.fields)fields[key]=host.querySelector('[data-field="'+key+'"]')?.value?.trim()||'';status[c.id]=host.querySelector('[data-status="'+c.id+'"]')?.value||'Draft';}
  const user=window.VioraAuth.currentUser;
  const profile={fields,status,updatedAt:new Date().toISOString(),updatedBy:user.uid};
  await dbApi.set(dbApi.ref(dbApi.db,roomPath()+'/profile'),profile);
  roomData=profile;paintRoom();
  const sync=host.querySelector('#idr-sync');if(sync)sync.textContent='Saved securely';
}
async function uploadFile(){
  if(!authorized())throw new Error('Admin or exec access is required.');
  const host=document.getElementById('engineeringCommandRoot'),input=host?.querySelector('#idr-file'),file=input?.files?.[0];
  if(!file)throw new Error('Choose a document first.');
  if(file.size>5*1024*1024)throw new Error('Maximum file size is 5 MB.');
  await ensureFirebase();
  const user=window.VioraAuth.currentUser,id=dbApi.push(dbApi.ref(dbApi.db,roomPath()+'/files')).key;
  const path='investor-data-room/'+user.uid+'/'+id+'_'+safeFileName(file.name);
  const objectRef=storageApi.ref(storageApi.storage,path);
  await storageApi.uploadBytes(objectRef,file,{contentType:file.type||'application/octet-stream',customMetadata:{uploadedBy:user.uid,category:host.querySelector('#idr-file-category').value}});
  const meta={name:file.name,path,category:host.querySelector('#idr-file-category').value,size:file.size,sizeLabel:(file.size/1024/1024).toFixed(2)+' MB',contentType:file.type||'application/octet-stream',uploadedAt:new Date().toISOString(),uploadedBy:user.uid};
  await dbApi.set(dbApi.ref(dbApi.db,roomPath()+'/files/'+id),meta);
  input.value='';filesData[id]=meta;paintRoom();
}
async function downloadFile(id){
  const f=filesData[id];if(!f)throw new Error('File record not found.');
  await ensureFirebase();const url=await storageApi.getDownloadURL(storageApi.ref(storageApi.storage,f.path));
  const response=await fetch(url);if(!response.ok)throw new Error('Document download failed.');
  downloadBlob(f.name,await response.blob());
}
async function shareFile(id){
  const f=filesData[id];if(!f)throw new Error('File record not found.');
  await ensureFirebase();const url=await storageApi.getDownloadURL(storageApi.ref(storageApi.storage,f.path));
  const response=await fetch(url);if(!response.ok)throw new Error('Document could not be prepared for sharing.');
  const blob=await response.blob(),file=new File([blob],f.name,{type:f.contentType||blob.type});
  if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'VIORA investor document',text:'Approved VIORA investor data-room document. Share only with the intended recipient.',files:[file]});}
  else {downloadBlob(f.name,blob);alert('File downloaded. Attach it manually to a secure message to your intended recipient.');}
}
async function deleteFile(id){
  if(!authorized()||!confirm('Permanently delete this uploaded document?'))return;
  await ensureFirebase();const f=filesData[id];if(!f)return;
  await storageApi.deleteObject(storageApi.ref(storageApi.storage,f.path));
  await dbApi.remove(dbApi.ref(dbApi.db,roomPath()+'/files/'+id));
  delete filesData[id];paintRoom();
}
function exportRoom(){
  const data={title:'VIORA Investor Data Room',exportedAt:new Date().toISOString(),warning:'Internal working pack. Review every item, remove confidential information and verify evidence before sharing with investors.',profile:roomData,documents:Object.values(filesData).map(f=>({...f,downloadUrl:undefined}))};
  downloadBlob('VIORA-investor-data-room-'+new Date().toISOString().slice(0,10)+'.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
}
function installSidebar(){
  const group=document.querySelector('.sb-group-items[data-group-items="engineering-command"]');
  if(!group||group.querySelector('[data-investor-room-link]'))return;
  const link=document.createElement('a');link.href='#investor-data-room';link.className='sb-engineering-sub-link';link.dataset.investorRoomLink='1';link.setAttribute('role','button');link.innerHTML='<i class="fa-solid fa-briefcase" style="color:#34d399"></i> Investor Data Room';
  group.appendChild(link);
  link.addEventListener('click',e=>{e.preventDefault();window.__vioraInvestorRoomMode=true;window.__vioraInvestorRoomNavInProgress=true;document.querySelector('#sidebarNav [data-tab="engineering-command"]')?.click();window.__vioraInvestorRoomNavInProgress=false;window.renderEngineeringCommandCentre?.();});
}
export async function renderInvestorDataRoom(){
  const host=document.getElementById('engineeringCommandRoot');if(!host)return;
  if(!authorized()){
    host.innerHTML='<div class="idr-denied"><i class="fa-solid fa-lock"></i><h2>Restricted area</h2><p>Only authorised admin or exec accounts can open the Investor Data Room.</p></div>';return;
  }
  renderShell(host);
  try{await loadRoom();}catch(error){const sync=host.querySelector('#idr-sync');if(sync)sync.textContent='Database access blocked';host.insertAdjacentHTML('beforeend','<div class="idr-error"><strong>Could not load the data room.</strong><p>'+esc(error.message||'Firebase access denied')+'</p><small>Realtime Database and Storage rules must explicitly restrict investorDataRoom records and investor-data-room files to verified admin/exec identities. No public read or write rule should be added.</small></div>');}
}
function boot(){
  installSidebar();
  document.addEventListener('click',e=>{
    const link=e.target.closest('#sidebarNav [data-tab="engineering-command"]');
    if(link && !window.__vioraInvestorRoomNavInProgress && !e.target.closest('[data-investor-room-link]'))window.__vioraInvestorRoomMode=false;
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
