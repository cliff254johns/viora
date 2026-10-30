(function () {
"use strict";

/* ============================================================
   VIORA PUBLIC — v5.0.0
   Renders public.html from ONE Firebase node:
       viora_data/orgs/viora/clientsite
   Any write from main.js appears on every device instantly.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
  authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app",
  messagingSenderId: "519782791696",
  appId: "1:519782791696:web:6e1a654ddeed14b72b2895",
  measurementId: "G-G0NB6JGQVF"
};

let firebaseApp = null, db = null, firebaseReady = false;
try {
  firebaseApp = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  firebaseReady = true;
} catch (e) {
  console.warn("[VIORA Public] Firebase init error:", e.message);
}

const SITE_PATH    = "viora_data/orgs/viora/clientsite";
const PROFILE_PATH = "viora_data/orgs/viora/companyProfile";
const LOGO_PATH    = "viora_data/orgs/viora/logoUrl";

/* ── DEFAULTS ── */
const DEFAULTS = {
  branding: {
    name: "Clifford Munene",
    company: "VIORA — Business Operating Systems",
    email: "cliff254johns@gmail.com",
    phone: "0713428774",
    location: "Meru, Kenya",
    accentColor: "#00d4ff",
    primaryColor: "#0a0a0f",
    logoUrl: "",
    footerName: "VIORA",
    founderLabel: "Founder",
    locationLabel: "Location"
  },
  seo: {
    title: "VIORA — Business Operating Systems",
    description: "AI-powered business operating systems built in Kenya.",
    ogImage: "https://viora.co.ke/viora.png"
  },
  nav: {
    brandText: "Cliff IT",
    brandIcon: "fa-solid fa-code",
    portalLabel: "Visit VIORA",
    about: "About", industries: "Industries", services: "Services",
    skills: "Skills", projects: "Projects", faq: "FAQ", contact: "Contact"
  },
  hero: {
    name: "Clifford Munene",
    title: "Business Operating Systems That Run Themselves",
    badge: "VIORA · EcoSystems",
    bio: "I build AI-powered ecosystems that replace 7 disconnected tools with one unified system.",
    image: "viora/viora.png",
    typedPhrases: "Software Engineer, AI Automation Architect, Full-Stack Developer",
    btn1Label: "Book a Demo", btn1Link: "#contact",
    btn2Label: "Download App", btn2Link: "#",
    stat1Value: "22", stat1Label: "Products Built",
    stat2Value: "10", stat2Label: "Industries Served",
    stat3Value: "4", stat3Label: "Years Experience"
  },
  ecosystem: {
    subtitle: "The Viora Ecosystem",
    heading: 'One System. <span class="highlight">Every Department.</span>',
    desc: "Most businesses run on 5–7 disconnected tools. None of them talk.",
    ctaHeading: 'No human touches the data <span class="highlight">between steps.</span>',
    ctaBody: "That's what an ecosystem is — every part of your business sharing the same brain.",
    steps: [
      { icon: "fa-solid fa-user-plus", title: "Lead Captured", sub: "Marketing" },
      { icon: "fa-solid fa-handshake", title: "Deal Closed", sub: "Sales" },
      { icon: "fa-solid fa-folder-plus", title: "Project + Contract", sub: "Auto-spawned" },
      { icon: "fa-solid fa-file-invoice", title: "Invoice", sub: "Auto-generated" },
      { icon: "fa-solid fa-mobile-screen-button", title: "M-Pesa Paid", sub: "Auto-matched" },
      { icon: "fa-solid fa-book", title: "Ledger", sub: "Auto-posted" },
      { icon: "fa-solid fa-brain", title: "AI Recommends", sub: "Next action" }
    ]
  },
  industries: {
    subtitle: "Industry Solutions",
    heading: 'Industries We <span class="highlight">Transform</span>',
    desc: "Click any industry to see the specific pain points we solve.",
    items: [
      { key: "manufacturing", icon: "fa-solid fa-industry", title: "Manufacturing", tagline: "Factories & Processing", pain: "Raw materials run out mid-production.", features: ["BOM tracking", "Batch tracking", "KRA reports", "AI forecast"] },
      { key: "retail", icon: "fa-solid fa-cart-shopping", title: "Retail & Wholesale", tagline: "Shops, Supermarkets", pain: "Stock counts never match.", features: ["POS + M-Pesa", "Multi-branch stock", "Loyalty", "AI reorder"] },
      { key: "healthcare", icon: "fa-solid fa-heart-pulse", title: "Healthcare", tagline: "Clinics, Hospitals", pain: "Patient files on paper.", features: ["EMR", "Appointments", "SHA claims", "Pharmacy"] },
      { key: "education", icon: "fa-solid fa-graduation-cap", title: "Education", tagline: "Schools, Colleges", pain: "Fee arrears untracked.", features: ["Student system", "Fee + M-Pesa", "Report cards", "Parent portal"] },
      { key: "hospitality", icon: "fa-solid fa-hotel", title: "Hospitality", tagline: "Hotels, Restaurants", pain: "Double-bookings.", features: ["Unified booking", "POS + room charge", "Housekeeping", "Guest CRM"] },
      { key: "logistics", icon: "fa-solid fa-truck-fast", title: "Logistics", tagline: "SACCOs, Trucking", pain: "Fleet maintenance reactive.", features: ["Fleet register", "Fuel log", "Trip scheduling", "Delivery proof"] },
      { key: "agriculture", icon: "fa-solid fa-seedling", title: "Agriculture", tagline: "Dairy, Coffee", pain: "Farmer records manual.", features: ["Farmer registry", "Produce intake", "M-Pesa payments", "Quality analytics"] },
      { key: "construction", icon: "fa-solid fa-helmet-safety", title: "Construction", tagline: "Contractors, Developers", pain: "Budgets balloon.", features: ["Project costing", "BOQ", "Material tracking", "Property mgmt"] },
      { key: "sacco", icon: "fa-solid fa-piggy-bank", title: "SACCOs", tagline: "Savings, Credit", pain: "Loan tracking in Excel.", features: ["Member registry", "Loan tracking", "Dividends", "SASRA reports"] },
      { key: "ngo", icon: "fa-solid fa-hands-holding-circle", title: "NGOs", tagline: "Development, Aid", pain: "Donor reporting manual.", features: ["Project tracking", "Beneficiary registry", "Donor reports", "Compliance"] }
    ]
  },
  compare: {
    subtitle: "The Difference",
    heading: 'Ecosystem vs. <span class="highlight">Standalone Stack</span>',
    desc: 'Here\'s what you tell a client who says "Why not just buy QuickBooks + HubSpot + a POS?"',
    colCap: "Capability",
    colStandalone: "Standalone Stack",
    colEcosystem: "Viora Ecosystem",
    rows: [
      { capability: "Vendors & billing", standalone: "5–7 invoices per month", ecosystem: "One bill, one relationship" },
      { capability: "Data flow", standalone: "Silos. Manual sync.", ecosystem: "Unified, real-time, automatic" },
      { capability: "AI readiness", standalone: "Impossible — silos", ecosystem: "AI-native across all data" },
      { capability: "Integration fees", standalone: "KSh 200K+ setup", ecosystem: "Zero — built together" },
      { capability: "Support", standalone: "5–7 tickets", ecosystem: "One channel, one owner" },
      { capability: "Learning curve", standalone: "5–7 different UIs", ecosystem: "One interface" },
      { capability: "Kenya compliance", standalone: "Patches per tool", ecosystem: "Native, always updated" },
      { capability: "Cross-module insights", standalone: "Spreadsheets to connect", ecosystem: "AI surfaces what matters" },
      { capability: "Your role", standalone: "Systems integrator", ecosystem: "You run your business" },
      { capability: "Cost example", standalone: "KSh 75K/mo + KSh 200K setup", ecosystem: "KSh 25–60K/mo, no chaos" }
    ]
  },
  services: {
    subtitle: "What We Do",
    heading: 'Our <span class="highlight">Services</span>',
    desc: "Six services. One orchestrated ecosystem.",
    items: [
      { icon: "fa-solid fa-cubes", title: "Business Operating System", description: "A unified ERP+CRM that replaces 7 tools with 1." },
      { icon: "fa-solid fa-rocket", title: "Customer Acquisition Engine", description: "Websites wired into your CRM." },
      { icon: "fa-solid fa-mobile-screen", title: "Field Operations Layer", description: "Mobile apps that sync field data in real time." },
      { icon: "fa-solid fa-user-tie", title: "Authority Layer", description: "Personal brand sites wired to booking and payment." },
      { icon: "fa-solid fa-bullhorn", title: "Demand Generation", description: "Social media that feeds your CRM." },
      { icon: "fa-solid fa-palette", title: "Brand System", description: "A brand kit + template system." }
    ]
  },
  skills: {
    subtitle: "Tech Stack",
    heading: 'Our <span class="highlight">Skills</span>',
    desc: "Technologies we master across web, mobile, AI, and enterprise.",
    items: [
      { name: "Web Development", icon: "fa-solid fa-code", level: 95 },
      { name: "Mobile App Dev", icon: "fa-solid fa-mobile-screen", level: 90 },
      { name: "AI & Automation", icon: "fa-solid fa-robot", level: 88 },
      { name: "System Development", icon: "fa-solid fa-server", level: 88 },
      { name: "UI/UX Design", icon: "fa-solid fa-pencil-ruler", level: 85 },
      { name: "Graphic Design", icon: "fa-solid fa-palette", level: 82 },
      { name: "Cloud & DevOps", icon: "fa-solid fa-cloud", level: 80 },
      { name: "IT Support", icon: "fa-solid fa-screwdriver-wrench", level: 80 }
    ]
  },
  projects: {
    subtitle: "Portfolio",
    heading: 'Featured <span class="highlight">Products</span>',
    desc: "22+ ventures from the VIORA Collective ecosystem.",
    items: []
  },
  testimonials: {
    subtitle: "Testimonials",
    heading: 'Client <span class="highlight">Feedback</span>',
    items: [
      { name: "Sarah Wanjiku", role: "CTO, FinTech Kenya", text: "Viora replaced 5 tools we were paying for separately." },
      { name: "James Ochieng", role: "CEO, Green Energy Ltd", text: "Leads auto-convert, invoices auto-generate, payments auto-reconcile." },
      { name: "Grace Muthoni", role: "Product Manager, HealthTech", text: "The AI recommendations alone saved us 20 hours a week." }
    ]
  },
  blog: {
    subtitle: "Insights",
    heading: 'From the <span class="highlight">Blog</span>',
    desc: "Thoughts on software, AI, fintech, and building in Africa.",
    items: [
      { tag: "AI", date: "Feb 2025", title: "Why African Businesses Need Local AI", excerpt: "Global models miss context.", read: "6 min read" },
      { tag: "Fintech", date: "Jan 2025", title: "The Airtime-to-Cash Gap", excerpt: "Millions of Kenyans hold value in airtime.", read: "5 min read" },
      { tag: "Engineering", date: "Dec 2024", title: "Scaling a 22-Project Ecosystem", excerpt: "How we run multiple products with a lean team.", read: "8 min read" }
    ]
  },
  faq: {
    subtitle: "Questions",
    heading: 'Frequently <span class="highlight">Asked</span>',
    desc: "Common questions about working with VIORA.",
    items: [
      { q: "What types of businesses do you work with?", a: "Startups, SMEs, enterprises, government, and NGOs." },
      { q: "How long does a typical project take?", a: "Website 1–2 weeks. App 4–8 weeks. Complex systems 8–16 weeks." },
      { q: "Do you offer maintenance?", a: "Yes. 30 days free bug fixes, then affordable monthly plans." },
      { q: "Can you integrate M-Pesa?", a: "Yes — M-Pesa Daraja, Airtel Money, banks, Flutterwave, Paystack." },
      { q: "What makes Viora different?", a: "One ecosystem, one database, one AI brain." }
    ]
  },
  tech: {
    subtitle: "Stack",
    heading: 'Technologies We <span class="highlight">Use</span>',
    items: [
      { name: "HTML5", icon: "fa-brands fa-html5" },
      { name: "CSS3", icon: "fa-brands fa-css3-alt" },
      { name: "JavaScript", icon: "fa-brands fa-js" },
      { name: "React", icon: "fa-brands fa-react" },
      { name: "Node.js", icon: "fa-brands fa-node-js" },
      { name: "Python", icon: "fa-brands fa-python" },
      { name: "Java", icon: "fa-brands fa-java" },
      { name: "Android", icon: "fa-brands fa-android" },
      { name: "Firebase", icon: "fa-solid fa-fire" },
      { name: "Figma", icon: "fa-brands fa-figma" },
      { name: "Docker", icon: "fa-brands fa-docker" },
      { name: "AWS", icon: "fa-brands fa-aws" }
    ]
  },
  stats: {
    subtitle: "By The Numbers",
    heading: 'Our <span class="highlight">Impact</span>',
    items: [
      { icon: "fa-solid fa-diagram-project", value: "22", label: "Products Built" },
      { icon: "fa-solid fa-industry", value: "10", label: "Industries Served" },
      { icon: "fa-solid fa-calendar", value: "4", label: "Years Experience" },
      { icon: "fa-solid fa-code-branch", value: "22", label: "Ecosystem Modules" },
      { icon: "fa-solid fa-mobile-screen", value: "6", label: "Android Apps Shipped" },
      { icon: "fa-solid fa-handshake", value: "98", label: "% Client Retention" }
    ]
  },
  contact: {
    subtitle: "Get in Touch",
    heading: 'Let\'s <span class="highlight">Connect</span>',
    desc: "Book a 15-minute walkthrough.",
    infoHeading: "Contact Details",
    formHeading: "Send a Message",
    founderLabel: "Founder",
    locationLabel: "Location",
    nameLabel: "Your Name *",
    emailLabel: "Your Email *",
    subjectLabel: "Subject",
    messageLabel: "Message *",
    submitLabel: "Send via WhatsApp"
  },
  mobile: {
    navHome: "Home", navEco: "Eco", navInd: "Ind.",
    navServ: "Serv.", navWork: "Work", navFaq: "FAQ", navContact: "Contact"
  },
  live: { clients: [], projects: [] }
};

const state = {
  site: JSON.parse(JSON.stringify(DEFAULTS)),
  profile: {},
  logoUrl: "",
  typingRefs: { desktop: null, mobile: null }
};

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const trusted = s => String(s == null ? "" : s);

const normalizePhone = p => {
  if (!p) return "";
  let c = String(p).replace(/[^0-9]/g, "");
  if (c.startsWith("0")) c = "254" + c.slice(1);
  if (!c.startsWith("254") && c.length === 9) c = "254" + c;
  return c;
};
const formatPhoneDisplay = p => {
  const c = String(p || "").replace(/\D/g, "");
  if (c.startsWith("254") && c.length === 12) return "0" + c.slice(3, 6) + " " + c.slice(6, 9) + " " + c.slice(9);
  if (c.startsWith("0") && c.length === 10) return c.slice(0, 4) + " " + c.slice(4, 7) + " " + c.slice(7);
  return p || "";
};

const safeSet = (id, val) => { const el = $(id); if (el && val != null) el.textContent = val; };
const safeHtml = (id, val) => { const el = $(id); if (el && val != null) el.innerHTML = trusted(val); };
const safeSrc = (id, val) => { const el = $(id); if (el && val) el.src = val; };
const safeHref = (id, val) => { const el = $(id); if (el && val) el.href = val; };

function applyTheme(primary, accent) {
  if (!accent) return;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    ["--primary","--accent","--accent-glow","--accent-dim","--border-color"].forEach(v =>
      document.documentElement.style.removeProperty(v));
  } else {
    if (primary) document.documentElement.style.setProperty("--primary", primary);
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-glow", accent + "40");
    document.documentElement.style.setProperty("--accent-dim", accent + "14");
    document.documentElement.style.setProperty("--border-color", accent + "1E");
  }
}

function hideLoader() {
  if (typeof window.vioraHidePreloader === "function") return window.vioraHidePreloader();
}

function startTyping(phrases, elementId, refKey) {
  if (state.typingRefs[refKey]) { clearTimeout(state.typingRefs[refKey]); state.typingRefs[refKey] = null; }
  const el = $(elementId);
  if (!el || !phrases) return;
  const list = String(phrases).split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length) { el.textContent = ""; return; }
  let ti = 0, ci = 0, del = false;
  function type() {
    const cur = list[ti % list.length];
    if (!del) {
      el.textContent = cur.substring(0, ci + 1);
      ci++;
      if (ci === cur.length) { del = true; state.typingRefs[refKey] = setTimeout(type, 1800); }
      else state.typingRefs[refKey] = setTimeout(type, 80);
    } else {
      el.textContent = cur.substring(0, ci - 1);
      ci--;
      if (ci === 0) { del = false; ti++; state.typingRefs[refKey] = setTimeout(type, 400); }
      else state.typingRefs[refKey] = setTimeout(type, 40);
    }
  }
  type();
}

