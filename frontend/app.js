// Store active streams and settings
const activeStreams = new Map();
let currentLayout = 2;
let streamSettings = {
    // FFmpeg settings
    videoBitrate: '2M',
    preset: 'ultrafast',
    segmentDuration: 1,
    playlistSize: 5,
    bufferSize: '2M',
    // HLS.js settings
    maxBufferLength: 3,
    backBufferLength: 30,
    liveSyncDuration: 3,
    playbackMode: 'smooth'
};

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('streamSettings');
    if (saved) {
        streamSettings = { ...streamSettings, ...JSON.parse(saved) };
        applySettingsToUI();
    }
}

// Save settings to localStorage
function saveSettings() {
    // Get values from UI
    streamSettings.videoBitrate = document.getElementById('videoBitrate').value;
    streamSettings.preset = document.getElementById('preset').value;
    streamSettings.segmentDuration = parseFloat(document.getElementById('segmentDuration').value);
    streamSettings.playlistSize = parseInt(document.getElementById('playlistSize').value);
    streamSettings.maxBufferLength = parseFloat(document.getElementById('maxBufferLength').value);
    streamSettings.backBufferLength = parseFloat(document.getElementById('backBufferLength').value);
    streamSettings.liveSyncDuration = parseInt(document.getElementById('liveSyncDuration').value);
    streamSettings.playbackMode = document.getElementById('playbackMode').value;
    
    // Save to localStorage
    localStorage.setItem('streamSettings', JSON.stringify(streamSettings));
    showStatus('Settings saved successfully', 'success');
}

// Apply settings to UI elements
function applySettingsToUI() {
    document.getElementById('videoBitrate').value = streamSettings.videoBitrate;
    document.getElementById('preset').value = streamSettings.preset;
    document.getElementById('segmentDuration').value = streamSettings.segmentDuration;
    document.getElementById('playlistSize').value = streamSettings.playlistSize;
    document.getElementById('maxBufferLength').value = streamSettings.maxBufferLength;
    document.getElementById('backBufferLength').value = streamSettings.backBufferLength;
    document.getElementById('liveSyncDuration').value = streamSettings.liveSyncDuration;
    document.getElementById('playbackMode').value = streamSettings.playbackMode;
}

// Reset settings to defaults
function resetSettings() {
    streamSettings = {
        videoBitrate: '2M',
        preset: 'ultrafast',
        segmentDuration: 1,
        playlistSize: 5,
        bufferSize: '2M',
        maxBufferLength: 3,
        backBufferLength: 30,
        liveSyncDuration: 3,
        playbackMode: 'smooth'
    };
    applySettingsToUI();
    saveSettings();
}

// Toggle settings panel
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setLayout(2);
    loadActiveStreams();
    restoreRunningStreams();
});

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    if (type !== 'error') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

function setLayout(layout) {
    currentLayout = layout;
    const grid = document.getElementById('streamsGrid');
    
    // Update grid class
    grid.className = `streams-grid layout-${layout}`;
    
    // Update active button
    document.querySelectorAll('.layout-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.layout == layout);
    });
    
    // Create stream containers
    updateStreamContainers();
}

function updateStreamContainers() {
    const grid = document.getElementById('streamsGrid');
    const existingContainers = grid.children.length;
    
    // Add containers if needed
    for (let i = existingContainers; i < currentLayout; i++) {
        const container = createStreamContainer(i);
        grid.appendChild(container);
    }
    
    // Remove extra containers
    while (grid.children.length > currentLayout) {
        const lastContainer = grid.lastElementChild;
        const streamId = lastContainer.dataset.streamId;
        if (streamId) {
            stopStream(streamId);
        }
        grid.removeChild(lastContainer);
    }
}

function createStreamContainer(index) {
    const container = document.createElement('div');
    container.className = 'stream-container';
    container.dataset.index = index;
    container.innerHTML = `
        <div class="stream-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 60px; height: 60px; opacity: 0.3;">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <polygon points="10 8 16 12 10 16"/>
            </svg>
            <p>Stream ${index + 1}</p>
        </div>
    `;
    return container;
}

function toggleAuthFields() {
    const useAuth = document.getElementById('useAuth').checked;
    const authFields = document.getElementById('authFields');
    authFields.style.display = useAuth ? 'block' : 'none';
    
    if (!useAuth) {
        // Clear auth fields when disabled
        document.getElementById('authUsername').value = '';
        document.getElementById('authPassword').value = '';
        document.getElementById('useSrtp').checked = false;
        toggleSrtpFields();
    }
}

