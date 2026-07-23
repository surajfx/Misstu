// ============================================
// Duo — Private two-person chat
// ============================================

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let CURRENT_USER = localStorage.getItem('duti_user') || null; // 'a' or 'b'
let PARTNER_USER = null;
let editingMsgId = null;
const sessionStartTs = Date.now() - 2000; // small buffer for server clock skew

const roomRef = () => db.ref(`rooms/${CHAT_ROOM_ID}`);
const messagesRef = () => roomRef().child('messages');
const presenceRef = (who) => roomRef().child(`presence/${who}`);
const typingRef = (who) => roomRef().child(`typing/${who}`);
const readsRef = (who) => roomRef().child(`reads/${who}`);
const pinnedRef = () => roomRef().child('pinned');

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
  listenReads();
  listenPinned();
  markAsRead();
  updateTogetherPill();

  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) markAsRead();
  });
  window.addEventListener('focus', markAsRead);
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
    const msg = snap.val();
    renderMessage(snap.key, msg);
    scrollToBottom();
    if(!document.hidden && msg.sender === PARTNER_USER) markAsRead();
    if(msg.ts && msg.ts >= sessionStartTs && msg.type === 'text'){
      checkForTriggerAnimation(msg.text);
    }
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
  if(mine) row.dataset.ts = msg.ts;

  const bubble = document.createElement('div');
  const isMedia = msg.type === 'image' || msg.type === 'video';
  bubble.className = 'bubble' + (isMedia ? ' media' : '');

  if(msg.type === 'image'){
    const img = document.createElement('img');
    img.src = msg.mediaUrl;
    bubble.appendChild(img);
    attachMediaTap(bubble, id, 'image', msg.mediaUrl);
  } else if(msg.type === 'video'){
    const vid = document.createElement('video');
    vid.src = msg.mediaUrl;
    vid.muted = true; vid.playsInline = true;
    bubble.appendChild(vid);
    attachMediaTap(bubble, id, 'video', msg.mediaUrl);
  } else if(msg.type === 'audio'){
    const wrap = document.createElement('div');
    wrap.className = 'voice-msg';
    wrap.innerHTML = `🎤 <audio controls src="${msg.mediaUrl}"></audio>`;
    bubble.appendChild(wrap);
  } else {
    bubble.innerHTML = linkify(msg.text || '');
  }
  row.appendChild(bubble);
  attachLongPress(bubble, () => openReactionPicker(bubble, id, msg));

  const chipsHost = document.createElement('div');
  chipsHost.className = 'reaction-chips-host';
  row.appendChild(chipsHost);

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.innerHTML = `<span class="time">${formatTime(msg.ts)}</span>` +
    (msg.edited ? ' <span class="edited-tag">edited</span>' : '') +
    (mine ? ` <span class="ticks">${tickSvg(false)}</span>` : '');
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
  if(mine) applyTickState(row, msg.ts);
  renderReactionChips(row, msg.reactions);
}

function updateMessageEl(id, msg){
  const row = document.getElementById('m_' + id);
  if(!row) return;
  const bubble = row.querySelector('.bubble');
  if(bubble && msg.type === 'text') bubble.innerHTML = linkify(msg.text || '');
  const mine = msg.sender === CURRENT_USER;
  const meta = row.querySelector('.meta-row');
  if(meta){
    meta.innerHTML = `<span class="time">${formatTime(msg.ts)}</span>` +
      (msg.edited ? ' <span class="edited-tag">edited</span>' : '') +
      (mine ? ` <span class="ticks">${tickSvg(false)}</span>` : '');
    if(mine) applyTickState(row, msg.ts);
  }
  renderReactionChips(row, msg.reactions);
}

// ---------- Long-press: reactions + pin ----------
function attachLongPress(el, onLongPress){
  let timer, longPressed = false;
  const start = () => {
    longPressed = false;
    timer = setTimeout(() => { longPressed = true; onLongPress(); }, 450);
  };
  const cancel = () => clearTimeout(timer);
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('click', (e) => {
    if(longPressed){ e.stopPropagation(); e.preventDefault(); longPressed = false; }
  }, true);
}