function initParticles() {
  const canvas = document.getElementById("particleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h;
  const particles = [];
  const count = 100;
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    w = canvas.width = r.width;
    h = canvas.height = r.height;
  }
  window.addEventListener("resize", resize);
  resize();
  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * w; this.y = Math.random() * h;
      this.size = Math.random() * 2 + .5;
      this.speedX = (Math.random() - .5) * .3;
      this.speedY = (Math.random() - .5) * .3;
      this.opacity = Math.random() * .4 + .1;
    }
    update() {
      this.x += this.speedX; this.y += this.speedY;
      if (this.x < 0 || this.x > w) this.speedX *= -1;
      if (this.y < 0 || this.y > h) this.speedY *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,212,255," + this.opacity + ")";
      ctx.fill();
    }
  }
  for (let i = 0; i < count; i++) particles.push(new Particle());
  function animate() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }
  animate();
}

/* ── RENDER ── */
function renderSEO() {
  const seo = state.site.seo || {};
  if (seo.title) document.title = seo.title;
  if (seo.description) {
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
    m.content = seo.description;
  }
  const setOG = (prop, val) => {
    if (!val) return;
    let m = document.querySelector(`meta[property="${prop}"]`);
    if (!m) { m = document.createElement("meta"); m.setAttribute("property", prop); document.head.appendChild(m); }
    m.content = val;
  };
  setOG("og:title", seo.title);
  setOG("og:description", seo.description);
  setOG("og:image", seo.ogImage || state.site.branding?.logoUrl || state.logoUrl);
}

