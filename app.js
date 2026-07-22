// ============================================
// Duo — Private two-person chat
// ============================================

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let CURRENT_USER = localStorage.getItem('duti_user') || null; // 'a' or 'b'
let PARTNER_USER = null;
let editingMsgId = null;

const roomRef = () => db.ref(`rooms/${CHAT_ROOM_ID}`);
const messagesRef = () => roomRef().child('messages');
const presenceRef = (who) => roomRef().child(`presence/${who}`);
const typingRef = (who) => roomRef().child(`typing/${who}`);

// ---------- Falling rose petals + hearts background ----------
function initPetals(){
  const canvas = document.getElementById('stars'); // kept original id, just draws petals now
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  const COUNT = 42;

  function makeParticle(spawnAnywhereY){
    const isHeart = Math.random() < 0.28;
    return {
      type: isHeart ? 'heart' : 'petal',
      x: Math.random()*w,
      y: spawnAnywhereY ? Math.random()*h : -20 - Math.random()*60,
      size: isHeart ? (6 + Math.random()*6) : (7 + Math.random()*7),
      speed: 0.35 + Math.random()*0.55,
      sway: 0.6 + Math.random()*1.2,
      swayFreq: 0.0006 + Math.random()*0.0008,
      phase: Math.random()*Math.PI*2,
      rot: Math.random()*Math.PI*2,
      rotSpeed: (Math.random()-0.5) * 0.01,
      opacity: 0.45 + Math.random()*0.4
    };
  }

  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    particles = Array.from({length: COUNT}, () => makeParticle(true));
  }

  function drawPetal(p){
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;
    const s = p.size;
    const grad = ctx.createLinearGradient(-s, -s, s, s);
    grad.addColorStop(0, 'rgba(255,158,181,0.95)');
    grad.addColorStop(1, 'rgba(196,42,90,0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s*0.85, -s*0.35, s*0.6, s*0.75, 0, s);
    ctx.bezierCurveTo(-s*0.6, s*0.75, -s*0.85, -s*0.35, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  function drawHeart(p){
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;
    const s = p.size;
    ctx.fillStyle = 'rgba(255,99,138,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, s*0.35);
    ctx.bezierCurveTo(s, -s*0.55, s*0.5, -s*1.25, 0, -s*0.45);
    ctx.bezierCurveTo(-s*0.5, -s*1.25, -s, -s*0.55, 0, s*0.35);
    ctx.fill();
    ctx.restore();
  }

  function draw(t){
    ctx.clearRect(0,0,w,h);
    for(const p of particles){
      p.y += p.speed;
      p.x += Math.sin(t*p.swayFreq + p.phase) * p.sway * 0.05;
      p.rot += p.rotSpeed;
      if(p.y - p.size > h){
        Object.assign(p, makeParticle(false));
      }
      if(p.type === 'heart') drawHeart(p); else drawPetal(p);
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
}
initPetals();

// ---------- Lock screen ----------
const whoBtns = document.querySelectorAll('.who-btn');
const pinInput = document.getElementById('pinInput');
const enterBtn = document.getElementById('enterBtn');
const lockError = document.getElementById('lockError');
let selectedWho = null;

document.querySelector('[data-who="a"]').textContent = CHAT_USERS.a.name;
document.querySelector('[data-who="b"]').textContent = CHAT_USERS.b.name;

whoBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    whoBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedWho = btn.dataset.who;
    lockError.textContent = '';
    checkEnterEnabled();
  });
});
pinInput.addEventListener('input', checkEnterEnabled);
function checkEnterEnabled(){
  enterBtn.disabled = !(selectedWho && pinInput.value.length > 0);
}
enterBtn.addEventListener('click', () => {
  const user = CHAT_USERS[selectedWho];
  if(!user || pinInput.value !== user.pin){
    lockError.textContent = "That PIN doesn't match, try again.";
    return;
  }
  CURRENT_USER = selectedWho;
  localStorage.setItem('duti_user', CURRENT_USER);
  enterChat();
});

// ---------- Enter chat ----------
function enterChat(){
  PARTNER_USER = CURRENT_USER === 'a' ? 'b' : 'a';
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.remove('hidden');

  const p = CHAT_USERS[PARTNER_USER];
  document.getElementById('partnerName').textContent = p.name;
  const avatarEl = document.getElementById('partnerAvatar');
  if(p.avatar){
    avatarEl.style.backgroundImage = `url(${p.avatar})`;
    avatarEl.textContent = '';
  } else {
    avatarEl.textContent = p.name.charAt(0).toUpperCase();
  }

  setupPresence();
  listenPresence();
  listenTyping();
  listenMessages();
}

