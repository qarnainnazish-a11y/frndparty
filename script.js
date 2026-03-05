import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  serverTimestamp,
  onDisconnect,
  child,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentRoomId = null;
let ytPlayer = null; // YouTube player
let videoPlayer = null; // <video> or Drive iframe
let isPlaying = false;
let currentTime = 0;
let videoId = null;
let ytReady = false;
let isHost = false;
let playbackRate = 1; // NEW: speed state

const elements = {
  roomId: document.getElementById("roomId"),
  createRoom: document.getElementById("createRoom"),
  joinRoom: document.getElementById("joinRoom"),
  roomControls: document.getElementById("roomControls"),
  videoPlayer: document.getElementById("videoPlayer"),
  videoUrl: document.getElementById("videoUrl"),
  loadVideo: document.getElementById("loadVideo"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  currentTime: document.getElementById("currentTime"),
  duration: document.getElementById("duration"),
  roomStatus: document.getElementById("roomStatus"),
  viewerCount: document.getElementById("viewerCount"),
  errorMsg: document.getElementById("errorMsg"),
  statusText: document.getElementById("statusText"),
  syncStatus: document.getElementById("syncStatus"),
  playbackRate: document.getElementById("playbackRate"), // NEW: dropdown
};

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseVideoUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());

    if (
      u.hostname.includes("youtube.com") ||
      u.hostname === "youtu.be" ||
      u.hostname === "music.youtube.com"
    ) {
      let id = null;
      if (u.hostname === "youtu.be") {
        id = u.pathname.slice(1);
      } else {
        id = u.searchParams.get("v");
      }
      if (!id) return null;
      return { type: "youtube", id };
    }

    if (u.hostname.includes("drive.google.com")) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (match) {
        return { type: "gdrive", id: match[1] };
      }
    }

    if (u.hostname.includes("dropbox.com")) {
      const dl = new URL(u.toString());
      dl.searchParams.set("dl", "1");
      return { type: "direct", url: dl.toString() };
    }

    if (
      u.pathname.endsWith(".mp4") ||
      u.pathname.endsWith(".webm") ||
      u.pathname.endsWith(".ogg")
    ) {
      return { type: "direct", url: u.toString() };
    }

    return null;
  } catch (e) {
    return null;
  }
}

function setStatus(text) {
  elements.syncStatus.textContent = text;
}

function showError(text) {
  elements.errorMsg.textContent = text;
  elements.errorMsg.classList.remove("hidden");
}

function clearError() {
  elements.errorMsg.textContent = "";
  elements.errorMsg.classList.add("hidden");
}

function applyPlaybackRate() {
  if (ytPlayer && ytReady) {
    try {
      ytPlayer.setPlaybackRate(playbackRate);
    } catch {}
  } else if (videoPlayer && videoPlayer.tagName === "VIDEO") {
    videoPlayer.playbackRate = playbackRate;
  }
}

function clearPlayer() {
  if (ytPlayer && ytPlayer.destroy) {
    ytPlayer.destroy();
  }
  ytPlayer = null;
  ytReady = false;

  if (videoPlayer && videoPlayer.parentNode) {
    videoPlayer.parentNode.removeChild(videoPlayer);
  }
  videoPlayer = null;

  elements.videoPlayer.innerHTML = "";
}

