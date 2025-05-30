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
}function restoreRunningStreams() {
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
}// Store active streams
const activeStreams = new Map();
let currentLayout = 2;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
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

function addStream() {
    const nameInput = document.getElementById('streamName');
    const urlInput = document.getElementById('rtspUrl');
    const name = nameInput.value.trim();
    const rtspUrl = urlInput.value.trim();
    
    if (!rtspUrl) {
        showStatus('Please enter an RTSP URL', 'error');
        return;
    }

    if (!rtspUrl.startsWith('rtsp://')) {
        showStatus('Invalid RTSP URL. URL must start with rtsp://', 'error');
        return;
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
    
    // Start stream
    startStream(rtspUrl, name, availableContainer);
}

function startStream(rtspUrl, name, container) {
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
        body: JSON.stringify({ rtspUrl, name })
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
    
    // Add a small delay to allow FFmpeg to create initial segments
    setTimeout(() => {
        const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,              // Keep 30 seconds of back buffer
            maxBufferLength: 3,                // 3 seconds of forward buffer
            maxMaxBufferLength: 5,             // Maximum 5 seconds
            maxBufferSize: 60 * 1000 * 1000,  // 60 MB buffer
            maxBufferHole: 0.5,                // Allow small gaps
            highBufferWatchdogPeriod: 2,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 3,
            maxFragLookUpTolerance: 0.25,
            liveSyncDurationCount: 3,          // Stay within 3 segments of live
            liveMaxLatencyDurationCount: 5,    // Maximum 5 segments behind
            liveDurationInfinity: true,
            preferManagedMediaSource: false,
            testBandwidth: false,
            startLevel: -1,
            fragLoadingTimeOut: 20000,         // 20 second timeout
            fragLoadingMaxRetry: 3,
            fragLoadingRetryDelay: 1000,
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 3,
            manifestLoadingRetryDelay: 1000,
            levelLoadingTimeOut: 10000,
            levelLoadingMaxRetry: 3,
            levelLoadingRetryDelay: 1000
        });
        
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        
        let retryCount = 0;
        const maxRetries = 10;
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play();
        });
        
        // Periodically check if we're falling behind live edge
        setInterval(() => {
            if (video.buffered.length > 0) {
                const liveEdge = video.buffered.end(video.buffered.length - 1);
                const delay = liveEdge - video.currentTime;
                
                // If we're more than 5 seconds behind, gently speed up
                if (delay > 5) {
                    video.playbackRate = 1.1;
                } else if (delay > 3) {
                    video.playbackRate = 1.05;
                } else {
                    video.playbackRate = 1.0;
                }
            }
        }, 5000);
        
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