function renderBranding() {
  const b = state.site.branding || {};
  const logo = b.logoUrl || state.logoUrl || "";
  const brandImg = $("brandLogoImg");
  const brandIcon = $("brandLogoIcon");
  const brandText = $("brandText");
  if (logo && brandImg) {
    brandImg.src = logo; brandImg.style.display = "inline-block";
    if (brandIcon) brandIcon.style.display = "none";
  } else if (brandImg) {
    brandImg.style.display = "none";
    if (brandIcon) brandIcon.style.display = "inline-flex";
  }
  if (brandText) brandText.textContent = (state.site.nav?.brandText) || b.company || "VIORA";

  const mIcon = $("mobileLogoIcon");
  const mText = $("mobileBrandText");
  if (logo && mIcon) {
    mIcon.innerHTML = `<img src="${escapeHtml(logo)}" alt="" style="height:26px;width:auto;object-fit:contain;border-radius:6px;">`;
  } else if (mIcon) {
    mIcon.innerHTML = `<i class="${escapeHtml(state.site.nav?.brandIcon || "fa-solid fa-code")}"></i>`;
  }
  if (mText) mText.textContent = (state.site.nav?.brandText) || b.company || "VIORA";

  const phoneRaw = b.phone || DEFAULTS.branding.phone;
  document.querySelectorAll(".phoneText").forEach(el => el.textContent = formatPhoneDisplay(phoneRaw));
  safeSet("contactName", b.name);
  safeSet("contactEmail", b.email);
  safeSet("contactLocation", b.location || state.profile.headquarters);
  safeSet("contactFounderLabel", b.founderLabel);
  safeSet("contactLocationLabel", b.locationLabel);
  const wa = "https://wa.me/" + normalizePhone(phoneRaw);
  safeHref("contactPhoneLink", wa);
  safeHref("whatsappFloat", wa);
  safeHref("mobilePhoneLink", wa);

  safeSet("footerName", b.footerName || b.company || "VIORA");
  safeSet("footerOwner", b.name);
  const cy = $("currentYear"); if (cy) cy.textContent = new Date().getFullYear();
  safeSet("mobileFooterName", b.footerName || b.company || "VIORA");
  safeSet("mobileFooterOwner", b.name);
  const mcy = $("mobileCurrentYear"); if (mcy) mcy.textContent = new Date().getFullYear();

  const c = state.site.contact || {};
  safeSet("contactInfoHeading", c.infoHeading);
  safeSet("contactFormHeading", c.formHeading);
  safeSet("contactFormNameLabel", c.nameLabel);
  safeSet("contactFormEmailLabel", c.emailLabel);
  safeSet("contactFormSubjectLabel", c.subjectLabel);
  safeSet("contactFormMessageLabel", c.messageLabel);
  safeSet("contactFormSubmitLabel", c.submitLabel);
  safeSet("mobileContactFormHeading", c.formHeading);
  safeSet("mobileFormNameLabel", c.nameLabel);
  safeSet("mobileFormEmailLabel", c.emailLabel);
  safeSet("mobileFormSubjectLabel", c.subjectLabel);
  safeSet("mobileFormMessageLabel", c.messageLabel);
  safeSet("mobileFormSubmitLabel", c.submitLabel);
  safeSet("mobileContactName", b.name);
  safeSet("mobileContactEmail", b.email);
  safeSet("mobileContactFounderLabel", b.founderLabel);

  const n = state.site.nav || {};
  safeSet("navAbout", n.about);
  safeSet("navIndustries", n.industries);
  safeSet("navServices", n.services);
  safeSet("navSkills", n.skills);
  safeSet("navProjects", n.projects);
  safeSet("navFaq", n.faq);
  safeSet("navContact", n.contact);
  safeSet("portalLabel", n.portalLabel);
  safeSet("mobilePortalLabel", n.portalLabel);

  const m = state.site.mobile || {};
  safeSet("mobileNavHomeLabel", m.navHome);
  safeSet("mobileNavEcoLabel", m.navEco);
  safeSet("mobileNavIndLabel", m.navInd);
  safeSet("mobileNavServLabel", m.navServ);
  safeSet("mobileNavWorkLabel", m.navWork);
  safeSet("mobileNavFaqLabel", m.navFaq);
  safeSet("mobileNavContactLabel", m.navContact);
}