function loadVideoIntoPlayer(parsed, startTime = 0) {
  clearError();
  clearPlayer();
  isPlaying = false;
  currentTime = startTime || 0;

  if (!parsed) {
    elements.currentTime.textContent = "0:00";
    elements.duration.textContent = "0:00";
    return;
  }

  if (parsed.type === "youtube") {
    const ytDiv = document.createElement("div");
    ytDiv.id = "ytplayer";
    elements.videoPlayer.appendChild(ytDiv);

    function createYT() {
      ytPlayer = new YT.Player("ytplayer", {
        width: "100%",
        height: "100%",
        videoId: parsed.id,
        playerVars: {
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            ytReady = true;
            const dur = event.target.getDuration();
            if (!isNaN(dur) && dur > 0) {
              elements.duration.textContent = formatTime(dur);
            }
            if (startTime > 0) {
              event.target.seekTo(startTime, true);
            }
            event.target.setPlaybackRate(playbackRate); // NEW
            if (isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
          },
          onStateChange: (event) => {
            if (!isHost) return;

            if (event.data === YT.PlayerState.PLAYING) {
              isPlaying = true;
              currentTime = ytPlayer.getCurrentTime();
              updateRoomState({ isPlaying: true, currentTime });
            } else if (event.data === YT.PlayerState.PAUSED) {
              isPlaying = false;
              currentTime = ytPlayer.getCurrentTime();
              updateRoomState({ isPlaying: false, currentTime });
            }
          },
        },
      });
    }

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      window.onYouTubeIframeAPIReady = createYT;
      document.head.appendChild(tag);
    } else if (window.YT && window.YT.Player) {
      createYT();
    } else {
      window.onYouTubeIframeAPIReady = createYT;
    }
  } else if (parsed.type === "gdrive") {
    const iframe = document.createElement("iframe");
    iframe.src = `https://drive.google.com/file/d/${parsed.id}/preview`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    elements.videoPlayer.appendChild(iframe);
  } else if (parsed.type === "direct") {
    const v = document.createElement("video");
    v.src = parsed.url;
    v.controls = false;
    v.style.width = "100%";
    v.style.height = "100%";

    videoPlayer = v;
    videoPlayer.playbackRate = playbackRate; // NEW

    v.addEventListener("loadedmetadata", () => {
      elements.duration.textContent = formatTime(v.duration);
      if (startTime > 0) {
        v.currentTime = startTime;
      }
    });

    v.addEventListener("timeupdate", () => {
      currentTime = v.currentTime;
      elements.currentTime.textContent = formatTime(currentTime);
    });

    v.addEventListener("play", () => {
      if (!isHost) return;
      isPlaying = true;
      currentTime = v.currentTime;
      updateRoomState({ isPlaying: true, currentTime });
    });

    v.addEventListener("pause", () => {
      if (!isHost) return;
      isPlaying = false;
      currentTime = v.currentTime;
      updateRoomState({ isPlaying: false, currentTime });
    });

    elements.videoPlayer.appendChild(v);
  }

  elements.currentTime.textContent = formatTime(currentTime);
}

function updateRoomState(partial) {
  if (!currentRoomId) return;
  const roomRef = ref(db, `rooms/${currentRoomId}`);

  set(roomRef, {
    videoId,
    isPlaying,
    currentTime,
    playbackRate, // NEW
    timestamp: Date.now(),
    ...partial,
  });

  setStatus("Synced");
}

function joinRoom(roomId, asHost) {
  currentRoomId = roomId;
  isHost = asHost;

  elements.roomControls.classList.remove("hidden");
  elements.roomStatus.textContent = `Room: ${roomId} (${
    isHost ? "Host" : "Guest"
  })`;
  elements.statusText.textContent = isHost
    ? "Paste a video link and click Load."
    : "Wait for host to load and control video.";

  const viewersRef = ref(db, `rooms/${roomId}/viewers`);
  const myId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const myRef = child(viewersRef, myId);
  set(myRef, { joinedAt: serverTimestamp() });
  onDisconnect(myRef).remove();

  onValue(viewersRef, (snap) => {
    const val = snap.val() || {};
    const count = Object.keys(val).length;
    elements.viewerCount.textContent = `👥 ${count} viewer${
      count === 1 ? "" : "s"
    }`;
  });

  const roomRef = ref(db, `rooms/${roomId}`);
  onValue(roomRef, (snap) => {
    const data = snap.val();
    if (!data) return;

    if (typeof data.playbackRate === "number") {
      playbackRate = data.playbackRate;
      if (elements.playbackRate) {
        elements.playbackRate.value = String(playbackRate);
      }
      applyPlaybackRate();
    }

    if (data.videoId && data.videoId !== videoId) {
      videoId = data.videoId;
      const parsed = parseVideoUrl(videoId);
      loadVideoIntoPlayer(parsed, data.currentTime || 0);
    }

    if (!isHost) {
      if (typeof data.currentTime === "number") {
        currentTime = data.currentTime;
      }
      if (typeof data.isPlaying === "boolean") {
        isPlaying = data.isPlaying;
      }

      if (ytPlayer && ytReady) {
        const diff = Math.abs(ytPlayer.getCurrentTime() - currentTime);
        if (diff > 1) {
          ytPlayer.seekTo(currentTime, true);
        }
        if (isPlaying) ytPlayer.playVideo();
        else ytPlayer.pauseVideo();
      } else if (videoPlayer && videoPlayer.tagName === "VIDEO") {
        const diff = Math.abs(videoPlayer.currentTime - currentTime);
        if (diff > 1) {
          videoPlayer.currentTime = currentTime;
        }
        if (isPlaying && videoPlayer.paused) videoPlayer.play();
        if (!isPlaying && !videoPlayer.paused) videoPlayer.pause();
      }

      elements.currentTime.textContent = formatTime(currentTime);
    }
  });
}