// Auto-resume if already logged in on this device
if(CURRENT_USER && CHAT_USERS[CURRENT_USER]){
  enterChat();
}

// ---------- Presence ----------
function setupPresence(){
  const myPresence = presenceRef(CURRENT_USER);
  const connectedRef = db.ref('.info/connected');
  connectedRef.on('value', (snap) => {
    if(snap.val() === true){
      myPresence.onDisconnect().set({ online:false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      myPresence.set({ online:true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
  });
}
function listenPresence(){
  presenceRef(PARTNER_USER).on('value', (snap) => {
    const val = snap.val();
    const statusEl = document.getElementById('partnerStatus');
    const dotEl = document.getElementById('onlineDot');
    if(val && val.online){
      statusEl.textContent = 'Online';
      statusEl.classList.add('online');
      dotEl.classList.add('online');
    } else {
      statusEl.classList.remove('online');
      statusEl.textContent = val && val.lastSeen ? `Last seen ${timeAgo(val.lastSeen)}` : 'Offline';
      dotEl.classList.remove('online');
    }
  });
}

// ---------- Typing ----------
const textInput = document.getElementById('textInput');
let typingTimeout;
textInput.addEventListener('input', () => {
  autoGrow();
  typingRef(CURRENT_USER).set({ typing:true, ts: firebase.database.ServerValue.TIMESTAMP });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingRef(CURRENT_USER).set({ typing:false, ts: firebase.database.ServerValue.TIMESTAMP });
  }, 1500);
});
function autoGrow(){
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 110) + 'px';
}
function listenTyping(){
  typingRef(PARTNER_USER).on('value', (snap) => {
    const val = snap.val();
    const row = document.getElementById('typingRow');
    if(val && val.typing && (Date.now() - val.ts) < 4000){
      row.classList.remove('hidden');
      scrollToBottom();
    } else {
      row.classList.add('hidden');
    }
  });
}

// ---------- Messages ----------
const messagesEl = document.getElementById('messages');
let renderedIds = new Set();

function listenMessages(){
  messagesRef().orderByChild('ts').on('child_added', (snap) => {
    renderMessage(snap.key, snap.val());
    scrollToBottom();
  });
  messagesRef().on('child_changed', (snap) => {
    updateMessageEl(snap.key, snap.val());
  });
  messagesRef().on('child_removed', (snap) => {
    const el = document.getElementById('m_' + snap.key);
    if(el) el.remove();
  });
}

let lastDay = null;
function renderMessage(id, msg){
  if(renderedIds.has(id)) return;
  renderedIds.add(id);

  const day = new Date(msg.ts).toDateString();
  if(day !== lastDay){
    lastDay = day;
    const div = document.createElement('div');
    div.className = 'day-divider';
    div.textContent = formatDay(msg.ts);
    messagesEl.appendChild(div);
  }

  const mine = msg.sender === CURRENT_USER;
  const row = document.createElement('div');
  row.className = `msg-row ${mine ? 'mine' : 'theirs'}`;
  row.id = 'm_' + id;

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (msg.type !== 'text' ? ' media' : '');

  if(msg.type === 'image'){
    const img = document.createElement('img');
    img.src = msg.mediaUrl;
    img.addEventListener('click', () => openLightbox('image', msg.mediaUrl));
    bubble.appendChild(img);
  } else if(msg.type === 'video'){
    const vid = document.createElement('video');
    vid.src = msg.mediaUrl;
    vid.muted = true; vid.playsInline = true;
    vid.addEventListener('click', () => openLightbox('video', msg.mediaUrl));
    bubble.appendChild(vid);
  } else {
    bubble.textContent = msg.text || '';
  }
  row.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.innerHTML = `<span class="time">${formatTime(msg.ts)}</span>` + (msg.edited ? ' <span class="edited-tag">edited</span>' : '');
  row.appendChild(meta);

  if(mine && msg.type === 'text'){
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `<button class="edit-a">Edit</button><button class="del-a">Delete</button>`;
    actions.querySelector('.edit-a').addEventListener('click', () => startEdit(id, msg.text));
    actions.querySelector('.del-a').addEventListener('click', () => deleteMessage(id));
    row.appendChild(actions);
    row.addEventListener('click', (e) => {
      if(e.target.tagName === 'BUTTON') return;
      row.classList.toggle('show-actions');
    });
  }

  messagesEl.appendChild(row);
}

function updateMessageEl(id, msg){
  const row = document.getElementById('m_' + id);
  if(!row) return;
  const bubble = row.querySelector('.bubble');
  if(bubble && msg.type === 'text') bubble.textContent = msg.text || '';
  const meta = row.querySelector('.meta-row');
  if(meta){
    meta.innerHTML = `<span class="time">${formatTime(msg.ts)}</span>` + (msg.edited ? ' <span class="edited-tag">edited</span>' : '');
  }
}

function scrollToBottom(){
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Send ----------
const sendBtn = document.getElementById('sendBtn');
sendBtn.addEventListener('click', sendText);
textInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendText();
  }
});

