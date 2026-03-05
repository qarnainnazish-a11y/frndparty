import { app, db } from "./firebase-config.js";
import {
  ref,
  set,
  onValue,
  serverTimestamp,
  onDisconnect,
  child,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const roomIdInput = document.getElementById("roomId");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const statusDiv = document.getElementById("status");
const videoContainer = document.getElementById("videoContainer");

const prev10Btn = document.getElementById("prev10");
const playPauseBtn = document.getElementById("playPause");
const next10Btn = document.getElementById("next10");
const currentTimeSpan = document.getElementById("currentTime");
const durationSpan = document.getElementById("duration");

const videoUrlInput = document.getElementById("videoUrl");
const loadVideoBtn = document.getElementById("loadVideo");

const playbackRateSelect = document.getElementById("playbackRate");

let currentRoomId = null;
let isHost = false;

let ytPlayer = null;
let ytReady = false;
let htmlVideo = null;

let isPlaying = false;
let currentTime = 0;
let videoId = null;
let playbackRate = 1;

let localChange = false;

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
  statusDiv.textContent = text;
}

function applyPlaybackRate() {
  if (ytPlayer && ytReady) {
    try {
      ytPlayer.setPlaybackRate(playbackRate);
    } catch {}
  } else if (htmlVideo) {
    htmlVideo.playbackRate = playbackRate;
  }
}

function clearPlayer() {
  if (ytPlayer && ytPlayer.destroy) {
    ytPlayer.destroy();
  }
  ytPlayer = null;
  ytReady = false;

  if (htmlVideo && htmlVideo.parentNode) {
    htmlVideo.parentNode.removeChild(htmlVideo);
  }
  htmlVideo = null;

  videoContainer.innerHTML = "";
}

function loadVideoIntoPlayer(parsed, startTime = 0) {
  clearPlayer();
  isPlaying = false;
  currentTime = startTime || 0;

  if (!parsed) {
    currentTimeSpan.textContent = "0:00";
    durationSpan.textContent = "0:00";
    return;
  }

  if (parsed.type === "youtube") {
    const ytDiv = document.createElement("div");
    ytDiv.id = "ytplayer";
    videoContainer.appendChild(ytDiv);

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
              durationSpan.textContent = formatTime(dur);
            }
            if (startTime > 0) {
              event.target.seekTo(startTime, true);
            }
            event.target.setPlaybackRate(playbackRate);
            if (isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
          },
          onStateChange: (event) => {
            if (!isHost) return;
            if (localChange) return;

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
    videoContainer.appendChild(iframe);
  } else if (parsed.type === "direct") {
    const v = document.createElement("video");
    v.src = parsed.url;
    v.controls = false;
    v.style.width = "100%";
    v.style.height = "100%";

    htmlVideo = v;
    htmlVideo.playbackRate = playbackRate;

    v.addEventListener("loadedmetadata", () => {
      durationSpan.textContent = formatTime(v.duration);
      if (startTime > 0) {
        v.currentTime = startTime;
      }
    });

    v.addEventListener("timeupdate", () => {
      currentTime = v.currentTime;
      currentTimeSpan.textContent = formatTime(currentTime);
    });

    v.addEventListener("play", () => {
      if (!isHost || localChange) return;
      isPlaying = true;
      currentTime = v.currentTime;
      updateRoomState({ isPlaying: true, currentTime });
    });

    v.addEventListener("pause", () => {
      if (!isHost || localChange) return;
      isPlaying = false;
      currentTime = v.currentTime;
      updateRoomState({ isPlaying: false, currentTime });
    });

    videoContainer.appendChild(v);
  }

  currentTimeSpan.textContent = formatTime(currentTime);
}

function updateRoomState(partial) {
  if (!currentRoomId) return;
  const roomRef = ref(db, `rooms/${currentRoomId}`);

  set(roomRef, {
    videoId,
    isPlaying,
    currentTime,
    playbackRate,
    timestamp: Date.now(),
    ...partial,
  });

  setStatus("Synced");
}

