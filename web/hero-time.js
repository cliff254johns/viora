/* ═══════════════════════════════════════════════════════════
   hero-time.js — network-synced time for the VIORA hero
   v1.2 — bulletproof, self-testing
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SYNC_INTERVAL_MS   = 3600000;        // 1 hour
  var RETRY_INTERVAL_MS  = 60000;          // 1 minute
  var REQUEST_TIMEOUT_MS = 5000;
  var MAX_SANE_OFFSET_MS = 7 * 86400000;   // 7 days

  var WORLD_TIME_URL     = 'https://worldtimeapi.org/api/timezone/';
  var TIME_API_URL       = 'https://timeapi.io/api/Time/current/zone?timeZone=';
  var CLOUDFLARE_URL     = 'https://cloudflare.com/cdn-cgi/trace';
  var WORLD_TIME_IP_URL  = 'https://worldtimeapi.org/api/ip';

  var state = {
    offsetMs: 0,
    syncedAt: 0,
    source: null,
    syncing: false,
    tz: null,
    tzOffsetMs: 0,
    tzOffsetAt: 0,
    syncTimer: null,
    retryTimer: null,
    listeners: {},
    destroyed: false,
    initFired: false
  };

  /* ── Events ── */
  function on(name, cb) {
    if (!state.listeners[name]) state.listeners[name] = [];
    state.listeners[name].push(cb);
    return function () { off(name, cb); };
  }
  function off(name, cb) {
    var arr = state.listeners[name];
    if (!arr) return;
    var i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  }
  function emit(name, payload) {
    var arr = state.listeners[name];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](payload); } catch (_) {}
    }
  }

  /* ── Core clock ── */
  function nowMsInternal() {
    return Date.now() + state.offsetMs;
  }
  function now() {
    return new Date(nowMsInternal());
  }

  /* ── TZ offset ── */
  var TZ_OFFSET_TTL_MS = 3600000;

  function computeTzOffsetMs(tz) {
    if (!tz) return 0;
    try {
      var fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
      var nowD = new Date(nowMsInternal());
      var parts = fmt.formatToParts(nowD);
      var year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === 'year') year = Number(p.value);
        else if (p.type === 'month') month = Number(p.value);
        else if (p.type === 'day') day = Number(p.value);
        else if (p.type === 'hour') hour = Number(p.value);
        else if (p.type === 'minute') minute = Number(p.value);
        else if (p.type === 'second') second = Number(p.value);
      }
      var localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
      return localAsUtc - nowD.getTime();
    } catch (_) {
      return 0;
    }
  }

  function tzOffsetMs(tz) {
    var n = nowMsInternal();
    if (state.tz === tz && (n - state.tzOffsetAt) < TZ_OFFSET_TTL_MS) {
      return state.tzOffsetMs;
    }
    state.tz = tz || null;
    state.tzOffsetMs = computeTzOffsetMs(tz);
    state.tzOffsetAt = n;
    emit('tzChange', { tz: state.tz, offsetMs: state.tzOffsetMs });
    return state.tzOffsetMs;
  }

  /* ── HTTP ── */
  function withTimeout(promise, ms) {
    var timer;
    var timeout = new Promise(function (_, rej) {
      timer = setTimeout(function () {
        var e = new Error('timeout after ' + ms + 'ms');
        e.code = 'ETIMEDOUT';
        rej(e);
      }, ms);
    });
    return Promise.race([promise, timeout]).then(function (v) {
      clearTimeout(timer);
      return v;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function fetchWorldTimeApi(tz) {
    if (!tz) return Promise.reject(new Error('worldtimeapi requires tz'));
    var url = WORLD_TIME_URL + encodeURIComponent(tz);
    return withTimeout(fetch(url, { cache: 'no-store' }), REQUEST_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('worldtimeapi http ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var ms = Number(json.unixtime) * 1000;
        if (!isFinite(ms)) throw new Error('bad unixtime');
        return { ms: ms, source: 'worldtimeapi' };
      });
  }

  function fetchTimeApiIo(tz) {
    if (!tz) return Promise.reject(new Error('timeapi.io requires tz'));
    var url = TIME_API_URL + encodeURIComponent(tz);
    return withTimeout(fetch(url, { cache: 'no-store' }), REQUEST_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('timeapi.io http ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var iso = String(json.dateTime || '');
        if (!iso) throw new Error('missing dateTime');
        var normalized = iso.replace(/\.\d+$/, '');
        var wallAsUtc = Date.parse(normalized + 'Z');
        if (!isFinite(wallAsUtc)) throw new Error('bad dateTime');
        var off = computeTzOffsetMs(tz);
        return { ms: wallAsUtc - off, source: 'timeapi.io' };
      });
  }

  function fetchCloudflare() {
    return withTimeout(fetch(CLOUDFLARE_URL, { cache: 'no-store' }), REQUEST_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('cloudflare http ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var m = text.match(/^ts=([\d.]+)/m);
        if (!m) throw new Error('cloudflare missing ts');
        var ms = Number(m[1]) * 1000;
        if (!isFinite(ms)) throw new Error('cloudflare bad ts');
        return { ms: ms, source: 'cloudflare' };
      });
  }

  function fetchWorldTimeApiIp() {
    return withTimeout(fetch(WORLD_TIME_IP_URL, { cache: 'no-store' }), REQUEST_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('worldtimeapi/ip http ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var ms = Number(json.unixtime) * 1000;
        if (!isFinite(ms)) throw new Error('bad unixtime');
        return { ms: ms, source: 'worldtimeapi-ip' };
      });
  }

  /* ── Sync ── */
  function sync(opts) {
    opts = opts || {};
    if (state.destroyed) return Promise.resolve(false);
    if (state.syncing && !opts.force) return Promise.resolve(false);
    state.syncing = true;

    var tz = opts.tz || state.tz || detectFallbackTz();
    var t0 = Date.now();

   var sources = [
      function () { return fetchCloudflare(); },
      function () { return fetchTimeApiIo(tz); },
      function () { return fetchWorldTimeApiIp(); }
    ];

    var result = null;
    var lastErr = null;

    function tryNext(i) {
      if (i >= sources.length) return Promise.resolve(null);
      return sources[i]().then(function (r) {
        var t1 = Date.now();
        var latency = (t1 - t0) / 2;
        return { ms: r.ms + latency, source: r.source };
      }, function (e) {
        lastErr = e;
        return tryNext(i + 1);
      });
    }

    return tryNext(0).then(function (res) {
      if (!res) {
        state.syncing = false;
        emit('failed', { error: lastErr, source: null });
        scheduleRetry();
        return false;
      }
      result = res;
      var offset = result.ms - Date.now();
      if (!isFinite(offset) || Math.abs(offset) > MAX_SANE_OFFSET_MS) {
        state.syncing = false;
        emit('failed', { error: new Error('offset out of sane range'), source: result.source });
        scheduleRetry();
        return false;
      }
      state.offsetMs = offset;
      state.syncedAt = Date.now();
      state.source = result.source;
      state.syncing = false;
      if (state.tz) {
        state.tzOffsetAt = 0;
        tzOffsetMs(state.tz);
      }
      emit('synced', { offsetMs: offset, source: result.source, at: state.syncedAt });
      scheduleNextSync();
      return true;
    }).catch(function (e) {
      state.syncing = false;
      emit('failed', { error: e, source: null });
      scheduleRetry();
      return false;
    });
  }

  function detectFallbackTz() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (_) {
      return 'UTC';
    }
  }

  function scheduleNextSync() {
    if (state.syncTimer) clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(function () {
      sync({ force: true });
    }, SYNC_INTERVAL_MS);
  }
  function scheduleRetry() {
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(function () {
      sync({ force: true });
    }, RETRY_INTERVAL_MS);
  }

  /* ── localParts ── */
  var _weekdayLong = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var _monthLong   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function localParts(date, tz) {
    var base = date instanceof Date ? date.getTime() : nowMsInternal();
    var off = tzOffsetMs(tz);
    var local = new Date(base + off);
    var hour = local.getUTCHours();
    var minute = local.getUTCMinutes();
    var second = local.getUTCSeconds();
    var weekday = _weekdayLong[local.getUTCDay()];
    var day = local.getUTCDate();
    var month = _monthLong[local.getUTCMonth()];
    var year = local.getUTCFullYear();
    var hh = hour < 10 ? '0' + hour : '' + hour;
    var mm = minute < 10 ? '0' + minute : '' + minute;
    var ss = second < 10 ? '0' + second : '' + second;
    return { hour: hour, minute: minute, second: second, hh: hh, mm: mm, ss: ss, weekday: weekday, day: day, month: month, year: year };
  }

  /* ── Public API ── */
  var api = {
    version: '1.3',

    init: function (opts) {
      opts = opts || {};
      if (state.initFired) return api;
      state.initFired = true;
      if (opts.tz) api.setTimezone(opts.tz);
      sync({ force: true, tz: opts.tz });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden && state.syncedAt > 0 &&
              (Date.now() - state.syncedAt) > SYNC_INTERVAL_MS) {
            sync({ force: true });
          }
        });
      }
      return api;
    },

    now: now,
    nowMs: nowMsInternal,
    offsetMs: function () { return state.offsetMs; },
    isSynced: function () { return state.syncedAt > 0; },
    source: function () { return state.source; },
    syncedAt: function () { return state.syncedAt; },

    sync: sync,

    setTimezone: function (tz) {
      if (!tz) return api;
      if (tz === state.tz) return api.forceRefresh();
      state.tz = tz;
      state.tzOffsetAt = 0;
      tzOffsetMs(tz);
      return api;
    },

    forceRefresh: function () {
      state.tzOffsetAt = 0;
      if (state.tz) tzOffsetMs(state.tz);
      return true;
    },

    tzOffsetMs: tzOffsetMs,
    localParts: localParts,
    on: on,
    off: off,

    destroy: function () {
      state.destroyed = true;
      if (state.syncTimer) clearTimeout(state.syncTimer);
      if (state.retryTimer) clearTimeout(state.retryTimer);
      state.syncTimer = null;
      state.retryTimer = null;
      state.listeners = {};
    },

    debug: {
      state: state,
      computeTzOffsetMs: computeTzOffsetMs,
      fetchWorldTimeApi: fetchWorldTimeApi,
      fetchTimeApiIo: fetchTimeApiIo,
      fetchCloudflare: fetchCloudflare,
      fetchWorldTimeApiIp: fetchWorldTimeApiIp
    }
  };

  Object.defineProperty(global, 'VioraTime', {
    value: api,
    writable: false,
    configurable: true
  });

  /* ── Global clock shim ── */
  if (typeof global.__vioraNow !== 'function') {
    global.__vioraNow = function () {
      try {
        if (global.VioraTime && typeof global.VioraTime.now === 'function') {
          return global.VioraTime.now();
        }
      } catch (_) {}
      return new Date();
    };
  }
  if (typeof global.__vioraNowMs !== 'function') {
    global.__vioraNowMs = function () {
      try {
        if (global.VioraTime && typeof global.VioraTime.nowMs === 'function') {
          return global.VioraTime.nowMs();
        }
      } catch (_) {}
      return Date.now();
    };
  }

  /* ── Self-boot ── */
  try {
    if (!global.VioraTime.__booted) {
      global.VioraTime.__booted = true;
      global.VioraTime.init({
        tz: (function () {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi'; }
          catch (_) { return 'Africa/Nairobi'; }
        })()
      });
    }
  } catch (e) {
    console.warn('[VioraTime] self-boot failed:', e);
  }

  /* ── Self-test: print to console so you KNOW it loaded ── */
  console.log('[VioraTime] v1.2 loaded — offsetMs:', typeof api.offsetMs, '| forceRefresh:', typeof api.forceRefresh);

})(typeof window !== 'undefined' ? window : globalThis);
