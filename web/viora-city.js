/* VIORA C2 — photo-led city atmosphere.
   The real skyline photograph supplies the scene; time-of-day grading stays subtle. */
(() => {
  'use strict';
  const root = document.getElementById('viora-city');
  if (!root) return;
  const timeLabel = root.querySelector('[data-city-time]');
  const weatherLabel = root.querySelector('[data-city-weather]');
  let latitude = -0.286, longitude = 36.817;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi';

  function solarElevation(date) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545;
    const L = ((280.46 + .9856474 * n) % 360 + 360) % 360;
    const g = ((357.528 + .9856003 * n) % 360 + 360) % 360 * Math.PI / 180;
    const lam = (L + 1.915 * Math.sin(g) + .020 * Math.sin(2 * g)) * Math.PI / 180;
    const ob = (23.439 - .0000004 * n) * Math.PI / 180;
    const dec = Math.asin(Math.sin(ob) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(ob) * Math.sin(lam), Math.cos(lam));
    const T = (jd - 2451545) / 36525;
    const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545) + .000387933 * T * T) * Math.PI / 180;
    const H = ((gmst + longitude * Math.PI / 180 - ra + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const p = latitude * Math.PI / 180;
    return Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H)) * 180 / Math.PI;
  }

  function updateSky() {
    const now = new Date();
    const elevation = solarElevation(now);
    root.dataset.phase = elevation < -5 ? 'night' : elevation < 5 ? 'sunset' : elevation > 18 ? 'day' : 'morning';
    if (timeLabel) {
      timeLabel.textContent = new Intl.DateTimeFormat('en-KE', {
        hour: '2-digit', minute: '2-digit', timeZone: timezone, timeZoneName: 'short'
      }).format(now);
    }
  }

  async function loadWeather(lat, lon) {
    try {
      const endpoint = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
        '&longitude=' + lon + '&current=temperature_2m,precipitation,weather_code&timezone=auto';
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Weather unavailable');
      const data = await response.json();
      const current = data.current;
      const code = current.weather_code;
      const condition = current.precipitation > 0 ? 'Rain' :
        code === 0 ? 'Clear' : code <= 3 ? 'Partly cloudy' :
        code <= 48 ? 'Fog' : code <= 67 ? 'Rain' :
        code <= 77 ? 'Snow' : 'Showers';
      if (weatherLabel) weatherLabel.textContent = Math.round(current.temperature_2m) + '°C · ' + condition;
    } catch (_) {
      if (weatherLabel) weatherLabel.textContent = 'Local conditions unavailable';
    }
  }

  updateSky();
  loadWeather(latitude, longitude);
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      updateSky();
      loadWeather(latitude, longitude);
    }, () => {}, { timeout: 5000, maximumAge: 900000 });
  }
  const timer = window.setInterval(updateSky, 60000);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
})();