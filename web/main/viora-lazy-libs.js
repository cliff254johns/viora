// /main/viora-lazy-libs.js
// Lazy loaders for heavy export libs. Each is downloaded on first use,
// then cached in-memory for the rest of the session.

let _XLSX = null;
let _jsPDF = null;
let _html2canvas = null;
let _inFlight = { xlsx: null, jspdf: null, h2c: null };

export async function getXLSX() {
  if (_XLSX) return _XLSX;
  if (_inFlight.xlsx) return _inFlight.xlsx;
  _inFlight.xlsx = (async () => {
    const m = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.full.min.js');
    _XLSX = window.XLSX || m.default || m;
    _inFlight.xlsx = null;
    return _XLSX;
  })();
  return _inFlight.xlsx;
}

export async function getJsPDF() {
  if (_jsPDF) return _jsPDF;
  if (_inFlight.jspdf) return _inFlight.jspdf;
  _inFlight.jspdf = (async () => {
    const m = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    _jsPDF = (m.jspdf && m.jspdf.jsPDF) || window.jspdf?.jsPDF || m.default;
    _inFlight.jspdf = null;
    return _jsPDF;
  })();
  return _inFlight.jspdf;
}

export async function getHtml2Canvas() {
  if (_html2canvas) return _html2canvas;
  if (_inFlight.h2c) return _inFlight.h2c;
  _inFlight.h2c = (async () => {
    const m = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    _html2canvas = window.html2canvas || m.default || m;
    _inFlight.h2c = null;
    return _html2canvas;
  })();
  return _inFlight.h2c;
}
