// Store active streams
const activeStreams = new Map();
let currentLayout = 2;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setLayout(2);
    loadActiveStreams();
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
    const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
    });
    
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
            console.error('HLS Error:', data);
            showStatus(`Stream error: ${data.type}`, 'error');
        }
    });
    
    // Store HLS instance
    activeStreams.set(streamId, { hls, container, streamData });
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
            streamsList.innerHTML = streams.map(stream => `
                <div class="stream-item">
                    <div class="stream-info">
                        <div class="stream-name">${stream.name}</div>
                        <div class="stream-url">${stream.rtspUrl}</div>
                    </div>
                    <div class="stream-actions">
                        <button class="btn-small btn-stop" onclick="stopStream('${stream.id}')">Stop</button>
                    </div>
                </div>
            `).join('');
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