const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const morgan = require('morgan');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3010;
const WS_PORT = process.env.WS_PORT || 8090;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));
app.use('/streams', express.static(path.join(__dirname, 'streams')));
app.use(express.static(path.join(__dirname, 'public')));

// Store active streams
const activeStreams = new Map();

// Cleanup function for old HLS files
function cleanupOldFiles(streamPath, maxAge = 300000) { // 5 minutes
    fs.readdir(streamPath, (err, files) => {
        if (err) return;
        
        files.forEach(file => {
            const filePath = path.join(streamPath, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                const now = new Date().getTime();
                const fileAge = now - stats.mtime.getTime();
                
                if (fileAge > maxAge && file.endsWith('.ts')) {
                    fs.unlink(filePath, err => {
                        if (err) console.error(`Error deleting ${filePath}:`, err);
                    });
                }
            });
        });
    });
}

// Stream class to manage individual RTSP streams
class RTSPStream {
    constructor(rtspUrl, streamId) {
        this.rtspUrl = rtspUrl;
        this.streamId = streamId;
        this.streamPath = path.join(__dirname, 'streams', streamId);
        this.ffmpegCommand = null;
        this.isRunning = false;
        this.viewers = 0;
        this.lastAccessed = new Date();
        
        // Create stream directory
        if (!fs.existsSync(this.streamPath)) {
            fs.mkdirSync(this.streamPath, { recursive: true });
        }
    }
    
    start() {
        if (this.isRunning) return;
        
        console.log(`Starting stream ${this.streamId} from ${this.rtspUrl}`);
        
        this.ffmpegCommand = ffmpeg(this.rtspUrl)
            .inputOptions([
                '-rtsp_transport', 'tcp',
                '-analyzeduration', '1000000',
                '-probesize', '1000000'
            ])
            .outputOptions([
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ac', '2',
                '-f', 'hls',
                '-hls_time', '2',
                '-hls_list_size', '10',
                '-hls_flags', 'delete_segments',
                '-hls_segment_type', 'mpegts',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency'
            ])
            .output(path.join(this.streamPath, 'stream.m3u8'))
            .on('start', (commandLine) => {
                console.log('FFmpeg started:', commandLine);
                this.isRunning = true;
            })
            .on('error', (err) => {
                console.error(`FFmpeg error for stream ${this.streamId}:`, err.message);
                this.isRunning = false;
            })
            .on('end', () => {
                console.log(`Stream ${this.streamId} ended`);
                this.isRunning = false;
            });
        
        this.ffmpegCommand.run();
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            cleanupOldFiles(this.streamPath);
        }, 30000); // Clean every 30 seconds
    }
    
    stop() {
        console.log(`Stopping stream ${this.streamId}`);
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        if (this.ffmpegCommand) {
            this.ffmpegCommand.kill('SIGTERM');
            this.ffmpegCommand = null;
        }
        
        this.isRunning = false;
        
        // Clean up stream files
        setTimeout(() => {
            fs.rm(this.streamPath, { recursive: true, force: true }, (err) => {
                if (err) console.error(`Error cleaning up stream ${this.streamId}:`, err);
            });
        }, 5000);
    }
    
    addViewer() {
        this.viewers++;
        this.lastAccessed = new Date();
    }
    
    removeViewer() {
        this.viewers = Math.max(0, this.viewers - 1);
        if (this.viewers === 0) {
            // Stop stream after 1 minute of no viewers
            setTimeout(() => {
                if (this.viewers === 0) {
                    this.stop();
                    activeStreams.delete(this.streamId);
                }
            }, 60000);
        }
    }
}

// API Routes

// Start a new stream
app.post('/api/stream/start', (req, res) => {
    const { rtspUrl } = req.body;
    
    if (!rtspUrl) {
        return res.status(400).json({ error: 'RTSP URL is required' });
    }
    
    // Check if stream already exists
    for (const [streamId, stream] of activeStreams) {
        if (stream.rtspUrl === rtspUrl) {
            stream.addViewer();
            return res.json({
                streamId,
                hlsUrl: `/streams/${streamId}/stream.m3u8`,
                status: 'existing'
            });
        }
    }
    
    // Create new stream
    const streamId = uuidv4();
    const stream = new RTSPStream(rtspUrl, streamId);
    
    activeStreams.set(streamId, stream);
    stream.start();
    stream.addViewer();
    
    // Wait a moment for the stream to initialize
    setTimeout(() => {
        res.json({
            streamId,
            hlsUrl: `/streams/${streamId}/stream.m3u8`,
            status: 'new'
        });
    }, 2000);
});

// Stop a stream
app.post('/api/stream/stop', (req, res) => {
    const { streamId } = req.body;
    
    if (!streamId) {
        return res.status(400).json({ error: 'Stream ID is required' });
    }
    
    const stream = activeStreams.get(streamId);
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    
    stream.removeViewer();
    res.json({ message: 'Viewer removed from stream' });
});

// Get stream status
app.get('/api/stream/:streamId/status', (req, res) => {
    const { streamId } = req.params;
    const stream = activeStreams.get(streamId);
    
    if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    
    res.json({
        streamId,
        isRunning: stream.isRunning,
        viewers: stream.viewers,
        lastAccessed: stream.lastAccessed
    });
});

// Get all active streams
app.get('/api/streams', (req, res) => {
    const streams = Array.from(activeStreams.entries()).map(([streamId, stream]) => ({
        streamId,
        rtspUrl: stream.rtspUrl,
        isRunning: stream.isRunning,
        viewers: stream.viewers,
        lastAccessed: stream.lastAccessed
    }));
    
    res.json(streams);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        activeStreams: activeStreams.size,
        uptime: process.uptime()
    });
});

// WebSocket server for real-time updates (optional)
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'subscribe' && data.streamId) {
                const stream = activeStreams.get(data.streamId);
                if (stream) {
                    ws.streamId = data.streamId;
                    stream.addViewer();
                }
            }
        } catch (err) {
            console.error('WebSocket message error:', err);
        }
    });
    
    ws.on('close', () => {
        if (ws.streamId) {
            const stream = activeStreams.get(ws.streamId);
            if (stream) {
                stream.removeViewer();
            }
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`RTSP to HLS proxy server running on port ${PORT}`);
    console.log(`WebSocket server running on port ${WS_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    // Stop all streams
    for (const [streamId, stream] of activeStreams) {
        stream.stop();
    }
    
    // Close servers
    wss.close();
    process.exit(0);
});