function openReactionPicker(anchorEl, id, msg){
  const picker = document.getElementById('reactionPicker');
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = Math.max(10, rect.top - 56) + 'px';
  let left = rect.left + rect.width/2 - 115;
  left = Math.max(8, Math.min(left, window.innerWidth - 238));
  picker.style.left = left + 'px';
  picker.classList.remove('hidden');

  picker.querySelectorAll('.react-emoji').forEach((el) => {
    el.onclick = () => { toggleReaction(id, el.dataset.emoji); closeReactionPicker(); };
  });
  document.getElementById('pickerPinBtn').onclick = () => { togglePin(id, msg); closeReactionPicker(); };

  setTimeout(() => document.addEventListener('click', outsidePickerClick), 0);
}
function outsidePickerClick(e){
  const picker = document.getElementById('reactionPicker');
  if(!picker.contains(e.target)) closeReactionPicker();
}
function closeReactionPicker(){
  document.getElementById('reactionPicker').classList.add('hidden');
  document.removeEventListener('click', outsidePickerClick);
}

// ---------- Reactions ----------
function toggleReaction(id, emoji){
  const ref = messagesRef().child(id).child('reactions').child(CURRENT_USER);
  ref.once('value').then((snap) => {
    if(snap.val() === emoji) ref.remove(); else ref.set(emoji);
  });
}

function renderReactionChips(row, reactions){
  const host = row.querySelector('.reaction-chips-host');
  if(!host) return;
  if(!reactions || Object.keys(reactions).length === 0){
    host.innerHTML = '';
    return;
  }
  const counts = {};
  Object.values(reactions).forEach((e) => { counts[e] = (counts[e] || 0) + 1; });
  host.innerHTML = `<div class="reaction-chips">` +
    Object.entries(counts).map(([emoji, count]) =>
      `<span class="reaction-chip">${emoji}${count > 1 ? `<span class="count">${count}</span>` : ''}</span>`
    ).join('') + `</div>`;
}

// ---------- Double-tap like on media ----------
function attachMediaTap(bubble, id, type, url){
  let lastTap = 0;
  bubble.addEventListener('click', () => {
    const now = Date.now();
    if(now - lastTap < 300){
      toggleReaction(id, '❤️');
      showHeartBurst(bubble);
      lastTap = 0;
    } else {
      lastTap = now;
      setTimeout(() => {
        if(Date.now() - lastTap >= 300) openLightbox(type, url);
      }, 300);
    }
  });
}
function showHeartBurst(bubble){
  const heart = document.createElement('div');
  heart.className = 'heart-burst';
  heart.textContent = '❤️';
  bubble.appendChild(heart);
  setTimeout(() => heart.remove(), 800);
}

// ---------- Pinned message ----------
function togglePin(id, msg){
  pinnedRef().once('value').then((snap) => {
    const current = snap.val();
    if(current && current.id === id){
      pinnedRef().remove();
    } else {
      const preview = msg.type === 'text' ? (msg.text || '')
        : msg.type === 'image' ? '📷 Photo'
        : msg.type === 'video' ? '🎥 Video'
        : '🎤 Voice message';
      pinnedRef().set({ id, preview, sender: msg.sender, ts: msg.ts });
    }
  });
}
function listenPinned(){
  pinnedRef().on('value', (snap) => {
    const val = snap.val();
    const banner = document.getElementById('pinnedBanner');
    const textEl = document.getElementById('pinnedText');
    if(val){
      const who = val.sender === CURRENT_USER ? 'You' : CHAT_USERS[PARTNER_USER].name;
      textEl.textContent = `${who}: ${val.preview}`;
      banner.classList.remove('hidden');
      banner.dataset.msgId = val.id;
    } else {
      banner.classList.add('hidden');
    }
  });
}
document.getElementById('pinnedBanner').addEventListener('click', (e) => {
  if(e.target.id === 'unpinBtn') return;
  const id = document.getElementById('pinnedBanner').dataset.msgId;
  const el = document.getElementById('m_' + id);
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('unpinBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  pinnedRef().remove();
});

// ---------- Gallery ----------
function openGallery(){
  document.getElementById('galleryScreen').classList.remove('hidden');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  grid.innerHTML = '';
  empty.classList.add('hidden');

  messagesRef().orderByChild('ts').once('value').then((snap) => {
    const items = [];
    snap.forEach((child) => {
      const m = child.val();
      if(m.type === 'image' || m.type === 'video') items.push(m);
    });
    if(items.length === 0){
      empty.classList.remove('hidden');
      return;
    }
    items.reverse().forEach((m) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb' + (m.type === 'video' ? ' is-video' : '');
      if(m.type === 'image'){
        const img = document.createElement('img');
        img.src = m.mediaUrl;
        thumb.appendChild(img);
      } else {
        const vid = document.createElement('video');
        vid.src = m.mediaUrl; vid.muted = true;
        thumb.appendChild(vid);
      }
      thumb.addEventListener('click', () => openLightbox(m.type, m.mediaUrl));
      grid.appendChild(thumb);
    });
  });
}
document.getElementById('galleryBtn').addEventListener('click', openGallery);
document.getElementById('closeGalleryBtn').addEventListener('click', () => {
  document.getElementById('galleryScreen').classList.add('hidden');
});