function toggleSrtpFields() {
    const useSrtp = document.getElementById('useSrtp').checked;
    const srtpFields = document.getElementById('srtpFields');
    srtpFields.style.display = useSrtp ? 'block' : 'none';
    
    if (!useSrtp) {
        // Clear SRTP fields when disabled
        document.getElementById('srtpSuite').value = '';
        document.getElementById('srtpKey').value = '';
    }
}

function addStream() {
    const nameInput = document.getElementById('streamName');
    const urlInput = document.getElementById('rtspUrl');
    const name = nameInput.value.trim();
    const rtspUrl = urlInput.value.trim();
    
    if (!rtspUrl) {
        showStatus('Please enter an RTSP URL', 'error');
        return;
    }

    if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://')) {
        showStatus('Invalid RTSP URL. URL must start with rtsp:// or rtsps://', 'error');
        return;
    }

    // Get authentication info
    const auth = {};
    if (document.getElementById('useAuth').checked) {
        auth.username = document.getElementById('authUsername').value.trim();
        auth.password = document.getElementById('authPassword').value.trim();
        
        if (!auth.username || !auth.password) {
            showStatus('Please enter username and password', 'error');
            return;
        }
        
        if (document.getElementById('useSrtp').checked) {
            auth.srtpSuite = document.getElementById('srtpSuite').value;
            auth.srtpKey = document.getElementById('srtpKey').value.trim();
            
            if (!auth.srtpKey) {
                showStatus('Please enter SRTP key', 'error');
                return;
            }
        }
    }

    // Find available container
    const grid = document.getElementById('streamsGrid');
    const containers = Array.from(grid.children);
    const availableContainer = containers.find(c => !c.dataset.streamId);
    
    if (!availableContainer) {
        showStatus('All stream slots are full. Remove a stream or increase layout size.', 'error');
        return;
    }

    // Clear inputs
    nameInput.value = '';
    urlInput.value = '';
    document.getElementById('useAuth').checked = false;
    toggleAuthFields();
    
    // Start stream
    startStream(rtspUrl, name, availableContainer, auth);
}

function startStream(rtspUrl, name, container, auth = {}) {
    // Show loading
    container.innerHTML = `
        <div class="stream-loading">
            <div class="spinner"></div>
            <p>Connecting...</p>
        </div>
    `;
    
    fetch('/api/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            rtspUrl, 
            name,
            auth,
            settings: {
                videoBitrate: streamSettings.videoBitrate,
                preset: streamSettings.preset,
                segmentDuration: streamSettings.segmentDuration,
                playlistSize: streamSettings.playlistSize,
                bufferSize: streamSettings.bufferSize
            }
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Create stream player
        createStreamPlayer(container, data);
        
        // Update active streams list
        loadActiveStreams();
        
        showStatus(`Stream "${data.name}" connected successfully`, 'success');
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus(`Failed to connect: ${error.message}`, 'error');
        
        // Reset container
        container.innerHTML = createStreamContainer(container.dataset.index).innerHTML;
        container.removeAttribute('data-stream-id');
    });
}

