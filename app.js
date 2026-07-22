// ============================================
// Duটি — Private two-person chat
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

// ---------- Star background ----------
function initStars(){
  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  let w, h, stars = [];
  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    stars = Array.from({length: 90}, () => ({
      x: Math.random()*w, y: Math.random()*h,
      r: Math.random()*1.3 + 0.3,
      s: Math.random()*0.02 + 0.005,
      phase: Math.random()*Math.PI*2
    }));
  }
  function draw(t){
    ctx.clearRect(0,0,w,h);
    for(const st of stars){
      const alpha = 0.35 + 0.5*Math.abs(Math.sin(t*st.s + st.phase));
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(245,242,251,${alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
}
initStars();

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
    checkEnterEnabled();
  });
});
pinInput.addEventListener('input', checkEnterEnabled);
function checkEnterEnabled(){
  enterBtn.disabled = !(selectedWho && pinInput.value.length > 0);
}
enterBtn.addEventListener('click', () => {
  if(pinInput.value !== CHAT_PIN){
    lockError.textContent = 'পিন মিলছে না, আবার চেষ্টা করো।';
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
    if(val && val.online){
      statusEl.textContent = 'অনলাইন';
      statusEl.classList.add('online');
    } else {
      statusEl.classList.remove('online');
      statusEl.textContent = val && val.lastSeen ? `সর্বশেষ ${timeAgo(val.lastSeen)}` : 'অফলাইন';
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
    const txt = document.getElementById('typingText');
    if(val && val.typing && (Date.now() - val.ts) < 4000){
      txt.textContent = `${CHAT_USERS[PARTNER_USER].name} লিখছে...`;
      row.classList.remove('hidden');
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
  meta.innerHTML = `<span class="time">${formatTime(msg.ts)}</span>` + (msg.edited ? ' <span class="edited-tag">এডিট করা</span>' : '');
  row.appendChild(meta);

  if(mine && msg.type === 'text'){
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `<button class="edit-a">এডিট</button><button class="del-a">মুছে ফেলো</button>`;
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
    meta.innerHTML = `<span class="time">${formatTime(msg.ts)}</span>` + (msg.edited ? ' <span class="edited-tag">এডিট করা</span>' : '');
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
  if(confirm('এই মেসেজটা মুছে ফেলবে?')){
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
  label.textContent = isVideo ? 'ভিডিও আপলোড হচ্ছে...' : 'ছবি আপলোড হচ্ছে...';

  try{
    const url = await uploadToCloudinary(file, (pct) => { fill.style.width = pct + '%'; });
    messagesRef().push({
      sender: CURRENT_USER,
      type: isVideo ? 'video' : 'image',
      mediaUrl: url,
      ts: firebase.database.ServerValue.TIMESTAMP,
      edited: false
    });
  } catch(err){
    alert('আপলোড ব্যর্থ হয়েছে। Cloudinary সেটআপ (config.js) ঠিক আছে কিনা দেখো।');
    console.error(err);
  } finally {
    progressWrap.classList.add('hidden');
    fill.style.width = '0%';
    mediaInput.value = '';
  }
});

function uploadToCloudinary(file, onProgress){
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
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
        reject(new Error('Upload failed: ' + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
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
  if(confirm('লগ আউট করবে?')){
    presenceRef(CURRENT_USER).set({ online:false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    localStorage.removeItem('duti_user');
    location.reload();
  }
});

// ---------- Helpers ----------
function formatTime(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
}
function formatDay(ts){
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate()-1);
  if(d.toDateString() === today.toDateString()) return 'আজ';
  if(d.toDateString() === yest.toDateString()) return 'গতকাল';
  return d.toLocaleDateString('bn-BD', { day:'numeric', month:'long', year:'numeric' });
}
function timeAgo(ts){
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if(diffMin < 1) return 'এইমাত্র';
  if(diffMin < 60) return `${diffMin} মিনিট আগে`;
  const diffHr = Math.floor(diffMin/60);
  if(diffHr < 24) return `${diffHr} ঘণ্টা আগে`;
  return `${Math.floor(diffHr/24)} দিন আগে`;
}
