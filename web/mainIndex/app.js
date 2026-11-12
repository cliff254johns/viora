/* app.js — bootstrap, 3D network bg, data streams, i18n, video, 3D charts, Firebase, forms, carousel, interactions */
(function () {
    "use strict";

    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function hexToRgba(hex, alpha) {
        var h = String(hex || '#00d2ff').replace('#', '');
        if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
        var n = parseInt(h, 16);
        var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
    }
    function fmtKes(n) { return window.VioraCurrency ? window.VioraCurrency.formatKES(Number(n) || 0) : "KES " + Math.round(n).toLocaleString(); }

    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

    /* ═══ 3D NETWORK BACKGROUND ═══ */
    var netCanvas = document.getElementById('networkCanvas');
    var netCtx = netCanvas ? netCanvas.getContext('2d') : null;
    var netNodes = [];
    var netW = 0, netH = 0;
    var netDpr = 1;
    var netMouse = { x: -9999, y: -9999 };
    var netRunning = true;
    var netSpeed = 25 / 6;

    function netResize() {
        if (!netCanvas) return;
        netW = window.innerWidth;
        netH = window.innerHeight;
        netCanvas.width = Math.floor(netW * netDpr);
        netCanvas.height = Math.floor(netH * netDpr);
        netCanvas.style.width = netW + 'px';
        netCanvas.style.height = netH + 'px';
        if (netCtx) netCtx.setTransform(netDpr, 0, 0, netDpr, 0, 0);
        netBuild();
    }

    function netBuild() {
        var density = isMobile ? 26000 : 16000;
        var count = Math.max(24, Math.min(isMobile ? 38 : 70, Math.floor((netW * netH) / density)));
        netNodes = [];
        for (var i = 0; i < count; i++) {
            var layer = Math.random();
            netNodes.push({
                x: Math.random() * netW,
                y: Math.random() * netH,
                vx: (Math.random() - 0.5) * 0.28,
                vy: (Math.random() - 0.5) * 0.28,
                z: layer,
                r: 0.9 + layer * 1.8,
                pulse: Math.random() * Math.PI * 2,
                hue: Math.random() < 0.5 ? 190 : (Math.random() < 0.5 ? 275 : 172)
            });
        }
    }

    var netFrame = 0;
    function netTick() {
        if (!netRunning || !netCtx) return;
        netFrame++;
        if (netFrame % 2 === 0) {
            netCtx.clearRect(0, 0, netW, netH);

            for (var i = 0; i < netNodes.length; i++) {
                var n = netNodes[i];
                n.x += n.vx * netSpeed;
                n.y += n.vy * netSpeed;
                n.pulse += 0.02;
                if (n.x < -50) n.x = netW + 50;
                if (n.x > netW + 50) n.x = -50;
                if (n.y < -50) n.y = netH + 50;
                if (n.y > netH + 50) n.y = -50;

                var dxm = n.x - netMouse.x;
                var dym = n.y - netMouse.y;
                var dm2 = dxm * dxm + dym * dym;
                if (dm2 < 16000) {
                    var f = (16000 - dm2) / 16000 * 0.4;
                    n.x += dxm / Math.sqrt(dm2 + 1) * f;
                    n.y += dym / Math.sqrt(dm2 + 1) * f;
                }
            }

            var maxDist = isMobile ? 100 : 140;
            var maxDist2 = maxDist * maxDist;
            var drawn = 0;
            for (var a = 0; a < netNodes.length && drawn < 200; a++) {
                for (var b = a + 1; b < netNodes.length; b++) {
                    var na = netNodes[a], nb = netNodes[b];
                    var dx = na.x - nb.x, dy = na.y - nb.y;
                    var d2 = dx * dx + dy * dy;
                    if (d2 < maxDist2) {
                        var t = 1 - d2 / maxDist2;
                        var zAvg = (na.z + nb.z) / 2;
                        netCtx.beginPath();
                        netCtx.moveTo(na.x, na.y);
                        netCtx.lineTo(nb.x, nb.y);
                        netCtx.strokeStyle = 'rgba(0, 210, 255, ' + (t * 0.16 * (0.4 + zAvg)) + ')';
                        netCtx.lineWidth = 0.4 + zAvg * 0.6;
                        netCtx.stroke();
                        drawn++;
                        if (drawn >= 200) break;
                    }
                }
            }

            for (var k = 0; k < netNodes.length; k++) {
                var nn = netNodes[k];
                var pulse = 1 + Math.sin(nn.pulse) * 0.25;
                var r = nn.r * pulse;
                var coreColor = nn.hue < 220
                    ? 'rgba(0, 210, 255, ' + (0.55 + nn.z * 0.35) + ')'
                    : (nn.hue < 260
                        ? 'rgba(20, 184, 166, ' + (0.55 + nn.z * 0.35) + ')'
                        : 'rgba(168, 85, 247, ' + (0.5 + nn.z * 0.35) + ')');
                /* Cheap halo (no shadowBlur) */
                netCtx.beginPath();
                netCtx.arc(nn.x, nn.y, r * 2.4, 0, Math.PI * 2);
                netCtx.fillStyle = nn.hue < 220
                    ? 'rgba(0, 210, 255, 0.07)'
                    : (nn.hue < 260 ? 'rgba(20, 184, 166, 0.07)' : 'rgba(168, 85, 247, 0.07)');
                netCtx.fill();
                /* Solid core */
                netCtx.beginPath();
                netCtx.arc(nn.x, nn.y, r, 0, Math.PI * 2);
                netCtx.fillStyle = coreColor;
                netCtx.fill();
            }
        }
        requestAnimationFrame(netTick);
    }

    window.addEventListener('mousemove', function (e) {
        netMouse.x = e.clientX;
        netMouse.y = e.clientY;
    }, { passive: true });

    /* ═══ DATA STREAMS ═══ */
    var canvas = document.getElementById('dataFlowCanvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var coreNode = document.getElementById('coreNode');
    var speedMultiplier = 25 / 4;
    var particles = [];
    var numParticlesPerPath = 4;
    var CARD_EDGE_PADDING = 8;
    var PARTICLE_TRAIL = 6;
    function setSpeed(val, btn) {
        speedMultiplier = val / 4;
        netSpeed = val / 6;
        document.querySelectorAll('.flow-btn').forEach(function (b) {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
        if (typeof markFlowRectsDirty === 'function') markFlowRectsDirty();
    }
    window.setSpeed = setSpeed;

    document.querySelectorAll('.flow-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            setSpeed(parseFloat(btn.dataset.speed), btn);
        });
    });

    function resizeCanvas() {
        if (!canvas) return;
        var vp = document.querySelector('.ecosystem-viewport');
        if (vp) {
            canvas.width = vp.clientWidth;
            canvas.height = vp.clientHeight;
        }
    }

    function getConnectorEndpoints(coreRect, cardRect, canvasRect) {
        var ccx = coreRect.left + coreRect.width / 2 - canvasRect.left;
        var ccy = coreRect.top + coreRect.height / 2 - canvasRect.top;
        var chr = coreRect.width / 2;
        var rcx = cardRect.left + cardRect.width / 2 - canvasRect.left;
        var rcy = cardRect.top + cardRect.height / 2 - canvasRect.top;
        var hw = cardRect.width / 2;
        var hh = cardRect.height / 2;
        var dx = rcx - ccx, dy = rcy - ccy;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;
        var startX = ccx + ux * chr;
        var startY = ccy + uy * chr;
        var tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
        var ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
        var t = Math.min(tx, ty);
        var bx = rcx - ux * (t * len);
        var by = rcy - uy * (t * len);
        bx -= ux * CARD_EDGE_PADDING;
        by -= uy * CARD_EDGE_PADDING;
        return { startX: startX, startY: startY, endX: bx, endY: by };
    }

    function Particle(color, direction) {
        this.color = color;
        this.direction = direction;
        this.progress = Math.random();
        this.speed = 0.003 + Math.random() * 0.004;
        this.size = 2.5 + Math.random() * 2.5;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.trail = [];
    }
    Particle.prototype.advance = function () {
        this.progress += this.speed * speedMultiplier;
        if (this.progress >= 1) this.progress = 0;
        this.pulsePhase += 0.15;
    };
    Particle.prototype.draw = function (c, sx, sy, ex, ey) {
        var t = this.direction === -1 ? 1 - this.progress : this.progress;
        var px = sx + (ex - sx) * t;
        var py = sy + (ey - sy) * t;
        this.trail.push({ x: px, y: py });
        if (this.trail.length > PARTICLE_TRAIL) this.trail.shift();
        c.save();
        for (var i = 0; i < this.trail.length - 1; i++) {
            var tAlpha = (i / this.trail.length) * 0.4;
            var tSize = this.size * (i / this.trail.length) * 0.8;
            c.beginPath();
            c.arc(this.trail[i].x, this.trail[i].y, tSize, 0, Math.PI * 2);
            c.fillStyle = this.color;
            c.globalAlpha = tAlpha;
            c.fill();
        }
        var pulse = 1 + Math.sin(this.pulsePhase) * 0.25;
        /* Soft halo instead of shadowBlur — much cheaper */
        c.beginPath();
        c.arc(px, py, this.size * pulse * 2.2, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.globalAlpha = 0.18;
        c.fill();
        /* Solid core */
        c.beginPath();
        c.arc(px, py, this.size * pulse, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.globalAlpha = 1;
        c.fill();
        c.beginPath();
        c.arc(px, py, this.size * 0.4, 0, Math.PI * 2);
        c.fillStyle = '#ffffff';
        c.globalAlpha = 0.9;
        c.fill();
        c.restore();
    };

    function getModuleNodes() {
        return document.querySelectorAll('.module-card');
    }

    function rebuildDataFlow() {
        particles = [];
        getModuleNodes().forEach(function (card) {
            var color = card.getAttribute('data-color') || '#00d2ff';
            for (var i = 0; i < numParticlesPerPath; i++) {
                particles.push(new Particle(color, 1));
                particles.push(new Particle('#00d2ff', -1));
            }
        });
    }
    window.rebuildDataFlow = rebuildDataFlow;

    var dashOffset = 0;

    /* ── Rect cache: computed once per layout change, not per frame ── */
    var _flowRectCache = { entries: [], dirty: true };
    function markFlowRectsDirty() { _flowRectCache.dirty = true; }

    function refreshFlowRects() {
        if (!canvas || !coreNode) { _flowRectCache.entries = []; _flowRectCache.dirty = false; return; }
        var canvasRect = canvas.getBoundingClientRect();
        var coreRect = coreNode.getBoundingClientRect();
        var cards = getModuleNodes();
        var out = [];
        cards.forEach(function (card) {
            var r = card.getBoundingClientRect();
            out.push({
                el: card,
                ep: getConnectorEndpoints(coreRect, r, canvasRect),
                color: card.getAttribute('data-color') || '#00d2ff'
            });
        });
        _flowRectCache.entries = out;
        _flowRectCache.dirty = false;
    }

    var _flowFrameSkip = 0;
    function animate() {
        if (!canvas || !ctx || !coreNode) return;
        var vp = document.querySelector('.ecosystem-viewport');
        if (!vp) return;
        if (canvas.width !== vp.clientWidth || canvas.height !== vp.clientHeight) {
            canvas.width = vp.clientWidth;
            canvas.height = vp.clientHeight;
            markFlowRectsDirty();
        }

        /* Mobile: render every other frame to halve GPU work */
        _flowFrameSkip++;
        if (isMobile && (_flowFrameSkip & 1)) {
            requestAnimationFrame(animate);
            return;
        }

        if (_flowRectCache.dirty) refreshFlowRects();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var cards = getModuleNodes();
        if (particles.length !== cards.length * numParticlesPerPath * 2) rebuildDataFlow();

        dashOffset -= speedMultiplier * 0.5;
        var pIdx = 0;
        var entries = _flowRectCache.entries;

        for (var e = 0; e < entries.length; e++) {
            var entry = entries[e];
            var ep = entry.ep;
            var color = entry.color;

            /* Halo stroke */
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ep.startX, ep.startY);
            ctx.lineTo(ep.endX, ep.endY);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.08;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.restore();

            /* Dashed main stroke */
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ep.startX, ep.startY);
            ctx.lineTo(ep.endX, ep.endY);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.8;
            ctx.setLineDash([6, 8]);
            ctx.lineDashOffset = dashOffset;
            ctx.stroke();
            ctx.restore();

            for (var i = 0; i < numParticlesPerPath * 2; i++) {
                var p = particles[pIdx++];
                if (!p) break;
                p.advance();
                p.draw(ctx, ep.startX, ep.startY, ep.endX, ep.endY);
            }
        }

        requestAnimationFrame(animate);
    }

    /* ═══ RADIAL LAYOUT ═══ */
    function layoutRadial(cards) {
        var viewport = document.querySelector('.ecosystem-viewport');
        var grid = document.getElementById('modulesGrid');
        if (!viewport || !grid) return;
        var N = cards.length;
        if (!N) return;

        var W = viewport.clientWidth;
        var H = viewport.clientHeight;
        if (!W || !H) return;

        var scale = Math.max(0.28, Math.min(1, W / 1200));
        var CARD_W = Math.min(W * 0.22, 320 * scale);
        var CARD_H = Math.min(H * 0.22, 200 * scale);
        var RADIUS_X = W * 0.42;
        var RADIUS_Y = H * 0.44;

        cards.forEach(function (b, idx) {
            var el = document.getElementById('mod-' + b.id);
            if (!el) return;
            /* Distribute 9 cards around circle — starting at top */
            var angle = (idx / N) * Math.PI * 2 - Math.PI / 2;
            var cx = W / 2 + Math.cos(angle) * RADIUS_X;
            var cy = H / 2 + Math.sin(angle) * RADIUS_Y;
            el.style.left = cx + 'px';
            el.style.top = cy + 'px';
            el.style.width = CARD_W + 'px';
            el.style.height = CARD_H + 'px';
            el.style.setProperty('--module-color', b.color || '#00d2ff');
            el.style.setProperty('--module-color-alpha', hexToRgba(b.color || '#00d2ff', 0.2));
        });

        var core = document.getElementById('coreNode');
        if (core) { core.style.top = '50%'; core.style.left = '50%'; }
    }

    window.renderModuleCards = function (cards) {
        var grid = document.getElementById('modulesGrid');
        if (!grid) return;
        if (!Array.isArray(cards) || !cards.length) cards = window.DEFAULT_BANNER_CARDS || [];
        grid.innerHTML = cards.map(function (b) {
            var color = b.color || '#00d2ff';
            var icon = b.icon || 'fa-solid fa-cube';
            var features = Array.isArray(b.features) ? b.features : [];
            return '<div class="module-card" id="mod-' + escHtml(b.id) + '" data-color="' + escHtml(color) + '">' +
                '<div class="module-header">' +
                    '<div class="module-icon-badge" style="color:' + color + ';border-color:' + color + ';background:' + hexToRgba(color, 0.25) + ';box-shadow:0 0 15px ' + hexToRgba(color, 0.5) + ';">' +
                        '<i class="' + escHtml(icon) + '" aria-hidden="true"></i>' +
                    '</div>' +
                    '<div class="module-title-area">' +
                        '<h3>' + escHtml(b.title || '') + '</h3>' +
                        '<div class="module-subtext" style="color:' + color + ';">' + escHtml(b.subtext || '') + '</div>' +
                    '</div>' +
                '</div>' +
                '<ul class="module-features">' +
                    features.map(function (f) {
                        return '<li style="--module-color:' + color + ';">' + escHtml(f) + '</li>';
                    }).join('') +
                '</ul>' +
            '</div>';
        }).join('');
        layoutRadial(cards);
        rebuildDataFlow();
        if (typeof markFlowRectsDirty === 'function') markFlowRectsDirty();
    };

    /* ═══ i18n ═══ */
    function applyLang(lang) {
        var dict = window.I18N && window.I18N[lang];
        if (!dict) return;
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) {
                if (/[<>]/.test(dict[key])) el.innerHTML = dict[key];
                else el.textContent = dict[key];
            }
        });
        document.documentElement.lang = lang === 'sw' ? 'sw' : 'en';
        document.querySelectorAll('.lang-btn').forEach(function (b) {
            var on = b.dataset.lang === lang;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        try { localStorage.setItem('viora_lang', lang); } catch (e) {}
    }
    document.querySelectorAll('.lang-btn').forEach(function (b) {
        b.addEventListener('click', function () { applyLang(b.dataset.lang); });
    });
    try {
        var savedLang = localStorage.getItem('viora_lang');
        if (savedLang === 'sw') applyLang('sw');
    } catch (e) {}

    /* ═══ LIVE COUNTERS ═══ */
    function initLiveCounters() {
        var els = document.querySelectorAll('.ls-val');
        if (!els.length) return;
        if (prefersReducedMotion) {
            els.forEach(function (el) {
                var t = parseInt(el.dataset.count, 10) || 0;
                el.textContent = t.toLocaleString() + (el.dataset.suffix || "");
            });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                if (el.dataset.done) return;
                el.dataset.done = "1";
                var target = parseInt(el.dataset.count, 10) || 0;
                var suffix = el.dataset.suffix || "";
                var start = performance.now();
                var dur = 1400;
                function tick(now) {
                    var p = Math.min(1, (now - start) / dur);
                    var eased = 1 - Math.pow(1 - p, 3);
                    el.textContent = Math.round(target * eased).toLocaleString() + (p === 1 ? suffix : "");
                    if (p < 1) requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
                io.unobserve(el);
            });
        }, { threshold: 0.4 });
        els.forEach(function (el) { io.observe(el); });
    }

    /* ═══ PORTAL CAROUSEL — 9 SLIDES ═══ */
    function initPortalCarousel() {
        var trackEl = document.getElementById('pcTrack');
        var dotsEl = document.getElementById('pcDots');
        var prevBtn = document.getElementById('pcPrev');
        var nextBtn = document.getElementById('pcNext');
        var viewport = document.getElementById('pcViewport');
        if (!trackEl) return;

        var cards = window.DEFAULT_BANNER_CARDS || [];
        if (!cards.length) return;

        var descs = {
            business: "The full back office: POS, inventory, M-Pesa reconciliation, supplier ledgers, staff management. Everything you need to run a store, restaurant, or service business.",
            public: "A consumer-facing discovery layer. Customers search, browse, review, and engage with your business and other verified enterprises in the ecosystem.",
            partner: "Collaborate with suppliers, resellers, and service providers. Joint campaigns, commission tracking, shared resources — one portal for the whole partner network.",
            training: "Courses, certifications, and skill development for your team and customers. Progress tracked. Certificates issued automatically.",
            client: "Your customers get their own portal. Request services, track projects, view documents, message your team — securely, with full audit trail.",
            product: "Digital products, physical catalogue, and marketplace listings. Manage SKUs, variants, and delivery across every channel.",
            youtube: "Video hub for brand stories, tutorials, and community content. Embed playlists, track engagement, monetise attention.",
            presentation: "Interactive demos and live product tours for sales teams. Walk a client through exactly what they'll get, on any device.",
            finance: "Real-time P&L, cash-flow forecasting, multi-currency ledgers, automated bank and M-Pesa reconciliation, VAT/PAYE/NSSF/SHIF/Housing Levy computation, eTIMS-ready invoices, and board-ready reports. The Finance portal reads from the same ledger every other portal writes to — so there's never a double entry."
        };

        trackEl.innerHTML = cards.map(function (c, i) {
            var color = c.color || '#00d2ff';
            var rgba = hexToRgba(color, 0.15);
            return '<article class="pc-slide" data-i="' + i + '" style="--pc-color:' + color + ';--pc-bg:' + rgba + ';">' +
                '<div class="pc-slide-inner">' +
                    '<div class="pc-icon" style="--pc-color:' + color + ';background:' + rgba + ';">' +
                        (c.icon ? '<i class="' + escHtml(c.icon) + '"></i>' : '') +
                    '</div>' +
                    '<div class="pc-body">' +
                        '<div class="pc-sub">' + escHtml(c.subtext || '') + '</div>' +
                        '<div class="pc-title">' + escHtml(c.title || '') + '</div>' +
                        '<p class="pc-desc">' + escHtml(descs[c.id] || '') + '</p>' +
                        '<div class="pc-features">' +
                            (c.features || []).map(function (f) {
                                return '<span class="pc-feature" style="--pc-color:' + color + ';">' + escHtml(f) + '</span>';
                            }).join('') +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</article>';
        }).join('');

        if (dotsEl) {
            dotsEl.innerHTML = cards.map(function (c, i) {
                return '<button type="button" class="pc-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" aria-label="Go to ' + escHtml(c.title) + '"></button>';
            }).join('');
        }

        var current = 0;
        var autoTimer = null;
        var autoDelay = prefersReducedMotion ? 0 : 3600;
        var paused = false;
        var total = cards.length;

        function go(i, userClicked) {
            current = ((i % total) + total) % total;
            trackEl.style.transform = 'translate3d(-' + (current * 100) + '%, 0, 0)';
            Array.prototype.forEach.call(document.querySelectorAll('.pc-dot'), function (d, idx) {
                d.classList.toggle('active', idx === current);
            });
            if (userClicked) {
                paused = true;
                clearTimeout(autoTimer);
                autoTimer = setTimeout(function () { paused = false; schedule(); }, 8000);
            }
        }

        function schedule() {
            clearTimeout(autoTimer);
            if (!autoDelay || paused) return;
            autoTimer = setTimeout(function () {
                if (!paused) { go(current + 1, false); schedule(); }
            }, autoDelay);
        }

        Array.prototype.forEach.call(document.querySelectorAll('.pc-dot'), function (d) {
            d.addEventListener('click', function () { go(parseInt(d.dataset.i, 10), true); });
        });
        if (prevBtn) prevBtn.addEventListener('click', function () { go(current - 1, true); });
        if (nextBtn) nextBtn.addEventListener('click', function () { go(current + 1, true); });

        if (viewport) {
            viewport.addEventListener('mouseenter', function () { paused = true; clearTimeout(autoTimer); });
            viewport.addEventListener('mouseleave', function () { paused = false; schedule(); });
        }

        var touchStartX = 0;
        if (viewport) {
            viewport.addEventListener('touchstart', function (e) {
                if (e.touches.length === 1) touchStartX = e.touches[0].clientX;
            }, { passive: true });
            viewport.addEventListener('touchend', function (e) {
                if (e.changedTouches.length !== 1) return;
                var dx = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1), true);
            }, { passive: true });
        }

        go(0, false);
        schedule();
    }

    /* ═══ 3D SUPERPOWERS ═══ */
    function initCap3D() {
        var grid = document.getElementById('cap3dGrid');
        if (!grid) return;
        var tiles = [
            { ico: '📶', h: 'Offline-first', p: 'Keep working through blackouts. Everything syncs the moment you\'re back online.' },
            { ico: '📱', h: 'Installable PWA', p: 'Add to home screen on any Android or iPhone. Native-feel, no app store needed.' },
            { ico: '💚', h: 'M-Pesa Daraja', p: 'STK push, C2B and B2C with automatic reconciliation against your ledger.' },
            { ico: '🧾', h: 'KRA eTIMS-ready', p: 'Compliant invoices, credit notes and statutory reports generated automatically.' },
            { ico: '💰', h: 'Finance portal', p: 'Real-time P&L, cash-flow forecasting, multi-currency ledgers, tax compliance.' },
            { ico: '🤖', h: 'Groq AI engine', p: 'Recommendations on pricing, stock, collections and staffing — on your live data.' },
            { ico: '🔐', h: 'Roles & audit logs', p: 'Granular permissions, 2FA, encrypted at rest, and a full who-did-what trail.' },
            { ico: '🔔', h: 'SMS + WhatsApp alerts', p: 'Payment reminders, approvals, low stock, renewals — pushed where people look.' },
            { ico: '🗂️', h: 'Document vault', p: 'Versioned contracts, IDs and certificates with expiry reminders.' },
            { ico: '📊', h: 'Live dashboards', p: 'Owner view on any phone: cash, pipeline, attendance, margin — right now.' },
            { ico: '🔌', h: 'API & webhooks', p: 'Connect anything else you run. Zapier, Make, custom scripts — all welcome.' },
            { ico: '🏢', h: 'Multi-branch', p: 'Consolidated reporting with branch-level P&L, stock and staff control.' }
        ];
        grid.innerHTML = tiles.map(function (t) {
            return '<div class="cap-tile">' +
                '<div class="cap-shine"></div>' +
                '<div class="cap-inner">' +
                    '<div class="ico-wrap">' + t.ico + '</div>' +
                    '<h4>' + escHtml(t.h) + '</h4>' +
                    '<p>' + escHtml(t.p) + '</p>' +
                '</div>' +
            '</div>';
        }).join('');

        if (prefersReducedMotion) return;
        Array.prototype.forEach.call(grid.querySelectorAll('.cap-tile'), function (card) {
            card.addEventListener('mousemove', function (e) {
                var r = card.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width;
                var y = (e.clientY - r.top) / r.height;
                card.style.setProperty('--mx', (x * 100) + '%');
                card.style.setProperty('--my', (y * 100) + '%');
                var rx = (0.5 - y) * 12;
                var ry = (x - 0.5) * 14;
                card.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(8px)';
            });
            card.addEventListener('mouseleave', function () { card.style.transform = ''; });
        });
    }

    /* ═══ 3D COMPARE ═══ */
    function initCompare3D() {
        var standList = document.getElementById('c3dStandalone');
        var ecoList = document.getElementById('c3dEcosystem');
        var standCard = document.getElementById('cmpStandalone');
        var ecoCard = document.getElementById('cmpEcosystem');
        if (!standList || !ecoList) return;

        var standalonePoints = [
            ['6–10 separate subscriptions', 'POS, accounting, payroll, CRM, inventory, website, payments, WhatsApp — each billed separately.'],
            ['Zero shared data', "A sale at the till doesn't update inventory, and doesn't post to the ledger."],
            ['Manual month-end reconciliation', 'M-Pesa, bank, cash, and card all reconciled by hand — hours per week lost.'],
            ['Leads die in DMs', 'Website enquiries and WhatsApp chats never become Clients, Deals, or Tasks.'],
            ['Reports take days', "Export CSV → clean in Excel → email → re-check. By the time you see it, it's stale."],
            ['No single client view', 'Sales, accounting, and ops each see a different version.'],
            ['Compliance is a scramble', 'KRA, NSSF, SHIF, Housing Levy — each filed separately, from separate tools.'],
            ['Scaling means new tools', 'Each new branch, product line or service = more subscriptions and more re-training.']
        ];
        var ecosystemPoints = [
            ['One system, nine portals', 'Business, Public, Partner, Product, YouTube, Client, Training, Presentation, Finance — under one subscription.'],
            ['Real-time shared data', 'A sale updates stock, posts the journal entry, feeds the AI — instantly and everywhere.'],
            ['Auto-reconciled payments', 'M-Pesa, bank, cash, and card land in the ledger and match themselves to invoices.'],
            ['Leads auto-convert', 'Any enquiry → Client + Deal + Task in one step, with full audit trail.'],
            ['Live dashboards', 'Owner view on any phone: cash, pipeline, margin — right now, from live data.'],
            ['Single client view', 'Every department sees the same 360° client profile: deals, invoices, comms, docs.'],
            ['Compliance on autopilot', 'eTIMS-ready invoicing and Kenya payroll calculated automatically.'],
            ['Scales without re-tooling', 'New branch, product, or service = a few clicks — never a new subscription.']
        ];

        standList.innerHTML = standalonePoints.map(function (p) {
            return '<li><div><strong>' + escHtml(p[0]) + '</strong><span>' + escHtml(p[1]) + '</span></div></li>';
        }).join('');
        ecoList.innerHTML = ecosystemPoints.map(function (p) {
            return '<li><div><strong>' + escHtml(p[0]) + '</strong><span>' + escHtml(p[1]) + '</span></div></li>';
        }).join('');

        if (prefersReducedMotion) return;

        function tilt(el) {
            if (!el) return;
            el.addEventListener('mousemove', function (e) {
                var r = el.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width;
                var y = (e.clientY - r.top) / r.height;
                var ry = (x - 0.5) * 16;
                var rx = (0.5 - y) * 12;
                el.style.transform = 'perspective(1200px) rotateY(' + ry + 'deg) rotateX(' + rx + 'deg) translateZ(20px)';
            });
            el.addEventListener('mouseleave', function () { el.style.transform = ''; });
        }
        tilt(standCard);
        tilt(ecoCard);
    }

    /* ═══ CALCULATOR + 3D CHARTS ═══ */
    function initCalculator() {
        var wrap = document.getElementById('calcTools');
        if (!wrap) return;
        var tools = window.COST_TOOLS || [];
        var vioraPrice = window.VIORA_BUNDLE_PRICE || 40000;

        wrap.innerHTML = tools.map(function (t) {
            return '<label class="calc-tool">' +
                '<input type="checkbox" value="' + escHtml(t.id) + '" data-price="' + t.price + '">' +
                '<span class="tool-label">' + escHtml(t.name) +
                    '<span class="tool-price">KES ' + t.price.toLocaleString() + ' one-time</span>' +
                '</span>' +
            '</label>';
        }).join("");

        var currentEl = document.getElementById('calcCurrentTotal');
        var vioraEl = document.getElementById('calcVioraTotal');
        var saveEl = document.getElementById('calcSavings');
        var annualEl = document.getElementById('calcAnnual');
        var cta = document.getElementById('calcCta');
        var donutCenter = document.getElementById('donutCenter');

        var barCanvas = document.getElementById('chartBar');
        var donutCanvas = document.getElementById('chartDonut');
        var lineCanvas = document.getElementById('chartLine');

        function prepCanvas(cv) {
            if (!cv) return null;
            var rect = cv.getBoundingClientRect();
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = Math.max(160, rect.width);
            var h = Math.max(120, rect.height);
            if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
                cv.width = Math.floor(w * dpr);
                cv.height = Math.floor(h * dpr);
            }
            var c = cv.getContext('2d');
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            return { ctx: c, w: w, h: h };
        }

        var state = { current: 0, viora: 0, count: 0, total: tools.length, save: 0, animT: 0 };
        var target = { current: 0, viora: 0, count: 0, save: 0 };

        function lerp(a, b, t) { return a + (b - a) * t; }

        function drawBar() {
            var cv = prepCanvas(barCanvas); if (!cv) return;
            var c = cv.ctx, W = cv.w, H = cv.h;
            c.clearRect(0, 0, W, H);

            var pad = 26;
            var baseY = H - pad;
            var max = Math.max(state.current, state.viora, 1000) * 1.18;
            var usable = baseY - 18;
            var bw = Math.min(52, W * 0.18);
            var gap = 24;
            var cx = W / 2;
            var x1 = cx - bw - gap / 2;
            var x2 = cx + gap / 2;

            function bar3d(x, val, colorTop, colorBot, label) {
                var h = (val / max) * usable;
                var y = baseY - h;
                var depth = 10;

                c.save();
                c.beginPath();
                c.ellipse(x + bw / 2, baseY + 4, bw / 2, 6, 0, 0, Math.PI * 2);
                c.fillStyle = 'rgba(0,0,0,0.35)';
                c.filter = 'blur(4px)';
                c.fill();
                c.restore();

                var grad = c.createLinearGradient(x + bw, y, x + bw + depth, y + h);
                grad.addColorStop(0, colorBot);
                grad.addColorStop(1, 'rgba(0,0,0,0.5)');
                c.fillStyle = grad;
                c.beginPath();
                c.moveTo(x + bw, y);
                c.lineTo(x + bw + depth, y - depth * 0.6);
                c.lineTo(x + bw + depth, baseY - depth * 0.6);
                c.lineTo(x + bw, baseY);
                c.closePath();
                c.fill();

                c.fillStyle = colorTop;
                c.beginPath();
                c.moveTo(x, y);
                c.lineTo(x + bw, y);
                c.lineTo(x + bw + depth, y - depth * 0.6);
                c.lineTo(x + depth, y - depth * 0.6);
                c.closePath();
                c.fill();

                var g2 = c.createLinearGradient(x, y, x, baseY);
                g2.addColorStop(0, colorTop);
                g2.addColorStop(1, colorBot);
                c.fillStyle = g2;
                c.shadowColor = colorTop;
                c.shadowBlur = 14;
                c.fillRect(x, y, bw, h);
                c.shadowBlur = 0;

                c.fillStyle = '#e2e8f0';
                c.font = '600 11px "JetBrains Mono", monospace';
                c.textAlign = 'center';
                c.fillText(label, x + bw / 2, y - 14);
            }

            bar3d(x1, state.current, '#fb7185', '#9d1b3a', fmtKes(state.current));
            bar3d(x2, state.viora, '#14b8a6', '#0b5a7a', fmtKes(state.viora));

            c.strokeStyle = 'rgba(255,255,255,0.14)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(pad, baseY);
            c.lineTo(W - pad, baseY);
            c.stroke();

            c.fillStyle = '#94a3b8';
            c.font = '600 10px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.fillText('Your stack', x1 + bw / 2, H - 8);
            c.fillText('VIORA', x2 + bw / 2, H - 8);
        }

        function drawDonut() {
            var cv = prepCanvas(donutCanvas); if (!cv) return;
            var c = cv.ctx, W = cv.w, H = cv.h;
            c.clearRect(0, 0, W, H);

            var cx = W / 2, cy = H / 2;
            var r = Math.min(W, H) * 0.32;
            var sw = Math.max(12, r * 0.42);
            var pct = state.total ? state.count / state.total : 0;

            c.beginPath();
            c.arc(cx, cy, r, 0, Math.PI * 2);
            c.strokeStyle = 'rgba(255,255,255,0.08)';
            c.lineWidth = sw;
            c.stroke();

            if (pct > 0) {
                var grad = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
                grad.addColorStop(0, '#00d2ff');
                grad.addColorStop(1, '#14b8a6');

                c.beginPath();
                c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
                c.strokeStyle = grad;
                c.lineWidth = sw;
                c.lineCap = 'round';
                c.shadowColor = 'rgba(0,210,255,0.7)';
                c.shadowBlur = 16;
                c.stroke();
                c.shadowBlur = 0;
            }
        }

        function drawLine() {
            var cv = prepCanvas(lineCanvas); if (!cv) return;
            var c = cv.ctx, W = cv.w, H = cv.h;
            c.clearRect(0, 0, W, H);

            var pad = 24;
            var baseY = H - pad;
            var max = Math.max(state.save * 5, 1000);
            var stepX = (W - pad * 2) / 5;

            c.strokeStyle = 'rgba(255,255,255,0.08)';
            c.lineWidth = 1;
            for (var g = 0; g <= 4; g++) {
                var yy = pad + (baseY - pad) * (g / 4);
                c.beginPath();
                c.moveTo(pad, yy);
                c.lineTo(W - pad, yy);
                c.stroke();
            }
            c.strokeStyle = 'rgba(255,255,255,0.18)';
            c.beginPath();
            c.moveTo(pad, pad); c.lineTo(pad, baseY); c.lineTo(W - pad, baseY);
            c.stroke();

            var pts = [];
            for (var m = 0; m <= 5; m++) {
                var v = state.save * m;
                var x = pad + m * stepX;
                var y = baseY - (v / max) * (baseY - pad);
                pts.push({ x: x, y: y });
            }

            var grad = c.createLinearGradient(0, pad, 0, baseY);
            grad.addColorStop(0, 'rgba(52,211,153,0.45)');
            grad.addColorStop(1, 'rgba(52,211,153,0)');
            c.beginPath();
            c.moveTo(pts[0].x, baseY);
            pts.forEach(function (p) { c.lineTo(p.x, p.y); });
            c.lineTo(pts[pts.length - 1].x, baseY);
            c.closePath();
            c.fillStyle = grad;
            c.fill();

            var lg = c.createLinearGradient(pad, 0, W - pad, 0);
            lg.addColorStop(0, '#00d2ff');
            lg.addColorStop(1, '#34d399');
            c.beginPath();
            pts.forEach(function (p, i) {
                if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
            });
            c.strokeStyle = lg;
            c.lineWidth = 3;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.shadowColor = 'rgba(0,210,255,0.65)';
            c.shadowBlur = 12;
            c.stroke();
            c.shadowBlur = 0;

            var last = pts[pts.length - 1];
            c.beginPath();
            c.arc(last.x, last.y, 5, 0, Math.PI * 2);
            c.fillStyle = '#34d399';
            c.shadowColor = '#34d399';
            c.shadowBlur = 16;
            c.fill();
            c.shadowBlur = 0;

            c.fillStyle = '#e2e8f0';
            c.font = '700 10px "JetBrains Mono", monospace';
            c.textAlign = 'right';
            c.fillText(fmtKes(state.save * 5), W - pad - 2, last.y - 8);
            c.textAlign = 'left';
            c.fillStyle = '#94a3b8';
            c.font = '600 9px "Plus Jakarta Sans", sans-serif';
            c.fillText('5-year savings', pad + 2, pad + 10);
        }

        function drawAll() { drawBar(); drawDonut(); drawLine(); }

        function animateTowards() {
            var t = 0.14;
            state.current = lerp(state.current, target.current, t);
            state.viora = lerp(state.viora, target.viora, t);
            state.save = lerp(state.save, target.save, t);
            state.count = lerp(state.count, target.count, t);

            if (Math.abs(state.current - target.current) > 1 ||
                Math.abs(state.viora - target.viora) > 1 ||
                Math.abs(state.save - target.save) > 1 ||
                Math.abs(state.count - target.count) > 0.05) {
                state.animT = requestAnimationFrame(animateTowards);
            } else {
                state.current = target.current;
                state.viora = target.viora;
                state.save = target.save;
                state.count = target.count;
                state.animT = 0;
            }
            drawAll();
        }

        function scheduleAnim() {
            if (!state.animT) state.animT = requestAnimationFrame(animateTowards);
        }

        function update() {
            var total = 0;
            var count = 0;
            var inputs = wrap.querySelectorAll('input[type="checkbox"]');
            inputs.forEach(function (inp) {
                var label = inp.closest('.calc-tool');
                var price = parseFloat(inp.dataset.price);
                if (!isFinite(price) || price < 0) price = 0;
                if (inp.checked) {
                    total += price;
                    count++;
                    if (label) label.classList.add('checked');
                } else {
                    if (label) label.classList.remove('checked');
                }
            });
            var vioraCost = count > 0 ? vioraPrice : 0;
            var save = Math.max(0, total - vioraCost);

            target.current = total;
            target.viora = vioraCost;
            target.count = count;
            target.save = save;

            if (currentEl) currentEl.textContent = fmtKes(total);
            if (vioraEl) vioraEl.textContent = fmtKes(vioraCost);
            if (saveEl) saveEl.textContent = fmtKes(save);
            if (annualEl) annualEl.textContent = fmtKes(save * 5);

            if (donutCenter) {
                var b = donutCenter.querySelector('b');
                var sp = donutCenter.querySelector('span');
                if (b) b.textContent = Math.round(count);
                if (sp) sp.textContent = 'of ' + state.total + ' tools';
            }

            var roiTime = document.getElementById('roiTime');
            var roiLeak = document.getElementById('roiLeak');
            var roiStock = document.getElementById('roiStock');
            var roiRecon = document.getElementById('roiRecon');
            if (roiTime) roiTime.textContent = (count * 2.4).toFixed(1) + ' h/wk';
            if (roiLeak) roiLeak.textContent = fmtKes(total * 0.28);
            if (roiStock) roiStock.textContent = (count * 0.8).toFixed(1) + '/mo';
            if (roiRecon) roiRecon.textContent = (count * 3.2).toFixed(1) + ' h/mo';
            var rT = document.getElementById('roiTimeBar');
            var rL = document.getElementById('roiLeakBar');
            var rS = document.getElementById('roiStockBar');
            var rR = document.getElementById('roiReconBar');
            if (rT) rT.style.width = Math.min(100, count * 6) + '%';
            if (rL) rL.style.width = Math.min(100, count * 6.5) + '%';
            if (rS) rS.style.width = Math.min(100, count * 5.5) + '%';
            if (rR) rR.style.width = Math.min(100, count * 6.2) + '%';

            scheduleAnim();
        }

        wrap.addEventListener('change', update);
        window.addEventListener('viora:currency-ready', function () {
            wrap.querySelectorAll('.calc-tool').forEach(function (label) {
                var input = label.querySelector('input[data-price]');
                var price = label.querySelector('.tool-price');
                if (input && price) price.textContent = fmtKes(Number(input.dataset.price) || 0) + ' one-time';
            });
            wrap.dispatchEvent(new Event('change', { bubbles: true }));
        });
        window.addEventListener('viora:currency-ready', function () {
            wrap.querySelectorAll('.calc-tool').forEach(function (label) {
                var input = label.querySelector('input[data-price]');
                var price = label.querySelector('.tool-price');
                if (input && price) price.textContent = fmtKes(Number(input.dataset.price) || 0) + ' one-time';
            });
            if (wrap.querySelector('input:checked')) wrap.dispatchEvent(new Event('change', { bubbles: true }));
        });

        requestAnimationFrame(function () {
            update();
            var rt;
            window.addEventListener('resize', function () {
                clearTimeout(rt);
                rt = setTimeout(drawAll, 120);
            });
        });

        if (cta) cta.addEventListener('click', function () {
            if (typeof window.openLeadModal === 'function') window.openLeadModal();
        });
    }

    /* ═══ IMPACT TICKER ═══ */
    function initImpactTicker() {
        var el1 = document.getElementById('impTx');
        var el2 = document.getElementById('impMpesa');
        var el3 = document.getElementById('impEtims');
        var el4 = document.getElementById('impFin');
        if (!el1 && !el2 && !el3 && !el4) return;

        var v = { tx: 912, mpesa: 348, etims: 127, fin: 89 };

        if (prefersReducedMotion) {
            if (el1) el1.textContent = v.tx.toLocaleString();
            if (el2) el2.textContent = v.mpesa.toLocaleString();
            if (el3) el3.textContent = v.etims.toLocaleString();
            if (el4) el4.textContent = v.fin.toLocaleString();
            return;
        }

        function bump(val, max) {
            var inc = Math.random() < 0.7 ? 1 : 2;
            var nv = val + inc;
            if (nv > max) nv = Math.floor(max * 0.6);
            return nv;
        }

        setInterval(function () {
            v.tx = bump(v.tx, 990);
            v.mpesa = bump(v.mpesa, 420);
            v.etims = bump(v.etims, 180);
            v.fin = bump(v.fin, 140);
            if (el1) el1.textContent = v.tx.toLocaleString();
            if (el2) el2.textContent = v.mpesa.toLocaleString();
            if (el3) el3.textContent = v.etims.toLocaleString();
            if (el4) el4.textContent = v.fin.toLocaleString();
        }, 1100);
    }

    /* ═══ FIREBASE ═══ */
    var WHATSAPP_NUMBER = "254713428774";
    var FIREBASE_CONFIG = {
        apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
        authDomain: "cliffclient-35ec5.firebaseapp.com",
        databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "cliffclient-35ec5",
        storageBucket: "cliffclient-35ec5.firebasestorage.app",
        messagingSenderId: "519782791696",
        appId: "1:519782791696:web:6e1a654ddeed14b72b2895"
    };
    var fbPromise = null;

    function loadFirebase() {
        if (fbPromise) return fbPromise;
        fbPromise = Promise.all([
            import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js')
        ]).then(function (mods) {
            var appMod = mods[0], dbMod = mods[1];
            var app;
            try { app = appMod.getApp(); }
            catch (e) { app = appMod.initializeApp(FIREBASE_CONFIG); }
            window._fbDb = dbMod.getDatabase(app);
            window._fbRef = dbMod.ref;
            window._fbPush = dbMod.push;
            window._fbSet = dbMod.set;
            window._fbOnValue = dbMod.onValue;
            return true;
        }).catch(function (e) {
            console.warn('[VIORA] Firebase load failed:', e.message);
            return false;
        });
        return fbPromise;
    }

    function saveBlueprintToFirebase(ind, cat, contact) {
        return loadFirebase().then(async function (ok) {
            if (!ok || !window._fbDb || !window._fbRef || !window._fbPush || !window._fbSet) return false;

            const record = {
                id: '',
                name: contact.name || "Blueprint Request",
                fullName: contact.name || "Blueprint Request",
                email: contact.email || "",
                phone: contact.phone || "",
                note: contact.note || "",
                industry: contact.industryKey || null,
                industryName: ind ? ind.name : null,
                industryCategory: cat ? cat.name : null,
                modules: ind ? ind.modules : [],
                modulesDetailed: ind ? (ind.modules || []).map(m => {
                    const def = window.MODULE_DEFS[m];
                    return def ? { key: m, name: def.name, emoji: def.em } : { key: m };
                }) : [],
                blueprint: ind ? {
                    problem: ind.problem, solutions: ind.solutions,
                    modules: ind.modules, changes: ind.changes, emoji: ind.em
                } : null,
                source: "viora-index-blueprint",
                status: "New",
                type: "blueprint_request",
                leadSource: "index.html",
                isNewClient: true,
                lastSeenAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                timestamp: Date.now(),
                userAgent: (navigator.userAgent || "").slice(0, 180)
            };

            const mRef = window._fbPush(window._fbRef(window._fbDb, "viora_data/orgs/viora/marketLeads"));
            record.leadId = 'idx-' + mRef.key;
            record.id = record.leadId;
            await window._fbSet(mRef, record);

            const leadRecord = Object.assign({}, record, {
                type: 'blueprint_request',
                _fromIndex: true,
                _fromMarket: false
            });
            const lRef = window._fbRef(window._fbDb, "viora_data/orgs/viora/leads/" + leadRecord.id);
            await window._fbSet(lRef, leadRecord);

            const aRef = window._fbPush(window._fbRef(window._fbDb, "viora_data/orgs/viora/activityLog"));
            await window._fbSet(aRef, {
                id: aRef.key, type: 'add',
                title: 'New blueprint request (index)',
                description: `${contact.name}${ind ? ' — ' + ind.name : ' (general enquiry — no sub-industry picked)'}`,
                by: 'index-blueprint', byName: 'Index Blueprint Form',
                timestamp: new Date().toISOString()
            });

            return true;
        });
    }

    /* ═══ LEAD FORM ═══ */
    window.openLeadModal = function () {
        if (typeof window.populateLeadSummary === "function") window.populateLeadSummary();
        var modal = document.getElementById('vioraLeadModal');
        if (!modal) return;
        window.openModal('vioraLeadModal');
        setTimeout(function () {
            var nameInp = document.getElementById('vfName');
            if (nameInp) nameInp.focus();
        }, 260);
    };
    window.closeLeadModal = function () { window.closeModal('vioraLeadModal'); };

    function initLeadForm() {
        var modal = document.getElementById('vioraLeadModal');
        var closeBtn = document.getElementById('vioraLeadClose');
        var form = document.getElementById('vioraLeadForm');
        if (closeBtn) closeBtn.addEventListener('click', window.closeLeadModal);
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) window.closeLeadModal(); });
        if (!form) return;

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            var name = document.getElementById('vfName').value.trim();
            var email = document.getElementById('vfEmail').value.trim();
            var phone = document.getElementById('vfPhone').value.trim();
            var note = document.getElementById('vfNote').value.trim();
            var err = document.getElementById('vfErr');
            var success = document.getElementById('vfSuccess');
            var submitBtn = document.getElementById('vfSubmit');

            if (err) err.textContent = "";
            if (success) { success.style.display = "none"; success.textContent = ""; }

            if (!name) { if (err) err.textContent = "Please enter your name."; return; }
            if (!phone || phone.replace(/\D/g, "").length < 7) { if (err) err.textContent = "Please enter a valid WhatsApp number."; return; }
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (err) err.textContent = "That email doesn't look right."; return; }

            submitBtn.disabled = true;
            var originalHTML = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving…';

            var active = (typeof window.getActiveIndustry === "function") ? window.getActiveIndustry() : null;
            var ind = active ? active.data : null;
            var cat = active ? active.cat : null;

            var saved = false;
            try {
                saved = await saveBlueprintToFirebase(ind, cat, {
                    name: name, email: email, phone: phone, note: note,
                    industryKey: active ? active.key : null
                });
            } catch (e2) {
                console.error('[VIORA] save failed', e2);
                if (err) err.textContent = "Could not save to server — still opening WhatsApp.";
            }

            var lines = [];
            lines.push("Hi VIORA 👋");
            lines.push("");
            lines.push("I'm " + name + " and I am interested in learning more about the sub-industry below.");
            lines.push("My WhatsApp: " + phone);
            if (email) lines.push("My email: " + email);
            lines.push("");
            lines.push("━━━━━━━━━━━━━━━━");
            lines.push("📋 SUB-INDUSTRY BLUEPRINT");
            lines.push("🏷️  " + (ind ? ind.em + " " + ind.name : "General enquiry"));
            if (cat) lines.push("📂 " + cat.em + " " + cat.name);
            lines.push("━━━━━━━━━━━━━━━━");
            if (ind) {
                lines.push("");
                lines.push("⚠️  BIGGEST PAIN TODAY");
                lines.push("   " + ind.problem);
                lines.push("");
                lines.push("✅ HOW VIORA SOLVES IT");
                ind.solutions.forEach(function (s) { lines.push("   • " + s); });
                lines.push("");
                lines.push("🧩 MODULES NEEDED FOR THIS SUB-INDUSTRY");
                (ind.modules || []).forEach(function (m) {
                    var mod = window.MODULE_DEFS[m];
                    if (mod) lines.push("   • " + mod.em + " " + mod.name);
                });
                lines.push("");
                lines.push("🚀 WHAT CHANGES WITH VIORA");
                ind.changes.forEach(function (c) { lines.push("   • " + c); });
            }
            if (note) {
                lines.push("");
                lines.push("📝 EXTRA NOTE");
                lines.push("   " + note);
            }
            lines.push("");
            lines.push("━━━━━━━━━━━━━━━━");
            lines.push("Can we talk?");

            var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(lines.join("\n"));

            if (success) {
                success.style.display = "block";
                success.textContent = saved
                    ? "✅ Saved to VIORA lead system. Opening WhatsApp…"
                    : "✅ Opening WhatsApp with your blueprint…";
            }

            setTimeout(function () {
                var win = window.open(url, "_blank", "noopener,noreferrer");
                if (!win) window.location.href = url;
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
                form.reset();
                if (typeof window.clearActiveIndustry === "function") window.clearActiveIndustry();
                setTimeout(function () {
                    window.closeLeadModal();
                    if (success) { success.style.display = "none"; success.textContent = ""; }
                    var summary = document.getElementById('leadSummary');
                    if (summary) summary.style.display = "none";
                }, 900);
            }, saved ? 700 : 250);
        });
    }

    /* ═══ FIREBASE LOGO SYNC ═══ */
    function initLogo() {
        loadFirebase().then(function (ok) {
            if (!ok || !window._fbDb || !window._fbRef || !window._fbOnValue) return;
            window._fbOnValue(window._fbRef(window._fbDb, 'viora_data/orgs/viora/logoUrl'), function (snap) {
                var url = snap.exists() ? snap.val() : null;
                var logoBox = document.querySelector('.brand-logo-v');
                if (!logoBox) return;
                if (url) {
                    logoBox.innerHTML = '<img src="' + escHtml(url) + '" alt="VIORA" style="width:100%;height:100%;object-fit:contain;border-radius:4px;">';
                    logoBox.style.background = 'transparent';
                    logoBox.style.clipPath = 'none';
                }
            });
        });
    }

    /* ═══ VIDEO ═══ */
    function initVideos() {
        var featured = document.getElementById('featuredVideo');
        var featuredThumb = document.getElementById('featuredThumb');
        var thumbs = document.getElementById('videoThumbs');
        var modal = document.getElementById('vioraVideoModal');
        var frame = document.getElementById('videoModalFrame');
        var closeBtn = document.getElementById('vioraVideoClose');
        var vids = window.VIORA_VIDEOS || { featured: '', list: [] };
        if (!featured || !thumbs) return;

        function thumbUrl(id) { return 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg'; }
        function thumbUrlFallback(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }

        function playVideo(id) {
            if (!id || !frame) return;
            frame.innerHTML =
                '<iframe src="https://www.youtube.com/embed/' + id +
                '?autoplay=1&rel=0&modestbranding=1" ' +
                'title="VIORA video" ' +
                'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
                'referrerpolicy="strict-origin-when-cross-origin" ' +
                'allowfullscreen></iframe>';
            window.openModal('vioraVideoModal');
        }

        if (vids.featured && featuredThumb) {
            featured.dataset.videoId = vids.featured;
            var preload = new Image();
            preload.onload = function () { featuredThumb.style.backgroundImage = 'url("' + thumbUrl(vids.featured) + '")'; };
            preload.onerror = function () { featuredThumb.style.backgroundImage = 'url("' + thumbUrlFallback(vids.featured) + '")'; };
            preload.src = thumbUrl(vids.featured);
        }

        featured.addEventListener('click', function () { playVideo(featured.dataset.videoId); });
        featured.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                playVideo(featured.dataset.videoId);
            }
        });

        var list = (vids.list || []).filter(function (v) { return v.id !== vids.featured; });

        thumbs.innerHTML = list.map(function (v) {
            return '<button type="button" class="video-thumb" ' +
                'data-video-id="' + escHtml(v.id) + '" ' +
                'aria-label="Play ' + escHtml(v.title) + '">' +
                '<div class="thumb-img" data-video-id="' + escHtml(v.id) + '"></div>' +
                '<div class="thumb-overlay" aria-hidden="true"></div>' +
                '<div class="thumb-play" aria-hidden="true"><i class="fa-solid fa-play"></i></div>' +
                '<div class="thumb-title">' + escHtml(v.title) + '</div>' +
            '</button>';
        }).join('');

        Array.prototype.forEach.call(thumbs.querySelectorAll('.thumb-img'), function (div) {
            var id = div.dataset.videoId;
            var img = new Image();
            img.onload = function () { div.style.backgroundImage = 'url("' + thumbUrl(id) + '")'; };
            img.onerror = function () { div.style.backgroundImage = 'url("' + thumbUrlFallback(id) + '")'; };
            img.src = thumbUrl(id);
        });

        Array.prototype.forEach.call(thumbs.querySelectorAll('.video-thumb'), function (t) {
            t.addEventListener('click', function () { playVideo(t.dataset.videoId); });
        });

        if (closeBtn) closeBtn.addEventListener('click', function () {
            frame.innerHTML = '';
            window.closeModal('vioraVideoModal');
        });
        if (modal) modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                frame.innerHTML = '';
                window.closeModal('vioraVideoModal');
            }
        });
    }

    /* ═══ SAFE INIT + BOOT ═══ */
    function safeInit(name, fn) {
        try { fn(); }
        catch (err) { console.error('[VIORA] init "' + name + '" failed:', err); }
    }

    function boot() {
        resizeCanvas();
        netResize();
        if (!prefersReducedMotion) {
            requestAnimationFrame(netTick);
        }

        if (typeof window.renderModuleCards === 'function') {
            window.renderModuleCards(window.DEFAULT_BANNER_CARDS || []);
        }

        if (!prefersReducedMotion) {
            requestAnimationFrame(animate);
        }

        safeInit('liveCounters', initLiveCounters);
        safeInit('portalCarousel', initPortalCarousel);

        setTimeout(function () {
            safeInit('cap3D', initCap3D);
            safeInit('compare3D', initCompare3D);
            safeInit('calculator', initCalculator);
            safeInit('impactTicker', initImpactTicker);
            safeInit('videos', initVideos);
            safeInit('leadForm', initLeadForm);
            safeInit('logo', initLogo);

            if (typeof window.initBlueprintModule === "function") {
                safeInit('blueprint', window.initBlueprintModule);
            }
        }, 60);

        var rz;
        window.addEventListener('resize', function () {
            clearTimeout(rz);
            rz = setTimeout(function () {
                resizeCanvas();
                netResize();
                if (typeof window.renderModuleCards === 'function') {
                    window.renderModuleCards(window.DEFAULT_BANNER_CARDS || []);
                }
                rebuildDataFlow();
                if (typeof markFlowRectsDirty === 'function') markFlowRectsDirty();
            }, 180);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