function renderSectionHeaders(prefix, key) {
  const s = state.site[key] || {};
  safeHtml(`${prefix}Subtitle`, s.subtitle);
  safeHtml(`${prefix}Heading`, s.heading);
  safeHtml(`${prefix}Desc`, s.desc);
}

function renderDesktop() {
  const site = state.site;
  const b = site.branding || {};
  applyTheme(b.primaryColor, b.accentColor);

  const hero = site.hero || {};
  safeSet("companyBadge", hero.badge);
  safeSet("heroName", hero.name);
  safeHtml("heroTitle", hero.title);
  safeHtml("heroBio", hero.bio);
  safeSrc("heroImage", hero.image || b.logoUrl || state.logoUrl);
  safeSet("heroBtn1Label", hero.btn1Label);
  safeHref("heroBtn1", hero.btn1Link);
  safeSet("apkBtnLabel", hero.btn2Label);
  safeHref("apkBtn", hero.btn2Link);
  safeSet("statProjects", hero.stat1Value);
  safeSet("statProjectsLabel", hero.stat1Label);
  safeSet("statIndustries", hero.stat2Value);
  safeSet("statIndustriesLabel", hero.stat2Label);
  safeSet("statExperience", hero.stat3Value);
  safeSet("statExperienceLabel", hero.stat3Label);
  if (hero.typedPhrases) startTyping(hero.typedPhrases, "typedText", "desktop");

  const eco = site.ecosystem || {};
  safeHtml("ecosystemSubtitle", eco.subtitle);
  safeHtml("ecosystemHeading", eco.heading);
  safeHtml("ecosystemDesc", eco.desc);
  safeHtml("ecosystemCtaHeading", eco.ctaHeading);
  safeHtml("ecosystemCtaBody", eco.ctaBody);
  const flow = $("ecosystemFlow");
  if (flow) {
    const steps = eco.steps || [];
    flow.innerHTML = steps.map((s, i) => {
      const arrow = i < steps.length - 1 ? `<div class="flow-arrow"><i class="fa-solid fa-arrow-right"></i></div>` : "";
      return `<div class="flow-step"><div class="flow-icon"><i class="${escapeHtml(s.icon)}"></i></div><div class="flow-label">${escapeHtml(s.title)}</div><div class="flow-sub">${escapeHtml(s.sub || "")}</div></div>${arrow}`;
    }).join("");
  }

  renderSectionHeaders("industries", "industries");
  const ig = $("industriesGrid");
  if (ig) {
    const items = site.industries?.items || [];
    ig.innerHTML = items.map((ind, i) => `
      <div class="industry-card" data-industry-index="${i}">
        <div class="ind-header">
          <div class="ind-icon"><i class="${escapeHtml(ind.icon || "fa-solid fa-industry")}"></i></div>
          <div><div class="ind-title">${escapeHtml(ind.title || "")}</div><div class="ind-tagline">${escapeHtml(ind.tagline || "")}</div></div>
        </div>
        <p class="ind-pain">${escapeHtml(ind.pain || "")}</p>
        <div class="ind-features"><div class="ind-features-inner"><ul style="list-style:none;padding:0;margin:0;">
          ${(ind.features || []).map(f => `<li><i class="fa-solid fa-circle-check"></i><span>${escapeHtml(f)}</span></li>`).join("")}
        </ul></div></div>
        <div class="ind-toggle"><span>See features</span> <i class="fa-solid fa-chevron-down"></i></div>
      </div>`).join("");
    ig.querySelectorAll(".industry-card").forEach(card => {
      card.addEventListener("click", () => {
        const isOpen = card.classList.contains("open");
        ig.querySelectorAll(".industry-card").forEach(c => c.classList.remove("open"));
        if (!isOpen) card.classList.add("open");
      });
    });
  }

  const cmp = site.compare || {};
  safeHtml("whySubtitle", cmp.subtitle);
  safeHtml("whyHeading", cmp.heading);
  safeHtml("whyDesc", cmp.desc);
  safeSet("compareColCap", cmp.colCap);
  safeSet("compareColStandalone", cmp.colStandalone);
  safeSet("compareColEcosystem", cmp.colEcosystem);
  const cb = $("compareBody");
  if (cb) {
    cb.innerHTML = (cmp.rows || []).map(r => `<tr>
      <td>${escapeHtml(r.capability || "")}</td>
      <td class="standalone-val">${escapeHtml(r.standalone || "")}</td>
      <td class="ecosystem-val"><i class="fa-solid fa-check"></i> ${escapeHtml(r.ecosystem || "")}</td>
    </tr>`).join("");
  }

  renderSectionHeaders("services", "services");
  const sg = $("servicesGrid");
  if (sg) {
    sg.innerHTML = (site.services?.items || []).map(s => `
      <div class="service-card">
        <div class="service-icon"><i class="${escapeHtml(s.icon || "fa-solid fa-code")}"></i></div>
        <h3>${escapeHtml(s.title || "")}</h3>
        <p>${escapeHtml(s.description || "")}</p>
      </div>`).join("");
  }

  renderSectionHeaders("skills", "skills");
  const skg = $("skillsGrid");
  if (skg) {
    skg.innerHTML = (site.skills?.items || []).map(s => `
      <div class="skill-item">
        <div class="skill-icon"><i class="${escapeHtml(s.icon || "fa-solid fa-code")}"></i></div>
        <div class="skill-name">${escapeHtml(s.name || "")}</div>
        <div class="skill-bar"><div class="fill" style="width:${Number(s.level) || 0}%;"></div></div>
      </div>`).join("");
  }

  renderSectionHeaders("projects", "projects");
  const pg = $("projectsGrid");
  if (pg) {
    const items = site.projects?.items || [];
    if (!items.length) {
      pg.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:2.5rem;font-size:.9rem;">Portfolio coming soon.</div>`;
    } else {
      pg.innerHTML = items.map(p => `
        <div class="project-card">
          ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title || "")}" onerror="this.style.display='none'">` : ""}
          <div class="project-body">
            <h3>${escapeHtml(p.title || "")}</h3>
            <p>${escapeHtml(p.description || "")}</p>
            <div class="project-tags">${(p.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div>
            ${p.link ? `<a href="${escapeHtml(p.link)}" class="project-link" target="_blank" rel="noopener">View Project <i class="fa-solid fa-arrow-right"></i></a>` : ""}
          </div>
        </div>`).join("");
    }
  }

  renderSectionHeaders("testimonials", "testimonials");
  const tg = $("testimonialsGrid");
  if (tg) {
    tg.innerHTML = (site.testimonials?.items || []).map(t => `
      <div class="testimonial-card">
        <div class="quote-icon"><i class="fa-solid fa-quote-left"></i></div>
        <p class="testimonial-text">"${escapeHtml(t.text || "")}"</p>
        <p class="testimonial-author">${escapeHtml(t.name || "")}</p>
        <p class="testimonial-role">${escapeHtml(t.role || "")}</p>
      </div>`).join("");
  }

  renderSectionHeaders("blog", "blog");
  const bg = $("blogGrid");
  if (bg) {
    bg.innerHTML = (site.blog?.items || []).map(b => `
      <div class="blog-card">
        <div class="blog-body">
          <div class="blog-meta"><span class="blog-tag">${escapeHtml(b.tag || "")}</span><span>${escapeHtml(b.date || "")}</span></div>
          <h3>${escapeHtml(b.title || "")}</h3>
          <p>${escapeHtml(b.excerpt || "")}</p>
          <div class="blog-footer">
            <span class="blog-read"><i class="fa-solid fa-book-open"></i> ${escapeHtml(b.read || "")}</span>
            <i class="fa-solid fa-arrow-right" style="color:var(--accent);font-size:.7rem;"></i>
          </div>
        </div>
      </div>`).join("");
  }

  renderSectionHeaders("faq", "faq");
  const fg = $("faqGrid");
  if (fg) {
    fg.innerHTML = (site.faq?.items || []).map((f, i) => `
      <div class="faq-item" data-faq="${i}">
        <div class="faq-q">${escapeHtml(f.q || "")}<span class="faq-icon"><i class="fa-solid fa-chevron-down"></i></span></div>
        <div class="faq-a">${escapeHtml(f.a || "")}</div>
      </div>`).join("");
    fg.querySelectorAll(".faq-item").forEach(item => {
      item.querySelector(".faq-q").addEventListener("click", () => item.classList.toggle("open"));
    });
  }

  renderSectionHeaders("tech", "tech");
  const tt = $("techTrack");
  if (tt) {
    const items = site.tech?.items || [];
    const doubled = [...items, ...items];
    tt.innerHTML = doubled.map(t => `<div class="tech-item"><i class="${escapeHtml(t.icon || "fa-solid fa-code")}"></i><span>${escapeHtml(t.name || "")}</span></div>`).join("");
  }

  renderSectionHeaders("stats", "stats");
  const sb = $("statsBannerGrid");
  if (sb) {
    sb.innerHTML = (site.stats?.items || []).map(s => `
      <div class="stats-banner-item">
        <div class="stat-icon-lg"><i class="${escapeHtml(s.icon || "fa-solid fa-star")}"></i></div>
        <div class="stat-number-lg">${escapeHtml(s.value || "")}<span class="accent">+</span></div>
        <div class="stat-label-lg">${escapeHtml(s.label || "")}</div>
      </div>`).join("");
  }

  renderSectionHeaders("contact", "contact");
}

function renderMobile() {
  const site = state.site;
  const b = site.branding || {};
  const hero = site.hero || {};

  safeSet("mobileCompanyBadge", hero.badge);
  safeSet("mobileHeroName", hero.name);
  safeHtml("mobileHeroTitle", hero.title);
  safeHtml("mobileHeroBio", hero.bio);
  safeSrc("mobileHeroImage", hero.image || b.logoUrl || state.logoUrl);
  safeSet("mobileHeroBtn1Label", hero.btn1Label);
  safeSet("mobileApkBtnLabel", hero.btn2Label);
  safeSet("mobileStatProjects", hero.stat1Value);
  safeSet("mobileStatProjectsLabel", hero.stat1Label);
  safeSet("mobileStatIndustries", hero.stat2Value);
  safeSet("mobileStatIndustriesLabel", hero.stat2Label);
  safeSet("mobileStatExperience", hero.stat3Value);
  safeSet("mobileStatExperienceLabel", hero.stat3Label);
  if (hero.typedPhrases) startTyping(hero.typedPhrases, "mobileTypedText", "mobile");

  const mobileMap = {
    ecosystem: "mobileEcosystem", industries: "mobileIndustries",
    services: "mobileServices", skills: "mobileSkills",
    projects: "mobileProjects", testimonials: "mobileTestimonials",
    blog: "mobileBlog", faq: "mobileFaq", contact: "mobileContact"
  };
  Object.entries(mobileMap).forEach(([key, prefix]) => {
    const s = site[key] || {};
    safeHtml(`${prefix}Subtitle`, s.subtitle);
    safeHtml(`${prefix}Heading`, s.heading);
    safeHtml(`${prefix}Desc`, s.desc);
  });

  const mef = $("mobileEcosystemFlow");
  if (mef) {
    mef.innerHTML = (site.ecosystem?.steps || []).map((s, i) => `
      <div class="mobile-service-item" style="padding:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="service-icon-sm"><i class="${escapeHtml(s.icon)}"></i></div>
          <div>
            <div style="font-weight:600;font-size:.85rem;color:var(--text-color);">${i + 1}. ${escapeHtml(s.title)}</div>
            <div style="font-size:.7rem;color:var(--text-muted);">${escapeHtml(s.sub || "")}</div>
          </div>
        </div>
      </div>`).join("");
  }

  const mil = $("mobileIndustriesList");
  if (mil) {
    mil.innerHTML = (site.industries?.items || []).map((ind, i) => `
      <div class="mobile-industry-card" data-mindustry-index="${i}">
        <div class="mi-header">
          <div class="mi-icon"><i class="${escapeHtml(ind.icon || "fa-solid fa-industry")}"></i></div>
          <div style="flex:1;min-width:0;">
            <div class="mi-title">${escapeHtml(ind.title || "")}</div>
            <div class="mi-tagline">${escapeHtml(ind.tagline || "")}</div>
          </div>
          <i class="fa-solid fa-chevron-down mi-toggle-icon"></i>
        </div>
        <p class="mi-pain">${escapeHtml(ind.pain || "")}</p>
        <div class="mi-features"><div class="mi-features-inner"><ul style="list-style:none;padding:0;margin:0;">
          ${(ind.features || []).map(f => `<li><i class="fa-solid fa-circle-check"></i><span>${escapeHtml(f)}</span></li>`).join("")}
        </ul></div></div>
      </div>`).join("");
    mil.querySelectorAll(".mobile-industry-card").forEach(card => {
      card.querySelector(".mi-header").addEventListener("click", () => {
        const isOpen = card.classList.contains("open");
        mil.querySelectorAll(".mobile-industry-card").forEach(c => c.classList.remove("open"));
        if (!isOpen) card.classList.add("open");
      });
    });
  }

  const msl = $("mobileServicesList");
  if (msl) {
    msl.innerHTML = (site.services?.items || []).map((s, i) => `
      <div class="mobile-service-item" data-index="${i}">
        <div class="service-header">
          <div class="service-icon-sm"><i class="${escapeHtml(s.icon || "fa-solid fa-code")}"></i></div>
          <div class="service-title-sm">${escapeHtml(s.title || "")}</div>
          <div class="expand-icon"><i class="fa-solid fa-chevron-down"></i></div>
        </div>
        <div class="service-body"><p>${escapeHtml(s.description || "")}</p></div>
      </div>`).join("");
    msl.querySelectorAll(".mobile-service-item .service-header").forEach(h => {
      h.addEventListener("click", function () {
        const item = this.closest(".mobile-service-item");
        const wasOpen = item.classList.contains("open");
        msl.querySelectorAll(".mobile-service-item").forEach(el => el.classList.remove("open"));
        if (!wasOpen) item.classList.add("open");
      });
    });
  }

  const mkg = $("mobileSkillsGrid");
  if (mkg) {
    mkg.innerHTML = (site.skills?.items || []).map(s => `<div class="mobile-skill-chip"><i class="${escapeHtml(s.icon || "fa-solid fa-code")}"></i><span>${escapeHtml(s.name || "")}</span></div>`).join("");
  }

  const mpl = $("mobileProjectsList");
  if (mpl) {
    const items = site.projects?.items || [];
    if (!items.length) {
      mpl.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:2rem;font-size:.85rem;">Portfolio coming soon.</div>`;
    } else {
      mpl.innerHTML = items.map(p => `
        <div class="mobile-project-card">
          ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title || "")}" loading="lazy" onerror="this.style.display='none'">` : ""}
          <div class="project-body-sm">
            <h3>${escapeHtml(p.title || "")}</h3>
            <p>${escapeHtml(p.description || "")}</p>
            <div class="project-tags">${(p.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div>
            ${p.link ? `<a href="${escapeHtml(p.link)}" class="project-link-sm" target="_blank" rel="noopener">View Project <i class="fa-solid fa-arrow-right"></i></a>` : ""}
          </div>
        </div>`).join("");
    }
  }

  const mtl = $("mobileTestimonialsList");
  if (mtl) {
    mtl.innerHTML = (site.testimonials?.items || []).map(t => `
      <div class="mobile-testimonial-card">
        <div class="quote-icon"><i class="fa-solid fa-quote-left"></i></div>
        <p class="testimonial-text">"${escapeHtml(t.text || "")}"</p>
        <p class="testimonial-author">${escapeHtml(t.name || "")}</p>
        <p class="testimonial-role">${escapeHtml(t.role || "")}</p>
      </div>`).join("");
  }

  const mbl = $("mobileBlogList");
  if (mbl) {
    mbl.innerHTML = (site.blog?.items || []).map(b => `
      <div class="mobile-testimonial-card" style="border-left:3px solid var(--accent);">
        <div class="quote-icon" style="opacity:.5;"><i class="fa-solid fa-newspaper"></i></div>
        <div style="font-size:.65rem;color:var(--accent);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:4px;">${escapeHtml(b.tag || "")} · ${escapeHtml(b.date || "")}</div>
        <h4 style="font-size:.88rem;color:var(--text-color);margin-bottom:6px;font-family:'Space Grotesk',sans-serif;">${escapeHtml(b.title || "")}</h4>
        <p style="font-size:.78rem;color:var(--text-secondary-color);line-height:1.6;margin-bottom:8px;">${escapeHtml(b.excerpt || "")}</p>
        <div style="font-size:.68rem;color:var(--text-muted);"><i class="fa-solid fa-book-open"></i> ${escapeHtml(b.read || "")}</div>
      </div>`).join("");
  }

  const mfl = $("mobileFaqList");
  if (mfl) {
    mfl.innerHTML = (site.faq?.items || []).map((f, i) => `
      <div class="mobile-service-item" data-faq-mobile="${i}">
        <div class="service-header">
          <div class="service-icon-sm"><i class="fa-solid fa-circle-question"></i></div>
          <div class="service-title-sm">${escapeHtml(f.q || "")}</div>
          <div class="expand-icon"><i class="fa-solid fa-chevron-down"></i></div>
        </div>
        <div class="service-body"><p>${escapeHtml(f.a || "")}</p></div>
      </div>`).join("");
    mfl.querySelectorAll(".mobile-service-item .service-header").forEach(h => {
      h.addEventListener("click", function () {
        const item = this.closest(".mobile-service-item");
        const wasOpen = item.classList.contains("open");
        mfl.querySelectorAll(".mobile-service-item").forEach(el => el.classList.remove("open"));
        if (!wasOpen) item.classList.add("open");
      });
    });
  }
}

function renderUI() {
  renderSEO();
  renderBranding();
  renderDesktop();
  renderMobile();
}

function deepMerge(defaults, incoming) {
  const out = JSON.parse(JSON.stringify(defaults));
  if (!incoming || typeof incoming !== "object") return out;
  Object.keys(incoming).forEach(key => {
    const dv = out[key], iv = incoming[key];
    if (Array.isArray(iv)) out[key] = iv;
    else if (iv && typeof iv === "object" && dv && typeof dv === "object" && !Array.isArray(dv)) out[key] = deepMerge(dv, iv);
    else if (iv !== undefined && iv !== null) out[key] = iv;
  });
  return out;
}

function subscribeToFirebase() {
  if (!firebaseReady || !db) { hideLoader(); return; }
  db.ref(SITE_PATH).on("value", snap => {
    state.site = deepMerge(DEFAULTS, snap.exists() ? snap.val() : {});
    renderUI();
    hideLoader();
  }, () => hideLoader());
  db.ref(PROFILE_PATH).on("value", snap => {
    state.profile = snap.exists() ? (snap.val() || {}) : {};
    if (!state.site.branding.location && state.profile.headquarters) safeSet("contactLocation", state.profile.headquarters);
  }, () => {});
  db.ref(LOGO_PATH).on("value", snap => {
    state.logoUrl = snap.exists() ? (snap.val() || "") : "";
    if (!state.site.branding.logoUrl && state.logoUrl) {
      renderBranding();
      safeSrc("heroImage", state.logoUrl);
      safeSrc("mobileHeroImage", state.logoUrl);
    }
  }, () => {});
}

function initTheme() {
  const themeToggle = $("themeToggle");
  const mobileThemeToggle = $("mobileThemeToggle");
  let cur = "dark";
  try { cur = localStorage.getItem("viora-public-theme") || "dark"; } catch (e) {}
  document.documentElement.setAttribute("data-theme", cur);
  function updateIcons() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const html = isDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    if (themeToggle) themeToggle.innerHTML = html;
    if (mobileThemeToggle) mobileThemeToggle.innerHTML = html;
  }
  updateIcons();
  function toggle() {
    const nt = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nt);
    try { localStorage.setItem("viora-public-theme", nt); } catch (e) {}
    updateIcons();
    const b = state.site.branding || {};
    applyTheme(b.primaryColor, b.accentColor);
  }
  if (themeToggle) themeToggle.addEventListener("click", toggle);
  if (mobileThemeToggle) mobileThemeToggle.addEventListener("click", toggle);
}

function initScrollInteractions() {
  const scrollTopBtn = $("scrollTopBtn");
  const nav = $("mainNav");
  window.addEventListener("scroll", () => {
    if (scrollTopBtn) scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 30);
  }, { passive: true });
  if (scrollTopBtn) scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  const revealAll = () => {
    document.querySelectorAll(".reveal:not(.visible), .stagger-children:not(.visible)").forEach(el => el.classList.add("visible"));
  };
  const handleReveal = () => {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const cutoff = vh - 40;
    document.querySelectorAll(".reveal:not(.visible), .stagger-children:not(.visible)").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < cutoff && r.bottom > -200) el.classList.add("visible");
    });
  };
  const enableReveal = () => {
    try { handleReveal(); document.documentElement.classList.add("js-reveal-enabled"); }
    catch (e) { document.documentElement.classList.remove("js-reveal-enabled"); revealAll(); }
  };
  if (document.readyState === "complete") enableReveal();
  else window.addEventListener("load", enableReveal, { once: true });

  let scheduled = false;
  const onScroll = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; handleReveal(); });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  setTimeout(revealAll, 2000);
  ["pointerdown", "touchstart", "keydown"].forEach(evt => {
    window.addEventListener(evt, function once() { revealAll(); window.removeEventListener(evt, once); }, { passive: true, once: true });
  });
  window.addEventListener("load", () => setTimeout(revealAll, 5000), { once: true });
}

function initMobileNav() {
  const screens = document.querySelectorAll(".mobile-screen");
  const navItems = document.querySelectorAll(".mobile-bottom-nav .nav-item");
  function switchScreen(name) {
    screens.forEach(s => s.classList.remove("active"));
    const target = document.querySelector('.mobile-screen[data-screen="' + name + '"]');
    if (!target) return;
    target.classList.add("active");
    target.scrollTop = 0;
    if (target.animate) target.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 240, easing: "ease-out" });
    navItems.forEach(it => it.classList.toggle("active", it.dataset.screen === name));
  }
  navItems.forEach(item => item.addEventListener("click", function () {
    if (this.dataset.screen) switchScreen(this.dataset.screen);
  }));
  document.querySelectorAll("[data-screen-target]").forEach(btn => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (this.dataset.screenTarget) switchScreen(this.dataset.screenTarget);
    });
  });
}

function initContactForms() {
  function submit(form, fields, e) {
    e.preventDefault();
    const name = $(fields.name).value.trim();
    const email = $(fields.email).value.trim();
    const subject = $(fields.subject).value.trim();
    const message = $(fields.message).value.trim();
    if (!name || !email || !message) return alert("Please fill all required fields.");
    const b = state.site.branding || {};
    const wa = normalizePhone(b.phone || DEFAULTS.branding.phone);
    const msg = `Hi! I'm ${name}. ${message} (${subject || "Inquiry"}) — ${email}`;
    window.open("https://wa.me/" + wa + "?text=" + encodeURIComponent(msg), "_blank");
    form.reset();
  }
  const df = $("contactForm");
  if (df) df.addEventListener("submit", e => submit(df, { name: "formName", email: "formEmail", subject: "formSubject", message: "formMessage" }, e));
  const mf = $("mobileContactForm");
  if (mf) mf.addEventListener("submit", e => submit(mf, { name: "mobileFormName", email: "mobileFormEmail", subject: "mobileFormSubject", message: "mobileFormMessage" }, e));
}

function initNavMenu() {
  const toggle = $("mobileToggle"), links = $("navLinks");
  if (toggle && links) toggle.addEventListener("click", () => links.classList.toggle("open"));
}

(function boot() {
  try {
    initTheme();
    initParticles();
    initScrollInteractions();
    initMobileNav();
    initContactForms();
    initNavMenu();
    renderUI();
    hideLoader();
    subscribeToFirebase();
    setTimeout(hideLoader, 4000);
  } catch (e) {
    console.error("[VIORA Public] Boot error:", e);
    hideLoader();
  }
})();

})();
