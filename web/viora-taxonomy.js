/* VIORA Global Solutions Taxonomy — canonical six-category classification.
   Shared by public website, Marketplace, admin catalogue and industry blueprints. */
(function (root) {
  'use strict';
  const categories = [
    { id:'enterprise', key:'enterprise', name:'VIORA Enterprise Solutions', short:'Enterprise Solutions', icon:'fa-solid fa-building', emoji:'🏢', color:'#3987ff', description:'ERP, HR, Payroll, Finance, CRM, Inventory and Procurement.' },
    { id:'institutional', key:'institutional', name:'VIORA Institutional Solutions', short:'Institutional Solutions', icon:'fa-solid fa-landmark', emoji:'🏛️', color:'#8b72e8', description:'School, College, Hospital, Church, University and Training Management.' },
    { id:'hospitality', key:'hospitality', name:'VIORA Hospitality Solutions', short:'Hospitality Solutions', icon:'fa-solid fa-hotel', emoji:'🏨', color:'#e59a42', description:'Hotel, Restaurant, Guest House, Club, Lounge and Tourism Management.' },
    { id:'property', key:'property', name:'VIORA Property & Infrastructure Solutions', short:'Property & Infrastructure', icon:'fa-solid fa-city', emoji:'🏗️', color:'#35a99a', description:'Property, Rental, Construction, Facility and Maintenance Management.' },
    { id:'industry', key:'industry', name:'VIORA Industry & Operations Solutions', short:'Industry & Operations', icon:'fa-solid fa-industry', emoji:'⚙️', color:'#54a66b', description:'Farm, Greenhouse, Cleaning, Laundry, Manufacturing, Fleet and Logistics Management.' },
    { id:'business', key:'business', name:'VIORA Business & Lifestyle Solutions', short:'Business & Lifestyle', icon:'fa-solid fa-store', emoji:'✨', color:'#d477aa', description:'Salon, Beauty, Gym, Fashion, Recruitment, Legal and Funeral Services Management.' }
  ];
  const byId = Object.fromEntries(categories.map(c => [c.id,c]));
  const aliases = {
    enterprise:['erp','enterprise resource','hr','human resource','payroll','finance','accounting','crm','customer relationship','inventory','stock control','procurement','purchasing','retail','wholesale','point of sale','pos','business management','business operations','commerce','sales management','hardware','hardware shop','hardware store','shop management','sacco','microfinance','bookkeeping','ledger','invoicing','technology','tech','digital','banking','insurance','telecommunications','automation','ai assistant','artificial intelligence'],
    institutional:['school','college','university','hospital','clinic','health','healthcare','health care','health and wellness','medical','pharmacy','diagnostic','church','ministry','faith institution','training centre','training center','academy','education','campus','student management','learner management','patient management','institution','membership','ngo','nonprofit','non profit','association','community','faith','government','public sector','veterinary','vet practice'],
    hospitality:['food','beverage','food and beverage','dining','hotel','restaurant','guest house','guesthouse','resort','club','clubs','club management','entertainment','nightclub','lounge','events','event management','bar','tourism','tour operator','travel agency','catering','bar management','hospitality','accommodation','booking management'],
    property:['property','real estate','rental','rentals','leasing','landlord','tenant management','construction','building project','facility management','facilities','maintenance management','estate management','property management','housing','architecture','architectural design','security','security company','security services'],
    industry:['farm','farming','agriculture','agricultural','greenhouse','cleaning','janitorial','laundry','dry cleaning','manufacturing','factory','production management','fleet','logistics','transport','warehouse','warehousing','distribution','delivery','supply chain','dispatch','vehicle operations','industrial','industry specific','production systems','automotive','garage','auto repair','mechanic','printing','print shop','graphics production','printing production','energy','utilities','mining','quarrying','fisheries','aquaculture','waste management','aviation','aerospace','jua kali','artisan','artisans'],
    business:['salon','beauty','spa','gym','fitness','fashion','apparel','recruitment','recruiting','staffing agency','legal','law firm','law practice','funeral','mortuary','undertaker','barber','wellness','creative studio','photography','sports','recreation','wellness','design studio','event planning','professional practice','professional services','creative','media','beauty and personal care','personal care','informal','msme','informal and msme','other industries','personal services','lifestyle','marketing agency','website','websites','web design','website builder','graphic design','graphics design','video advertisement','video advertisements','advertising','android application','android applications','mobile application','mobile applications','3d website','games','gaming','personal profile','ecommerce','e commerce','digital commerce']
  };
  const legacy = {
    retail_trade:'enterprise', food_bev:'hospitality', health_wellness:'institutional',
    beauty_personal:'business', prof_services:'business', creative_media:'business',
    construction:'property', transport_logi:'industry', agri_farming:'industry',
    education:'institutional', finance_ins:'enterprise', real_estate:'property',
    hospitality:'hospitality', manufacturing:'industry', tech_digital:'enterprise',
    community_faith:'institutional', informal_msme:'business', energy_env:'industry',
    mining_extract:'industry', events_ent:'hospitality', gov_ngo:'institutional',
    automotive:'industry', sports_rec:'business', security_safety:'property',
    legal_compliance:'business', warehouse:'industry', fashion_apparel:'business',
    cleaning_facility:'industry', rental_leasing:'property', misc_other:'business'
  };
  const norm = v => String(v == null ? '' : v).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ').trim();
  const contains = (hay, term) => (' '+hay+' ').includes(' '+norm(term)+' ');
  function canonicalId(value) {
    const n = norm(value);
    if (byId[n]) return n;
    const found = categories.find(c => norm(c.name) === n || norm(c.short) === n || norm(c.key) === n);
    if (found) return found.id;
    return legacy[n] || legacy[n.replace(/\s+/g,'_')] || null;
  }
  function classifyText(text, fallback) {
    const n = norm(text);
    // Specific industry signals take precedence over broad business-system terms.
    for (const id of ['institutional','hospitality','property','industry','business','enterprise']) {
      if (aliases[id].some(term => contains(n,term))) return id;
    }
    return canonicalId(fallback) || null;
  }
  function classifyProduct(product) {
    const p = product && typeof product === 'object' ? product : { category:product };
    const explicit = canonicalId(p.vioraCategoryId || p.solutionCategory || p.solutionCategoryId || p.categoryGroup);
    if (explicit) return explicit;
    const text = [p.category,p.categoryName,p.categoryId,p.solutionCategory,p.productType,p.industry,p.name,p.title,p.description,p.id,
      ...(Array.isArray(p.tags)?p.tags:[typeof p.tags==='string'?p.tags:'']),
      ...(Array.isArray(p.features)?p.features:[])].join(' ');
    return classifyText(text,null) || canonicalId(p.category || p.categoryId) || 'enterprise';
  }
  function classifyIndustry(industry, legacyKey) {
    const i = industry && typeof industry === 'object' ? industry : { name:industry, cat:legacyKey };
    const explicit = canonicalId(i.vioraCategoryId || i.solutionCategory || i.categoryGroup);
    if (explicit) return explicit;
    const text = [i.name,i.key,i.problem,i.marketCategory,i.category,i.cat].join(' ');
    const specific = classifyText(text,null);
    if (specific) return specific;
    return legacy[norm(i.cat || legacyKey)] || canonicalId(i.cat || legacyKey) || 'enterprise';
  }
  function category(value) { return byId[canonicalId(value) || 'enterprise']; }
  function title(value) { return category(value).name; }
  function normalizeProduct(product) {
    const p = Object.assign({}, product || {});
    p.vioraCategoryId = classifyProduct(p);
    p.solutionCategory = byId[p.vioraCategoryId].name;
    p.category = byId[p.vioraCategoryId].name;
    return p;
  }
  root.VIORATaxonomy = Object.freeze({
    version:'2026-11-13.1',
    categories:Object.freeze(categories.map(c=>Object.freeze(c))),
    byId:Object.freeze(byId),
    legacy:Object.freeze(legacy),
    canonicalId, category, title, classifyProduct, classifyIndustry, normalizeProduct,
    options(includeAll) {
      return (includeAll ? [{id:'all',name:'All VIORA Solutions'}] : []).concat(categories);
    }
  });
})(window);
