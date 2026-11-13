/* VIORA Industry Marketplace — live category-matched products for standalone industry pages. */
import './viora-taxonomy.js';
const VIORA_INDUSTRY_MARKET={
  retail:{label:"VIORA Enterprise Solutions",categories:["enterprise"],nameTerms:["retail","wholesale","shop management","pos system","boutique","hardware management","butchery","fashion house"]},
  healthcare:{label:"VIORA Institutional Solutions",categories:["institutional"],nameTerms:["clinic","hospital","pharmacy","diagnostic","healthcare"]},
  hospitality:{label:"VIORA Hospitality Solutions",categories:["hospitality"],nameTerms:["hotel","guest house","restaurant","catering","laundry","club management"]},
  education:{label:"VIORA Institutional Solutions",categories:["institutional"],nameTerms:["school management","campus connect","student management","academy"]},
  logistics:{label:"VIORA Industry & Operations Solutions",categories:["industry"],nameTerms:["boda riders","salama movers","fleet management","transport management","logistics management","delivery management"]},
  "professional-services":{label:"VIORA Business & Lifestyle Solutions",categories:["business"],nameTerms:["law firm management","professional services automation","legal practice","professional advisory"]},
  agriculture:{label:"VIORA Industry & Operations Solutions",categories:["industry"],nameTerms:["farm integrated","farm management","greenhouse","soko ai"]}
};
const viPlain=value=>{let text=String(value??"");for(let i=0;i<2;i++){const box=document.createElement("div");box.innerHTML=text;const next=box.textContent||"";if(next===text)break;text=next;}return text;};
const viNorm=value=>viPlain(value).toLowerCase().replace(/\s+/g," ").trim();
const viEsc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const viAsset=value=>{const raw=String(value||"").trim();if(/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw))return raw;try{const url=new URL(raw,location.origin);return /^https?:$/.test(url.protocol)?url.href:"";}catch(_){return"";}};
function viPrice(product){
 const amount=Number(product.price);
 if(amount>0&&window.VioraCurrency?.formatUSD)return window.VioraCurrency.formatUSD(amount)+(product.period?" / "+viEsc(viPlain(product.period)):"");
 if(product.pricing==="quote")return"Request a quote";
 return"See in Marketplace";
}
async function viLoadProducts(){
 const endpoint="https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app/viora_data/orgs/viora/products.json";
 const response=await fetch(endpoint,{method:"GET",mode:"cors",cache:"no-store",headers:{Accept:"application/json"}});
 if(!response.ok)throw new Error("Marketplace catalogue returned HTTP "+response.status);
 const raw=await response.json();
 return Object.keys(raw||{}).map(id=>Object.assign({id},raw[id]||{})).filter(p=>p.status!=="archived"&&p.status!=="draft");
}
function viRenderProduct(product){
 const image=viAsset(product.image);
 const name=viPlain(product.name||"VIORA product");
 const description=viPlain(product.description||"Explore this solution in the VIORA Marketplace.");
 const media=image?'<img class="industry-product-image" src="'+viEsc(image)+'" alt="'+viEsc(name)+'" loading="lazy">':'<div class="industry-product-placeholder" aria-hidden="true"><i class="'+viEsc(product.icon||"fa-solid fa-cube")+'"></i></div>';
 return '<article class="industry-product-card">'+media+'<div class="industry-product-copy"><span class="industry-product-kicker">VIORA MARKETPLACE</span><h3>'+viEsc(name)+'</h3><p>'+viEsc(description)+'</p><div class="industry-product-bottom"><strong>'+viPrice(product)+'</strong><a href="/market">View product <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div></article>';
}
async function viInitIndustryMarketplace(){
 const host=document.getElementById("industryMarketplaceGrid");
 if(!host)return;
 const config=VIORA_INDUSTRY_MARKET[document.body.dataset.industry];
 if(!config){host.innerHTML='<p class="industry-marketplace-state">Browse the full VIORA Marketplace for available products.</p>';return;}
 host.setAttribute("aria-busy","true");
 try{
  const products=await viLoadProducts();
  const solutionCategory=window.VIORATaxonomy.classifyIndustry({name:config.label,cat:document.body.dataset.industry});
  const matches=products.map(product=>{
   const categoryMatch=window.VIORATaxonomy.classifyProduct(product)===solutionCategory;
   const name=viNorm(product.name||"");
   const nameMatch=config.nameTerms.some(term=>name.includes(term));
   return {product,rank:categoryMatch?0:nameMatch?1:9};
  }).filter(item=>item.rank<9).sort((a,b)=>a.rank-b.rank).map(item=>item.product).slice(0,6);
  if(!matches.length){
   host.innerHTML='<div class="industry-marketplace-empty"><span class="industry-product-placeholder"><i class="fa-solid fa-box-open"></i></span><div><strong>No matching products are listed yet.</strong><p>Browse the Marketplace to see the full catalogue or check back as this category grows.</p><a class="btn" href="/market">Explore the Marketplace <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div>';
  }else{
   host.innerHTML=matches.map(viRenderProduct).join("");
  }
 }catch(error){
  console.warn("[VIORA industry marketplace] Could not load products:",error);
  host.innerHTML='<div class="industry-marketplace-empty"><span class="industry-product-placeholder"><i class="fa-solid fa-store"></i></span><div><strong>Marketplace products are temporarily unavailable.</strong><p>You can still browse the full catalogue.</p><a class="btn" href="/market">Open Marketplace <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div>';
 }finally{host.removeAttribute("aria-busy");}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",viInitIndustryMarketplace,{once:true});else viInitIndustryMarketplace();
