(function () {
  // --- DOM Elements ---
  const video = document.getElementById('videoPlayer');
  const videoOverlay = document.getElementById('videoOverlay');
  const overlayText = document.getElementById('overlayText');
  const overlaySubtext = document.getElementById('overlaySubtext');
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const consoleEl = document.getElementById('console');
  
  // Stats Elements
  const statResolution = document.getElementById('statResolution');
  const statFps = document.getElementById('statFps');
  const statBitrate = document.getElementById('statBitrate');
  const statStatus = document.getElementById('statStatus');
  const statLatency = document.getElementById('statLatency');
  
  // Config Inputs
  const streamUrlInput = document.getElementById('streamUrlInput');
  const rtmpUrlInput = document.getElementById('rtmpUrlInput');
  
  // Interactive Buttons
  const btnPlay = document.getElementById('btnPlay');
  const btnMute = document.getElementById('btnMute');
  const btnPip = document.getElementById('btnPip');
  const btnReconnect = document.getElementById('btnReconnect');
  const btnCopyWeb = document.getElementById('btnCopyWeb');
  const btnCopyRtmp = document.getElementById('btnCopyRtmp');

  // --- Constants & Config ---
  const STREAM_PATH = '/live/stream.flv';
  const PROTOCOL = window.location.protocol;
  const HOST = window.location.host;
  const WEB_URL = `${PROTOCOL}//${HOST}${STREAM_PATH}`;
  const HOST_IP = window.location.hostname;
  const RTMP_URL = `rtmp://[${HOST_IP}]:1935/live`;

  let player = null;
  let retryTimer = null;
  let statsTimer = null;
  let latencySimTimer = null;
  let maxRetries = 15;
  const RETRY_INTERVAL = 4000; // ms

  // Populate config fields
  if (streamUrlInput) streamUrlInput.value = window.location.href;
  if (rtmpUrlInput) rtmpUrlInput.value = `${RTMP_URL} (Stream Key: stream)`;

  // --- Helpers ---
  function log(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${message}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function updateStatus(state) {
    if (state === 'live') {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'ONLINE';
      statusBadge.style.borderColor = 'rgba(57, 255, 20, 0.3)';
      statStatus.textContent = 'Active';
      statStatus.style.color = 'var(--accent-green)';
    } else if (state === 'connecting') {
      statusDot.className = 'status-dot warning';
      statusText.textContent = 'CONNECTING';
      statusBadge.style.borderColor = 'rgba(255, 215, 0, 0.3)';
      statStatus.textContent = 'Connecting...';
      statStatus.style.color = 'var(--accent-yellow)';
    } else {
      statusDot.className = 'status-dot error';
      statusText.textContent = 'OFFLINE';
      statusBadge.style.borderColor = 'rgba(255, 59, 48, 0.3)';
      statStatus.textContent = 'Offline';
      statStatus.style.color = 'var(--accent-red)';
    }
  }

  function showOverlay(title, subtitle = '') {
    videoOverlay.classList.remove('hidden');
    overlayText.textContent = title;
    overlaySubtext.textContent = subtitle;
  }

  function hideOverlay() {
    videoOverlay.classList.add('hidden');
  }

  // --- Player Core Management ---
  function initPlayer() {
    if (!window.mpegts) {
      log('mpegts.js library not loaded', 'error');
      showOverlay('ERROR', 'mpegts.js failed to load. Check network.');
      updateStatus('offline');
      return;
    }

    if (!mpegts.getFeatureList().mseLivePlayback) {
      log('Browser does not support MSE', 'error');
      showOverlay('UNSUPPORTED', 'Your browser does not support MSE FLV playback.');
      updateStatus('offline');
      return;
    }

    log(`Initializing stream: ${WEB_URL}`, 'info');
    updateStatus('connecting');
    showOverlay('Connecting to Node...', 'Establishing Direct IPv6 Connection');

    try {
      player = mpegts.createPlayer({
        type: 'flv',
        url: WEB_URL,
        isLive: true,
        enableWorker: true,
        enableStashBuffer: false, // Low latency mode
        stashInitialSize: 128,
      });

      player.attachMediaElement(video);
      player.load();
      
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          log('Playback started successfully', 'success');
          hideOverlay();
          updateStatus('live');
          maxRetries = 15; // Reset retries on success
          startDiagnostics();
        }).catch(err => {
          log(`Play failed/deferred: ${err.message}`, 'warn');
        });
      }

      // Error handler
      player.on(mpegts.Events.ERROR, function (eventType, detail) {
        log(`Player error: ${eventType} - ${detail}`, 'error');
        handlePlaybackFailure();
      });

    } catch (e) {
      log(`Initialization exception: ${e.message}`, 'error');
      handlePlaybackFailure();
    }
  }

  function handlePlaybackFailure() {
    stopDiagnostics();
    destroyPlayer();
    updateStatus('offline');

    if (maxRetries > 0) {
      maxRetries--;
      log(`Stream offline. Retrying in ${RETRY_INTERVAL / 1000}s... (Attempts left: ${maxRetries})`, 'warn');
      showOverlay('STREAM OFFLINE', `Retrying in ${RETRY_INTERVAL / 1000}s... (${maxRetries} attempts left)`);
      retryTimer = setTimeout(initPlayer, RETRY_INTERVAL);
    } else {
      log('Max reconnect attempts reached. Stream offline.', 'error');
      showOverlay('OFFLINE', 'Ready. Click "Reconnect" or verify OBS is broadcasting.');
    }
  }

  function destroyPlayer() {
    if (player) {
      try {
        player.pause();
        player.unload();
        player.destroy();
      } catch (e) {
        // Suppress
      }
      player = null;
    }
  }

  // --- Diagnostics & Stats ---
  function startDiagnostics() {
    // Clear old timers
    stopDiagnostics();

    // Query real-time stats
    statsTimer = setInterval(() => {
      if (!player) return;

      // Resolution & details
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        statResolution.textContent = `${video.videoWidth}x${video.videoHeight}`;
      } else {
        statResolution.textContent = 'Detecting...';
      }

      // Bitrate & Speeds
      if (player.statistics) {
        const stats = player.statistics;
        const kbps = Math.round(stats.speed * 8); // speed is in KB/s, convert to kbps
        if (kbps > 0) {
          statBitrate.textContent = kbps > 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} Kbps`;
        } else {
          statBitrate.textContent = 'Calculating...';
        }
      }

      // FPS (estimated)
      if (video.webkitDecodedFrameCount || video.decodedFrameCount) {
        const currentFrames = video.webkitDecodedFrameCount || video.decodedFrameCount;
        if (this.lastFrameCount && this.lastFrameTime) {
          const deltaFrames = currentFrames - this.lastFrameCount;
          const deltaTime = (Date.now() - this.lastFrameTime) / 1000;
          const fps = Math.round(deltaFrames / deltaTime);
          if (fps >= 0 && fps < 120) {
            statFps.textContent = `${fps} FPS`;
          }
        }
        this.lastFrameCount = currentFrames;
        this.lastFrameTime = Date.now();
      } else {
        statFps.textContent = '--';
      }
    }, 1000);

    // Mock low latency representation based on buffer duration
    latencySimTimer = setInterval(() => {
      if (!video) return;
      
      const buffered = video.buffered;
      if (buffered.length > 0) {
        const duration = buffered.end(buffered.length - 1) - video.currentTime;
        const latency = (duration * 1000 + 120).toFixed(0); // simulation including handshake latency
        statLatency.textContent = `${latency} ms`;
      } else {
        statLatency.textContent = '--';
      }
    }, 1500);
  }

  function stopDiagnostics() {
    clearInterval(statsTimer);
    clearInterval(latencySimTimer);
    statResolution.textContent = '--';
    statFps.textContent = '--';
    statBitrate.textContent = '--';
    statLatency.textContent = '--';
  }

  // --- UI Interactions ---

  // Reconnect Button
  btnReconnect.addEventListener('click', () => {
    log('Manual reconnection initiated.', 'info');
    clearTimeout(retryTimer);
    maxRetries = 15;
    destroyPlayer();
    initPlayer();
  });

  // Mute Toggle
  btnMute.addEventListener('click', () => {
    video.muted = !video.muted;
    btnMute.innerHTML = video.muted 
      ? `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM19 12c0 3.28-2.16 6.07-5.14 7.03v2.06c3.97-.93 7-4.5 7-8.77s-3.03-7.84-7-8.77v2.06c2.98.96 5.14 3.75 5.14 7.03zM3 9v6h4l5 5V4L7 9H3z"/></svg> Muted` 
      : `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg> Mute`;
    log(`Audio ${video.muted ? 'muted' : 'unmuted'}`, 'info');
  });

  // Play/Pause Toggle
  btnPlay.addEventListener('click', () => {
    if (video.paused) {
      video.play().then(() => {
        btnPlay.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> Pause`;
        log('Player resumed.', 'info');
      });
    } else {
      video.pause();
      btnPlay.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Play`;
      log('Player paused.', 'info');
    }
  });

  // Picture in Picture
  btnPip.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        log('Exited Picture-in-Picture mode.', 'info');
      } else if (video.readyState >= 2) {
        await video.requestPictureInPicture();
        log('Entered Picture-in-Picture mode.', 'info');
      } else {
        log('Stream not ready for PiP mode.', 'warn');
      }
    } catch (e) {
      log(`PiP failed: ${e.message}`, 'error');
    }
  });

  // Copy Buttons
  function setupCopyBtn(btn, input, label) {
    btn.addEventListener('click', () => {
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(input.value).then(() => {
        const origHtml = btn.innerHTML;
        btn.innerHTML = `<span style="color: var(--accent-green)">✓</span>`;
        log(`Copied ${label} to clipboard`, 'success');
        setTimeout(() => {
          btn.innerHTML = origHtml;
        }, 1500);
      }).catch(err => {
        log('Failed to copy text', 'error');
      });
    });
  }
  setupCopyBtn(btnCopyWeb, streamUrlInput, 'web view URL');
  setupCopyBtn(btnCopyRtmp, rtmpUrlInput, 'RTMP publish address');

  // Accordion Logic
  const accordionHeaders = document.querySelectorAll('.guide-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const parent = header.parentElement;
      const isOpen = parent.classList.contains('open');
      
      // Close all items
      document.querySelectorAll('.guide-item').forEach(item => {
        item.classList.remove('open');
      });

      // Toggle current
      if (!isOpen) {
        parent.classList.add('open');
      }
    });
  });

  // --- Boot & Cleanup ---
  initPlayer();

  window.addEventListener('beforeunload', () => {
    clearTimeout(retryTimer);
    stopDiagnostics();
    destroyPlayer();
  });
})();
