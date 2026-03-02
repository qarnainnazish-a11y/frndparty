import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getDatabase, ref, onValue, set, onDisconnect } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentRoomId = null;
let videoPlayer = null;
let isPlaying = false;
let currentTime = 0;
let videoId = null;

const elements = {
    roomId: document.getElementById('roomId'),
    createRoom: document.getElementById('createRoom'),
    joinRoom: document.getElementById('joinRoom'),
    roomControls: document.getElementById('roomControls'),
    videoPlayer: document.getElementById('videoPlayer'),
    videoUrl: document.getElementById('videoUrl'),
    loadVideo: document.getElementById('loadVideo'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    roomStatus: document.getElementById('roomStatus'),
    viewerCount: document.getElementById('viewerCount'),
    errorMsg: document.getElementById('errorMsg')
};

function showError(msg) {
    elements.errorMsg.textContent = msg;
    elements.errorMsg.classList.remove('hidden');
    setTimeout(() => elements.errorMsg.classList.add('hidden'), 5000);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseVideoUrl(url) {
    const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const ytMatch = url.match(ytRegex);
    if (ytMatch) return { type: 'youtube', id: ytMatch[1] };

    const driveRegex = /\/file\/d\/([a-zA-Z0-9-_]+)/;
    const driveMatch = url.match(driveRegex);
    if (driveMatch) {
        const fileId = driveMatch[1];
        return { type: 'drive', id: fileId };
    }

    if (url.match(/\.(mp4|webm|ogg)$/i)) {
        return { type: 'direct', id: url };
    }

    return null;
}

function createVideoPlayer(type, id) {
    elements.videoPlayer.innerHTML = '';
    
    if (type === 'youtube') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&controls=1&modestbranding=1`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        elements.videoPlayer.appendChild(iframe);
        videoPlayer = iframe;
    } else if (type === 'drive') {
        const iframe = document.createElement('iframe');
        iframe.src = `https://drive.google.com/file/d/${id}/preview`;
        iframe.allow = 'autoplay';
        iframe.allowFullscreen = true;
        elements.videoPlayer.appendChild(iframe);
        videoPlayer = iframe;
    } else if (type === 'direct') {
        const video = document.createElement('video');
        video.src = id;
        video.controls = true;
        video.autoplay = false;
        elements.videoPlayer.appendChild(video);
        videoPlayer = video;
        videoPlayer.addEventListener('loadedmetadata', () => {
            updateRoomState({ duration: videoPlayer.duration });
        });
    }
    
    videoId = { type, id };
}

function updateRoomState(partialState) {
    if (!currentRoomId) return;
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    set(roomRef, {
        videoId,
        isPlaying,
        currentTime,
        timestamp: Date.now(),
        ...partialState
    });
}

function syncVideo() {
    if (!currentRoomId) return;
    
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        if (data.videoId && (data.videoId.type !== videoId?.type || data.videoId.id !== videoId?.id)) {
            createVideoPlayer(data.videoId.type, data.videoId.id);
        }
        
        if (typeof data.isPlaying === 'boolean') {
            isPlaying = data.isPlaying;
            if (isPlaying) {
                elements.playPauseBtn.textContent = '⏸ Pause';
            } else {
                elements.playPauseBtn.textContent = '▶️ Play';
            }
        }
        
        if (typeof data.currentTime === 'number') {
            currentTime = data.currentTime;
            elements.currentTime.textContent = formatTime(currentTime);
            if (videoPlayer && videoPlayer.tagName === 'VIDEO') {
                videoPlayer.currentTime = currentTime;
            }
        }
        
        if (typeof data.duration === 'number') {
            elements.duration.textContent = formatTime(data.duration);
        }
    });
}

elements.createRoom.addEventListener('click', () => {
    const roomId = elements.roomId.value.trim() || 'room_' + Math.random().toString(36).substr(2, 8);
    currentRoomId = roomId;
    elements.roomId.value = roomId;
    elements.roomStatus.textContent = `Room: ${roomId}`;
    elements.roomControls.classList.remove('hidden');
    syncVideo();
});

elements.joinRoom.addEventListener('click', () => {
    const roomId = elements.roomId.value.trim();
    if (!roomId) {
        showError('Enter a room ID first');
        return;
    }
    currentRoomId = roomId;
    elements.roomStatus.textContent = `Room: ${roomId}`;
    elements.roomControls.classList.remove('hidden');
    syncVideo();
});

elements.loadVideo.addEventListener('click', () => {
    const url = elements.videoUrl.value.trim();
    if (!url) {
        showError('Enter a video URL');
        return;
    }
    
    const parsed = parseVideoUrl(url);
    if (!parsed) {
        showError('Unsupported URL. Use YouTube, Google Drive, or direct MP4/WebM');
        return;
    }
    
    createVideoPlayer(parsed.type, parsed.id);
    updateRoomState({ videoId: parsed, currentTime: 0, isPlaying: false });
});

elements.playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    updateRoomState({ isPlaying });
});

elements.prevBtn.addEventListener('click', () => {
    currentTime = Math.max(0, currentTime - 10);
    updateRoomState({ currentTime });
});

elements.nextBtn.addEventListener('click', () => {
    currentTime += 10;
    updateRoomState({ currentTime });
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('room')) {
    elements.roomId.value = urlParams.get('room');
    elements.joinRoom.click();
}