// UI events

elements.createRoom.addEventListener("click", () => {
  const roomId = elements.roomId.value.trim();
  if (!roomId) return;
  joinRoom(roomId, true);
});

elements.joinRoom.addEventListener("click", () => {
  const roomId = elements.roomId.value.trim();
  if (!roomId) return;
  joinRoom(roomId, false);
});

elements.loadVideo.addEventListener("click", () => {
  const url = elements.videoUrl.value.trim();
  const parsed = parseVideoUrl(url);
  if (!parsed) {
    showError(
      "Unsupported link. Use YouTube / Google Drive / Dropbox / direct .mp4 / .webm / .ogg"
    );
    return;
  }

  videoId = url;
  currentTime = 0;
  isPlaying = false;
  loadVideoIntoPlayer(parsed, 0);

  if (currentRoomId && isHost) {
    updateRoomState({ videoId, currentTime: 0, isPlaying: false });
  }
});

elements.playPauseBtn.addEventListener("click", () => {
  if (!currentRoomId) return;

  if (ytPlayer && ytReady) {
    if (isPlaying) {
      ytPlayer.pauseVideo();
      isPlaying = false;
    } else {
      ytPlayer.playVideo();
      isPlaying = true;
    }
    currentTime = ytPlayer.getCurrentTime();
    if (isHost) {
      updateRoomState({ isPlaying, currentTime });
    }
  } else if (videoPlayer && videoPlayer.tagName === "VIDEO") {
    if (videoPlayer.paused) {
      videoPlayer.play();
      isPlaying = true;
    } else {
      videoPlayer.pause();
      isPlaying = false;
    }
    currentTime = videoPlayer.currentTime;
    if (isHost) {
      updateRoomState({ isPlaying, currentTime });
    }
  }
});

elements.prevBtn.addEventListener("click", () => {
  if (!currentRoomId) return;

  currentTime = Math.max(0, currentTime - 10);

  if (ytPlayer && ytReady) {
    ytPlayer.seekTo(currentTime, true);
    if (!isPlaying) ytPlayer.pauseVideo();
  } else if (videoPlayer && videoPlayer.tagName === "VIDEO") {
    videoPlayer.currentTime = currentTime;
  }

  if (isHost) {
    updateRoomState({ currentTime });
  }
});

elements.nextBtn.addEventListener("click", () => {
  if (!currentRoomId) return;

  currentTime = currentTime + 10;

  if (ytPlayer && ytReady) {
    ytPlayer.seekTo(currentTime, true);
    if (!isPlaying) ytPlayer.pauseVideo();
  } else if (videoPlayer && videoPlayer.tagName === "VIDEO") {
    videoPlayer.currentTime = currentTime;
  }

  if (isHost) {
    updateRoomState({ currentTime });
  }
});

// NEW: speed dropdown listener
if (elements.playbackRate) {
  elements.playbackRate.addEventListener("change", () => {
    const val = parseFloat(elements.playbackRate.value);
    if (!isNaN(val) && val > 0) {
      playbackRate = val;
      applyPlaybackRate();
      if (currentRoomId && isHost) {
        updateRoomState({ playbackRate });
      }
    }
  });
}