// ---------- Together-since day counter ----------
function updateTogetherPill(){
  if(typeof TOGETHER_SINCE_DATE === 'undefined') return;
  const start = new Date(TOGETHER_SINCE_DATE + 'T00:00:00');
  if(isNaN(start.getTime())) return;
  const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000);
  if(diffDays < 0) return;
  const pill = document.getElementById('togetherPill');
  pill.textContent = `💕 Day ${diffDays}`;
  pill.classList.remove('hidden');
}

// ---------- Clickable links ----------
function linkify(text){
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;
  return escaped.replace(urlRegex, (match) => {
    const href = match.startsWith('http') ? match : 'https://' + match;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

// ---------- Sent / Seen ticks ----------
let partnerLastReadTs = 0;

function tickSvg(seen){
  const color = seen ? '#5fc9ff' : 'currentColor';
  return `<svg class="tick-icon" viewBox="0 0 16 11" width="15" height="11" fill="none">
    <path d="M1 5.5L4.5 9L11 1.5" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${seen ? '<path d="M5 5.5L8.5 9L15 1.5" stroke="' + color + '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' : ''}
  </svg>`;
}

function applyTickState(row, ts){
  const tickEl = row.querySelector('.ticks');
  if(!tickEl) return;
  const seen = partnerLastReadTs && ts && partnerLastReadTs >= ts;
  tickEl.innerHTML = tickSvg(!!seen);
}

function refreshAllTicks(){
  document.querySelectorAll('.msg-row.mine').forEach((row) => {
    const ts = Number(row.dataset.ts);
    if(ts) applyTickState(row, ts);
  });
}

function markAsRead(){
  readsRef(CURRENT_USER).set(firebase.database.ServerValue.TIMESTAMP);
}

function listenReads(){
  readsRef(PARTNER_USER).on('value', (snap) => {
    partnerLastReadTs = snap.val() || 0;
    refreshAllTicks();
  });
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
    pinnedRef().once('value').then((snap) => {
      if(snap.val() && snap.val().id === id) pinnedRef().remove();
    });
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

// ---------- Voice messages ----------
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = 0;
let recordingTimerInterval = null;

document.getElementById('micBtn').addEventListener('click', startRecording);
document.getElementById('cancelRecording').addEventListener('click', cancelRecording);
document.getElementById('sendRecording').addEventListener('click', stopAndSendRecording);

async function startRecording(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder._stream = stream;
    mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start();
    recordingStartTime = Date.now();
    document.getElementById('recordingBar').classList.remove('hidden');
    document.querySelector('.composer').classList.add('hidden');
    recordingTimerInterval = setInterval(updateRecordingTime, 250);
  } catch(err){
    alert('Could not access the microphone: ' + err.message);
  }
}
function updateRecordingTime(){
  const secs = Math.floor((Date.now() - recordingStartTime) / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  document.getElementById('recordingTime').textContent = `${m}:${s.toString().padStart(2, '0')}`;
}
function stopRecordingUI(){
  clearInterval(recordingTimerInterval);
  if(mediaRecorder && mediaRecorder._stream) mediaRecorder._stream.getTracks().forEach((t) => t.stop());
  document.getElementById('recordingBar').classList.add('hidden');
  document.querySelector('.composer').classList.remove('hidden');
}
function cancelRecording(){
  if(mediaRecorder && mediaRecorder.state !== 'inactive'){
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  recordedChunks = [];
  stopRecordingUI();
}
function stopAndSendRecording(){
  if(!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.onstop = async () => {
    stopRecordingUI();
    if(recordedChunks.length === 0) return;
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

    const progressWrap = document.getElementById('uploadProgress');
    const fill = document.getElementById('uploadFill');
    const label = document.getElementById('uploadLabel');
    progressWrap.classList.remove('hidden');
    label.textContent = 'Sending voice message...';

    try{
      const url = await uploadToCloudinary(file, true, (pct) => { fill.style.width = pct + '%'; });
      messagesRef().push({
        sender: CURRENT_USER,
        type: 'audio',
        mediaUrl: url,
        ts: firebase.database.ServerValue.TIMESTAMP,
        edited: false
      });
    } catch(err){
      alert('Voice message failed to send: ' + err.message);
    } finally {
      progressWrap.classList.add('hidden');
      fill.style.width = '0%';
    }
  };
  mediaRecorder.stop();
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

// ---------- Special-moment animations ----------
function playEmojiBurst({ emojis, count = 24, duration = 3200, fontSizeRange = [24, 40], flashColor = null, centerEmoji = null, label = null }){
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  document.body.appendChild(layer);

  if(flashColor){
    layer.style.background = flashColor;
    layer.classList.add('fx-flash');
  }
  if(centerEmoji){
    const center = document.createElement('div');
    center.className = 'fx-center-emoji';
    center.textContent = centerEmoji;
    layer.appendChild(center);
  }
  if(label){
    const lbl = document.createElement('div');
    lbl.className = 'fx-label';
    lbl.textContent = label;
    layer.appendChild(lbl);
  }
  for(let i = 0; i < count; i++){
    const span = document.createElement('span');
    span.className = 'fx-piece';
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const size = fontSizeRange[0] + Math.random() * (fontSizeRange[1] - fontSizeRange[0]);
    span.style.fontSize = size + 'px';
    span.style.left = Math.random() * 100 + 'vw';
    span.style.animationDelay = (Math.random() * 0.6) + 's';
    span.style.animationDuration = (2.2 + Math.random() * 1.4) + 's';
    layer.appendChild(span);
  }
  setTimeout(() => layer.remove(), duration);
}

function playRoseBurst(){
  playEmojiBurst({
    emojis: ['🌹', '❤️', '💗'],
    count: 30, duration: 3400, fontSizeRange: [24, 40],
    label: '❤️ I love you too ❤️'
  });
}
function playGoodNight(){
  playEmojiBurst({
    emojis: ['⭐', '✨', '🌙'],
    count: 20, duration: 3600, fontSizeRange: [15, 26],
    flashColor: 'radial-gradient(ellipse at 50% 100%, rgba(60,40,110,0.55), rgba(10,6,20,0.7))',
    centerEmoji: '🌙',
    label: 'Good night 🌙'
  });
}
function playGoodMorning(){
  playEmojiBurst({
    emojis: ['✨', '🌸', '🐦'],
    count: 18, duration: 3400, fontSizeRange: [15, 24],
    flashColor: 'radial-gradient(ellipse at 50% 0%, rgba(255,190,120,0.5), rgba(255,140,90,0.12))',
    centerEmoji: '🌞',
    label: 'Good morning ☀️'
  });
}
function playMissYou(){
  playEmojiBurst({
    emojis: ['❤️', '💌', '🥺'],
    count: 20, duration: 3200, fontSizeRange: [20, 32],
    label: 'Missing you too 💌'
  });
}
function playBirthday(){
  playEmojiBurst({
    emojis: ['🎉', '🎂', '✨', '🎈'],
    count: 34, duration: 3600, fontSizeRange: [18, 30],
    label: '🎉 Happy Birthday! 🎉'
  });
}
function playCongrats(){
  playEmojiBurst({
    emojis: ['🎉', '👏', '✨', '🥳'],
    count: 26, duration: 3200, fontSizeRange: [18, 30],
    label: '🎉 Congratulations! 🎉'
  });
}

function checkForTriggerAnimation(text){
  if(!text) return;
  const t = text.toLowerCase();
  if(/i\s*love\s*you|love\s*(u|you)\b|ভালোবাসি/.test(t)) playRoseBurst();
  else if(/good\s*ni?ght|goodnight/.test(t)) playGoodNight();
  else if(/good\s*morning|goodmorning/.test(t)) playGoodMorning();
  else if(/miss\s*(u|you)\b/.test(t)) playMissYou();
  else if(/happy\s*birthday/.test(t)) playBirthday();
  else if(/congrat/.test(t)) playCongrats();
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
});

if(installBtn){
  installBtn.addEventListener('click', async () => {
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    // Prompt not available yet (already installed, or browser needs manual steps)
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if(isIOS){
      alert('To install: tap the Share button, then "Add to Home Screen".');
    } else {
      alert('To install: open the browser menu (⋮) and tap "Install app" or "Add to Home screen".');
    }
  });
}