function sendText(){
  const text = textInput.value.trim();
  if(!text) return;

  if(editingMsgId){
    messagesRef().child(editingMsgId).update({ text, edited: true });
    cancelEditMode();
    textInput.value = '';
    autoGrow();
    return;
  }

  messagesRef().push({
    sender: CURRENT_USER,
    type: 'text',
    text,
    ts: firebase.database.ServerValue.TIMESTAMP,
    edited: false
  });
  textInput.value = '';
  autoGrow();
  typingRef(CURRENT_USER).set({ typing:false, ts: firebase.database.ServerValue.TIMESTAMP });
}

function startEdit(id, currentText){
  editingMsgId = id;
  textInput.value = currentText;
  textInput.focus();
  autoGrow();
  document.getElementById('editBanner').classList.remove('hidden');
}
function cancelEditMode(){
  editingMsgId = null;
  document.getElementById('editBanner').classList.add('hidden');
}
document.getElementById('cancelEdit').addEventListener('click', () => {
  cancelEditMode();
  textInput.value = '';
  autoGrow();
});

function deleteMessage(id){
  if(confirm('Delete this message?')){
    messagesRef().child(id).remove();
  }
}

// ---------- Media upload (Cloudinary) ----------
const mediaInput = document.getElementById('mediaInput');
document.getElementById('attachBtn').addEventListener('click', () => mediaInput.click());

mediaInput.addEventListener('change', async () => {
  const file = mediaInput.files[0];
  if(!file) return;
  const isVideo = file.type.startsWith('video');
  const progressWrap = document.getElementById('uploadProgress');
  const fill = document.getElementById('uploadFill');
  const label = document.getElementById('uploadLabel');
  progressWrap.classList.remove('hidden');
  label.textContent = isVideo ? 'Uploading video...' : 'Uploading photo...';

  try{
    const url = await uploadToCloudinary(file, isVideo, (pct) => { fill.style.width = pct + '%'; });
    messagesRef().push({
      sender: CURRENT_USER,
      type: isVideo ? 'video' : 'image',
      mediaUrl: url,
      ts: firebase.database.ServerValue.TIMESTAMP,
      edited: false
    });
  } catch(err){
    alert('Upload failed: ' + err.message);
    console.error(err);
  } finally {
    progressWrap.classList.add('hidden');
    fill.style.width = '0%';
    mediaInput.value = '';
  }
});

function uploadToCloudinary(file, isVideo, onProgress){
  return new Promise((resolve, reject) => {
    const resourceType = isVideo ? 'video' : 'image';
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if(e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if(xhr.status >= 200 && xhr.status < 300){
        const res = JSON.parse(xhr.responseText);
        resolve(res.secure_url);
      } else {
        let msg = 'HTTP ' + xhr.status;
        try{ msg = JSON.parse(xhr.responseText).error.message; } catch(e){}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error — could not reach Cloudinary'));
    xhr.send(formData);
  });
}

// ---------- Lightbox ----------
function openLightbox(type, url){
  const content = document.getElementById('lightboxContent');
  content.innerHTML = '';
  if(type === 'image'){
    const img = document.createElement('img');
    img.src = url;
    content.appendChild(img);
  } else {
    const vid = document.createElement('video');
    vid.src = url; vid.controls = true; vid.autoplay = true; vid.playsInline = true;
    content.appendChild(vid);
  }
  document.getElementById('lightbox').classList.remove('hidden');
}
document.getElementById('closeLightbox').addEventListener('click', () => {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightboxContent').innerHTML = '';
});

// ---------- Logout ----------
document.getElementById('logoutBtn').addEventListener('click', () => {
  if(confirm('Log out?')){
    presenceRef(CURRENT_USER).set({ online:false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    localStorage.removeItem('duti_user');
    location.reload();
  }
});

// ---------- Helpers ----------
function formatTime(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function formatDay(ts){
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate()-1);
  if(d.toDateString() === today.toDateString()) return 'Today';
  if(d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric' });
}
function timeAgo(ts){
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if(diffMin < 1) return 'just now';
  if(diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin/60);
  if(diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr/24)} days ago`;
}

// ---------- PWA: installable app ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if(installBtn) installBtn.classList.remove('hidden');
});

if(installBtn){
  installBtn.addEventListener('click', async () => {
    if(!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });
}

window.addEventListener('appinstalled', () => {
  if(installBtn) installBtn.classList.add('hidden');
});
    
