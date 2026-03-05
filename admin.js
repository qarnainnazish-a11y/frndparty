import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getDatabase,
  ref,
  onValue
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const adminRoomIdInput = document.getElementById('adminRoomId');
const adminJoinBtn = document.getElementById('adminJoinRoom');
const adminStatus = document.getElementById('adminStatus');
const roomStateView = document.getElementById('roomStateView');
const roomsList = document.getElementById('roomsList');

let currentAdminRoom = null;

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function watchRoom(roomId) {
  const roomRef = ref(db, `rooms/${roomId}`);
  onValue(roomRef, (snap) => {
    const data = snap.val() || {};
    roomStateView.textContent = pretty(data);
  });
}

function watchAllRooms() {
  const rootRef = ref(db, 'rooms');
  onValue(rootRef, (snap) => {
    const data = snap.val() || {};
    roomsList.innerHTML = '';

    const ids = Object.keys(data);
    if (!ids.length) {
      roomsList.innerHTML = '<li style="opacity:0.7;">No rooms yet</li>';
      return;
    }

    ids.forEach((roomId) => {
      const li = document.createElement('li');
      li.style.marginBottom = '4px';

      const btn = document.createElement('button');
      btn.textContent = `Watch ${roomId}`;
      btn.style.padding = '4px 8px';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '999px';
      btn.style.border = '1px solid #334155';
      btn.style.background = '#020617';
      btn.style.color = '#e5e7eb';
      btn.style.cursor = 'pointer';

      btn.addEventListener('click', () => {
        adminRoomIdInput.value = roomId;
        adminJoinBtn.click();
      });

      const span = document.createElement('span');
      const hasVideo = data[roomId]?.videoId ? 'yes' : 'no';
      const camCount = data[roomId]?.participants
        ? Object.values(data[roomId].participants).filter((p) => p.cameraOn).length
        : 0;

      span.textContent = `  (video: ${hasVideo}, cameras on: ${camCount})`;
      span.style.opacity = '0.7';
      span.style.fontSize = '12px';

      li.appendChild(btn);
      li.appendChild(span);
      roomsList.appendChild(li);
    });
  });
}

adminJoinBtn.addEventListener('click', () => {
  const roomId = adminRoomIdInput.value.trim();
  if (!roomId) {
    adminStatus.textContent = 'Enter a Room ID first.';
    return;
  }
  currentAdminRoom = roomId;
  adminStatus.textContent = `Watching room: ${roomId}`;
  watchRoom(roomId);
});

const params = new URLSearchParams(window.location.search);
if (params.has('room')) {
  const r = params.get('room');
  adminRoomIdInput.value = r;
  adminJoinBtn.click();
}

watchAllRooms();
