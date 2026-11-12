/* blueprint.js — category browser, blueprint preview modal, lead form, wizard */
(function () {
    "use strict";

    var CATEGORIES = window.CATEGORIES;
    var INDUSTRIES = window.INDUSTRIES;
    var MODULE_DEFS = window.MODULE_DEFS;
    var WIZARD_DATA = window.WIZARD_DATA;

    var categoryCardsEl = document.getElementById("categoryCards");
    var searchInp = document.getElementById("indSearch");
    var searchClear = document.getElementById("searchClear");
    var resultsMeta = document.getElementById("resultsMeta");
    var noResults = document.getElementById("noResults");

    var activeSearch = "";
    var activeIndustryKey = null;

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function catInfo(key) {
        for (var i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i].key === key) return CATEGORIES[i];
        }
        return { key: key, em: "📁", name: "Other" };
    }
    function countsByCat() {
        var out = {};
        CATEGORIES.forEach(function (c) { out[c.key] = 0; });
        Object.keys(INDUSTRIES).forEach(function (k) {
            out[INDUSTRIES[k].cat] = (out[INDUSTRIES[k].cat] || 0) + 1;
        });
        return out;
    }
    function subsOfCat(catKey) {
        return Object.keys(INDUSTRIES).filter(function (k) { return INDUSTRIES[k].cat === catKey; });
    }

    function renderCategoryCards() {
        var counts = countsByCat();
        var q = activeSearch.trim().toLowerCase();

        var visibleCats = CATEGORIES.filter(function (c) {
            if (!q) return true;
            if (c.name.toLowerCase().indexOf(q) !== -1) return true;
            return subsOfCat(c.key).some(function (k) {
                var v = INDUSTRIES[k];
                return v.name.toLowerCase().indexOf(q) !== -1 ||
                    (v.problem && v.problem.toLowerCase().indexOf(q) !== -1) ||
                    (v.solutions && v.solutions.join(" ").toLowerCase().indexOf(q) !== -1);
            });
        });

        categoryCardsEl.innerHTML = visibleCats.map(function (c) {
            var n = counts[c.key] || 0;
            return '<div class="cat-wrap" data-cat-wrap="' + c.key + '">' +
                '<button type="button" class="cat-card" data-cat="' + c.key + '" aria-label="Open ' + escHtml(c.name) + '">' +
                    '<span class="cat-em" aria-hidden="true">' + c.em + '</span>' +
                    '<span class="cat-name">' + escHtml(c.name) + '</span>' +
                    '<span class="cat-count"><b>' + n + '</b> sub-industries</span>' +
                '</button>' +
            '</div>';
        }).join("");

        Array.prototype.forEach.call(categoryCardsEl.querySelectorAll(".cat-card"), function (card) {
            card.addEventListener("click", function () { openCategory(card.dataset.cat); });
        });

        if (q) {
            var totalMatches = 0;
            visibleCats.forEach(function (c) {
                totalMatches += subsOfCat(c.key).filter(function (k) {
                    var v = INDUSTRIES[k];
                    return v.name.toLowerCase().indexOf(q) !== -1 ||
                        (v.problem && v.problem.toLowerCase().indexOf(q) !== -1) ||
                        (v.solutions && v.solutions.join(" ").toLowerCase().indexOf(q) !== -1) ||
                        c.name.toLowerCase().indexOf(q) !== -1;
                }).length;
            });
            resultsMeta.innerHTML = 'Found <strong>' + totalMatches + '</strong> matching sub-industries in <strong>' + visibleCats.length + '</strong> categories';
        } else {
            resultsMeta.innerHTML = '<strong>' + CATEGORIES.length + '</strong> categories · <strong>' + Object.keys(INDUSTRIES).length + '</strong> sub-industries';
        }

        if (!visibleCats.length) {
            categoryCardsEl.innerHTML = "";
            noResults.style.display = "block";
        } else {
            noResults.style.display = "none";
        }
    }

    function openCategory(catKey) {
        var subs = subsOfCat(catKey);
        var wrap = categoryCardsEl.querySelector('[data-cat-wrap="' + catKey + '"]');
        if (!wrap) return;
        if (wrap.classList.contains("expanded")) { closeCategory(catKey); return; }
        categoryCardsEl.querySelectorAll(".cat-wrap.expanded").forEach(function (w) {
            closeCategory(w.dataset.catWrap);
        });
        Array.prototype.forEach.call(categoryCardsEl.querySelectorAll(".cat-card"), function (card) {
            card.classList.toggle("active", card.dataset.cat === catKey);
        });
        var panel = document.createElement("div");
        panel.className = "cat-subpanel";
        panel.setAttribute("data-cat-subpanel", catKey);
        panel.innerHTML = '<div class="subcats-grid">' +
            subs.sort(function (a, b) { return INDUSTRIES[a].name.localeCompare(INDUSTRIES[b].name); })
            .map(function (k) {
                var v = INDUSTRIES[k];
                return '<button type="button" class="subcat-btn" data-key="' + k + '">' +
                    '<span class="sb-em" aria-hidden="true">' + v.em + '</span>' +
                    '<span class="sb-name">' + escHtml(v.name) + '</span>' +
                    '</button>';
            }).join("") +
        '</div>';
        Array.prototype.forEach.call(panel.querySelectorAll(".subcat-btn"), function (b) {
            b.addEventListener("click", function (ev) {
                ev.stopPropagation();
                activeIndustryKey = b.dataset.key;
                window.openBlueprintPreview();
            });
        });
        wrap.appendChild(panel);
        wrap.classList.add("expanded");
        setTimeout(function () {
            var top = wrap.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top: top, behavior: "smooth" });
        }, 80);
    }

    function closeCategory(catKey) {
        var wrap = categoryCardsEl.querySelector('[data-cat-wrap="' + catKey + '"]');
        if (!wrap) return;
        var panel = wrap.querySelector('[data-cat-subpanel]');
        if (panel) panel.remove();
        wrap.classList.remove("expanded");
        Array.prototype.forEach.call(categoryCardsEl.querySelectorAll(".cat-card"), function (card) {
            if (card.dataset.cat === catKey) card.classList.remove("active");
        });
    }

    var marketplaceProductsPromise=null;
