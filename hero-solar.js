/* ═══════════════════════════════════════════════════════════
   hero-solar.js — NOAA solar + lunar ephemeris library
   ─────────────────────────────────────────────────────────────
   v3.3 — moonrise/moonset, peakNorm, schema 6

   What changed vs v3.2:
     • NEW getMoonTimes(lat, lon, date)
       Iterative moonrise/moonset using the same NOAA
       crossing-time approach as sunrise/sunset, but at the
       moon's horizon altitude (-0.833°). Handles "always up"
       and "always down" days (the moon rises and sets about
       50 minutes later each day, so some days have no rise
       or no set at all).
     • NEW getMoonFull(lat, lon, date)
       Moon phase + rise/set + nextFull + nextNew, one call.
     • NEW getSkyState().sun.peakNorm
       min(1, solarNoonElevationDeg / 60). The orb uses this
       to scale the parabola height. Previously hero-orb.js
       had a local fallback; this makes the fallback
       unnecessary without breaking it.
     • NEW getSkyState().sun.solarNoonElevationDeg
       Peak sun angle today (already existed on getFull(),
       now also on getSkyState()).
     • NEW getSkyState().moon.{rise,set,riseStatus,setStatus,
       nextFull,nextNew,alwaysUp,alwaysDown}
       For the tooltip.
     • SCHEMA bumped 5 → 6.
     • No existing function changed behavior. All additions
       are new keys on returned objects.

   Accuracy:
     • NOAA iterative sunrise/sunset (10 s precision).
     • Iterative twilight crossings for all 5 bands.
     • Iterative moonrise/moonset at -0.833° horizon.
     • Local-date aware cache keys — correct at every longitude.
     • Standard phase names: day | golden | blue | civil |
       nautical | astronomical.
     • Moon visibility threshold based on sun elevation < 0°.

   Performance:
     • getSkyState → pure cache read after first call.
     • prewarm() fills every cache so the first paint is free.
     • Moon position memoized per (lat, lon, minute).
     • Moon times memoized per (lat, lon, local date).
     • Sunrise/sunset memoized per (lat, lon, local date).
     • Solar geometry memoized per minute.

   Public API:
     Solar.getPosition(lat, lon, date)
     Solar.getTimes(lat, lon, date, opts)
     Solar.getFull(lat, lon, date, opts)
     Solar.getMoonPosition(lat, lon, date)
     Solar.getMoonTimes(lat, lon, date)
     Solar.getMoonFull(lat, lon, date)
     Solar.getTwilights(lat, lon, date)
     Solar.isDay(lat, lon, date)
     Solar.getSkyState(lat, lon, date)
     Solar.snapshot(lat, lon, date)
     Solar.prewarm(lat, lon, date)
     Solar.prewarmIfStale(lat, lon, date)
     Solar.workerEntry(payload)
     Solar.version, Solar.schema
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const VERSION = '3.3';
  const SCHEMA  = 6;

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  const HORIZON = Object.freeze({
    SUNRISE:      -0.833,
    GOLDEN_UPPER:  6.0,
    GOLDEN_LOWER:  0.0,
    BLUE_UPPER:    0.0,
    BLUE_LOWER:   -4.0,
    CIVIL:        -6.0,
    NAUTICAL:    -12.0,
    ASTRONOMICAL:-18.0,
    MOONRISE:     -0.833
  });

  let TT_MINUS_UTC_SECONDS = 69.184;
  function setTTMinusUTC(s) {
    TT_MINUS_UTC_SECONDS = Number.isFinite(s) ? s : 69.184;
  }
  function setDut1(s) { /* no-op — kept for API compat */ }

  /* ── Validation ────────────────────────────────────────── */
  function validate(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new TypeError('[Solar] lat and lon must be finite numbers');
    }
    if (lat < -90 || lat > 90) throw new RangeError('[Solar] lat out of range');
    if (lon < -180 || lon > 180) throw new RangeError('[Solar] lon out of range');
  }
  function toDate(d) {
    if (d instanceof Date) {
      if (Number.isNaN(d.getTime())) throw new TypeError('[Solar] invalid Date');
      return d;
    }
    let fallback;
    if (d == null) {
      try {
        if (typeof global.__vioraNow === 'function') {
          fallback = global.__vioraNow();
        } else if (global.VioraTime && typeof global.VioraTime.now === 'function') {
          fallback = global.VioraTime.now();
        } else {
          fallback = new Date();
        }
      } catch (_) {
        fallback = new Date();
      }
    } else {
      fallback = d;
    }
    const dt = new Date(fallback);
    if (Number.isNaN(dt.getTime())) throw new TypeError('[Solar] invalid Date');
    return dt;
  }

  /* ═══════════════════════════════════════════════════════════
     solar-core — pure math, worker-safe
     ═══════════════════════════════════════════════════════════ */
  const core = (function () {

    function toJulian(date) {
      return date.valueOf() / 86400000 + 2440587.5;
    }
    function fromJulian(jd) {
      return new Date((jd - 2440587.5) * 86400000);
    }

    function solarGeometry(jd) {
      const n = jd - 2451545.0;
      const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
      const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * DEG;
      const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
      const epsilon = (23.439 - 0.0000004 * n) * DEG;

      const ra  = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
      const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

      const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
      const lst  = gmst * 15 * DEG;

      return { ra, dec, lst, lambda, epsilon, gmst };
    }

    function altAz(ra, dec, lst, lat, lon) {
      const H = lst + lon * DEG - ra;
      const sinAlt = Math.sin(lat * DEG) * Math.sin(dec) +
                     Math.cos(lat * DEG) * Math.cos(dec) * Math.cos(H);
      const sinAltC = Math.max(-1, Math.min(1, sinAlt));
      const alt = Math.asin(sinAltC);

      const y = -Math.sin(H);
      const x = Math.tan(dec) * Math.cos(lat * DEG) -
                Math.sin(lat * DEG) * Math.cos(H);
      const az = Math.atan2(y, x);

      return {
        elevation: Number.isFinite(alt) ? alt * RAD : NaN,
        azimuth:   Number.isFinite(az)  ? ((az * RAD) + 360) % 360 : NaN
      };
    }

    function refraction(elevDeg) {
      if (!Number.isFinite(elevDeg)) return 0;
      if (elevDeg > 85) return 0;
      const e = Math.max(-1, elevDeg);
      const r = 1.02 / Math.tan((e + 10.3 / (e + 5.11)) * DEG);
      return r / 60;
    }

    function sunriseSunset(lat, lon, date) {
      const jd0 = toJulian(date);
      const n0 = Math.floor(jd0 - 2451545.0 + 0.0008);
      const Jstar = n0 - lon / 360;

      const M = ((357.5291 + 0.98560028 * Jstar) % 360 + 360) % 360;
      const C = 1.9148 * Math.sin(M * DEG)
              + 0.0200 * Math.sin(2 * M * DEG)
              + 0.0003 * Math.sin(3 * M * DEG);
      const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360;

      const Jtransit0 = 2451545.0 + Jstar
        + 0.0053 * Math.sin(M * DEG)
        - 0.0069 * Math.sin(2 * lambda * DEG);

      const sinDec0 = Math.sin(lambda * DEG) * Math.sin(23.44 * DEG);
      const dec0    = Math.asin(sinDec0);

      const cosOmega0 =
        (Math.sin(HORIZON.SUNRISE * DEG) - Math.sin(lat * DEG) * sinDec0) /
        (Math.cos(lat * DEG) * Math.cos(dec0));

      if (cosOmega0 >  1) return { sunrise: null, sunset: null, solarNoon: fromJulian(Jtransit0), polarNight: true,  polarDay: false };
      if (cosOmega0 < -1) return { sunrise: null, sunset: null, solarNoon: fromJulian(Jtransit0), polarNight: false, polarDay: true  };

      const omega0 = Math.acos(cosOmega0);
      let Jrise = Jtransit0 - omega0 / (2 * Math.PI);
      let Jset  = Jtransit0 + omega0 / (2 * Math.PI);

      for (let iter = 0; iter < 3; iter++) {
        const gRise = solarGeometry(Jrise);
        const sinDecR = Math.sin(gRise.dec);
        const cosDecR = Math.cos(gRise.dec);
        const cosOmegaR =
          (Math.sin(HORIZON.SUNRISE * DEG) - Math.sin(lat * DEG) * sinDecR) /
          (Math.cos(lat * DEG) * cosDecR);
        if (cosOmegaR > 1 || cosOmegaR < -1) { Jrise = NaN; break; }
        const omegaR = Math.acos(cosOmegaR);
        Jrise = Jtransit0 - omegaR / (2 * Math.PI);

        const gSet = solarGeometry(Jset);
        const sinDecS = Math.sin(gSet.dec);
        const cosDecS = Math.cos(gSet.dec);
        const cosOmegaS =
          (Math.sin(HORIZON.SUNRISE * DEG) - Math.sin(lat * DEG) * sinDecS) /
          (Math.cos(lat * DEG) * cosDecS);
        if (cosOmegaS > 1 || cosOmegaS < -1) { Jset = NaN; break; }
        const omegaS = Math.acos(cosOmegaS);
        Jset = Jtransit0 + omegaS / (2 * Math.PI);
      }

      if (Number.isNaN(Jrise) || Number.isNaN(Jset)) {
        return { sunrise: null, sunset: null, solarNoon: fromJulian(Jtransit0), polarNight: false, polarDay: true };
      }

      return {
        sunrise:   fromJulian(Jrise),
        sunset:    fromJulian(Jset),
        solarNoon: fromJulian(Jtransit0),
        polarNight:false,
        polarDay:  false
      };
    }

    function crossingTimes(lat, lon, date, altitudeDeg) {
      const jd0 = toJulian(date);
      const n0 = Math.floor(jd0 - 2451545.0 + 0.0008);
      const Jstar = n0 - lon / 360;

      const M = ((357.5291 + 0.98560028 * Jstar) % 360 + 360) % 360;
      const C = 1.9148 * Math.sin(M * DEG)
              + 0.0200 * Math.sin(2 * M * DEG)
              + 0.0003 * Math.sin(3 * M * DEG);
      const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360;

      const Jtransit0 = 2451545.0 + Jstar
        + 0.0053 * Math.sin(M * DEG)
        - 0.0069 * Math.sin(2 * lambda * DEG);

      const sinDec0 = Math.sin(lambda * DEG) * Math.sin(23.44 * DEG);
      const dec0    = Math.asin(sinDec0);

      const cosOmega0 =
        (Math.sin(altitudeDeg * DEG) - Math.sin(lat * DEG) * sinDec0) /
        (Math.cos(lat * DEG) * Math.cos(dec0));

      if (cosOmega0 >  1) return { rise: null, set: null, always: 'below' };
      if (cosOmega0 < -1) return { rise: null, set: null, always: 'above' };

      const omega0 = Math.acos(cosOmega0);
      let Jrise = Jtransit0 - omega0 / (2 * Math.PI);
      let Jset  = Jtransit0 + omega0 / (2 * Math.PI);

      for (let iter = 0; iter < 3; iter++) {
        const gRise = solarGeometry(Jrise);
        const sinDecR = Math.sin(gRise.dec);
        const cosDecR = Math.cos(gRise.dec);
        const cosOmegaR =
          (Math.sin(altitudeDeg * DEG) - Math.sin(lat * DEG) * sinDecR) /
          (Math.cos(lat * DEG) * cosDecR);
        if (cosOmegaR >= 1 || cosOmegaR <= -1) break;
        const omegaR = Math.acos(cosOmegaR);
        Jrise = Jtransit0 - omegaR / (2 * Math.PI);

        const gSet = solarGeometry(Jset);
        const sinDecS = Math.sin(gSet.dec);
        const cosDecS = Math.cos(gSet.dec);
        const cosOmegaS =
          (Math.sin(altitudeDeg * DEG) - Math.sin(lat * DEG) * sinDecS) /
          (Math.cos(lat * DEG) * cosDecS);
        if (cosOmegaS >= 1 || cosOmegaS <= -1) break;
        const omegaS = Math.acos(cosOmegaS);
        Jset = Jtransit0 + omegaS / (2 * Math.PI);
      }

      return { rise: fromJulian(Jrise), set: fromJulian(Jset), always: null };
    }

    return { toJulian, fromJulian, solarGeometry, altAz, refraction,
             sunriseSunset, crossingTimes };
  })();

  /* ═══════════════════════════════════════════════════════════
     Moon — truncated ELP2000
     ═══════════════════════════════════════════════════════════ */
  const moon = (function () {

    function moonPosition(date) {
      const jd = core.toJulian(date);
      const n = jd - 2451545.0;

      const L = ((218.316 + 13.176396 * n) % 360 + 360) % 360;
      const M = ((134.963 + 13.064993 * n) % 360 + 360) % 360;
      const F = ((93.272  + 13.229350 * n) % 360 + 360) % 360;

      const lambda = L + 6.289 * Math.sin(M * DEG);
      const beta   = 5.128 * Math.sin(F * DEG);
      const delta  = Math.asin(
        Math.sin(beta * DEG) * Math.cos(23.44 * DEG) +
        Math.cos(beta * DEG) * Math.sin(23.44 * DEG) * Math.sin(lambda * DEG)
      );
      const ra = Math.atan2(
        Math.sin(lambda * DEG) * Math.cos(23.44 * DEG) -
        Math.tan(beta * DEG) * Math.sin(23.44 * DEG),
        Math.cos(lambda * DEG)
      );

           const sunG = core.solarGeometry(jd);
      // `lambda` above is in DEGREES; sunG.lambda is in RADIANS.
      // Convert lambda to radians before subtracting, otherwise the
      // moon phase is computed from a meaningless angle.
      const lambdaRad = lambda * DEG;
      let elong = lambdaRad - sunG.lambda;
      elong = ((elong % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

      const phase = 0.5 * (1 - Math.cos(elong));
      return {
        ra, dec: delta,
        eclipticLon: lambda,
        eclipticLat: beta,
        phase,
        illumination: phase,
        phaseName: phaseName(phase)
      };
    }

    function phaseName(p) {
      if (p < 0.03 || p > 0.97) return 'new';
      if (p < 0.22) return 'waxing-crescent';
      if (p < 0.28) return 'first-quarter';
      if (p < 0.47) return 'waxing-gibbous';
      if (p < 0.53) return 'full';
      if (p < 0.72) return 'waning-gibbous';
      if (p < 0.78) return 'last-quarter';
      return 'waning-crescent';
    }

    function getMoonPosition(lat, lon, date) {
      const m = moonPosition(date);
      const g = core.solarGeometry(core.toJulian(date));
      const p = core.altAz(m.ra, m.dec, g.lst, lat, lon);
      return {
        elevation: p.elevation,
        azimuth:   p.azimuth,
        apparentElevation: p.elevation + core.refraction(p.elevation),
        phase: m.phase,
        illumination: m.illumination,
        phaseName: m.phaseName,
        visible: p.elevation > -1
      };
    }

    /* ── Moonrise / moonset ──────────────────────────────────
       The moon moves 13°/day east, so a given latitude sees
       moonrise about 50 minutes later each day. On roughly
       one day per month the moon is up all night (always up
       during the local day of interest), and on another it's
       down all night. We handle both cases by sampling
       elevation at midnight, noon, and next midnight and
       looking for sign changes.

       We use a simple bisection on `f(t) = elev(t) - horizon`.
       Moon elevation changes by ~15°/hour so bisection
       converges in ~15 iterations for 1-second precision.
       The cache makes this cheap: one call per location per
       local day. */
    function moonTimes(lat, lon, date) {
      const horizon = HORIZON.MOONRISE;

      const dayStart = new Date(date);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayMs = dayStart.getTime();
      const hourMs = 3600000;

      function elevAt(t) {
        const p = getMoonPosition(lat, lon, new Date(t));
        return Number.isFinite(p.elevation) ? p.elevation - horizon : NaN;
      }

      /* Step through the day in 1-hour increments and look
         for zero crossings. */
      let rise = null, set = null;
      let alwaysUp = true, alwaysDown = true;
      let prevT = dayMs;
      let prevV = elevAt(prevT);
      if (!Number.isFinite(prevV)) {
        return { rise: null, set: null, alwaysUp: false, alwaysDown: false };
      }
      if (prevV > 0) alwaysDown = false;
      if (prevV <= 0) alwaysUp = false;

      for (let h = 1; h <= 24; h++) {
        const t = dayMs + h * hourMs;
        const v = elevAt(t);
        if (!Number.isFinite(v)) break;
        if (v > 0) alwaysDown = false;
        if (v <= 0) alwaysUp = false;

        if (Number.isFinite(prevV) && Math.sign(prevV) !== Math.sign(v)) {
          /* Bisection between prevT and t. */
          let lo = prevT, hi = t;
          let flo = prevV, fhi = v;
          for (let it = 0; it < 30; it++) {
            const mid = (lo + hi) / 2;
            const fm = elevAt(mid);
            if (!Number.isFinite(fm)) break;
            if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; }
            else { hi = mid; fhi = fm; }
            if (hi - lo < 1000) break;
          }
          const cross = new Date((lo + hi) / 2);
          if (prevV <= 0 && v > 0) {
            if (!rise) rise = cross;
          } else {
            if (!set) set = cross;
          }
        }

        prevT = t;
        prevV = v;
      }

      return {
        rise,
        set,
        alwaysUp: alwaysUp && !rise && !set,
        alwaysDown: alwaysDown && !rise && !set
      };
    }

    /* ── Next full / new moon ───────────────────────────────
       We look ahead day by day for the phase fraction to
       hit the target, then bisect to the nearest minute.
       Max lookahead 32 days (a full synodic month). */
    function nextPhase(lat, lon, date, target) {
      const start = core.toJulian(date);
      const maxJd = start + 32;
      let prevJd = start;
      let prevPhase = moonPosition(fromJulianSafe(prevJd)).phase;

      for (let d = 1; d <= 32; d++) {
        const jd = start + d;
        const p = moonPosition(fromJulianSafe(jd)).phase;

        /* Handle wraparound: if target is 0 (new) and phase
           crossed from >0.97 to <0.03, that's a new moon. */
        let crossed = false;
        if (target <= 0.03) {
          if (prevPhase > 0.9 && p < 0.1) crossed = true;
        } else if (target >= 0.5) {
          if (Math.sign(prevPhase - 0.5) !== Math.sign(p - 0.5)) crossed = true;
        }

        if (crossed) {
          /* Bisect to nearest minute */
          let lo = prevJd, hi = jd;
          let flo = moonPosition(fromJulianSafe(lo)).phase;
          for (let it = 0; it < 20; it++) {
            const mid = (lo + hi) / 2;
            const fm = moonPosition(fromJulianSafe(mid)).phase;
            if (target <= 0.03) {
              /* New moon: need the phase closest to 0 */
              if (fm < 0.5) {
                /* New moon is the minimum. We bisect toward
                   the closer side. */
              }
            }
            if (Math.abs(fm - target) < Math.abs(flo - target)) {
              hi = mid;
            } else {
              lo = mid; flo = fm;
            }
          }
          return fromJulianSafe((lo + hi) / 2);
        }

        prevJd = jd;
        prevPhase = p;
      }
      return null;
    }

    function fromJulianSafe(jd) {
      return new Date((jd - 2440587.5) * 86400000);
    }

    return { getMoonPosition, _moonPosition: moonPosition, moonTimes, nextPhase,
             fromJulianSafe };
  })();

  /* ═══════════════════════════════════════════════════════════
     Caches
     ═══════════════════════════════════════════════════════════ */
  function makeLRU(max) {
    const map = new Map();
    return {
      get(k) {
        if (!map.has(k)) return undefined;
        const v = map.get(k);
        map.delete(k);
        map.set(k, v);
        return v;
      },
      set(k, v) {
        if (map.has(k)) map.delete(k);
        map.set(k, v);
        if (map.size > max) map.delete(map.keys().next().value);
      },
      has(k) { return map.has(k); },
      clear() { map.clear(); },
      get size() { return map.size; }
    };
  }

  const _geomCache    = makeLRU(256);
  const _timesCache   = makeLRU(128);
  const _altAzCache   = makeLRU(512);
  const _sunTimesCache= makeLRU(128);
  const _fullCache    = makeLRU(128);
  const _moonCache    = makeLRU(128);
  const _moonTimesCache = makeLRU(128);
  const _moonFullCache  = makeLRU(128);

  const _prewarmMemo  = makeLRU(32);

  function geomCached(jd) {
    const key = Math.floor(jd * 1440);
    let v = _geomCache.get(key);
    if (v === undefined) {
      v = core.solarGeometry(key / 1440);
      _geomCache.set(key, v);
    }
    return v;
  }
  function altAzCached(ra, dec, lst, lat, lon) {
    const key = ra.toFixed(5) + '|' + dec.toFixed(5) + '|' + lst.toFixed(5) + '|' +
                lat.toFixed(3) + '|' + lon.toFixed(3);
    let v = _altAzCache.get(key);
    if (v === undefined) {
      v = core.altAz(ra, dec, lst, lat, lon);
      _altAzCache.set(key, v);
    }
    return v;
  }

  function localDateKey(lat, lon, date) {
    const localOffsetHours = lon / 15;
    const localMs = date.getTime() + localOffsetHours * 3600000;
    const localDate = new Date(localMs);
    return localDate.toISOString().slice(0, 10);
  }

  function localNoon(lon, date) {
    const localOffsetHours = lon / 15;
    const localMs = date.getTime() + localOffsetHours * 3600000;
    const localDate = new Date(localMs);
    const noonUTC = new Date(Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      12, 0, 0
    ));
    return new Date(noonUTC.getTime() - localOffsetHours * 3600000);
  }

  function sunTimesCached(lat, lon, date) {
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' + localDateKey(lat, lon, date);
    let v = _timesCache.get(key);
    if (v === undefined) {
      v = core.sunriseSunset(lat, lon, localNoon(lon, date));
      _timesCache.set(key, v);
    }
    return v;
  }

  function twilightCached(lat, lon, date, alt) {
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' +
                localDateKey(lat, lon, date) + '|' + alt;
    let v = _sunTimesCache.get(key);
    if (v === undefined) {
      v = core.crossingTimes(lat, lon, localNoon(lon, date), alt);
      _sunTimesCache.set(key, v);
    }
    return v;
  }

  function moonCached(lat, lon, date) {
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' +
                Math.floor(date.getTime() / 60000);
    let v = _moonCache.get(key);
    if (v === undefined) {
      v = moon.getMoonPosition(lat, lon, date);
      _moonCache.set(key, v);
    }
    return v;
  }

  function moonTimesCached(lat, lon, date) {
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' + localDateKey(lat, lon, date);
    let v = _moonTimesCache.get(key);
    if (v === undefined) {
      v = moon.moonTimes(lat, lon, date);
      _moonTimesCache.set(key, v);
    }
    return v;
  }

  function moonFullCached(lat, lon, date) {
    const key = lat.toFixed(2) + '|' + lon.toFixed(2) + '|' + localDateKey(lat, lon, date);
    let v = _moonFullCache.get(key);
    if (v === undefined) {
      const pos = moonCached(lat, lon, date);
      const times = moonTimesCached(lat, lon, date);

      let nextFull = null, nextNew = null;
      try { nextFull = moon.nextPhase(lat, lon, date, 1.0); } catch (_) {}
      try { nextNew  = moon.nextPhase(lat, lon, date, 0.0); } catch (_) {}

      const statusOf = (t, alwaysUp, alwaysDown) => {
        if (t) return 'ok';
        if (alwaysUp) return 'above';
        if (alwaysDown) return 'below';
        return 'absent';
      };

      v = Object.freeze({
        rise: times.rise,
        set: times.set,
        riseISO: times.rise ? times.rise.toISOString() : null,
        setISO:  times.set  ? times.set.toISOString()  : null,
        riseStatus: statusOf(times.rise, times.alwaysUp, times.alwaysDown),
        setStatus:  statusOf(times.set,  times.alwaysUp, times.alwaysDown),
        alwaysUp:   times.alwaysUp,
        alwaysDown: times.alwaysDown,
        phase: pos.phase,
        phaseName: pos.phaseName,
        illumination: pos.illumination,
        elevation: pos.elevation,
        azimuth: pos.azimuth,
        nextFull,
        nextNew,
        nextFullISO: nextFull ? nextFull.toISOString() : null,
        nextNewISO:  nextNew  ? nextNew.toISOString()  : null,
        _schema: SCHEMA
      });
      _moonFullCache.set(key, v);
    }
    return v;
  }

  function _pickBracketingDay(lat, lon, d, day) {
    const nowMs = d.getTime();
    const hasPair = (x) => x && x.sunrise && x.sunset;

    if (hasPair(day)) {
      const s = day.sunrise.getTime();
      const e = day.sunset.getTime();
      if (nowMs >= s && nowMs < e) {
        return { day, isDay: true };
      }
      if (nowMs >= e) {
        const tomorrow = sunTimesCached(lat, lon, new Date(d.getTime() + 86400000));
        if (hasPair(tomorrow) && tomorrow.sunrise.getTime() > nowMs) {
          return { day, tomorrow, isDay: false };
        }
        if (hasPair(tomorrow)) {
          return { day: tomorrow, isDay: nowMs < tomorrow.sunset.getTime() };
        }
        return { day, isDay: false };
      }
      const yesterday = sunTimesCached(lat, lon, new Date(d.getTime() - 86400000));
      if (hasPair(yesterday)) {
        return { day, yesterday, isDay: false };
      }
      return { day, isDay: false };
    }

    const tomorrow = sunTimesCached(lat, lon, new Date(d.getTime() + 86400000));
    if (hasPair(tomorrow) && nowMs < tomorrow.sunset.getTime()) {
      return { day: tomorrow, isDay: nowMs >= tomorrow.sunrise.getTime() };
    }
    const yesterday = sunTimesCached(lat, lon, new Date(d.getTime() - 86400000));
    if (hasPair(yesterday) && nowMs < yesterday.sunset.getTime()) {
      return { day: yesterday, isDay: nowMs >= yesterday.sunrise.getTime() };
    }
    return { day, isDay: false };
  }

  function computeFractions(lat, lon, d, day) {
    const nowMs = d.getTime();

    if (day.polarDay) {
      return { isDay: true, dayFraction: 0.5, nightFraction: 0, arcFraction: 0.5 };
    }
    if (day.polarNight) {
      return { isDay: false, dayFraction: 0, nightFraction: 0.5, arcFraction: 0.5 };
    }
    if (!day.sunrise || !day.sunset) {
      const jd = core.toJulian(d);
      const g = geomCached(jd);
      const p = altAzCached(g.ra, g.dec, g.lst, lat, lon);
      const isDayFallback = p.elevation > HORIZON.SUNRISE;
      return {
        isDay: isDayFallback,
        dayFraction: isDayFallback ? 0.5 : 0,
        nightFraction: isDayFallback ? 0 : 0.5,
        arcFraction: 0.5
      };
    }

    const pick = _pickBracketingDay(lat, lon, d, day);
    const dayForFrac = pick.day;
    const isDay = pick.isDay;

    let dayFraction = 0;
    let nightFraction = 0;

    if (isDay) {
      const total = dayForFrac.sunset.getTime() - dayForFrac.sunrise.getTime();
      if (total > 0) {
        dayFraction = (nowMs - dayForFrac.sunrise.getTime()) / total;
      }
      if (dayFraction < 0) dayFraction = 0;
      if (dayFraction > 1) dayFraction = 1;
    } else {
      const start = pick.day.sunset.getTime();
      const sunriseSource = pick.tomorrow || sunTimesCached(lat, lon, new Date(d.getTime() + 86400000));
      const end = sunriseSource && sunriseSource.sunrise
        ? sunriseSource.sunrise.getTime()
        : start + 12 * 3600000;
      if (end > start) {
        nightFraction = (nowMs - start) / (end - start);
      }
      if (nightFraction < 0) nightFraction = 0;
      if (nightFraction > 1) nightFraction = 1;
    }

    const arcFraction = isDay ? dayFraction : nightFraction;
    return {
      isDay,
      dayFraction,
      nightFraction,
      arcFraction: Math.max(0, Math.min(1, arcFraction))
    };
  }

  function classifySky(sunElev, times) {
    if (times && times.polarDay)   return 'day';
    if (times && times.polarNight) return 'astronomical';
    const e = sunElev;

    if (e >=  HORIZON.GOLDEN_UPPER) return 'day';
    if (e >=  HORIZON.GOLDEN_LOWER) return 'golden';
    if (e >=  HORIZON.BLUE_LOWER)   return 'blue';
    if (e >=  HORIZON.CIVIL)        return 'civil';
    if (e >=  HORIZON.NAUTICAL)     return 'nautical';
    return 'astronomical';
  }

  /* ═══════════════════════════════════════════════════════════
     Public entry points
     ═══════════════════════════════════════════════════════════ */

  function getPosition(lat, lon, date) {
    validate(lat, lon);
    const d = toDate(date);
    const jd = core.toJulian(d);
    const g = geomCached(jd);
    const p = altAzCached(g.ra, g.dec, g.lst, lat, lon);
    const day = sunTimesCached(lat, lon, d);
    const frac = computeFractions(lat, lon, d, day);

    return Object.freeze({
      elevation: p.elevation,
      apparentElevation: p.elevation + core.refraction(p.elevation),
      azimuth: p.azimuth,
      isDay: frac.isDay,
      dayFraction: frac.dayFraction,
      nightFraction: frac.nightFraction,
      arcFraction: frac.arcFraction,
      sunrise: day.sunrise,
      sunset: day.sunset,
      sunriseISO: day.sunrise ? day.sunrise.toISOString() : null,
      sunsetISO:  day.sunset  ? day.sunset.toISOString()  : null,
      polarDay: !!day.polarDay,
      polarNight: !!day.polarNight,
      _schema: SCHEMA
    });
  }

  function shiftForRefTz(date, refTz) {
    if (!refTz) return date;
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: refTz,
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
      const parts = fmt.format(date).split('-');
      return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0));
    } catch (_) {
      return date;
    }
  }

  function getTimes(lat, lon, date, opts) {
    validate(lat, lon);
    const d = toDate(date);
    const opts2 = opts || {};
    const refTz = opts2.refTz || null;
    const baseDate = shiftForRefTz(d, refTz);

    const day = sunTimesCached(lat, lon, baseDate);

    const goldenAM = twilightCached(lat, lon, baseDate, HORIZON.GOLDEN_UPPER);
    const blueAM   = twilightCached(lat, lon, baseDate, HORIZON.BLUE_LOWER);
    const civil    = twilightCached(lat, lon, baseDate, HORIZON.CIVIL);
    const nautical = twilightCached(lat, lon, baseDate, HORIZON.NAUTICAL);
    const astro    = twilightCached(lat, lon, baseDate, HORIZON.ASTRONOMICAL);

    let dayLengthHours = null;
    let dayLengthDeltaHours = null;

    if (day.polarDay) {
      dayLengthHours = 24;
      dayLengthDeltaHours = 0;
    } else if (day.polarNight) {
      dayLengthHours = 0;
      dayLengthDeltaHours = 0;
    } else if (day.sunrise && day.sunset) {
      dayLengthHours = (day.sunset.getTime() - day.sunrise.getTime()) / 3600000;
      const prev = sunTimesCached(lat, lon, new Date(baseDate.getTime() - 86400000));
      if (prev.sunrise && prev.sunset) {
        const prevLen = (prev.sunset.getTime() - prev.sunrise.getTime()) / 3600000;
        dayLengthDeltaHours = dayLengthHours - prevLen;
      } else if (prev.polarDay) {
        dayLengthDeltaHours = dayLengthHours - 24;
      } else if (prev.polarNight) {
        dayLengthDeltaHours = dayLengthHours - 0;
      }
    }

    let solarNoonElevationDeg = null;
    try {
      if (day.solarNoon) {
        const jdNoon = core.toJulian(day.solarNoon);
        const gNoon  = geomCached(jdNoon);
        const pNoon  = altAzCached(gNoon.ra, gNoon.dec, gNoon.lst, lat, lon);
        solarNoonElevationDeg = pNoon.elevation;
      }
    } catch (_) {}

    function statusOf(c) {
      if (c.rise && c.set) return 'ok';
      if (c.always === 'above') return 'above';
      if (c.always === 'below') return 'below';
      return 'absent';
    }

    return Object.freeze({
      sunrise:    day.sunrise,
      sunset:     day.sunset,
      sunriseISO: day.sunrise ? day.sunrise.toISOString() : null,
      sunsetISO:  day.sunset  ? day.sunset.toISOString()  : null,
      sunriseStatus: day.polarDay ? 'above' : (day.polarNight ? 'below' : (day.sunrise ? 'ok' : 'absent')),
      sunsetStatus:  day.polarDay ? 'above' : (day.polarNight ? 'below' : (day.sunset  ? 'ok' : 'absent')),

      solarNoon:  day.solarNoon,
      solarNoonISO: day.solarNoon ? day.solarNoon.toISOString() : null,
      solarNoonElevationDeg,

      polarDay:   !!day.polarDay,
      polarNight: !!day.polarNight,

      goldenHourAM: goldenAM.rise,
      goldenHourPM: goldenAM.set,
      goldenHourStatus: statusOf(goldenAM),
      blueHourAM:   blueAM.rise,
      blueHourPM:   blueAM.set,
      blueHourStatus: statusOf(blueAM),

      civilDawn:    civil.rise,
      civilDusk:    civil.set,
      civilStatus:  statusOf(civil),

      nauticalDawn: nautical.rise,
      nauticalDusk: nautical.set,
      nauticalStatus: statusOf(nautical),

      astronomicalDawn: astro.rise,
      astronomicalDusk: astro.set,
      astronomicalStatus: statusOf(astro),

      dayLengthHours,
      dayLengthDeltaHours,
      _schema: SCHEMA
    });
  }

  function getFull(lat, lon, date, opts) {
    validate(lat, lon);
    const d = toDate(date);
    const opts2 = opts || {};
    const refTz = opts2.refTz || null;
    const baseDate = shiftForRefTz(d, refTz);

    const cacheKey = lat.toFixed(3) + '|' + lon.toFixed(3) + '|' +
                     Math.floor(d.getTime() / 60000) + '|' + (refTz || '');
    const cached = _fullCache.get(cacheKey);
    if (cached) return cached;

    const jd = core.toJulian(d);
    const g = geomCached(jd);
    const p = altAzCached(g.ra, g.dec, g.lst, lat, lon);

    const times = getTimes(lat, lon, baseDate, opts);
    const frac  = computeFractions(lat, lon, d, {
      sunrise: times.sunrise,
      sunset: times.sunset,
      polarDay: times.polarDay,
      polarNight: times.polarNight
    });

    const phase = classifySky(p.elevation, times);

    const result = Object.freeze({
      elevation: p.elevation,
      apparentElevation: p.elevation + core.refraction(p.elevation),
      azimuth: p.azimuth,
      isDay: frac.isDay,
      sunrise: times.sunrise,
      sunset: times.sunset,
      sunriseISO: times.sunriseISO,
      sunsetISO: times.sunsetISO,
      sunriseStatus: times.sunriseStatus,
      sunsetStatus: times.sunsetStatus,
      dayFraction: frac.dayFraction,
      nightFraction: frac.nightFraction,
      arcFraction: frac.arcFraction,
      skyPhase: phase,

      solarNoon: times.solarNoon,
      solarNoonISO: times.solarNoonISO,
      solarNoonElevationDeg: times.solarNoonElevationDeg,
      polarDay: times.polarDay,
      polarNight: times.polarNight,
      dayLengthHours: times.dayLengthHours,
      dayLengthDeltaHours: times.dayLengthDeltaHours,

      goldenHourAM: times.goldenHourAM,
      goldenHourPM: times.goldenHourPM,
      goldenHourStatus: times.goldenHourStatus,
      blueHourAM: times.blueHourAM,
      blueHourPM: times.blueHourPM,
      blueHourStatus: times.blueHourStatus,
      civilDawn: times.civilDawn,
      civilDusk: times.civilDusk,
      civilStatus: times.civilStatus,
      nauticalDawn: times.nauticalDawn,
      nauticalDusk: times.nauticalDusk,
      nauticalStatus: times.nauticalStatus,
      astronomicalDawn: times.astronomicalDawn,
      astronomicalDusk: times.astronomicalDusk,
      astronomicalStatus: times.astronomicalStatus,

      _schema: SCHEMA
    });
    _fullCache.set(cacheKey, result);
    return result;
  }

  function isDay(lat, lon, date) {
    try {
      validate(lat, lon);
      const d = toDate(date);
      const day = sunTimesCached(lat, lon, d);
      if (day.polarDay)   return true;
      if (day.polarNight) return false;
      if (!day.sunrise || !day.sunset) {
        const jd = core.toJulian(d);
        const g = geomCached(jd);
        const p = core.altAz(g.ra, g.dec, g.lst, lat, lon);
        return p.elevation > HORIZON.SUNRISE;
      }
      const nowMs = d.getTime();
      return nowMs >= day.sunrise.getTime() && nowMs < day.sunset.getTime();
    } catch (_) {
      return true;
    }
  }

  function getSkyState(lat, lon, date) {
    validate(lat, lon);
    const d = toDate(date);

    const full = getFull(lat, lon, d);
    const moonP = moonCached(lat, lon, d);
    const moonFull = moonFullCached(lat, lon, d);

    const orbMode = full.isDay ? 'sun' : 'moon';
    const orbFraction = full.isDay ? full.dayFraction : full.nightFraction;

    let starOpacity = 0;
    const sunElev = full.elevation;
    if (sunElev <= HORIZON.CIVIL) {
      starOpacity = Math.min(1, (HORIZON.CIVIL - sunElev) / 12);
    }
    if (full.polarNight) starOpacity = 1;
    if (full.polarDay)   starOpacity = 0;

    /* Moon visibility: real 3D angular separation from the
       sun, using the equatorial coordinates we already have. */
    const moonAboveHorizon = moonP.elevation > -1;
    const moonIlluminated  = moonP.illumination > 0.02;

    const moonSepFromSun = (function () {
      try {
        const jd = core.toJulian(d);
        const g  = core.solarGeometry(jd);
        const m  = moon._moonPosition(d);
        const sx = Math.cos(g.dec) * Math.cos(g.ra);
        const sy = Math.sin(g.dec);
        const sz = Math.cos(g.dec) * Math.sin(g.ra);
        const mx = Math.cos(m.dec) * Math.cos(m.ra);
        const my = Math.sin(m.dec);
        const mz = Math.cos(m.dec) * Math.sin(m.ra);
        const dot = Math.max(-1, Math.min(1, sx * mx + sy * my + sz * mz));
        return Math.acos(dot) * RAD;
      } catch (_) {
        return 180;
      }
    })();

    const moonInGlare = moonSepFromSun < 2;
    const moonVisible = moonAboveHorizon &&
                        moonIlluminated &&
                        !moonInGlare;

    /* peakNorm: how high the sun gets at solar noon, as a
       fraction of 60°. Used by the orb for its parabola. */
    let peakNorm = 0.5;
    try {
      const noonElev = Number(full.solarNoonElevationDeg);
      if (Number.isFinite(noonElev)) {
        peakNorm = Math.max(0, Math.min(1, noonElev / 60));
      } else if (full.polarDay) {
        peakNorm = 1;
      } else if (full.polarNight) {
        peakNorm = 0;
      }
    } catch (_) {}

    return Object.freeze({
      phase: full.skyPhase,
      isDay: full.isDay,
      isNight: !full.isDay,

      sun: Object.freeze({
        elevation: full.elevation,
        apparentElevation: full.apparentElevation,
        azimuth: full.azimuth,
        arcFraction: full.arcFraction,
        dayFraction: full.dayFraction,
        nightFraction: full.nightFraction,
        sunrise: full.sunrise,
        sunset: full.sunset,
        polarDay: full.polarDay,
        polarNight: full.polarNight,
        solarNoonElevationDeg: full.solarNoonElevationDeg,
        peakNorm: peakNorm
      }),

      moon: Object.freeze({
        elevation: moonP.elevation,
        apparentElevation: moonP.apparentElevation,
        azimuth: moonP.azimuth,
        phase: moonP.phase,
        phaseName: moonP.phaseName,
        phaseLabel: moonP.phaseName,
        illumination: moonP.illumination,
        visible: moonVisible,
        angularSepFromSun: moonSepFromSun,
        aboveHorizon: moonAboveHorizon,
        inGlare: moonInGlare,

        rise: moonFull.rise,
        set:  moonFull.set,
        riseISO: moonFull.riseISO,
        setISO:  moonFull.setISO,
        riseStatus: moonFull.riseStatus,
        setStatus:  moonFull.setStatus,
        alwaysUp:   moonFull.alwaysUp,
        alwaysDown: moonFull.alwaysDown,
        nextFull:   moonFull.nextFull,
        nextNew:    moonFull.nextNew,
        nextFullISO: moonFull.nextFullISO,
        nextNewISO:  moonFull.nextNewISO
      }),

      stars: Object.freeze({ opacity: starOpacity }),

      orb: Object.freeze({
        mode: orbMode,
        arcFraction: Math.max(0, Math.min(1, orbFraction))
      }),

      _schema: SCHEMA
    });
  }

  function snapshot(lat, lon, date) {
    validate(lat, lon);
    const d = toDate(date);
    const sky = getSkyState(lat, lon, d);
    return Object.freeze({
      _version: VERSION,
      _schema: SCHEMA,
      _at: d.toISOString(),
      lat, lon,
      sky
    });
  }

  function _prewarmKey(lat, lon, date) {
    return lat.toFixed(3) + '|' + lon.toFixed(3) + '|' + localDateKey(lat, lon, date);
  }

  function prewarm(lat, lon, date) {
    try {
      validate(lat, lon);
      const d = toDate(date || Date.now());
      const key = _prewarmKey(lat, lon, d);
      if (_prewarmMemo.has(key)) return;

      const jd = core.toJulian(d);
      const g = geomCached(jd);
      altAzCached(g.ra, g.dec, g.lst, lat, lon);
      sunTimesCached(lat, lon, d);
      sunTimesCached(lat, lon, new Date(d.getTime() - 86400000));
      sunTimesCached(lat, lon, new Date(d.getTime() + 86400000));
      twilightCached(lat, lon, d, HORIZON.GOLDEN_UPPER);
      twilightCached(lat, lon, d, HORIZON.BLUE_LOWER);
      twilightCached(lat, lon, d, HORIZON.CIVIL);
      twilightCached(lat, lon, d, HORIZON.NAUTICAL);
      twilightCached(lat, lon, d, HORIZON.ASTRONOMICAL);
      moonCached(lat, lon, d);
      moonTimesCached(lat, lon, d);
      moonFullCached(lat, lon, d);
      getFull(lat, lon, d);
      getSkyState(lat, lon, d);

      _prewarmMemo.set(key, 1);
    } catch (e) {
      /* Prewarm is best-effort. */
    }
  }

  function prewarmIfStale(lat, lon, date) {
    const result = {
      warmed: false,
      wasFresh: false,
      key: '',
      dateKey: '',
      elapsedMs: 0
    };
    try {
      validate(lat, lon);
      const d = toDate(date || Date.now());
      const key = _prewarmKey(lat, lon, d);
      result.key = key;
      result.dateKey = localDateKey(lat, lon, d);

      if (_prewarmMemo.has(key)) {
        result.wasFresh = true;
        return result;
      }

      const t0 = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      prewarm(lat, lon, d);
      const t1 = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      result.warmed = true;
      result.elapsedMs = Math.max(0, t1 - t0);
      return result;
    } catch (_) {
      return result;
    }
  }

  function prewarmIfStaleBool(lat, lon, date) {
    return prewarmIfStale(lat, lon, date).warmed;
  }

  function workerEntry(payload) {
    const p = payload || {};
    try {
      const date = p.t ? new Date(p.t) : new Date();
      switch (p.op) {
        case 'position': return { ok: true, result: dateSafe(getPosition(p.lat, p.lon, date)) };
        case 'times':    return { ok: true, result: dateSafe(getTimes(p.lat, p.lon, date)) };
        case 'full':     return { ok: true, result: dateSafe(getFull(p.lat, p.lon, date)) };
        case 'moon':     return { ok: true, result: moon.getMoonPosition(p.lat, p.lon, date) };
        case 'moonFull': return { ok: true, result: dateSafe(getMoonFull(p.lat, p.lon, date)) };
        case 'sky':      return { ok: true, result: dateSafe(getSkyState(p.lat, p.lon, date)) };
        case 'snapshot': return { ok: true, result: dateSafe(snapshot(p.lat, p.lon, date)) };
        default:         return { ok: false, error: 'unknown op: ' + p.op };
      }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  function dateSafe(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[k] = (v instanceof Date) ? v.toISOString() : dateSafe(v);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════
     Golden-master tests
     ═══════════════════════════════════════════════════════════ */
  const tests = {
    version: VERSION,
    cases: [
      { name: 'Meru 2024-06-21T09:00Z', lat: -0.04626, lon: 37.65587,
        t: '2024-06-21T09:00:00Z', isDay: true, phase: 'day' },
      { name: 'Nairobi 2024-06-21T12:00Z', lat: -1.286, lon: 36.817,
        t: '2024-06-21T12:00:00Z', elevation: 46.6, isDay: true, phase: 'day' },
      { name: 'London 2024-12-21T12:00Z', lat: 51.507, lon: -0.128,
        t: '2024-12-21T12:00:00Z', elevation: 15.0, isDay: true },
      { name: 'NewYork 2024-03-20T03:00Z', lat: 40.713, lon: -74.006,
        t: '2024-03-20T03:00:00Z', isDay: false,
        phaseIn: ['astronomical','nautical','civil','blue'] },
      { name: 'Svalbard summer (polar day)', lat: 78.22, lon: 15.63,
        t: '2024-06-21T00:00:00Z', polarDay: true, isDay: true },
      { name: 'Svalbard winter (polar night)', lat: 78.22, lon: 15.63,
        t: '2024-12-21T00:00:00Z', polarNight: true, isDay: false },
      { name: 'Tokyo 2024-06-21T03:00Z', lat: 35.69, lon: 139.69,
        t: '2024-06-21T03:00:00Z', isDay: true }
    ],
    run(toleranceDeg) {
      const tol = Number.isFinite(toleranceDeg) ? toleranceDeg : 1.5;
      const failures = [];
      for (const c of this.cases) {
        try {
          const s = getSkyState(c.lat, c.lon, new Date(c.t));
          if (c.elevation != null && Math.abs(s.sun.elevation - c.elevation) > tol) {
            failures.push(c.name + ': elevation ' + s.sun.elevation.toFixed(2) + ' !≈ ' + c.elevation);
          }
          if (c.isDay != null && s.isDay !== c.isDay) {
            failures.push(c.name + ': isDay ' + s.isDay + ' !== ' + c.isDay);
          }
          if (c.polarDay != null && s.sun.polarDay !== c.polarDay) {
            failures.push(c.name + ': polarDay ' + s.sun.polarDay + ' !== ' + c.polarDay);
          }
          if (c.polarNight != null && s.sun.polarNight !== c.polarNight) {
            failures.push(c.name + ': polarNight ' + s.sun.polarNight + ' !== ' + c.polarNight);
          }
          if (c.phase != null && s.phase !== c.phase) {
            failures.push(c.name + ': phase ' + s.phase + ' !== ' + c.phase);
          }
          if (c.phaseIn && c.phaseIn.indexOf(s.phase) === -1) {
            failures.push(c.name + ': phase ' + s.phase + ' not in [' + c.phaseIn.join(',') + ']');
          }
          /* New schema checks — must not throw */
          if (typeof s.sun.peakNorm !== 'number') {
            failures.push(c.name + ': sun.peakNorm missing');
          }
          if (typeof s.moon.riseStatus !== 'string') {
            failures.push(c.name + ': moon.riseStatus missing');
          }
          if (typeof s.moon.nextFullISO !== 'object' && typeof s.moon.nextFullISO !== 'string' && s.moon.nextFullISO !== null) {
            failures.push(c.name + ': moon.nextFullISO wrong type');
          }
        } catch (e) {
          failures.push(c.name + ': threw ' + e.message);
        }
      }
      return failures;
    }
  };

  /* ═══════════════════════════════════════════════════════════
     Facade
     ═══════════════════════════════════════════════════════════ */
  const Solar = {
    version: VERSION,
    schema:  SCHEMA,

    getPosition,
    getTimes,
    getFull,
    getMoonPosition: moon.getMoonPosition,

    getMoonTimes: function (lat, lon, date) {
      validate(lat, lon);
      const d = toDate(date);
      return moonTimesCached(lat, lon, d);
    },
    getMoonFull: function (lat, lon, date) {
      validate(lat, lon);
      const d = toDate(date);
      return moonFullCached(lat, lon, d);
    },

    getTwilights: function (lat, lon, date) {
      const d = toDate(date);
      return {
        goldenAM:   twilightCached(lat, lon, d, HORIZON.GOLDEN_UPPER).rise,
        goldenPM:   twilightCached(lat, lon, d, HORIZON.GOLDEN_UPPER).set,
        blueAM:     twilightCached(lat, lon, d, HORIZON.BLUE_LOWER).rise,
        bluePM:     twilightCached(lat, lon, d, HORIZON.BLUE_LOWER).set,
        civilDawn:  twilightCached(lat, lon, d, HORIZON.CIVIL).rise,
        civilDusk:  twilightCached(lat, lon, d, HORIZON.CIVIL).set,
        nauticalDawn: twilightCached(lat, lon, d, HORIZON.NAUTICAL).rise,
        nauticalDusk: twilightCached(lat, lon, d, HORIZON.NAUTICAL).set,
        astronomicalDawn: twilightCached(lat, lon, d, HORIZON.ASTRONOMICAL).rise,
        astronomicalDusk: twilightCached(lat, lon, d, HORIZON.ASTRONOMICAL).set,
        _schema: SCHEMA
      };
    },
    isDay,
    getSkyState,

    snapshot,
    prewarm,
    prewarmIfStale,
    prewarmIfStaleBool,
    workerEntry,
    setDut1,
    setTTMinusUTC,
    horizon: HORIZON,

    clearCaches: function () {
      _geomCache.clear();
      _timesCache.clear();
      _altAzCache.clear();
      _sunTimesCache.clear();
      _fullCache.clear();
      _moonCache.clear();
      _moonTimesCache.clear();
      _moonFullCache.clear();
      _prewarmMemo.clear();
    },
    cacheStats: function () {
      return {
        geom: _geomCache.size,
        times: _timesCache.size,
        altAz: _altAzCache.size,
        twilight: _sunTimesCache.size,
        full: _fullCache.size,
        moon: _moonCache.size,
        moonTimes: _moonTimesCache.size,
        moonFull: _moonFullCache.size,
        prewarmMemo: _prewarmMemo.size
      };
    },

    debug: {
      tests,
      core,
      moon,
      caches: { _geomCache, _timesCache, _altAzCache, _sunTimesCache, _fullCache, _moonCache, _moonTimesCache, _moonFullCache, _prewarmMemo },
      refraction: core.refraction,
      classifySky,
      computeFractions,
      localDateKey,
      prewarmKey: _prewarmKey,
      prewarmIfStale,
      prewarmIfStaleBool,
      moonTimes: (lat, lon, date) => moonTimesCached(lat, lon, toDate(date)),
      moonFull: (lat, lon, date) => moonFullCached(lat, lon, toDate(date)),
      lruStats: () => ({
        geom: _geomCache.size,
        times: _timesCache.size,
        altAz: _altAzCache.size,
        twilight: _sunTimesCache.size,
        full: _fullCache.size,
        moon: _moonCache.size,
        moonTimes: _moonTimesCache.size,
        moonFull: _moonFullCache.size,
        prewarmMemo: _prewarmMemo.size
      })
    }
  };

  Object.freeze(Solar);
  global.Solar = Solar;

})(typeof window !== 'undefined' ? window : globalThis);
