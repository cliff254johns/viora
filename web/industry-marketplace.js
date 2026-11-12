/* VIORA Industry Marketplace — live category-matched products for standalone industry pages. */
const VIORA_INDUSTRY_MARKET={
  retail:{label:"Retail & Wholesale",category:"retail_trade",terms:["retail","trade","commerce","pos","inventory","wholesale","hardware","shop"]},
  healthcare:{label:"Healthcare",category:"health_wellness",terms:["health","healthcare","medical","clinic","diagnostic","laboratory","hospital","wellness"]},
  hospitality:{label:"Hospitality",category:"hospitality",terms:["hospitality","hotel","tourism","restaurant","food","beverage","laundry","butchery"]},
  education:{label:"Education",category:"education",terms:["education","training","school","academy","learning","student"]},
  logistics:{label:"Transport & Logistics",category:"transport_logi",terms:["transport","logistics","fleet","delivery","courier","supply chain"]},
  "professional-services":{label:"Professional Services",category:"prof_services",terms:["professional","legal","accounting","consulting","advisory","law","finance"]},
  agriculture:{label:"Agriculture",category:"agri_farming",terms:["agriculture","farming","agri","farm","livestock","greenhouse"]}
};
const viEsc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const viAsset=value=>{try{const url=new URL(String(value||""),location.origin);return /^https?:$/.test(url.protocol)?url.href:"";}catch(_){return"";}};
function viPrice(product){
 const amount=Number(product.price);
 if(amount>0&&window.VioraCurrency?.formatUSD)return window.VioraCurrency.formatUSD(amount)+(product.period?" / "+viEsc(product.period):"");
 if(product.pricing==="quote")return"Request a quote";
 return"View pricing";
}
async function viLoadProducts(){
 const appMod=await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js");
 const dbMod=await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js");
 const config={apiKey:"AIzaSyC9gCBt-xR8t9n6rTGNdVZ5usUGiW-Dqxc",authDomain:"cliffclient-35ec5.firebaseapp.com",databaseURL:"https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",projectId:"cliffclient-35ec5",storageBucket:"cliffclient-35ec5.firebasestorage.app",messagingSenderId:"519782791696",appId:"1:519782791696:web:6e1a654ddeed14b72b2895"};
 let app;try{app=appMod.getApp();}catch(_){app=appMod.initializeApp(config);}
 const snap=await dbMod.get(dbMod.ref(dbMod.getDatabase(app),"viora_data/orgs/viora/products"));
 const raw=snap.exists()?snap.val():{};
 return Object.keys(raw||{}).map(id=>Object.assign({id},raw[id]||{})).filter(p=>p.status!=="archived"&&p.status!=="draft");
}
function viRenderProduct(product){
 const image=viAsset(product.image);
 const media=image?'<img class="industry-product-image" src="'+viEsc(image)+'" alt="'+viEsc(product.name||"Marketplace product")+'" loading="lazy">':'<div class="industry-product-placeholder" aria-hidden="true"><i class="'+viEsc(product.icon||"fa-solid fa-cube")+'"></i></div>';
 const description=product.description||"Explore this solution in the VIORA Marketplace.";
 return '<article class="industry-product-card">'+media+'<div class="industry-product-copy"><span class="industry-product-kicker">VIORA MARKETPLACE</span><h3>'+viEsc(product.name||"VIORA product")+'</h3><p>'+viEsc(description)+'</p><div class="industry-product-bottom"><strong>'+viPrice(product)+'</strong><a href="/market">View product <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div></article>';
}
async function viInitIndustryMarketplace(){
 const host=document.getElementById("industryMarketplaceGrid");
 if(!host)return;
 const config=VIORA_INDUSTRY_MARKET[document.body.dataset.industry];
 if(!config){host.innerHTML='<p class="industry-marketplace-state">Browse the full VIORA Marketplace for available products.</p>';return;}
 host.setAttribute("aria-busy","true");
 try{
  const products=await viLoadProducts();
  const matches=products.filter(product=>{
   const tags=Array.isArray(product.tags)?product.tags:[typeof product.tags==="string"?product.tags:""];
   const features=Array.isArray(product.features)?product.features:[];
   const hay=[product.category,product.categoryId,product.categoryName,product.industry,product.name,product.description,...tags,...features].join(" ").toLowerCase();
   return config.terms.some(term=>hay.includes(term));
  }).slice(0,6);
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