function loadIndustryMarketplaceProducts(){
 if(marketplaceProductsPromise)return marketplaceProductsPromise;
 marketplaceProductsPromise=(async function(){try{var appMod=await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js');var dbMod=await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js');var config={apiKey:"AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",authDomain:"cliffclient-35ec5.firebaseapp.com",databaseURL:"https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",projectId:"cliffclient-35ec5",storageBucket:"cliffclient-35ec5.firebasestorage.app",messagingSenderId:"519782791696",appId:"1:519782791696:web:6e1a654ddeed14b72b2895"};var app;try{app=appMod.getApp()}catch(_){app=appMod.initializeApp(config)}var snap=await dbMod.get(dbMod.ref(dbMod.getDatabase(app),'viora_data/orgs/viora/products'));var raw=snap.exists()?snap.val():{};return Object.keys(raw||{}).map(function(id){return Object.assign({id:id},raw[id]||{})}).filter(function(p){return p.status!=='archived'&&p.status!=='draft'});}catch(e){console.warn('[VIORA industry marketplace] Catalogue unavailable:',e);return [];}})();return marketplaceProductsPromise;
}
function renderIndustryMarketplace(ind,cat){
 var host=document.getElementById('bpMarketplaceProducts');if(!host)return;var categoryText=String(cat&&cat.name||'').toLowerCase(),industryText=String(ind&&ind.name||'').toLowerCase(),key=String(ind&&ind.cat||'').toLowerCase();
 var aliases={'retail_trade':['retail','trade','commerce','pos','inventory','wholesale'],'food_bev':['food','beverage','restaurant','hospitality'],'health_wellness':['health','medical','clinic','wellness'],'beauty_personal':['beauty','salon','personal care'],'prof_services':['professional','legal','accounting','consulting'],'creative_media':['creative','media','design'],'construction':['construction','building'],'transport_logi':['transport','logistics','fleet'],'agri_farming':['agriculture','farming','agri'],'education':['education','training','school'],'finance_ins':['finance','insurance'],'real_estate':['real estate','property'],'hospitality':['hospitality','hotel','tourism'],'manufacturing':['manufacturing','industry'],'tech_digital':['technology','digital','software'],'community_faith':['community','faith'],'informal_msme':['msme','small business']};
 var terms=[categoryText,industryText].concat(aliases[key]||[]).filter(Boolean);
 loadIndustryMarketplaceProducts().then(function(products){if(!document.getElementById('bpMarketplaceProducts'))return;var match=products.filter(function(p){var hay=[p.category,p.name,p.description].concat(Array.isArray(p.tags)?p.tags:[typeof p.tags==='string'?p.tags:''],Array.isArray(p.features)?p.features:[]).join(' ').toLowerCase();return terms.some(function(t){return t.length>2&&hay.includes(t);});}).slice(0,6);if(!match.length){host.innerHTML='<div class="bp-marketplace-empty"><i class="fa-solid fa-box-open"></i><span>No live Marketplace products are currently tagged for '+escHtml(ind.name)+'.</span><a href="/market">Browse the full Marketplace</a></div>';return;}host.innerHTML=match.map(function(p){var price=Number(p.price)>0?'KSh '+Math.round(Number(p.price)*129).toLocaleString('en-KE')+(p.period?' / '+escHtml(p.period):''):(p.pricing==='quote'?'Request a quote':'View product');var image=p.image?'<img src="'+escHtml(p.image)+'" alt="" loading="lazy">':'<span class="bp-product-icon"><i class="'+escHtml(p.icon||'fa-solid fa-cube')+'"></i></span>';return '<article class="bp-market-product">'+image+'<div class="bp-product-info"><b>'+escHtml(p.name||'VIORA product')+'</b><p>'+escHtml(p.description||'Explore this product in the VIORA Marketplace.')+'</p><strong>'+price+'</strong><a href="/market">View in Marketplace <i class="fa-solid fa-arrow-right"></i></a></div></article>';}).join('');});
}

