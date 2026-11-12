(function(){
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════════════════ */
const CONFIG = {
  WORKER_URL: 'https://viora-api.cliff254johns.workers.dev',
  CHAT_ENDPOINTS: ['/chat', '/ai/chat', '/groq/chat', '/ask', '/ai/ask'],
  TTS_ENDPOINT: '/tts',
  STT_ENDPOINT: '/stt',
  ANALYTICS_ENDPOINT: '/analytics',
  REQUEST_TIMEOUT_MS: 12000,
  CHAT_TOTAL_TIMEOUT_MS: 35000,
  MAX_HISTORY: 12,
  MAX_MESSAGE_LEN: 800,
  SESSION_STORAGE_KEY: 'viora_avatar_session',
  CHAT_STORAGE_KEY: 'viora_chat_history',
  PREF_KEY: 'viora_voice_prefs',
  A11Y_KEY: 'viora_a11y',
  LOGO_URL: 'https://viora.co.ke/viora.png',
  WAKE_WORD: 'hey viora',
  PROACTIVE_DELAY_MS: 30000,
  RATE_LIMIT: { minGapMs: 400, maxPerMin: 30 },

  // ── TTS defaults ──
  TTS_VOICE_DEFAULT: 'nova',
  TTS_VOICE_FALLBACK: 'sage',
  BROWSER_PITCH_DEFAULT: 1.05,
  BROWSER_RATE_DEFAULT: 0.98
};
const EXTERNAL_KB_URL = 'https://viora.co.ke/mainIndex/knowledge.md';
const EXTERNAL_KB_MAX_CHARS = 10000;
let EXTERNAL_KB = '';

async function loadExternalKB(){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    console.info('[VIORA] Loading external KB from', EXTERNAL_KB_URL);
    const r = await fetch(EXTERNAL_KB_URL, { cache: 'no-store', signal: controller.signal });
    if (!r.ok){
      console.warn('[VIORA] KB fetch failed:', r.status);
      return;
    }
    EXTERNAL_KB = (await r.text()).slice(0, EXTERNAL_KB_MAX_CHARS);
    console.info('[VIORA] External KB loaded:', EXTERNAL_KB.length, 'chars');
  } catch(e){
    console.warn('[VIORA] KB load skipped; local knowledge remains available:', e.message);
  } finally {
    clearTimeout(timer);
  }
}

const FEATURES = {
  streaming: false,
  bargeIn: true,
  vad: true,
  wakeWord: false,
  sentenceTTS: true,
  audioCache: true,
  emotion: true,
  captions: true,
  tools: true,
  grounding: true,
  analytics: true,
  proactiveGreeting: false,
  rateLimit: true
};

/* ═══════════════════════════════════════════════════════════════════════════
   SHORTCUTS
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const assistant   = $('viora-assistant');
const panel       = $('panel');
const bubble      = $('bubble');
const bubbleText  = $('bubbleText');
const chat        = $('chat');
const input       = $('userInput');
const inputHint   = $('inputHint');
const signBox     = $('signBox');
const signHands   = $('signHands');
const signCaption = $('signCaption');
const bigAvatar   = $('bigAvatar');
const statusPill  = $('statusPill');
const stopBtn     = $('stopBtn');
const captionsEl  = $('captions');
const captionText = $('captionText');
const mouthPath   = $('mouthPath');
const eyeL        = $('eyeL');
const eyeR        = $('eyeR');
const micBtn      = $('micBtn');
const micTime     = $('micTime');
const readBtn     = $('readBtn');
const sendBtn     = $('sendBtn');
const miniAvatar  = $('avatarButton');
const miniLogo    = $('miniLogo');
const bigLogo     = $('bigLogo');

function guardLogo(img){
  if (!img) return;
  img.addEventListener('error', ()=>{ img.style.display = 'none'; });
}

const state = {
  sessionId: (function(){
    try {
      let s = sessionStorage.getItem(CONFIG.SESSION_STORAGE_KEY);
      if (!s){ s = 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(CONFIG.SESSION_STORAGE_KEY, s); }
      return s;
    } catch(e){ return 'v-' + Date.now().toString(36); }
  })(),
  history: [],
  isBusy: false,
  requestId: 0,
  isSpeaking: false,
  isListening: false,
  isOpen: false,
  readAloud: false,
  micArmed: false,
  captions: false,
  verbose: false,
  vadEnabled: true,
  wakeEnabled: false,
  currentUtterance: null,
  currentAudio: null,
  currentSpeakId: 0,
  visemeTimers: [],
  lastRequestAt: 0,
  requestsInMinute: [],
  ttsCache: new Map(),
  mediaRecorder: null,
  audioChunks: [],
  sttStart: 0,
  recStart: 0,
  recTimer: null,
  metrics: { sttMs:0, llmMs:0, ttsMs:0, latencyMs:0, errorCode:null },
  visemeProvider: null,
  emotion: 'neutral',
  emotionTimer: null,
  lastUserMessage: '',
  signKey: 'hello',
  interimRecognizer: null,
  wakeRecognizer: null,
  levelMeterRAF: 0,
  levelMeterAC: null
};

/* ═══════════════════════════════════════════════════════════════════════════
   VISEME MAPPER
   ═══════════════════════════════════════════════════════════════════════════ */
const VISEME_SHAPES = {
  REST:{path:'M92 92 L128 92',w:5},
  MM:  {path:'M92 92 Q110 92 128 92',w:5},
  AA:  {path:'M96 86 Q110 108 124 86 Q110 96 96 86',w:6},
  EH:  {path:'M96 88 Q110 100 124 88',w:5},
  IH:  {path:'M98 90 Q110 98 122 90',w:4.5},
  OH:  {path:'M94 88 Q110 106 126 88 Q110 94 94 88',w:7},
  UW:  {path:'M100 90 Q110 100 120 90',w:6},
  FV:  {path:'M96 92 Q110 86 124 92',w:4},
  TH:  {path:'M96 90 Q110 96 124 90',w:4.5}
};

function charToViseme(ch){
  const c = ch.toLowerCase();
  if (/[aàáâ]/.test(c)) return 'AA';
  if (/[eèéê]/.test(c)) return 'EH';
  if (/[iìíîy]/.test(c)) return 'IH';
  if (/[oòóô]/.test(c)) return 'OH';
  if (/[uùúûw]/.test(c)) return 'UW';
  if (/[fv]/.test(c)) return 'FV';
  if (/[th]/.test(c)) return 'TH';
  if (/[mbp]/.test(c)) return 'MM';
  return null;
}
function textToVisemes(text, opts){
  const msPerViseme = (opts && opts.msPerViseme) || 70;
  const seq = [];
  // Strip emojis, markdown, bullet glyphs, and UI-button text.
  const clean = String(text||'')
    .replace(/⎘ Copy|🔊 Speak|↻ Retry/g,'')
    .replace(/[*_`~#>]+/g,'')
    .replace(/^[\s]*[•·–—▪§▶›]\s*/gm,'')
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu,'');

  for (let i=0;i<clean.length;i++){
    const ch = clean[i];
    const next = clean[i+1];

    // Sentence-final punctuation = real (short) pause, but only at word end.
    // This keeps "v1.2", "e.g.", "Mr." from pausing mid-word.
    if (/[.!?…]/.test(ch)){
      if (!next || /\s/.test(next)){
        seq.push({viseme:'REST', duration: msPerViseme * 1.2});
        continue;
      }
      // Mid-word period — treat as a normal character (skip it silently)
      continue;
    }

    // Comma / semicolon / colon = micro-pause only. Imperceptible.
    if (/[,;:]/.test(ch)){
      seq.push({viseme:'REST', duration: 30});
      continue;
    }

    // Whitespace: single space = NO frame at all. Paragraph = one beat.
    if (/\s/.test(ch)){
      if (/\n\s*\n/.test(clean.slice(i, i+4))){
        seq.push({viseme:'REST', duration: msPerViseme * 1.5});
      }
      continue;
    }

    // Normal letters only.
    const v = charToViseme(ch);
    if (v) seq.push({viseme:v, duration: msPerViseme * (0.8 + Math.random()*0.4)});
    // Anything else (rare symbols) is skipped — no REST spam.
  }
  return seq;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */
function prefersReducedMotion(){
  return document.body.classList.contains('va-reduced-motion') ||
         (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
const AvatarRenderer = (function(){
  function applyViseme(viseme){
    const shape = VISEME_SHAPES[viseme] || VISEME_SHAPES.REST;
    if (mouthPath){
      mouthPath.setAttribute('d', shape.path);
      mouthPath.setAttribute('stroke-width', shape.w);
    }
  }
  function setEmotion(emotion){
    if (!eyeL || !eyeR) return;
    const set = (el,rx,ry)=>{ el.setAttribute('rx',rx); el.setAttribute('ry',ry); };
    if (emotion==='happy'||emotion==='excited'){ set(eyeL,9,11); set(eyeR,9,11); }
    else if (emotion==='concerned'){ set(eyeL,8,13); set(eyeR,8,13); }
    else { set(eyeL,9,12); set(eyeR,9,12); }
    if(bigAvatar){
      ['happy','excited','concerned','neutral'].forEach(name=>bigAvatar.classList.remove('emotion-'+name));
      bigAvatar.classList.add('emotion-'+(emotion||'neutral'));
    }
  }
  function setSpeaking(on){
    if (!bigAvatar) return;
    bigAvatar.classList.toggle('speaking',!!on);
    bigAvatar.classList.toggle('idle',!on);
    if(on)bigAvatar.classList.remove('thinking');
  }
  function setThinking(on){ if (!bigAvatar) return; bigAvatar.classList.toggle('thinking',!!on); }
  function setExplaining(on){ if (!bigAvatar) return; bigAvatar.classList.toggle('explaining',!!on); }
  function trackGaze(event){
    if(!bigAvatar||!panel||!panel.classList.contains('open')||prefersReducedMotion())return;
    const rect=bigAvatar.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const x=Math.max(-2.5,Math.min(2.5,((event.clientX-(rect.left+rect.width/2))/rect.width)*7));
    const y=Math.max(-1.5,Math.min(1.5,((event.clientY-(rect.top+rect.height/2))/rect.height)*4));
    bigAvatar.querySelectorAll('.eye-pupil').forEach(pupil=>{
      pupil.style.setProperty('--gaze-x',x.toFixed(2)+'px');
      pupil.style.setProperty('--gaze-y',y.toFixed(2)+'px');
    });
  }
  function resetGaze(){
    if(!bigAvatar)return;
    bigAvatar.querySelectorAll('.eye-pupil').forEach(pupil=>{
      pupil.style.setProperty('--gaze-x','0px');
      pupil.style.setProperty('--gaze-y','0px');
    });
  }
  if(bigAvatar){
    bigAvatar.addEventListener('pointermove',trackGaze,{passive:true});
    bigAvatar.addEventListener('pointerleave',resetGaze,{passive:true});
  }
  function bounce(){
    if (!bigAvatar || prefersReducedMotion()) return;
    bigAvatar.classList.remove('bouncing');
    void bigAvatar.offsetWidth;
    bigAvatar.classList.add('bouncing');
    setTimeout(()=> bigAvatar.classList.remove('bouncing'), 650);
  }
  return { applyViseme, setEmotion, setSpeaking, setThinking, setExplaining, bounce };
})();

function playVisemes(seq){
  stopVisemes();
  let t = 0;
  seq.forEach(item=>{
    const timer = setTimeout(()=>{ AvatarRenderer.applyViseme(item.viseme); }, t);
    state.visemeTimers.push(timer);
    t += item.duration;
  });
  const doneTimer = setTimeout(()=>{ AvatarRenderer.applyViseme('REST'); }, t);
  state.visemeTimers.push(doneTimer);
  return t;
}
function stopVisemes(){
  state.visemeTimers.forEach(t=>clearTimeout(t));
  state.visemeTimers = [];
  AvatarRenderer.applyViseme('REST');
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOICE PREFERENCES
   ═══════════════════════════════════════════════════════════════════════════ */
const VoicePrefs = (function(){
  let prefs = {
    browserVoiceURI:'',
    serverVoice: CONFIG.TTS_VOICE_DEFAULT,
    pitch: CONFIG.BROWSER_PITCH_DEFAULT,
    rate:  CONFIG.BROWSER_RATE_DEFAULT
  };
  try {
    const saved = localStorage.getItem(CONFIG.PREF_KEY);
    if (saved) prefs = Object.assign(prefs, JSON.parse(saved));
  } catch(e){}
  function save(){ try{ localStorage.setItem(CONFIG.PREF_KEY, JSON.stringify(prefs)); }catch(e){} }
  function get(){ return prefs; }
  function set(patch){ Object.assign(prefs, patch); save(); }
  return { get, set, save };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   TTS
   ═══════════════════════════════════════════════════════════════════════════ */
const audioTextCache = new WeakMap();   // <audio> element → text it is speaking
function hashString(str){
  let h=5381;
  for (let i=0;i<str.length;i++) h = ((h<<5)+h) ^ str.charCodeAt(i);
  return (h>>>0).toString(36);
}
async function fetchTTS(text, opts){
  const prefs = VoicePrefs.get();
  const voice = (opts && opts.voice) || prefs.serverVoice || CONFIG.TTS_VOICE_DEFAULT;
  const key = 'tts:' + hashString(voice + '|' + text);
  if (FEATURES.audioCache && state.ttsCache.has(key)) return state.ttsCache.get(key);

  const body = { text };
  if (voice) body.voice = voice;

  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  const res = await fetch(CONFIG.WORKER_URL + CONFIG.TTS_ENDPOINT, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body),
    signal: controller.signal
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error('TTS HTTP ' + res.status);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (FEATURES.audioCache){
    // Evict oldest entries if we exceed a hard cap
    const HARD_CAP = 80;
    while (state.ttsCache.size >= HARD_CAP){
      const fk = state.ttsCache.keys().next().value;
      try{ URL.revokeObjectURL(state.ttsCache.get(fk)); }catch(e){}
      state.ttsCache.delete(fk);
    }
    state.ttsCache.set(key, url);
  }
  return url;
}
/* Strip everything the TTS engine shouldn't try to pronounce. */
function stripForTTS(text){
  let s = String(text);
  s = s.replace(/⎘ Copy|🔊 Speak|↻ Retry/g, '');
  s = s.replace(/[*_`~#>]+/g, '');
  s = s.replace(/^[\s]*[•·–—▪§▶›]\s*/gm, '');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '');
  s = s.replace(/([.!?])\1{1,}/g, '$1');
  s = s.replace(/[,;:]{2,}/g, ',');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/* Split into speakable chunks. Paragraph breaks only — never on periods.
   Merges very short fragments (list items) with their neighbours. */
function splitForTTS(text){
  const MAX_CHUNK = 280;
  const MIN_CHUNK = 60;
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  // Merge short fragments with the previous chunk
  const merged = [];
  for (const p of paragraphs){
    if (merged.length && (p.length < MIN_CHUNK || merged[merged.length-1].length < MIN_CHUNK)){
      merged[merged.length-1] = (merged[merged.length-1] + ' ' + p).trim();
    } else {
      merged.push(p);
    }
  }

  // Break really long chunks at sentence boundaries only
  const chunks = [];
  for (const p of merged){
    if (p.length <= MAX_CHUNK){ chunks.push(p); continue; }
    const sentences = p.match(/[^.!?]+[.!?]+["']?|\S+$/g) || [p];
    let buf = '';
    for (const s of sentences){
      if ((buf + ' ' + s).trim().length > MAX_CHUNK && buf){
        chunks.push(buf.trim());
        buf = s;
      } else {
        buf = (buf + ' ' + s).trim();
      }
    }
    if (buf) chunks.push(buf.trim());
  }
  return chunks;
}

/* Play a URL with visemes synced to the ACTUAL audio duration. */
function playAudioUrl(url, speakId, audioEl){
  return new Promise((resolve)=>{
    const audio = audioEl || new Audio(url);
    state.currentAudio = audio;
    let settled = false;
    const done = ()=>{
      if (settled) return;
      settled = true;
      if (state.currentAudio === audio) state.currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;

    audio.onplaying = ()=>{
      if (speakId !== state.currentSpeakId){ try{ audio.pause(); }catch(e){} return; }
      if (prefersReducedMotion()) return;
      const dur = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 0;
      const spokenText = audioTextCache.get(audio) || '';
      if (dur > 0 && spokenText){
        const seq = textToVisemes(spokenText, { msPerViseme: 70 });
        const seqTotal = seq.reduce((a,v)=> a + v.duration, 0);
        const scale = seqTotal > 0 ? (dur * 1000) / seqTotal : 1;
        playVisemes(seq.map(item => ({ viseme: item.viseme, duration: item.duration * scale })));
      } else {
        // Fallback: play visemes at natural speed
        playVisemes(textToVisemes(spokenText, { msPerViseme: 70 }));
      }
    };

    audio.play().catch(done);
  });
}

/* Start voice while the response is still streaming. Completed sentences are
   queued immediately using the browser voice, avoiding a server-TTS round trip
   after the full text has finished rendering. */
function createStreamingSpeechQueue(speakId){
  let seen=0;
  let pending='';
  let latestText='';
  let queue=Promise.resolve();
  let started=false;
  let cancelled=false;

  function activate(){
    if(started)return;
    started=true;
    state.isSpeaking=true;
    stopBtn.classList.add('show');
    AvatarRenderer.setSpeaking(true);
    AvatarRenderer.setExplaining(true);
    setStatus('Speaking…');
    armSpeakWatchdog(60000);
  }
  function enqueue(text){
    const clean=stripForTTS(String(text||'').trim());
    if(!clean)return;
    activate();
    queue=queue.then(()=>{
      if(cancelled||speakId!==state.currentSpeakId)return;
      armSpeakWatchdog(Math.max(8000,clean.length*180+5000));
      return browserSpeak(clean,speakId);
    });
  }
  function push(acc, final=false){
    if(cancelled)return;
    const value=String(acc||'');
    if(value.length>=seen){
      pending+=value.slice(seen);
      seen=value.length;
      latestText=value;
    }
    // Tool-call JSON is not spoken. finish() can still queue the human reply.
    if(latestText.trimStart().startsWith('{')){
      pending='';
      if(!final)return;
    }
    const chunks=[];
    let match;
    const sentence=/^([\s\S]*?[.!?](?:["')\]]?))\s+/;
    while((match=pending.match(sentence))){
      chunks.push(match[1]);
      pending=pending.slice(match[0].length);
    }
    if(!final&&pending.length>=110){
      let cut=pending.lastIndexOf(' ',110);
      if(cut<70)cut=110;
      chunks.push(pending.slice(0,cut));
      pending=pending.slice(cut).trimStart();
    }
    if(final&&pending.trim()){
      chunks.push(pending.trim());
      pending='';
    }
    chunks.forEach(enqueue);
  }
  return {
    id:speakId,
    push:(acc)=>push(acc,false),
    finish:async(finalText)=>{
      const finalValue=String(finalText||'');
      if(finalValue && finalValue!==latestText){
        // The model may have returned a tool envelope or post-processed reply.
        pending=finalValue;
        latestText=finalValue;
        seen=finalValue.length;
      }
      push(latestText,true);
      await queue;
    },
    cancel:()=>{
      cancelled=true;
      if(started&&speakId===state.currentSpeakId)stopSpeaking();
    }
  };
}

/* Speak a whole reply in as few TTS calls as possible. */
function getActiveLanguageCode(){
  let value='en';
  try { value=localStorage.getItem('viora_site_language') || document.documentElement.lang || 'en'; }
  catch(_) { value=document.documentElement.lang || 'en'; }
  return String(value).toLowerCase().split('-')[0] || 'en';
}
async function speakReply(fullText, speakId){
  if (!state.readAloud || !fullText.trim()) return;
  if (speakId !== state.currentSpeakId) return;
  const cleaned = stripForTTS(fullText);
  if (!cleaned) return;
  const chunks = splitForTTS(cleaned);
  for (const chunk of chunks){
    // Only the speakId matters — a stray isSpeaking flag must NOT abort TTS
    if (speakId !== state.currentSpeakId) return;
    await speakOneChunk(chunk, speakId);
  }
}

/* One TTS request per chunk, with server → fallback voice → browser chain. */
async function speakOneChunk(text, speakId){
  if (!text.trim()) return;
  const prefs = VoicePrefs.get();
  if (getActiveLanguageCode() !== 'en') return browserSpeak(text, speakId);
  try {
    const url = await fetchTTS(text);
    if (speakId !== state.currentSpeakId) return;
    const audio = new Audio(url);
    audioTextCache.set(audio, text);
    return await playAudioUrl(url, speakId, audio);
  } catch(e){
    if (prefs.serverVoice !== CONFIG.TTS_VOICE_FALLBACK && CONFIG.TTS_VOICE_FALLBACK){
      try {
        const url = await fetchTTS(text, { voice: CONFIG.TTS_VOICE_FALLBACK });
        if (speakId !== state.currentSpeakId) return;
        const audio = new Audio(url);
        audioTextCache.set(audio, text);
        return await playAudioUrl(url, speakId, audio);
      } catch(e2){ /* fall through to browser */ }
    }
    return browserSpeak(text, speakId);
  }
}
function browserSpeak(text, speakId){
  return new Promise((resolve)=>{
    if (!('speechSynthesis' in window)) return resolve();
    try { speechSynthesis.cancel(); } catch(e){}
    const prefs = VoicePrefs.get();
    const u = new SpeechSynthesisUtterance(text);
    const activeLang = getActiveLanguageCode();
    u.lang = activeLang === 'zh' ? 'zh-CN' : activeLang;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    const voices = speechSynthesis.getVoices();
    const preferred = prefs.browserVoiceURI ? voices.find(v => v.voiceURI === prefs.browserVoiceURI) : null;
    const localeVoice = voices.find(v => String(v.lang || '').toLowerCase().startsWith(activeLang));
    if (preferred && String(preferred.lang || '').toLowerCase().startsWith(activeLang)) u.voice = preferred;
    else if (localeVoice) u.voice = localeVoice;
    else if (preferred) u.voice = preferred;
    state.currentUtterance = u;
    let settled = false;
    const finish = ()=>{
      if (settled) return;
      settled = true;
      if (state.currentUtterance === u) state.currentUtterance = null;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    // Guard against browsers that never fire onend
    setTimeout(finish, Math.max(3000, text.length * 120));
  });
}
function stopSpeaking(){
  state.currentSpeakId++;
  try { if (state.currentAudio){ state.currentAudio.pause(); state.currentAudio.currentTime = 0; } } catch(e){}
  state.currentAudio = null;
  try { speechSynthesis.cancel(); } catch(e){}
  state.currentUtterance = null;
  state.isSpeaking = false;
  AvatarRenderer.setSpeaking(false);
  AvatarRenderer.setExplaining(false);
  stopVisemes();
  stopBtn.classList.remove('show');
  clearTimeout(_speakWatchdog);
  setStatus('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   GROUNDING
   ═══════════════════════════════════════════════════════════════════════════ */
const FALLBACK_KB = {
  brand:{name:'VIORA',tagline:'Explore. Discover. Belong.',
         subtitle:'The Unified Integrated Enterprise Ecosystem'},
  contact:{whatsapp:'254713428774',phone:'0713 428 774',email:'hello@viora.co.ke'},
  facts:[
    'VIORA is an integrated enterprise operating system and business ecosystem builder.',
    'Nine portals share one real-time data core: Business, Public, Partner, Training, Client, Product, YouTube, Presentation, and Finance.',
    'M-Pesa Daraja integration with STK push, C2B, B2C and automatic reconciliation.',
    'KRA eTIMS-ready invoicing, PAYE/NSSF/SHIF/Housing Levy computation.',
    'Offline-first PWA — keeps working through blackouts.',
    'Finance portal: real-time P&L, cash-flow forecasting, multi-currency ledgers, tax compliance.',
    'Groq AI engine for pricing, stock and collection recommendations.',
    'Role-based access, 2FA, encrypted at rest, full audit trail.',
    'Setup typically 2-4 weeks for Business UI, +1-2 weeks per additional portal.'
  ]
};

const SECTION_MAP = [
  {key:'about',selectors:['#about','.about-section'],keywords:['about','what is viora','who','company','mission'],priority:10},
  {key:'portals',selectors:['.pc-section','.portal-carousel'],keywords:['portal','portals','nine','9 portals','modules'],priority:9},
  {key:'capabilities',selectors:['#capabilities'],keywords:['capability','capabilities','features','superpowers'],priority:7},
  {key:'compare',selectors:['#compare'],keywords:['compare','versus','vs','difference'],priority:7},
  {key:'pricing',selectors:['#costCalc'],keywords:['price','pricing','cost','how much','kes'],priority:9},
  {key:'how',selectors:['#how'],keywords:['how','process','setup','onboard'],priority:8},
  {key:'builder',selectors:['#builder'],keywords:['industry','industries','sector'],priority:8},
  {key:'security',selectors:['#security'],keywords:['security','secure','encryption','2fa','audit'],priority:9},
  {key:'cases',selectors:['#cases'],keywords:['case','cases','example','client'],priority:8},
  {key:'faq',selectors:['#faq'],keywords:['faq','question','ask'],priority:8},
  {key:'contact',selectors:['#ctaBand','.band','footer'],keywords:['contact','whatsapp','call','demo'],priority:10},
  {key:'mpesa',selectors:['body'],keywords:['mpesa','m-pesa','daraja','stk','paybill'],priority:10},
  {key:'etims',selectors:['body'],keywords:['etims','kra','tax','vat','invoice'],priority:10},
  {key:'ai',selectors:['body'],keywords:['ai','groq','predict','forecast'],priority:9}
];
function cleanText(s){ return (s||'').replace(/\s+/g,' ').trim(); }
function textOf(el){ return cleanText(el && el.textContent); }

function getVisiblePageSummary(){
  try {
    const headings = Array.prototype.slice
      .call(document.querySelectorAll('h1, h2'))
      .filter(h => {
        const r = h.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      })
      .map(h => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80))
      .filter(Boolean)
      .slice(0, 4);
    return 'Current page: ' + location.pathname +
           (headings.length ? '\nVisible headings: ' + headings.join(' | ') : '');
  } catch(e){ return ''; }
}

function buildGroundingContext(msg){
  if (!FEATURES.grounding) return '';
  const parts = [];
  parts.push('BRAND: ' + FALLBACK_KB.brand.name + ' — ' + FALLBACK_KB.brand.subtitle);
  parts.push('TAGLINE: ' + FALLBACK_KB.brand.tagline);
  parts.push('CONTACT: WhatsApp ' + FALLBACK_KB.contact.whatsapp + ' · Phone ' + FALLBACK_KB.contact.phone);
  const page = getVisiblePageSummary();
  if (page) parts.push(page);

  // Only scrape the host DOM if we're NOT inside an iframe
  const isIframe = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();
  let scrapedAny = false;
  if (!isIframe){
    const t = (msg||'').toLowerCase();
    for (const sec of SECTION_MAP){
      const matched = sec.keywords.some(k => t.includes(k));
      if (!matched) continue;
      for (const sel of sec.selectors){
        const nodes = document.querySelectorAll(sel);
        if (!nodes.length) continue;
        const chunks = [];
        nodes.forEach(node=>{
          const title = node.querySelector('h2,h3,h4,.pc-title');
          if (title) chunks.push('## ' + textOf(title));
          node.querySelectorAll('p, li, .pc-desc, .pc-feature, .module-features li').forEach(el=>{
            const txt = textOf(el);
            if (txt.length >= 12 && txt.length <= 320) chunks.push('• ' + txt);
          });
        });
        if (chunks.length){
          parts.push('\n## ' + sec.key.toUpperCase());
          parts.push(chunks.slice(0,15).join('\n'));
          scrapedAny = true;
          break;
        }
      }
    }
  }
  if (!scrapedAny){
    parts.push('\nKNOWN FACTS');
    FALLBACK_KB.facts.forEach(f => parts.push('• ' + f));
  }
  if (EXTERNAL_KB){
    // Always inject the knowledge base. The prompt fitter will trim
    // the DOM scraping (middle) long before it touches this section.
    parts.push('\n## CORE KNOWLEDGE BASE');
    parts.push(EXTERNAL_KB.slice(0, 9000));
  }
  return parts.join('\n');
}

const SYSTEM_PROMPT_MAX = 10000;

function fitSystemPrompt(prompt){
  if (prompt.length <= SYSTEM_PROMPT_MAX) return prompt;
  // Keep the operator instructions (head) and the trailing tools section,
  // trim the middle (grounding) which is the least critical.
  const headLen = 1200;
  const tailLen = 600;
  const head = prompt.slice(0, headLen);
  const tail = prompt.slice(-tailLen);
  const middle = prompt.slice(headLen, prompt.length - tailLen);
  const budget = SYSTEM_PROMPT_MAX - head.length - tail.length - 40;
  const trimmed = middle.length > budget ? middle.slice(0, budget) : middle;
  return head + '\n…[context trimmed]…\n' + trimmed + tail;
}

function getSelectedLanguageName(){
  let preferred = 'en';
  try { preferred = localStorage.getItem('viora_site_language') || document.documentElement.lang || 'en'; } catch (_) { preferred = document.documentElement.lang || 'en'; }
  const raw = String(preferred).toLowerCase();
  const names = {en:'English',sw:'Swahili',fr:'French',es:'Spanish',de:'German',pt:'Portuguese',it:'Italian',zh:'Chinese (Simplified)','zh-cn':'Chinese (Simplified)',ja:'Japanese',ar:'Arabic',hi:'Hindi',ru:'Russian',nl:'Dutch',tr:'Turkish',ko:'Korean'};
  return names[raw] || names[raw.split('-')[0]] || 'the language selected by the visitor';
}
function buildSystemPrompt(userMessage){
  const grounding = buildGroundingContext(userMessage);
  const selectedLanguage = getSelectedLanguageName();
  const tools = FEATURES.tools ? [
    '',
    'AVAILABLE TOOLS (call via JSON when relevant):',
    '- openLeadModal()             → open the lead form',
    '- openBlueprintPreview()      → open the industry blueprint modal',
    '- navigate(sectionId)         → scroll to a section',
    '- openWhatsApp(number, text)  → open WhatsApp with prefilled message',
    'If you want to call a tool, respond with EXACTLY this JSON and nothing else:',
    '{"tool":"<name>","args":{...},"reply":"<short user-facing text>"}',
    'Otherwise reply normally.'
  ].join('\n') : '';
  const prompt = [
    'You are VIORA AI, the warm, sharp, helpful assistant for VIORA.',
    'Answer in under ~180 words unless asked for detail. Short paragraphs. Warm tone.',
    'The active website language is ' + selectedLanguage + '. Reply naturally and fluently in that language unless the visitor explicitly asks for another language.',
    'Keep product names, brand names, technical terms and official integration names accurate; explain them in the selected language.',
    'If the visitor switches language mid-conversation, follow the newest language immediately without asking them to repeat their question.',
    'Use culturally neutral international English or the selected locale; do not assume the visitor is Kenyan unless the page, question or context establishes it.',
    "Mirror the user's language (English, Swahili, Sheng, French, etc.).",
    'Never invent facts, prices, features, or timelines not in the context below.',
    'If the context does not cover it, say so and offer WhatsApp 254713428774.',
    'Never quote raw HTML or JSON — speak like a human.',
    'Act as VIORA’s international website concierge: help visitors understand the ecosystem, identify a relevant industry blueprint and take a clear next step.',
    'Be an expert product guide, not a generic chatbot: understand the visitor’s goal, ask one focused clarifying question when needed, compare relevant options, and give actionable next steps.',
    'Use conversation history to avoid repeating questions. Summarise the visitor’s requirements accurately before proposing a solution.',
    'Be transparent about uncertainty, integrations, availability, pricing and deployment status. Never imply that AI can access private customer data or perform an action unless an authorised tool confirms it.',
    'When a visitor asks about translation or language support, explain that the page translation is AI-generated and may need human review for legal, financial or contractual wording.',
    'Prefer clear international terminology, accessible explanations and concise natural phrasing. Avoid robotic greetings, filler, exaggerated claims and repetitive calls to action.',
    'Do not assume every visitor is in Kenya. Ask for country or region only when it helps scope the enquiry; never make it a requirement.',
    'Describe modules as capabilities VIORA can design and build. Claim that a feature is live only when the live page context explicitly confirms it.',
    'For demo, quote, consultation or clear buying intent, offer openLeadModal(). For a visitor exploring how their workflows could connect, offer openBlueprintPreview(). Use openWhatsApp only when the visitor prefers direct contact or needs a human handoff.',
    'Marketplace prices may be shown in KES. Do not invent foreign-currency prices, exchange rates, implementation fees or subscription quotes; explain that bespoke pricing follows a scoped discussion.',
    '',
    'After your reply, OPTIONALLY append up to 3 quick follow-up questions',
    'the user might ask next, in exactly this format on its own line:',
    '[[suggestions: First question | Second question | Third question]]',
    'Omit this line entirely if no good follow-ups exist.',
    '',
    '═══ LIVE PAGE CONTEXT ═══',
    grounding,
    '═══ END CONTEXT ═══',
    tools
  ].filter(Boolean).join('\n');
  return fitSystemPrompt(prompt);
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORKER
   ═══════════════════════════════════════════════════════════════════════════ */
async function callChatStreaming(userMessage, onToken){
  const systemPrompt = buildSystemPrompt(userMessage);
  const messages = state.history.slice(-(CONFIG.MAX_HISTORY - 1));
  messages.push({role:'user',content:userMessage});

  const body = {
    system: systemPrompt,
    messages,
    stream: true,
    sessionId: state.sessionId
  };
  const url = CONFIG.WORKER_URL + CONFIG.CHAT_ENDPOINTS[0];
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Accept':'text/event-stream' },
    body: JSON.stringify(body),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!res.ok){
    const errText = await res.text().catch(()=> '');
    console.error('[VIORA] /chat ' + res.status + ' body:', errText);
    throw new Error('HTTP ' + res.status + ' — ' + errText.slice(0, 300));
  }

  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream')){
    const data = await res.json().catch(()=> null);
    const reply = extractReply(data) || '';
    if (reply){ onToken(reply, reply); return reply; }
    throw new Error('Non-SSE response: ' + ctype);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true){
    const {value,done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines){
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('event:')) continue;
      if (trimmed.startsWith('data:')){
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return full;
        try {
          const j = JSON.parse(data);
          const tok = j.choices?.[0]?.delta?.content || j.token || j.delta || '';
          if (tok){ full += tok; onToken(tok, full); }
        } catch(e){
          if (data){ full += data; onToken(data, full); }
        }
      }
    }
  }
  return full;
}
function extractReply(data){
  if (!data) return '';
  if (typeof data === 'string') return data;
  const keys = ['reply','response','message','text','output','content','answer'];
  for (const k of keys){ if (typeof data[k] === 'string') return data[k]; }
  if (data.choices && data.choices[0]){
    const c = data.choices[0];
    if (c.message && typeof c.message.content === 'string') return c.message.content;
    if (typeof c.text === 'string') return c.text;
  }
  if (data.data){ const r = extractReply(data.data); if (r) return r; }
  return '';
}
// Returns { reply, tool } where tool is the parsed tool call if any.
async function callChatNonStreaming(userMessage){
  const systemPrompt = buildSystemPrompt(userMessage);
  const messages = state.history.slice(-(CONFIG.MAX_HISTORY - 1));
  messages.push({role:'user',content:userMessage});
  const bodies = [
    { system: systemPrompt, messages, model:'llama-3.3-70b-versatile', temperature:0.5, max_tokens:600, sessionId: state.sessionId },
    { system: systemPrompt, messages, sessionId: state.sessionId }
  ];
  const deadline = Date.now() + CONFIG.CHAT_TOTAL_TIMEOUT_MS;
  for (const ep of CONFIG.CHAT_ENDPOINTS){
    for (const body of bodies){
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(CONFIG.REQUEST_TIMEOUT_MS, remaining));
      try {
        const res = await fetch(CONFIG.WORKER_URL + ep, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!res.ok){
          const t = await res.text().catch(()=> '');
          console.warn('[VIORA] ' + ep + ' → ' + res.status, t.slice(0,200));
          continue;
        }
        const data = await res.json();
        const toolCall = tryParseToolCallObj(data);
        const reply = extractReply(data);
        if (reply || toolCall) return { reply: reply || '', tool: toolCall };
      } catch(e){
        console.warn('[VIORA] ' + ep + ' failed:', e.message);
      } finally {
        clearTimeout(timer);
      }
    }
    if (Date.now() >= deadline) break;
  }
  throw new Error('All chat endpoints failed or exceeded the 35-second response budget');
}
function tryParseToolCallObj(data){
  if (!data || typeof data !== 'object') return null;
  if (data.tool && typeof data.tool === 'string'){
    return { tool: data.tool, args: data.args || {}, reply: data.reply || '' };
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI
   ═══════════════════════════════════════════════════════════════════════════ */
let _bubbleTimer = null;
let _lastBubbleText = '';
function sayBubble(text){
  if (text === _lastBubbleText && bubble.classList.contains('show')) return;
  _lastBubbleText = text;
  bubbleText.textContent = text;
  bubble.classList.add('show');
  clearTimeout(_bubbleTimer);
  _bubbleTimer = setTimeout(()=>bubble.classList.remove('show'),4200);
}
function setStatus(text){
  if (text){ statusPill.textContent = text; statusPill.classList.add('show'); }
  else { statusPill.classList.remove('show'); }
  if (state.verbose && text) announce(text);
}
function announce(text){
  let el = document.getElementById('vaSrLive');
  if (!el){
    el = document.createElement('div');
    el.id = 'vaSrLive';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.setAttribute('aria-atomic','true');
    el.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    document.body.appendChild(el);
  }
  el.textContent = text;
}
function renderMarkdownLite(text){
  let s = String(text==null?'':text);
  // Escape HTML except we preserve the entities we create ourselves
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
       .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // Bold and code — restrict to keep HTML valid
  s = s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  s = s.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  // URLs — non-greedy, stop at whitespace or quotes
  s = s.replace(/(https?:\/\/[^\s"'<>]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\n/g,'<br>');
  return s;
}
function addMsg(text, who, opts){
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  if (opts && opts.id) d.dataset.msgId = opts.id;
  if (who === 'bot' || who === 'tool') d.innerHTML = renderMarkdownLite(text);
  else d.textContent = text;
  if (who === 'bot' || who === 'user'){
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.textContent = '⎘ Copy';
    copy.addEventListener('click', ()=>{
      try {
        navigator.clipboard.writeText(d.textContent.replace(/⎘ Copy|↻ Retry/g,'').trim());
        copy.textContent = '✓ Copied';
        setTimeout(()=>copy.textContent = '⎘ Copy', 1500);
      } catch(e){}
    });
    actions.appendChild(copy);
    if (who === 'bot'){
      const again = document.createElement('button');
      again.textContent = '🔊 Speak';
      again.addEventListener('click', ()=>{
        stopSpeaking();
        const id = ++state.currentSpeakId;
        state.readAloud = true;
        updateReadBtn();
        $('setSpeak').checked = true;
        persistA11y();
        state.isSpeaking = true;
        stopBtn.classList.add('show');
        AvatarRenderer.setSpeaking(true);
        // Extract just the message text (strip the action buttons)
        const clone = d.cloneNode(true);
        clone.querySelectorAll('.msg-actions').forEach(el => el.remove());
        const spoken = clone.textContent.trim();
        armSpeakWatchdog(60000);
        speakReply(spoken, id).then(()=>{
          if (id === state.currentSpeakId) finishSpeaking();
        });
      });
      actions.appendChild(again);
    }
    if (who === 'user'){
      const retry = document.createElement('button');
      retry.textContent = '↻ Retry';
      retry.addEventListener('click', ()=>{
        const txt = d.textContent.replace(/⎘ Copy|↻ Retry/g,'').trim();
        if (txt){ input.value = txt; sendMessage(); }
      });
      actions.appendChild(retry);
    }
    d.appendChild(actions);
  }
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}
function addTypingIndicator(){
  const d = document.createElement('div');
  d.className = 'msg bot';
  d.id = 'vaTyping';
  d.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}
function removeTypingIndicator(){
  const el = document.getElementById('vaTyping');
  if (el) el.remove();
}

function renderSuggestedReplies(chips){
  removeSuggestedReplies();
  if (!chips || !chips.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'msg bot va-suggestions';
  wrap.id = 'vaSuggestions';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Suggested replies');
  chips.forEach(text=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'va-chip';
    b.textContent = text;
    b.addEventListener('click', ()=>{
      removeSuggestedReplies();
      input.value = text;
      updateInputHint();
      sendMessage();
    });
    wrap.appendChild(b);
  });
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}
function removeSuggestedReplies(){
  const el = document.getElementById('vaSuggestions');
  if (el) el.remove();
}

function addErrorMessage(text){
  const d = document.createElement('div');
  d.className = 'msg bot';
  d.innerHTML = renderMarkdownLite(text);
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  const retry = document.createElement('button');
  retry.textContent = '↻ Retry';
  retry.addEventListener('click', ()=>{
    if (state.lastUserMessage){ input.value = state.lastUserMessage; sendMessage(); }
  });
  actions.appendChild(retry);
  d.appendChild(actions);
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}
function setCaption(text, currentSent){
  if (!FEATURES.captions) return;
  if (currentSent){
    captionText.innerHTML = '';
    const pre = document.createElement('span');
    pre.className = 'cap-done';
    pre.textContent = ' ' + text.slice(0, text.length - currentSent.length);
    const cur = document.createElement('span');
    cur.className = 'cap-current';
    cur.textContent = currentSent;
    captionText.appendChild(pre);
    captionText.appendChild(cur);
  } else {
    captionText.textContent = ' ' + text;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MIC STATE VISUALS
   ═══════════════════════════════════════════════════════════════════════════ */
function updateMicUI(){
  micBtn.classList.toggle('recording', state.isListening);
  micBtn.classList.toggle('armed', state.micArmed && !state.isListening);
  micBtn.setAttribute('aria-pressed', state.isListening ? 'true' : 'false');
  micBtn.disabled = state.isBusy;
  if (state.isListening){
    micBtn.firstChild.textContent = '⏹';
    micBtn.title = 'Recording… tap to stop';
  } else if (state.micArmed){
    micBtn.firstChild.textContent = '🎙';
    micBtn.title = 'Armed — tap to record, or just speak';
  } else {
    micBtn.firstChild.textContent = '🎙';
    micBtn.title = 'Tap to start/stop recording';
  }
}
function fmtTime(ms){
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const ss = String(s%60).padStart(2,'0');
  return String(m).padStart(2,'0') + ':' + ss;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDIO CONSTRAINTS + LEVEL METER + VAD
   ═══════════════════════════════════════════════════════════════════════════ */
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16
  },
  video: false
};

function attachLevelMeter(stream){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  detachLevelMeter();
  try {
    const ac = new AC();
    state.levelMeterAC = ac;
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    function tick(){
      if (!state.isListening){ micBtn.style.boxShadow = ''; return; }
      an.getByteFrequencyData(data);
      let sum = 0;
      for (let i=0;i<data.length;i++) sum += data[i];
      const level = Math.min(100, (sum / data.length) * 2);
      micBtn.style.setProperty('--mic-level', level);
      state.levelMeterRAF = requestAnimationFrame(tick);
    }
    tick();
  } catch(e){ /* mic level is best-effort */ }
}
function detachLevelMeter(){
  cancelAnimationFrame(state.levelMeterRAF);
  state.levelMeterRAF = 0;
  if (state.levelMeterAC){ try{ state.levelMeterAC.close(); }catch(e){} state.levelMeterAC = null; }
  micBtn.style.boxShadow = '';
}

function attachVAD(stream){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (state._vadStop) { try { state._vadStop(); } catch(e){} state._vadStop = null; }
  try {
    const ac = new AC();
    const src = ac.createMediaStreamSource(stream);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 85;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(hp); hp.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const history = [];
    const HISTORY_LEN = 60;
    let noiseFloor = 8;
    let silenceStart = null;
    let spoke = false;
    let speechStart = 0;

    const SILENCE_MS    = 1200;
    const MIN_SPEECH_MS = 350;
    const MAX_UTTER_MS  = 15000;

    let raf = 0;
    let closed = false;
    function closeAC(){ if (!closed){ closed = true; try{ ac.close(); }catch(e){} } }
    function tick(){
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i=0;i<data.length;i++) sum += data[i];
      const avg = sum / data.length;

      history.push(avg);
      if (history.length > HISTORY_LEN) history.shift();
      const sorted = [...history].sort((a,b)=>a-b);
      noiseFloor = sorted[Math.floor(sorted.length * 0.1)];

      const speechThreshold = noiseFloor + 6;
      const now = performance.now();

      if (avg > speechThreshold){
        if (!spoke){ spoke = true; speechStart = now; }
        silenceStart = null;
      } else if (spoke){
        if (silenceStart === null) silenceStart = now;
        else if (now - silenceStart > SILENCE_MS){
          if (now - speechStart >= MIN_SPEECH_MS){
            closeAC();
            stopListening();
            return;
          } else {
            spoke = false;
            silenceStart = null;
          }
        }
      }
      if (spoke && now - speechStart > MAX_UTTER_MS){
        closeAC();
        stopListening();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    state._vadStop = ()=>{ cancelAnimationFrame(raf); closeAC(); };
    raf = requestAnimationFrame(tick);
  } catch(e){ /* VAD is best-effort */ }
}

/* ═══════════════════════════════════════════════════════════════════════════
   INTERIM PREVIEW (Web Speech API)
   ═══════════════════════════════════════════════════════════════════════════ */
function startInterimPreview(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  try {
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-KE';
    rec.onresult = (e)=>{
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++){
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) input.value = interim;
      else if (final) input.value = final;
    };
    rec.onerror = ()=>{};
    rec.start();
    state.interimRecognizer = rec;
  } catch(e){ /* best-effort */ }
}
function stopInterimPreview(){
  if (state.interimRecognizer){
    try { state.interimRecognizer.stop(); } catch(e){}
    state.interimRecognizer = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   WAKE WORD
   ═══════════════════════════════════════════════════════════════════════════ */
function startWakeWord(){
  if (state.wakeRecognizer) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  try {
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e)=>{
      for (let i = e.resultIndex; i < e.results.length; i++){
        const t = (e.results[i][0].transcript || '').toLowerCase();
        if (t.includes(CONFIG.WAKE_WORD)){
          if (!state.isOpen) open();
          sayBubble('I heard you!');
          // Don't auto-arm the mic — the user will speak again
        }
      }
    };
    rec.onerror = ()=>{};
    rec.onend = ()=>{ if (state.wakeEnabled){ try{ rec.start(); }catch(e){} } };
    rec.start();
    state.wakeRecognizer = rec;
  } catch(e){ /* best-effort */ }
}
function stopWakeWord(){
  if (state.wakeRecognizer){
    try { state.wakeRecognizer.stop(); } catch(e){}
    state.wakeRecognizer = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   STT
   ═══════════════════════════════════════════════════════════════════════════ */
async function startListening(){
  if (state.isSpeaking && FEATURES.bargeIn) stopSpeaking();
  if (state.isListening) return;
  if (!window.isSecureContext){ sayBubble('Microphone needs HTTPS (or localhost).'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ sayBubble('This browser does not expose microphone access.'); return; }
  if (!window.MediaRecorder){ sayBubble('MediaRecorder unsupported — please use Chrome, Edge, Firefox, or Safari 14+.'); return; }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
  } catch (e){
    const name = (e && e.name) || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') sayBubble('Microphone permission denied.');
    else if (name === 'NotFoundError') sayBubble('No microphone detected.');
    else if (name === 'NotReadableError') sayBubble('Microphone is busy in another app.');
    else sayBubble('Could not access microphone: ' + (e.message||name));
    state.micArmed = false; updateMicUI();
    return;
  }

  state.isListening = true;
  state.micArmed = true;
  state.audioChunks = [];
  state.recStart = performance.now();
  updateMicUI();

  // Start the recording timer
  clearInterval(state.recTimer);
  state.recTimer = setInterval(()=>{
    micTime.textContent = fmtTime(performance.now() - state.recStart);
  }, 250);

  // Live level meter + interim transcript
  attachLevelMeter(stream);
  startInterimPreview();

  const prefer = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  let mime = '';
  for (const m of prefer){
    if (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)){ mime = m; break; }
  }

  let mr;
  try {
    mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (e){
    stream.getTracks().forEach(t=>t.stop());
    state.isListening = false; state.micArmed = false;
    updateMicUI();
    sayBubble('Could not start the recorder.');
    return;
  }

  state.mediaRecorder = mr;
  mr.ondataavailable = (e)=>{ if (e.data.size) state.audioChunks.push(e.data); };
  mr.onstop = async ()=>{
    stream.getTracks().forEach(t=>t.stop());
    clearInterval(state.recTimer);
    state.recTimer = null;
    micTime.textContent = '00:00';
    stopInterimPreview();
    detachLevelMeter();
    if (state._vadStop){ state._vadStop(); state._vadStop = null; }
    if (!state.audioChunks.length){ state.isListening = false; updateMicUI(); return; }

    const rawType = mr.mimeType || 'audio/webm';
    const cleanType = rawType.split(';')[0];
    const blob = new Blob(state.audioChunks, { type: cleanType });
    state.sttStart = performance.now();
    setStatus('Transcribing…');
    try {
      const text = await transcribe(blob);
      state.metrics.sttMs = Math.round(performance.now() - state.sttStart);
      if (text && text.trim() && !isLikelyHallucination(text)){
        // If the interim preview already produced better text, prefer the server
        input.value = text.trim();
        sendMessage();
      } else if (isLikelyHallucination(text)){
        sayBubble("I didn't quite catch that — could you say it again?");
        if (FEATURES.vad && state.vadEnabled) setTimeout(()=>{ if (!state.isListening) startListening(); }, 400);
      } else {
        sayBubble("I didn't hear anything — try again?");
      }
    } catch(e){
      console.warn('[VIORA] STT error', e);
      sayBubble('Speech-to-text unavailable. Type instead.');
    } finally {
      state.isListening = false;
      state.micArmed = FEATURES.vad && state.vadEnabled;
      setStatus('');
      updateMicUI();
    }
  };
  mr.start();
  setStatus('Listening…');
  if (FEATURES.vad && state.vadEnabled) attachVAD(stream);
}

function stopListening(){
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive'){
    try { state.mediaRecorder.stop(); } catch(e){}
  }
  clearInterval(state.recTimer);
  state.recTimer = null;
  state.isListening = false;
  if (!FEATURES.vad || !state.vadEnabled) state.micArmed = false;
  updateMicUI();
}

const WHISPER_HALLUCINATIONS = new Set([
  'thank you.', 'thanks for watching.', 'thank you for watching.',
  'subtitles by the amara.org community', 'you', 'bye.', '.', '...',
  'subscribe to my channel', 'please subscribe.', 'thank you for watching!'
]);
function isLikelyHallucination(text){
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (t.length < 2) return true;
  if (WHISPER_HALLUCINATIONS.has(t)) return true;
  if (!/[aeiou]/i.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length >= 3 && new Set(words).size === 1) return true;
  return false;
}

async function transcribe(blob){
  const fd = new FormData();
  let ext = 'webm';
  const t = blob.type || '';
  if (t.includes('ogg')) ext = 'ogg';
  else if (t.includes('mp4')) ext = 'mp4';
  else if (t.includes('wav')) ext = 'wav';
  else if (t.includes('mpeg') || t.includes('mp3')) ext = 'mp3';
  fd.append('audio', blob, 'recording.' + ext);
  // Some Workers expect 'file' — the Worker will pick whichever it needs.
  fd.append('file', blob, 'recording.' + ext);

  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  const res = await fetch(CONFIG.WORKER_URL + CONFIG.STT_ENDPOINT, {
    method:'POST', body: fd, signal: controller.signal
  });
  clearTimeout(timer);
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok){
    const detail = await res.text().catch(()=> '');
    throw new Error('STT ' + res.status + ' ' + detail.slice(0,200));
  }
  if (!ctype.includes('application/json')){
    throw new Error('STT returned non-JSON: ' + ctype);
  }
  const j = await res.json();
  return j.text || j.transcript || j.reply || '';
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEND MESSAGE
   ═══════════════════════════════════════════════════════════════════════════ */
function withinRateLimit(){
  const now = Date.now();
  if (state.lastRequestAt && now - state.lastRequestAt < CONFIG.RATE_LIMIT.minGapMs) return false;
  state.requestsInMinute = state.requestsInMinute.filter(t => now - t < 60000);
  if (state.requestsInMinute.length >= CONFIG.RATE_LIMIT.maxPerMin) return false;
  return true;
}
function recordRequest(){
  const now = Date.now();
  state.lastRequestAt = now;
  state.requestsInMinute.push(now);
}
async function sendMessage(){
  if (state.isBusy) return;
  const raw = (input.value || '').trim();
  if (!raw) return;
  if (raw.length > CONFIG.MAX_MESSAGE_LEN){
    sayBubble('Message is too long. Please shorten it.');
    return;
  }
  if (FEATURES.rateLimit && !withinRateLimit()){
    sayBubble('Slow down a moment — try again in a second.');
    return;
  }
  recordRequest();

  state.lastUserMessage = raw;
  input.value = '';
  input.style.height = 'auto';
  updateInputHint();
  addMsg(raw, 'user');
  removeSuggestedReplies();
  state.history.push({role:'user',content:raw});
  if (state.history.length > CONFIG.MAX_HISTORY) state.history = state.history.slice(-CONFIG.MAX_HISTORY);
  persistChatHistory();

  const requestId = ++state.requestId;
  state.isBusy = true;
  sendBtn.disabled = true;
  updateMicUI();
  setStatus('Thinking…');
  AvatarRenderer.setThinking(true);
  AvatarRenderer.bounce();
  const typing = addTypingIndicator();

  const progressiveSpeech = state.readAloud ? createStreamingSpeechQueue(++state.currentSpeakId) : null;

  const t0 = performance.now();
  let full = '';
  let toolCall = null;

  try {
    if (FEATURES.streaming){
      removeTypingIndicator();
      const botDiv = addMsg('', 'bot');
      botDiv.classList.add('streaming');
      full = await callChatStreaming(raw, (tok, acc)=>{
        botDiv.innerHTML = renderMarkdownLite(acc);
        chat.scrollTop = chat.scrollHeight;
        setCaption(acc.slice(-160));
        progressiveSpeech?.push(acc);
      });
      botDiv.classList.remove('streaming');
      if (!full) throw new Error('empty stream');
    } else {
      const result = await callChatNonStreaming(raw);
      full = result.reply;
      toolCall = result.tool;
      removeTypingIndicator();
      const botDiv = addMsg('', 'bot');
      botDiv.classList.add('streaming');
      const tokens = full.split(/(\s+)/);
      let acc = '';
      for (const t of tokens){
        acc += t;
        botDiv.innerHTML = renderMarkdownLite(acc);
        chat.scrollTop = chat.scrollHeight;
        setCaption(acc.slice(-160));
        progressiveSpeech?.push(acc);
        await new Promise(r => setTimeout(r, 16));
      }
      botDiv.classList.remove('streaming');
    }
    state.metrics.llmMs = Math.round(performance.now() - t0);
    state.metrics.errorCode = null;

    // Run tool call if the model produced one
    if (FEATURES.tools){
      if (toolCall){
        runTool(toolCall);
        addMsg('⚙ ' + (toolCall.reply || 'Running action…'), 'tool');
        if (toolCall.reply) full = toolCall.reply;
      } else {
        const parsed = tryParseToolCall(full);
        if (parsed){
          runTool(parsed);
          addMsg('⚙ ' + (parsed.reply || 'Running action…'), 'tool');
          if (parsed.reply) full = parsed.reply;
        }
      }
    }

    if (full){
      const { cleaned, chips } = extractSuggestions(full);
      full = cleaned;
      state.history.push({role:'assistant',content:full});
      if (state.history.length > CONFIG.MAX_HISTORY) state.history = state.history.slice(-CONFIG.MAX_HISTORY);
      persistChatHistory();
      renderSuggestedReplies(chips);
    }

    state.emotion = detectEmotion(full);
    AvatarRenderer.setEmotion(state.emotion);
    clearTimeout(state.emotionTimer);
    state.emotionTimer = setTimeout(()=>{
      state.emotion = 'neutral';
      AvatarRenderer.setEmotion('neutral');
    }, 5000);

    if (state.readAloud){
      state.isSpeaking = true;
      stopBtn.classList.add('show');
      AvatarRenderer.setSpeaking(true);
      AvatarRenderer.setExplaining(true);
      setStatus('Speaking…');
      const speakId = progressiveSpeech ? progressiveSpeech.id : ++state.currentSpeakId;
      armSpeakWatchdog(60000);
      if (progressiveSpeech) await progressiveSpeech.finish(full);
      else await speakReply(full, speakId);
      if (speakId === state.currentSpeakId) finishSpeaking();
    } else {
      state.isSpeaking = true;
      stopBtn.classList.add('show');
      AvatarRenderer.setSpeaking(true);
      AvatarRenderer.setExplaining(true);
      const visemes = (state.visemeProvider || textToVisemes)(full, { msPerViseme: 90 });
      const total = visemes.reduce((a,v)=> a + v.duration, 0);
      playVisemes(visemes);
      armSpeakWatchdog(Math.max(4000, total + 2000));
    }
  } catch(err){
    progressiveSpeech?.cancel();
    removeTypingIndicator();
    console.warn('[VIORA]', err);
    state.metrics.errorCode = err.message || 'error';
    const msg = friendlyError(err);
    addErrorMessage(msg);
    state.history.push({role:'assistant',content:msg});
    persistChatHistory();
  } finally {
    // Only the *matching* request can clear the busy flag
    if (requestId === state.requestId){
      state.isBusy = false;
      sendBtn.disabled = false;
      AvatarRenderer.setThinking(false);
      if (!state.isSpeaking) setStatus('');
      updateMicUI();
    }
    state.metrics.latencyMs = Math.round(performance.now() - t0);
    logAnalytics();
  }
}

let _speakWatchdog = null;
function armSpeakWatchdog(ms){
  clearTimeout(_speakWatchdog);
  _speakWatchdog = setTimeout(()=>{
    console.warn('[VIORA] TTS watchdog fired — forcing finish');
    finishSpeaking();
  }, ms || 45000);
}
function finishSpeaking(){
  clearTimeout(_speakWatchdog);
  state.isSpeaking = false;
  stopBtn.classList.remove('show');
  AvatarRenderer.setSpeaking(false);
  AvatarRenderer.setExplaining(false);
  stopVisemes();
  setStatus('');
}

function tryParseToolCall(text){
  if (!text) return null;
  const trimmed = String(text).trim();
  // Only accept a JSON-only reply. Anything else is normal prose.
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const j = JSON.parse(trimmed);
    if (j && typeof j.tool === 'string') return j;
  } catch(e){}
  return null;
}
function extractSuggestions(text){
  if (!text) return { cleaned: text, chips: [] };
  const m = String(text).match(/\[\[\s*suggestions?\s*:\s*([^\]]+)\]\]/i);
  if (!m) return { cleaned: text, chips: [] };
  const chips = m[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 3);
  const cleaned = String(text).replace(m[0], '').trim();
  return { cleaned, chips };
}
function runTool(call){
  const { tool, args = {} } = call;
  try {
    switch(tool){
      case 'openLeadModal': {
        if (typeof window.openLeadModal === 'function') window.openLeadModal();
        else {
          const form = document.getElementById('contact-form') || document.getElementById('contact');
          if (form) form.scrollIntoView({behavior:'smooth', block:'start'});
          else window.location.href = '/contact_us';
        }
        break;
      }
      case 'openBlueprintPreview':
        if (typeof window.openBlueprintPreview === 'function') window.openBlueprintPreview();
        else window.location.href = '/industries';
        break;
      case 'navigate': {
        const el = document.getElementById((args.sectionId||'').replace('#',''));
        if (el){
          el.scrollIntoView({behavior:'smooth', block:'start'});
          // Re-assert the panel is open in case focus was lost
          setTimeout(()=>{ if (!state.isOpen) open(); }, 120);
        }
        break;
      }
      case 'openWhatsApp':
        window.open('https://wa.me/' + (args.number || '254713428774') + '?text=' + encodeURIComponent(args.text||''), '_blank');
        break;
    }
  } catch(e){ console.warn('[VIORA] tool error', e); }
}
function friendlyError(err){
  const m = String((err && err.message) || err);
  if (m.includes('abort') || m.includes('timeout'))
    return 'That took too long. Please try again.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError'))
    return 'Network issue reaching VIORA.\n\n[📱 WhatsApp 254713428774](https://wa.me/254713428774) — or retry in a moment.';
  return 'Something went wrong.\n\n[📱 WhatsApp 254713428774](https://wa.me/254713428774) — or retry.';
}
async function logAnalytics(){
  if (!FEATURES.analytics) return;
  try {
    await fetch(CONFIG.WORKER_URL + CONFIG.ANALYTICS_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        sessionId: state.sessionId,
        turn: state.history.length,
        sttMs: state.metrics.sttMs,
        llmMs: state.metrics.llmMs,
        ttsMs: state.metrics.ttsMs,
        latencyMs: state.metrics.latencyMs,
        errorCode: state.metrics.errorCode,
        ts: Date.now()
      }),
      keepalive: true
    });
  } catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMOTION
   ═══════════════════════════════════════════════════════════════════════════ */
function detectEmotion(text){
  if (!FEATURES.emotion || !text) return 'neutral';
  const t = text.toLowerCase();
  if (/\b(amazing|incredible|fantastic|excellent|wow|absolutely|brilliant)\b/i.test(t)) return 'excited';
  if (/\b(great|wonderful|awesome|glad|happy|excited|love)\b/i.test(t)) return 'happy';
  if (/\b(sorry|unfortunately|issue|problem|error|fail|concern|warn|careful)\b/i.test(t)) return 'concerned';
  return 'neutral';
}

/* ═══════════════════════════════════════════════════════════════════════════
   SESSION / EXPORT / SIGN
   ═══════════════════════════════════════════════════════════════════════════ */
function persistChatHistory(){
  try {
    const json = JSON.stringify(state.history);
    sessionStorage.setItem(CONFIG.CHAT_STORAGE_KEY, json);
    localStorage.setItem(CONFIG.CHAT_STORAGE_KEY, json);
  } catch(e){}
}
function restoreChatHistory(){
  try {
    const raw = sessionStorage.getItem(CONFIG.CHAT_STORAGE_KEY)
              || localStorage.getItem(CONFIG.CHAT_STORAGE_KEY);
    if (!raw) return false;
    const h = JSON.parse(raw);
    if (!Array.isArray(h) || !h.length) return false;
    state.history = h.slice(-CONFIG.MAX_HISTORY);
    h.forEach(turn=>{
      if (turn.role === 'user') addMsg(turn.content, 'user');
      else if (turn.role === 'assistant') addMsg(turn.content, 'bot');
    });
    return true;
  } catch(e){ return false; }
}
function newSession(){
  stopSpeaking();
  state.history = [];
  state.metrics = { sttMs:0, llmMs:0, ttsMs:0, latencyMs:0, errorCode:null };
  state.emotion = 'neutral';
  state.lastUserMessage = '';
  state.ttsCache.forEach(url => { try{ URL.revokeObjectURL(url); }catch(e){} });
  state.ttsCache.clear();
  AvatarRenderer.setEmotion('neutral');
  chat.innerHTML = '';
  try { sessionStorage.removeItem(CONFIG.CHAT_STORAGE_KEY); } catch(e){}
  try { localStorage.removeItem(CONFIG.CHAT_STORAGE_KEY); } catch(e){}
  seedGreeting();
  sayBubble('New conversation started.');
  logAnalytics();
}
function seedGreeting(){
  addMsg("Hi! I'm **VIORA**. Ask me anything about the ecosystem, pricing, M-Pesa, eTIMS, or security. Type below, tap 🎙 to talk, or hold **Space** to push-to-talk.", 'bot');
}
function exportTranscript(){
  const lines = [];
  const ts = new Date().toISOString();
  lines.push('# VIORA Transcript');
  lines.push('Session: ' + state.sessionId);
  lines.push('Exported: ' + ts);
  lines.push('');
  chat.querySelectorAll('.msg').forEach(m=>{
    const role = m.classList.contains('user') ? 'User' : 'VIORA';
    // Strip the action buttons from the text
    const clone = m.cloneNode(true);
    clone.querySelectorAll('.msg-actions').forEach(el=>el.remove());
    lines.push(role + ': ' + clone.textContent.trim());
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'viora-transcript-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.txt';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 3000);
}
const SIGNS = {
  hello:['👋','HELLO'], thanks:['🙏','THANK YOU'], yes:['👍','YES'], no:['🙅','NO'],
  help:['🆘','HELP'], good:['👌','GOOD'], welcome:['🤝','WELCOME'],
  accessibility:['♿','ACCESSIBILITY'], viora:['🤖','VIORA']
};
function showSign(text){
  if (!signBox.classList.contains('on')) return;
  const t = (text||'').toLowerCase();
  let key = 'hello';
  const keys = Object.keys(SIGNS);
  // Prefer whole-word matches over substring (so "goodbye" doesn't match "good")
  for (const k of keys){
    const re = new RegExp('\\b' + k + '\\b');
    if (re.test(t)){ key = k; break; }
  }
  state.signKey = key;
  signHands.textContent = SIGNS[key][0];
  signCaption.textContent = 'Sign mode: ' + SIGNS[key][1];
  if (!prefersReducedMotion()){
    signHands.animate(
      [{transform:'scale(.85) rotate(-8deg)'},{transform:'scale(1.12) rotate(7deg)'},{transform:'scale(1) rotate(0)'}],
      {duration:850,easing:'ease-out'}
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREFERENCES
   ═══════════════════════════════════════════════════════════════════════════ */
function persistA11y(){
  try {
    localStorage.setItem(CONFIG.A11Y_KEY, JSON.stringify({
      motion:   document.body.classList.contains('va-reduced-motion'),
      contrast: document.body.classList.contains('va-high-contrast'),
      large:    document.body.classList.contains('va-large-text'),
      sign:     signBox.classList.contains('on'),
      captions: state.captions,
      verbose:  state.verbose,
      speak:    state.readAloud,
      vad:      state.vadEnabled,
      wake:     state.wakeEnabled
    }));
  } catch(e){}
}
function restoreA11y(){
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.A11Y_KEY) || '{}');
    if (s.motion){ $('setMotion').checked = true; document.body.classList.add('va-reduced-motion'); }
    if (s.contrast){ $('setContrast').checked = true; document.body.classList.add('va-high-contrast'); }
    if (s.large){ $('setLarge').checked = true; document.body.classList.add('va-large-text'); }
    if (s.sign){ $('setSign').checked = true; signBox.classList.add('on'); showSign('hello'); }
    if (s.captions){ $('setCaptions').checked = true; state.captions = true; captionsEl.classList.add('on'); }
    if (s.verbose){ $('setVerbose').checked = true; state.verbose = true; }
    if (typeof s.vad === 'boolean'){ $('setVAD').checked = s.vad; state.vadEnabled = s.vad; }
    else { $('setVAD').checked = true; state.vadEnabled = true; }
    if (s.wake){ $('setWake').checked = true; state.wakeEnabled = true; }
    else { $('setWake').checked = false; state.wakeEnabled = false; }
    if (typeof s.speak === 'boolean'){ $('setSpeak').checked = s.speak; state.readAloud = s.speak; }
    else { $('setSpeak').checked = false; state.readAloud = false; }
  } catch(e){
    $('setSpeak').checked = false;  state.readAloud = false;
    $('setVAD').checked = true;     state.vadEnabled = true;
    $('setWake').checked = false;   state.wakeEnabled = false;
  }
  updateReadBtn();
  updateMicUI();
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOICES
   ═══════════════════════════════════════════════════════════════════════════ */
function pickDefaultBrowserVoice(voices){
  if (!voices || !voices.length) return null;
  const preferNames = [
    'Google UK English Female',
    'Google US English',
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Microsoft Zira',
    'Samantha',
    'Karen',
    'Daniel',
    'Google Swahili',
    'Microsoft Swahili'
  ];
  for (const wanted of preferNames){
    const hit = voices.find(v => (v.name||'').toLowerCase() === wanted.toLowerCase());
    if (hit) return hit;
  }
  for (const wanted of preferNames){
    const w = wanted.toLowerCase();
    const hit = voices.find(v => (v.name||'').toLowerCase().includes(w));
    if (hit) return hit;
  }
  const english = voices.filter(v => /^en(-|_|$)/i.test(v.lang||''));
  const female  = english.find(v => /female|zira|samantha|aria|jenny|hazel/i.test(v.name||''));
  if (female)  return female;
  if (english.length) return english[0];
  const sysDefault = voices.find(v => v.default);
  if (sysDefault) return sysDefault;
  return voices[0];
}

function populateVoices(){
  const sel = $('voiceSelect');
  if (!sel) return;
  if (!('speechSynthesis' in window)){
    sel.innerHTML = '<option value="">(speechSynthesis unavailable)</option>';
    return;
  }
  const voices = speechSynthesis.getVoices() || [];
  if (!voices.length){
    sel.innerHTML = '<option value="">(loading…)</option>';
    return;
  }
  const byLang = {};
  voices.forEach(v=>{
    const lang = v.lang || 'und';
    byLang[lang] = byLang[lang] || [];
    byLang[lang].push(v);
  });
  let html = '<option value="">— browser default —</option>';
  Object.keys(byLang).sort().forEach(lang=>{
    html += '<optgroup label="' + lang + '">';
    byLang[lang].forEach(v=>{
      html += '<option value="' + v.voiceURI.replace(/"/g,'&quot;') + '">' +
              (v.name || v.voiceURI) + (v.default ? ' (default)' : '') + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;

  const prefs = VoicePrefs.get();
  // Set the select to the persisted voice if it exists in the new list
  if (prefs.browserVoiceURI && voices.some(v => v.voiceURI === prefs.browserVoiceURI)){
    sel.value = prefs.browserVoiceURI;
  } else {
    const preferred = pickDefaultBrowserVoice(voices);
    if (preferred){
      prefs.browserVoiceURI = preferred.voiceURI;
      VoicePrefs.set({ browserVoiceURI: preferred.voiceURI });
      sel.value = preferred.voiceURI;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPEN / CLOSE
   ═══════════════════════════════════════════════════════════════════════════ */
function updateReadBtn(){
  readBtn.classList.toggle('on', state.readAloud);
  readBtn.classList.toggle('off', !state.readAloud);
  readBtn.textContent = state.readAloud ? '🔊' : '🔇';
  readBtn.setAttribute('aria-pressed', state.readAloud ? 'true' : 'false');
  readBtn.title = state.readAloud ? 'Read aloud ON — click to mute' : 'Read aloud OFF — click to enable';
}
function updateInputHint(){
  const len = (input.value || '').length;
  inputHint.textContent = len + ' / ' + CONFIG.MAX_MESSAGE_LEN;
  inputHint.classList.toggle('on', len > CONFIG.MAX_MESSAGE_LEN * 0.8);
}
function open(){
  state.isOpen = true;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden','false');
  assistant.classList.add('hidden');
  // Auto-arm the mic when VAD is on so the user can just speak
  if (FEATURES.vad && state.vadEnabled && !state.isListening && !state.isBusy){
    setTimeout(()=>{ if (state.isOpen && !state.isListening) startListening(); }, 400);
  }
  setTimeout(()=>{ if (window.matchMedia('(min-width: 769px)').matches) input.focus(); }, 300);
}
function close(){
  state.isOpen = false;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden','true');
  assistant.classList.remove('hidden');
  stopSpeaking();
  if (state.isListening) stopListening();
}
function toggle(){ state.isOpen ? close() : open(); }

function bounceMini(){
  if (!miniAvatar || prefersReducedMotion()) return;
  miniAvatar.classList.remove('bouncing');
  void miniAvatar.offsetWidth;
  miniAvatar.classList.add('bouncing');
  setTimeout(()=> miniAvatar.classList.remove('bouncing'), 650);
}

/* ═══════════════════════════════════════════════════════════════════════════
   WIRE UP
   ═══════════════════════════════════════════════════════════════════════════ */
miniAvatar.addEventListener('click', ()=>{ bounceMini(); toggle(); });
let _miniHoverShown = false;
miniAvatar.addEventListener('mouseenter', ()=>{
  if (_miniHoverShown) return;
  _miniHoverShown = true;
  sayBubble('Hi! Tap me to chat.');
});
miniAvatar.addEventListener('mouseleave', ()=> setTimeout(()=>bubble.classList.remove('show'), 1300));

bigAvatar.addEventListener('click', ()=>{ AvatarRenderer.bounce(); });
bigAvatar.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); AvatarRenderer.bounce(); }
});
bigAvatar.setAttribute('tabindex','0');
bigAvatar.setAttribute('role','button');
bigAvatar.setAttribute('aria-label','VIORA avatar — tap to bounce');

sendBtn.addEventListener('click', ()=>{ AvatarRenderer.bounce(); sendMessage(); });
input.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); sendMessage(); }
});
input.addEventListener('input', ()=>{
  // If the assistant is speaking and the user starts typing, stop TTS.
  if (state.isSpeaking && FEATURES.bargeIn) stopSpeaking();
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  updateInputHint();
});

micBtn.addEventListener('click', ()=>{
  AvatarRenderer.bounce();
  if (state.isListening){
    stopListening();
  } else {
    if (state.isSpeaking && FEATURES.bargeIn) stopSpeaking();
    startListening();
  }
});

readBtn.addEventListener('click', ()=>{
  AvatarRenderer.bounce();
  state.readAloud = !state.readAloud;
  if (!state.readAloud) stopSpeaking();
  $('setSpeak').checked = state.readAloud;
  updateReadBtn();
  persistA11y();
});

$('footerChips').addEventListener('click', (e)=>{
  const btn = e.target.closest('.va-chip');
  if (!btn) return;

  AvatarRenderer.bounce();

  // Control chips — never send them to the AI
  if (btn.id === 'signChip'){
    e.preventDefault();
    signBox.classList.toggle('on');
    $('setSign').checked = signBox.classList.contains('on');
    persistA11y();
    return;
  }
  if (btn.id === 'exportChip'){
    e.preventDefault();
    exportTranscript();
    return;
  }
  if (btn.dataset.action === 'close'){
    e.preventDefault();
    close();
    return;
  }

  // Suggestion / question chips
  const q = btn.dataset.q;
  if (!q) return;
  e.preventDefault();
  input.value = q;
  updateInputHint();
  sendMessage();
});

stopBtn.addEventListener('click', stopSpeaking);
$('closeBtn').addEventListener('click', close);
$('newSessionBtn').addEventListener('click', newSession);
$('settingsBtn').addEventListener('click', ()=>{
  const s = $('settings');
  s.classList.toggle('on');
  if (s.classList.contains('on')) s.scrollTop = 0;
});
$('settingsBack').addEventListener('click', ()=> $('settings').classList.remove('on'));

let _shortcutsTimer = null;
$('shortcutsBtn').addEventListener('click', ()=>{
  const box = $('shortcutsBox');
  box.classList.toggle('on');
  clearTimeout(_shortcutsTimer);
  if (box.classList.contains('on')){
    _shortcutsTimer = setTimeout(()=> box.classList.remove('on'), 12000);
  }
});

$('setMotion').addEventListener('change',   e=>{ document.body.classList.toggle('va-reduced-motion', e.target.checked); persistA11y(); });
$('setContrast').addEventListener('change', e=>{ document.body.classList.toggle('va-high-contrast', e.target.checked); persistA11y(); });
$('setLarge').addEventListener('change',    e=>{ document.body.classList.toggle('va-large-text', e.target.checked); persistA11y(); });
$('setSign').addEventListener('change',     e=>{ signBox.classList.toggle('on', e.target.checked); showSign('hello'); persistA11y(); });
$('setSpeak').addEventListener('change',    e=>{ state.readAloud = e.target.checked; if (!state.readAloud) stopSpeaking(); updateReadBtn(); persistA11y(); });
$('setCaptions').addEventListener('change', e=>{ state.captions = e.target.checked; captionsEl.classList.toggle('on', e.target.checked); persistA11y(); });
$('setVerbose').addEventListener('change',  e=>{ state.verbose = e.target.checked; persistA11y(); });
$('setVAD').addEventListener('change',      e=>{ state.vadEnabled = e.target.checked; persistA11y(); });
$('setWake').addEventListener('change',     e=>{
  state.wakeEnabled = e.target.checked;
  if (state.wakeEnabled) startWakeWord(); else stopWakeWord();
  persistA11y();
});

$('voiceSelect').addEventListener('change', e=>{ VoicePrefs.set({ browserVoiceURI: e.target.value }); });
$('serverVoice').addEventListener('input', e=>{
  const v = (e.target.value || '').trim();
  VoicePrefs.set({ serverVoice: v || CONFIG.TTS_VOICE_DEFAULT });
});
$('pitch').addEventListener('input', e=>{
  const v = parseFloat(e.target.value);
  $('pitchVal').textContent = v.toFixed(2);
  VoicePrefs.set({ pitch: v });
});
$('rate').addEventListener('input', e=>{
  const v = parseFloat(e.target.value);
  $('rateVal').textContent = v.toFixed(2);
  VoicePrefs.set({ rate: v });
});

function hydrateVoiceUI(){
  const p = VoicePrefs.get();
  const sel = $('voiceSelect');
  if (sel && p.browserVoiceURI) sel.value = p.browserVoiceURI;
  const sv = $('serverVoice');
  if (sv) sv.value = p.serverVoice || '';
  $('pitch').value = p.pitch;
  $('pitchVal').textContent = Number(p.pitch).toFixed(2);
  $('rate').value = p.rate;
  $('rateVal').textContent = Number(p.rate).toFixed(2);
}

/* ── Keyboard shortcuts ────────────────────────────────────────────── */
let pttActive = false;
document.addEventListener('keydown', (e)=>{
  // 1. Overlay-aware Escape
  if (e.key === 'Escape'){
    const settings = $('settings');
    const shortcuts = $('shortcutsBox');
    if (settings.classList.contains('on')){ settings.classList.remove('on'); return; }
    if (shortcuts.classList.contains('on')){ shortcuts.classList.remove('on'); return; }
    // If another modal (lead form, blueprint, video) is open on the page,
    // let that modal handle its own Escape — don't close the chatbot.
    const modalOpen = document.querySelector('.modal-backdrop.open');
    if (modalOpen) return;
    if (state.isOpen) close();
    return;
  }
  // 2. Open with F6
  if (e.key === 'F6'){ e.preventDefault(); open(); return; }
  // 3. Push-to-talk with Space (hold) — only when not typing in a field
  const tag = (e.target && e.target.tagName) || '';
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
  if (e.code === 'Space' && !e.repeat && !isTyping && state.isOpen && !pttActive){
    e.preventDefault();
    pttActive = true;
    if (state.isSpeaking && FEATURES.bargeIn) stopSpeaking();
    if (!state.isListening) startListening();
  }
});
document.addEventListener('keyup', (e)=>{
  if (e.code === 'Space' && pttActive){
    pttActive = false;
    if (state.isListening) stopListening();
  }
});

guardLogo(miniLogo);
guardLogo(bigLogo);

const assistantApi = {
  open, close, toggle,
  ask(q){ input.value = q; updateInputHint(); sendMessage(); },
  setVisemeProvider(fn){ state.visemeProvider = fn; },
  setVoice(v){ VoicePrefs.set({ serverVoice: v }); const el = $('serverVoice'); if (el) el.value = v; },
  setBrowserVoice(uri){ VoicePrefs.set({ browserVoiceURI: uri }); const el = $('voiceSelect'); if (el) el.value = uri; },
  getVoicePrefs(){ return VoicePrefs.get(); },
  stopSpeaking,
  captions(on){ state.captions = !!on; captionsEl.classList.toggle('on', !!on); $('setCaptions').checked = !!on; persistA11y(); },
  transcript: ()=> chat.textContent,
  newSession,
  setTool: (name, fn)=>{ window[name] = fn; },
  bounce: ()=>{ AvatarRenderer.bounce(); bounceMini(); },
  settings(){ $('settings').classList.toggle('on'); },
  micOn(){ state.micArmed = true; updateMicUI(); if (!state.isListening) startListening(); },
  micOff(){ state.micArmed = false; if (state.isListening) stopListening(); updateMicUI(); },
  pushToTalkOn(){ if (!state.isListening) startListening(); },
  pushToTalkOff(){ if (state.isListening) stopListening(); },
  _state: state,
  _config: CONFIG,
  _features: FEATURES
};

// Keep the assistant API separate from the VIORA systems application namespace.
window.VioraAssistant = assistantApi;
if (!/\/main\.html$/i.test(location.pathname) && typeof window.Viora === "undefined") {
  window.Viora = assistantApi; // Backward compatibility for the public website widget.
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════════════ */
async function boot(){
  try {
    await loadExternalKB();

    restoreA11y();
    hydrateVoiceUI();
    updateReadBtn();
    updateMicUI();
    updateInputHint();

    // Restore the previous conversation if one exists — otherwise greet.
    const restored = restoreChatHistory();
    if (!restored){
      chat.innerHTML = '';
      state.history = [];
      seedGreeting();
    }

    populateVoices();
    if ('speechSynthesis' in window){
      speechSynthesis.onvoiceschanged = populateVoices;
      setTimeout(populateVoices, 250);
      setTimeout(populateVoices, 1200);
    }

    // Re-apply the persisted voice after each population pass
    const p = VoicePrefs.get();
    if (p.browserVoiceURI){
      const sel = $('voiceSelect');
      if (sel) sel.value = p.browserVoiceURI;
    }

    // Start wake-word listening if enabled
    if (state.wakeEnabled) startWakeWord();

    setTimeout(()=>{ if (!state.isOpen) sayBubble("Hi! I'm VIORA — tap me anytime."); }, 1400);
  } catch(e){
    console.error('[VIORA] boot failed:', e);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot().catch(console.error); });
else boot().catch(console.error);

})();
