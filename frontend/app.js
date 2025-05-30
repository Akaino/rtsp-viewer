let hls = null;
let reconnectInterval = null;
const backendUrl = window.location.protocol + '//' + window.location.hostname + ':8080';
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

function connectStream() {
    const rtspUrl = document.getElementById('rtspUrl').value.trim();

    if (!rtspUrl) {
        showStatus('Please enter an RTSP URL', 'error');
        return;
    }

    // Validate RTSP URL format
    if (!rtspUrl.startsWith('rtsp://')) {
        showStatus('Invalid RTSP URL. URL must start with rtsp://', 'error');
        return;
    }

    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    document.getElementById('connectBtn').disabled = true;

    // Request HLS stream from backend
    fetch(`${backendUrl}/api/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rtspUrl: rtspUrl })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }

            // Initialize HLS.js
            const video = document.getElementById('videoPlayer');
            const streamUrl = `${backendUrl}${data.streamUrl}`;

            if (Hls.isSupported()) {
                if (hls) {
                    hls.destroy();
                }

                hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });

                hls.loadSource(streamUrl);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, function () {
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('videoPlayer').style.display = 'block';
                    document.getElementById('disconnectBtn').disabled = false;
                    showStatus('Stream connected successfully', 'success');
                    video.play();
                });

                hls.on(Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                showStatus('Network error occurred. Attempting to recover...', 'error');
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                showStatus('Media error occurred. Attempting to recover...', 'error');
                                hls.recoverMediaError();
                                break;
                            default:
                                showStatus('Fatal error occurred. Please reconnect.', 'error');
                                disconnectStream();
                                break;
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // For Safari
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', function () {
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('videoPlayer').style.display = 'block';
                    document.getElementById('disconnectBtn').disabled = false;
                    showStatus('Stream connected successfully', 'success');
                    video.play();
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showStatus(`Failed to connect: ${error.message}`, 'error');
            document.getElementById('loading').style.display = 'none';
            document.getElementById('placeholder').style.display = 'block';
            document.getElementById('connectBtn').disabled = false;
        });
}

function disconnectStream() {
    if (hls) {
        hls.destroy();
        hls = null;
    }

    const video = document.getElementById('videoPlayer');
    video.src = '';
    video.style.display = 'none';

    document.getElementById('placeholder').style.display = 'block';
    document.getElementById('connectBtn').disabled = false;
    document.getElementById('disconnectBtn').disabled = true;

    // Notify backend to stop stream
    fetch(`${backendUrl}/api/stream/stop`, {
        method: 'POST'
    });

    showStatus('Stream disconnected', 'info');
}

// Handle Enter key in input field
document.getElementById('rtspUrl').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        connectStream();
    }
});