function createStreamPlayer(container, streamData) {
    const { streamId, streamUrl, name } = streamData;
    
    container.dataset.streamId = streamId;
    container.innerHTML = `
        <div class="stream-header">
            <span class="stream-title">${name}</span>
            <button class="stream-close" onclick="stopStream('${streamId}')">&times;</button>
        </div>
        <div class="stream-video-container">
            <video id="video-${streamId}" class="stream-video" controls autoplay muted></video>
        </div>
    `;
    
    const video = document.getElementById(`video-${streamId}`);
    
    // Configure HLS.js based on playback mode
    let hlsConfig = {
        enableWorker: true,
        lowLatencyMode: true,
        testBandwidth: false,
        startLevel: -1
    };
    
    switch(streamSettings.playbackMode) {
        case 'realtime':
            // Aggressive settings for lowest latency
            hlsConfig = {
                ...hlsConfig,
                backBufferLength: 0,
                maxBufferLength: 0.5,
                maxMaxBufferLength: 1,
                maxBufferSize: 0,
                maxBufferHole: 0.1,
                highBufferWatchdogPeriod: 1,
                nudgeOffset: 0.1,
                nudgeMaxRetry: 10,
                maxFragLookUpTolerance: 0.1,
                liveSyncDurationCount: 1,
                liveMaxLatencyDurationCount: 2,
                liveDurationInfinity: false,
                fragLoadingTimeOut: 2000,
                fragLoadingMaxRetry: 2,
                fragLoadingRetryDelay: 500
            };
            break;
        case 'lowlatency':
            // Balanced for low latency with some stability
            hlsConfig = {
                ...hlsConfig,
                backBufferLength: 10,
                maxBufferLength: streamSettings.maxBufferLength * 0.5,
                maxMaxBufferLength: streamSettings.maxBufferLength,
                maxBufferSize: 30 * 1000 * 1000,
                maxBufferHole: 0.3,
                highBufferWatchdogPeriod: 2,
                nudgeOffset: 0.1,
                nudgeMaxRetry: 5,
                maxFragLookUpTolerance: 0.2,
                liveSyncDurationCount: 2,
                liveMaxLatencyDurationCount: 4,
                liveDurationInfinity: true,
                fragLoadingTimeOut: 10000,
                fragLoadingMaxRetry: 3,
                fragLoadingRetryDelay: 1000
            };
            break;
        case 'smooth':
        default:
            // Stable playback with configurable buffer
            hlsConfig = {
                ...hlsConfig,
                backBufferLength: streamSettings.backBufferLength,
                maxBufferLength: streamSettings.maxBufferLength,
                maxMaxBufferLength: streamSettings.maxBufferLength * 2,
                maxBufferSize: 60 * 1000 * 1000,
                maxBufferHole: 0.5,
                highBufferWatchdogPeriod: 2,
                nudgeOffset: 0.1,
                nudgeMaxRetry: 3,
                maxFragLookUpTolerance: 0.25,
                liveSyncDurationCount: streamSettings.liveSyncDuration,
                liveMaxLatencyDurationCount: streamSettings.liveSyncDuration * 2,
                liveDurationInfinity: true,
                fragLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 3,
                fragLoadingRetryDelay: 1000
            };
    }
    
    // Add common retry settings
    hlsConfig = {
        ...hlsConfig,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 3,
        levelLoadingRetryDelay: 1000
    };
    
    // Add a small delay to allow FFmpeg to create initial segments
    setTimeout(() => {
        const hls = new Hls(hlsConfig);
        
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        
        let retryCount = 0;
        const maxRetries = 10;
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play();
            
            // For real-time mode, jump to live edge
            if (streamSettings.playbackMode === 'realtime' && video.buffered.length > 0) {
                const liveEdge = video.buffered.end(video.buffered.length - 1);
                video.currentTime = liveEdge;
            }
        });
        
        // Handle live sync based on mode
        if (streamSettings.playbackMode === 'realtime') {
            // Aggressive live edge seeking
            hls.on(Hls.Events.FRAG_LOADED, () => {
                if (video.buffered.length > 0) {
                    const liveEdge = video.buffered.end(video.buffered.length - 1);
                    const delay = liveEdge - video.currentTime;
                    if (delay > 0.5) {
                        video.currentTime = liveEdge - 0.1;
                    }
                }
            });
        } else if (streamSettings.playbackMode === 'lowlatency') {
            // Moderate catch-up using playback rate
            setInterval(() => {
                if (video.buffered.length > 0) {
                    const liveEdge = video.buffered.end(video.buffered.length - 1);
                    const delay = liveEdge - video.currentTime;
                    
                    if (delay > 3) {
                        video.playbackRate = 1.1;
                    } else if (delay > 2) {
                        video.playbackRate = 1.05;
                    } else {
                        video.playbackRate = 1.0;
                    }
                }
            }, 3000);
        } else {
            // Smooth mode: gentle catch-up
            setInterval(() => {
                if (video.buffered.length > 0) {
                    const liveEdge = video.buffered.end(video.buffered.length - 1);
                    const delay = liveEdge - video.currentTime;
                    
                    if (delay > streamSettings.liveSyncDuration * 2) {
                        video.playbackRate = 1.1;
                    } else if (delay > streamSettings.liveSyncDuration) {
                        video.playbackRate = 1.05;
                    } else {
                        video.playbackRate = 1.0;
                    }
                }
            }, 5000);
        }
        
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        if (data.details === 'levelEmptyError' && retryCount < maxRetries) {
                            retryCount++;
                            console.log(`Empty playlist, retrying... (${retryCount}/${maxRetries})`);
                            setTimeout(() => {
                                hls.startLoad();
                            }, 1000);
                            return;
                        }
                        console.error('Network error:', data);
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log('Media error, attempting recovery...');
                        hls.recoverMediaError();
                        return;
                    default:
                        console.error('Fatal error:', data);
                        break;
                }
                
                if (retryCount >= maxRetries) {
                    showStatus(`Stream error: Failed to load stream after ${maxRetries} attempts`, 'error');
                }
            }
        });
        
        // Store HLS instance
        activeStreams.set(streamId, { hls, container, streamData });
    }, 1500);
}

