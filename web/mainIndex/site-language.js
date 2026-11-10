/* VIORA in-place multilingual page translator backed by Cloudflare Workers AI.
   Original DOM strings are retained and restored when visitors switch languages. */
(()=>{
'use strict';
const LANGS=new Set(['en','sw','fr','es','de','pt','it','zh','ja','ar','hi','ru','nl','tr','ko']);
const state={base:(document.documentElement.lang||'en').split('-')[0].toLowerCase(),target:'en',running:false,applied:false,generation:0,pending:[],textOriginals:new Map(),attrOriginals:new Map(),cache:new Map(),observer:null};
const SKIP='script,style,noscript,svg,code,pre,textarea,input,select,option,iframe,canvas,[contenteditable="true"],#chat,#captions,#signBox,#viora-language-control,[data-no-translate]';
const ATTRS=['placeholder','title','aria-label','alt'];
const status=()=>document.getElementById('viora-language-status');
const setStatus=(value)=>{const el=status();if(el)el.textContent=value||'';};
const hash=(s)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
function restore(){
 for(const [node,original] of state.textOriginals){if(node.isConnected)node.nodeValue=original;}
 for(const [el,attrs] of state.attrOriginals){if(el.isConnected)for(const [name,value] of Object.entries(attrs))el.setAttribute(name,value);}
}
function skipped(el){return !el||!!el.closest(SKIP);}
function skippedAttribute(el){return !el||!!el.closest('script,style,noscript,svg,code,pre,iframe,#chat,#captions,#signBox,#viora-language-control,[data-no-translate]');}
function collect(root){
 const textNodes=[],elements=[];
 const scope=root&&root.nodeType===1?root:document.body;
 const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT,{acceptNode(node){
  const p=node.parentElement,t=node.nodeValue||'';
  if(!p||skipped(p)||!t.trim()||t.trim().length<2||/^([\d\s.,:%/+-]+)$/.test(t))return NodeFilter.FILTER_REJECT;
  return NodeFilter.FILTER_ACCEPT;
 }});
 let n;while((n=walker.nextNode()))textNodes.push(n);
 if(scope.nodeType===1)elements.push(scope);
 elements.push(...scope.querySelectorAll('*'));
 const attrTasks=[];
 for(const el of elements){
  if(skippedAttribute(el))continue;
  for(const name of ATTRS){const value=el.getAttribute(name);if(value&&value.trim().length>2)attrTasks.push({el,name,value});}
 }
 return {textNodes,attrTasks};
}
async function translateOne(text,target){
 const key=state.base+'|'+target+'|'+hash(text);
 if(state.cache.has(key))return state.cache.get(key);
 try{const saved=localStorage.getItem('viora_i18n_'+key);if(saved){state.cache.set(key,saved);return saved;}}catch(_){}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const res=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,sourceLang:state.base,targetLang:target}),signal:controller.signal,credentials:'same-origin'});
  if(!res.ok)throw Error('Translation request failed ('+res.status+')');
  const data=await res.json();const translated=String(data.translatedText||'').trim();
  if(!translated)throw Error('Translation returned empty text');
  state.cache.set(key,translated);try{localStorage.setItem('viora_i18n_'+key,translated);}catch(_){}
  return translated;
 }finally{clearTimeout(timer);}
}
async function translateTasks(tasks,target,generation){
 let cursor=0,done=0,failed=0;
 const total=tasks.length;
 const worker=async()=>{
  while(cursor<total){
   const task=tasks[cursor++];
   try{
    const original=task.type==='text'?task.node.nodeValue:task.value;
    const translated=await translateOne(original,target);
    if(generation===state.generation&&task.type==='text'&&task.node.isConnected)task.node.nodeValue=translated;
    else if(generation===state.generation&&task.type==='attr'&&task.el.isConnected)task.el.setAttribute(task.name,translated);
   }catch(error){failed++;console.warn('[VIORA language] translation skipped:',error.message);}
   done++;if(total>20&&done%10===0)setStatus('Translating '+done+'/'+total);
  }
 };
 await Promise.all(Array.from({length:Math.min(4,total)},worker));
 return {done,failed,total};
}
async function processRoot(root){
 if(!state.target||state.target===state.base)return;
 const {textNodes,attrTasks}=collect(root);
 const tasks=[];
 for(const node of textNodes){if(!state.textOriginals.has(node))state.textOriginals.set(node,node.nodeValue);const original=state.textOriginals.get(node);if(original&&original.trim())tasks.push({type:'text',node});}
 for(const item of attrTasks){
  let originals=state.attrOriginals.get(item.el);
  if(!originals){originals={};state.attrOriginals.set(item.el,originals);}
  if(!(item.name in originals))originals[item.name]=item.value;
  const original=originals[item.name];if(original&&original.trim())tasks.push({type:'attr',el:item.el,name:item.name,value:original});
 }
 const result=await translateTasks(tasks,state.target,state.generation);
 return result;
}
async function drain(){
 if(state.running)return;state.running=true;
 try{
  while(state.pending.length){const root=state.pending.shift();const result=await processRoot(root);if(result&&result.failed===result.total)setStatus('Translation unavailable');else if(result&&result.failed>0)setStatus('Partially translated');else if(result&&result.done===result.total)setStatus('AI translated');}
 }finally{state.running=false;}
}
function queue(root){if(!root)return;state.pending.push(root);drain();}
function watch(){
 if(state.observer)state.observer.disconnect();
 state.observer=new MutationObserver(records=>{
  if(!state.target||state.target===state.base)return;
  for(const record of records)for(const node of record.addedNodes){if(node.nodeType===1&&!skipped(node))queue(node);else if(node.nodeType===3&&node.parentElement&&!skipped(node.parentElement))queue(node.parentElement);}
 });
 state.observer.observe(document.body,{childList:true,subtree:true});
}
async function apply(language){
 let target=String(language||state.base).toLowerCase();if(target==='zh-cn')target='zh';
 if(!LANGS.has(target)){setStatus('Language unavailable');return false;}
 if(target===state.target&&state.applied)return true;
 state.generation++;state.pending=[];state.target=target;state.applied=true;
 try{localStorage.setItem('viora_site_language',target);}catch(_){}
 document.documentElement.dir=target==='ar'?'rtl':'ltr';
 document.documentElement.lang=target;
 restore();
 if(target===state.base){setStatus('');watch();return true;}
 setStatus('Translating…');queue(document.body);watch();return true;
}
document.addEventListener('click',event=>{
 const link=event.target.closest&&event.target.closest('a[href]');if(!link)return;
 try{const url=new URL(link.href,location.origin);if(url.origin!==location.origin)return;
  if(url.pathname==='/fr/'||url.pathname==='/fr'){localStorage.setItem('viora_site_language','fr');}
  else if(url.pathname==='/es/'||url.pathname==='/es'){localStorage.setItem('viora_site_language','es');}
  else if(url.pathname==='/'||url.pathname==='/index.html'){localStorage.setItem('viora_site_language','en');}
 }catch(_){}
});
const api={apply,baseLanguage:state.base};
window.VioraLanguage=api;
const saved=(()=>{try{return localStorage.getItem('viora_site_language')||state.base;}catch(_){return state.base;}})();
if(location.pathname==='/'&&saved==='fr'){location.replace('/fr/');}
else if(location.pathname==='/'&&saved==='es'){location.replace('/es/');}
else { /* The shared bootstrap applies the selected language after this file loads. */ }
})();