function joinRoom(roomId, asHost) {
  currentRoomId = roomId;
  isHost = asHost;

  setStatus(`Joined room ${roomId} as ${isHost ? "host" : "guest"}`);

  const viewersRef = ref(db, `rooms/${roomId}/viewers`);
  const myId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const myRef = child(viewersRef, myId);
  set(myRef, { joinedAt: serverTimestamp() });
  onDisconnect(myRef).remove();

  const roomRef = ref(db, `rooms/${roomId}`);
  onValue(roomRef, (snap) => {
    const data = snap.val();
    if (!data) return;

    localChange = true;
    try {
      if (typeof data.playbackRate === "number") {
        playbackRate = data.playbackRate;
        playbackRateSelect.value = String(playbackRate);
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
        } else if (htmlVideo) {
          const diff = Math.abs(htmlVideo.currentTime - currentTime);
          if (diff > 1) {
            htmlVideo.currentTime = currentTime;
          }
          if (isPlaying && htmlVideo.paused) htmlVideo.play();
          if (!isPlaying && !htmlVideo.paused) htmlVideo.pause();
        }

        currentTimeSpan.textContent = formatTime(currentTime);
      }
    } finally {
      localChange = false;
    }
  });
}

// UI events

createRoomBtn.addEventListener("click", () => {
  const roomId = roomIdInput.value.trim();
  if (!roomId) return;
  joinRoom(roomId, true);
});

joinRoomBtn.addEventListener("click", () => {
  const roomId = roomIdInput.value.trim();
  if (!roomId) return;
  joinRoom(roomId, false);
});

loadVideoBtn.addEventListener("click", () => {
  const url = videoUrlInput.value.trim();
  const parsed = parseVideoUrl(url);
  if (!parsed) {
    setStatus("Unsupported link");
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

playPauseBtn.addEventListener("click", () => {
  if (!currentRoomId) return;

  if (ytPlayer && ytReady) {
    localChange = true;
    try {
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
    } finally {
      localChange = false;
    }
  } else if (htmlVideo) {
    localChange = true;
    try {
      if (htmlVideo.paused) {
        htmlVideo.play();
        isPlaying = true;
      } else {
        htmlVideo.pause();
        isPlaying = false;
      }
      currentTime = htmlVideo.currentTime;
      if (isHost) {
        updateRoomState({ isPlaying, currentTime });
      }
    } finally {
      localChange = false;
    }
  }
});

prev10Btn.addEventListener("click", () => {
  if (!currentRoomId) return;

  currentTime = Math.max(0, currentTime - 10);

  if (ytPlayer && ytReady) {
    localChange = true;
    ytPlayer.seekTo(currentTime, true);
    if (!isPlaying) ytPlayer.pauseVideo();
    localChange = false;
  } else if (htmlVideo) {
    localChange = true;
    htmlVideo.currentTime = currentTime;
    localChange = false;
  }

  if (isHost) {
    updateRoomState({ currentTime });
  }
});

next10Btn.addEventListener("click", () => {
  if (!currentRoomId) return;

  currentTime = currentTime + 10;

  if (ytPlayer && ytReady) {
    localChange = true;
    ytPlayer.seekTo(currentTime, true);
    if (!isPlaying) ytPlayer.pauseVideo();
    localChange = false;
  } else if (htmlVideo) {
    localChange = true;
    htmlVideo.currentTime = currentTime;
    localChange = false;
  }

  if (isHost) {
    updateRoomState({ currentTime });
  }
});

playbackRateSelect.addEventListener("change", () => {
  const val = parseFloat(playbackRateSelect.value);
  if (!isNaN(val) && val > 0) {
    playbackRate = val;
    applyPlaybackRate();
    if (currentRoomId && isHost) {
      updateRoomState({ playbackRate });
    }
  }
});