function stopStream(streamId) {
    const stream = activeStreams.get(streamId);
    if (!stream) return;
    
    // Destroy HLS instance
    if (stream.hls) {
        stream.hls.destroy();
    }
    
    // Reset container
    const container = stream.container;
    container.innerHTML = createStreamContainer(container.dataset.index).innerHTML;
    container.removeAttribute('data-stream-id');
    
    // Remove from active streams
    activeStreams.delete(streamId);
    
    // Notify backend
    fetch('/api/stream/stop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ streamId })
    });
    
    // Update active streams list
    loadActiveStreams();
}

function clearAllStreams() {
    activeStreams.forEach((stream, streamId) => {
        stopStream(streamId);
    });
    showStatus('All streams cleared', 'info');
}

function loadActiveStreams() {
    fetch('/api/streams')
        .then(response => response.json())
        .then(streams => {
            const streamsList = document.getElementById('streamsList');
            const activeStreamsDiv = document.getElementById('activeStreams');
            
            if (streams.length === 0) {
                activeStreamsDiv.style.display = 'none';
                return;
            }
            
            activeStreamsDiv.style.display = 'block';
            streamsList.innerHTML = streams.map(stream => {
                // Check if this stream is already displayed
                const isDisplayed = activeStreams.has(stream.id);
                return `
                    <div class="stream-item">
                        <div class="stream-info">
                            <div class="stream-name">${stream.name}</div>
                            <div class="stream-url">${stream.rtspUrl}</div>
                        </div>
                        <div class="stream-actions">
                            ${!isDisplayed ? `<button class="btn-small btn-primary" onclick="restoreStream('${stream.id}', '${stream.name}', '${stream.streamUrl}')">View</button>` : ''}
                            <button class="btn-small btn-stop" onclick="stopStream('${stream.id}')">Stop</button>
                        </div>
                    </div>
                `;
            }).join('');
        })
        .catch(error => {
            console.error('Error loading streams:', error);
        });
}

function restoreRunningStreams() {
    // Fetch all running streams from backend
    fetch('/api/streams')
        .then(response => response.json())
        .then(streams => {
            if (streams.length === 0) return;
            
            // Adjust layout if needed
            if (streams.length > currentLayout) {
                const newLayout = streams.length <= 2 ? 2 : 4;
                setLayout(newLayout);
            }
            
            // Restore each stream
            const grid = document.getElementById('streamsGrid');
            const containers = Array.from(grid.children);
            
            streams.forEach((stream, index) => {
                if (index < containers.length) {
                    const container = containers[index];
                    const streamData = {
                        streamId: stream.id,
                        streamUrl: stream.streamUrl,
                        name: stream.name
                    };
                    createStreamPlayer(container, streamData);
                }
            });
            
            showStatus(`Restored ${streams.length} active stream(s)`, 'info');
        })
        .catch(error => {
            console.error('Error restoring streams:', error);
        });
}

// Export functions for use in HTML onclick handlers
window.toggleAuthFields = toggleAuthFields;
window.toggleSrtpFields = toggleSrtpFields;
window.addStream = addStream;
window.stopStream = stopStream;
window.clearAllStreams = clearAllStreams;
window.setLayout = setLayout;
window.toggleSettings = toggleSettings;
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;
window.restoreStream = restoreStream;

function restoreStream(streamId, name, streamUrl) {
    // Find available container
    const grid = document.getElementById('streamsGrid');
    const containers = Array.from(grid.children);
    const availableContainer = containers.find(c => !c.dataset.streamId);
    
    if (!availableContainer) {
        showStatus('All stream slots are full. Remove a stream or increase layout size.', 'error');
        return;
    }
    
    const streamData = {
        streamId: streamId,
        streamUrl: streamUrl,
        name: name
    };
    
    createStreamPlayer(availableContainer, streamData);
    showStatus(`Stream "${name}" restored`, 'success');
    
    // Update the streams list
    loadActiveStreams();
}

// Handle Enter key in input fields
document.addEventListener('DOMContentLoaded', () => {
    const rtspInput = document.getElementById('rtspUrl');
    const nameInput = document.getElementById('streamName');
    
    if (rtspInput) {
        rtspInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addStream();
            }
        });
    }
    
    if (nameInput) {
        nameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                rtspInput.focus();
            }
        });
    }
});