window.openBlueprintPreview = function () {
        if (!activeIndustryKey || !INDUSTRIES[activeIndustryKey]) {
            alert("Please pick an industry first.");
            return;
        }
        var ind = INDUSTRIES[activeIndustryKey];
        var cat = catInfo(ind.cat);

        document.getElementById("bpIndustryBadge").textContent = ind.em;
        document.getElementById("bpCategory").textContent = cat.name;
        document.getElementById("bpTitle").textContent = ind.name;
        document.getElementById("bpSubtitle").textContent = "Your personalised VIORA blueprint for " + ind.name;

        document.getElementById("bpProblem").textContent = ind.problem || "—";

        var solEl = document.getElementById("bpSolutions");
        solEl.innerHTML = (ind.solutions || []).map(function (s) {
            var parts = String(s).split(" — ");
            if (parts.length >= 2) {
                return '<li><div><strong>' + escHtml(parts[0]) + '</strong><span>' + escHtml(parts.slice(1).join(" — ")) + '</span></div></li>';
            }
            return '<li><div>' + escHtml(s) + '</div></li>';
        }).join("");

        var chgEl = document.getElementById("bpChanges");
        chgEl.innerHTML = (ind.changes || []).map(function (c) {
            var parts = String(c).split(" — ");
            if (parts.length >= 2) {
                return '<li><div><strong>' + escHtml(parts[0]) + '</strong><span>' + escHtml(parts.slice(1).join(" — ")) + '</span></div></li>';
            }
            return '<li><div>' + escHtml(c) + '</div></li>';
        }).join("");

        var modEl = document.getElementById("bpModules");
        var mods = ind.modules || [];
        if (!mods.length) {
            modEl.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem;">No modules recommended yet.</span>';
        } else {
            modEl.innerHTML = mods.map(function (key) {
                var def = MODULE_DEFS[key];
                if (!def) return "";
                return '<span class="bp-module-chip"><span class="em" aria-hidden="true">' + def.em + '</span>' + escHtml(def.name) + '</span>';
            }).join("");
        }

        renderIndustryMarketplace(ind,cat);
        var marketLink=document.getElementById("bpMarketplaceLink");if(marketLink)marketLink.href="/market";
        window.openModal("vioraBlueprintModal");
    };

    window.closeBlueprintModal = function () {
        window.closeModal("vioraBlueprintModal");
    };

    window.populateLeadSummary = function () {
        var sub = document.getElementById('vioraLeadSub');
        var summary = document.getElementById('leadSummary');
        var summaryIcon = document.getElementById('leadSummaryIcon');
        var summaryTitle = document.getElementById('leadSummaryTitle');
        var summaryCat = document.getElementById('leadSummaryCat');
        var summaryModules = document.getElementById('leadModulesList');
        var summaryProblem = document.getElementById('leadSummaryProblem');

        if (activeIndustryKey && INDUSTRIES[activeIndustryKey]) {
            var ind = INDUSTRIES[activeIndustryKey];
            var cat = catInfo(ind.cat);
            if (sub) sub.textContent = "You picked " + ind.name + ". Drop your details and we'll send the full blueprint on WhatsApp.";
            if (summary) summary.style.display = "block";
            if (summaryIcon) summaryIcon.textContent = ind.em;
            if (summaryTitle) summaryTitle.textContent = ind.name;
            if (summaryCat) summaryCat.textContent = cat.name;
            if (summaryModules) {
                summaryModules.innerHTML = (ind.modules || []).map(function (key) {
                    var def = MODULE_DEFS[key];
                    if (!def) return "";
                    return '<span class="lead-module-tag"><span class="em" aria-hidden="true">' + def.em + '</span>' + escHtml(def.name) + '</span>';
                }).join("");
            }
            if (summaryProblem) summaryProblem.textContent = ind.problem || "—";
        } else {
            if (sub) sub.textContent = "Drop your details and we'll continue on WhatsApp with your custom plan.";
            if (summary) summary.style.display = "none";
        }
    };

    window.getActiveIndustry = function () {
        return activeIndustryKey && INDUSTRIES[activeIndustryKey] ? {
            key: activeIndustryKey,
            data: INDUSTRIES[activeIndustryKey],
            cat: catInfo(INDUSTRIES[activeIndustryKey].cat)
        } : null;
    };

    window.clearActiveIndustry = function () {
        activeIndustryKey = null;
    };

    window.openModal = function (id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.classList.add("open");
        m.setAttribute("aria-hidden", "false");
        document.body.classList.add("locked");
    };
    window.closeModal = function (id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.classList.remove("open");
        m.setAttribute("aria-hidden", "true");
        document.body.classList.remove("locked");
    };

    if (searchInp) {
        searchInp.addEventListener("input", function () {
            activeSearch = searchInp.value;
            searchClear.classList.toggle("show", !!activeSearch.trim());
            renderCategoryCards();
            if (activeSearch.trim()) {
                var open = categoryCardsEl.querySelector(".cat-wrap.expanded");
                if (open) closeCategory(open.dataset.catWrap);
            }
        });
    }
    if (searchClear) {
        searchClear.addEventListener("click", function () {
            searchInp.value = "";
            activeSearch = "";
            searchClear.classList.remove("show");
            renderCategoryCards();
            var open = categoryCardsEl.querySelector(".cat-wrap.expanded");
            if (open) closeCategory(open.dataset.catWrap);
            searchInp.focus();
        });
    }

    function initWizard() {
        var modal = document.getElementById("vioraWizardModal");
        var launch = document.getElementById("wizardLaunch");
        var closeBtn = document.getElementById("vioraWizardClose");
        var backBtn = document.getElementById("wizBack");
        var nextBtn = document.getElementById("wizNext");
        var progressBar = document.getElementById("wizProgressBar");
        var painsEl = document.getElementById("wizPains");
        var staffEl = document.getElementById("wizStaff");
        var branchesEl = document.getElementById("wizBranches");
        var toolsEl = document.getElementById("wizTools");
        if (!modal || !launch) return;

        var currentStep = 1;
        var totalSteps = 4;
        var answers = { pains: [], staff: null, branches: null, tools: [] };

        function renderOptions(el, options, type, multi) {
            el.innerHTML = options.map(function (o) {
                return '<button type="button" class="wiz-' + (type === "tool" ? "tool" : "option") + '" data-id="' + o.id + '">' +
                    (type === "tool" ? '<span class="check">✓</span>' : '') +
                    '<span>' + escHtml(o.label || o.name) + '</span>' +
                '</button>';
            }).join("");
            Array.prototype.forEach.call(el.querySelectorAll("button"), function (btn) {
                btn.addEventListener("click", function () {
                    var id = btn.dataset.id;
                    if (multi) {
                        btn.classList.toggle("selected");
                        var arr = type === "tool" ? answers.tools : answers.pains;
                        var idx = arr.indexOf(id);
                        if (idx === -1) arr.push(id); else arr.splice(idx, 1);
                    } else {
                        Array.prototype.forEach.call(el.querySelectorAll("button"), function (b) { b.classList.remove("selected"); });
                        btn.classList.add("selected");
                        if (type === "staff") answers.staff = id;
                        else if (type === "branches") answers.branches = id;
                    }
                });
            });
        }

        renderOptions(painsEl, WIZARD_DATA.pains, "pain", true);
        renderOptions(staffEl, WIZARD_DATA.staff, "staff", false);
        renderOptions(branchesEl, WIZARD_DATA.branches, "branches", false);
        renderOptions(toolsEl, window.COST_TOOLS.map(function (t) { return { id: t.id, label: t.name + " — KES " + t.price.toLocaleString() }; }), "tool", true);

        function showStep(n) {
            currentStep = n;
            modal.querySelectorAll(".wiz-step").forEach(function (s) {
                s.hidden = (parseInt(s.dataset.step, 10) !== n);
            });
            progressBar.style.width = (n / totalSteps * 100) + "%";
            backBtn.disabled = n === 1;
            nextBtn.textContent = n === totalSteps ? "See my blueprint →" : "Next →";
        }

        launch.addEventListener("click", function () {
            answers = { pains: [], staff: null, branches: null, tools: [] };
            renderOptions(painsEl, WIZARD_DATA.pains, "pain", true);
            renderOptions(staffEl, WIZARD_DATA.staff, "staff", false);
            renderOptions(branchesEl, WIZARD_DATA.branches, "branches", false);
            renderOptions(toolsEl, window.COST_TOOLS.map(function (t) { return { id: t.id, label: t.name + " — KES " + t.price.toLocaleString() }; }), "tool", true);
            showStep(1);
            window.openModal("vioraWizardModal");
        });

        closeBtn.addEventListener("click", function () { window.closeModal("vioraWizardModal"); });
        modal.addEventListener("click", function (e) { if (e.target === modal) window.closeModal("vioraWizardModal"); });

        backBtn.addEventListener("click", function () {
            if (currentStep > 1) showStep(currentStep - 1);
        });

        nextBtn.addEventListener("click", function () {
            if (currentStep < totalSteps) {
                showStep(currentStep + 1);
            } else {
                var map = {
                    leakage: "supermarket", stockouts: "retail", late_reports: "accounting",
                    leads_dying: "consultancy", compliance: "accounting", growth: "supermarket"
                };
                var suggested = null;
                for (var i = 0; i < answers.pains.length; i++) {
                    if (map[answers.pains[i]]) { suggested = map[answers.pains[i]]; break; }
                }
                if (!suggested) suggested = "retail";
                activeIndustryKey = suggested;
                window.closeModal("vioraWizardModal");
                setTimeout(function () { window.openBlueprintPreview(); }, 200);
            }
        });
    }

    window.initBlueprintModule = function () {
        renderCategoryCards();
        initWizard();

        var bpModal = document.getElementById("vioraBlueprintModal");
        var bpClose = document.getElementById("vioraBlueprintClose");
        var bpGetBtn = document.getElementById("bpGetBlueprintBtn");
        if (bpClose) bpClose.addEventListener("click", window.closeBlueprintModal);
        if (bpModal) bpModal.addEventListener("click", function (e) { if (e.target === bpModal) window.closeBlueprintModal(); });
        if (bpGetBtn) bpGetBtn.addEventListener("click", function () {
            if (bpGetBtn.disabled) return;
            bpGetBtn.disabled = true;
            window.closeBlueprintModal();
            setTimeout(function () {
                bpGetBtn.disabled = false;
                if (typeof window.openLeadModal === "function") window.openLeadModal();
            }, 250);
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                ["vioraLeadModal", "vioraBlueprintModal", "vioraWizardModal", "vioraVideoModal"].forEach(function (id) {
                    var m = document.getElementById(id);
                    if (m && m.classList.contains("open")) window.closeModal(id);
                });
            }
        });
    };
})();
