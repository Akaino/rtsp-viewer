const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;
const STREAM_DIR = path.join(__dirname, 'streams');

// Ensure streams directory exists
if (!fs.existsSync(STREAM_DIR)) {
    fs.mkdirSync(STREAM_DIR, { recursive: true });
}

console.log('Starting server with config:', {
    workingDir: process.cwd(),
    __dirname: __dirname,
    streamDir: STREAM_DIR,
    streamDirExists: fs.existsSync(STREAM_DIR)
});

// Middleware
app.use(cors());
app.use(express.json());

// Debug middleware to log requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Serve static files from streams directory
app.use('/streams', express.static(STREAM_DIR, {
    setHeaders: (res, path) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Range');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
        
        if (path.endsWith('.m3u8')) {
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (path.endsWith('.ts')) {
            res.set('Content-Type', 'video/mp2t');
        }
    }
}));

// Debug route - must come AFTER the static middleware
app.get('/streams/*', (req, res) => {
    const fullUrl = req.originalUrl || req.url;
    const streamPath = fullUrl.replace('/streams/', '');
    const fullPath = path.join(STREAM_DIR, streamPath);
    
    console.log('404 Debug:', {
        originalUrl: req.originalUrl,
        url: req.url,
        streamPath: streamPath,
        fullPath: fullPath,
        exists: fs.existsSync(fullPath),
        dirContents: fs.existsSync(STREAM_DIR) ? fs.readdirSync(STREAM_DIR) : 'Streams dir not found'
    });
    
    res.status(404).json({
        error: 'File not found',
        requested: fullUrl,
        debug: {
            streamDir: STREAM_DIR,
            fullPath: fullPath,
            exists: fs.existsSync(fullPath)
        }
    });
});

// Log the streams directory path for debugging
console.log('Streams directory:', STREAM_DIR);
console.log('Directory exists:', fs.existsSync(STREAM_DIR));

// Store active FFmpeg processes
const activeStreams = new Map();

// Clean up old stream files
function cleanupOldStreams() {
    fs.readdir(STREAM_DIR, (err, files) => {
        if (err) return;
        
        files.forEach(file => {
            const filePath = path.join(STREAM_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                // Delete files older than 1 hour
                const ageInMs = Date.now() - stats.mtime.getTime();
                if (ageInMs > 3600000) {
                    fs.unlink(filePath, err => {
                        if (err) console.error(`Error deleting ${file}:`, err);
                    });
                }
            });
        });
    });
}

// Run cleanup every 30 minutes
setInterval(cleanupOldStreams, 1800000);

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', activeStreams: activeStreams.size });
});

app.post('/api/stream', (req, res) => {
    const { rtspUrl, name } = req.body;
    
    if (!rtspUrl) {
        return res.status(400).json({ error: 'RTSP URL is required' });
    }
    
    // Generate unique stream ID
    const streamId = Date.now().toString();
    const outputPath = path.join(STREAM_DIR, streamId);
    
    // Create directory for this stream
    fs.mkdirSync(outputPath, { recursive: true });
    
    // FFmpeg command balanced for low latency and stability
    const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-fflags', '+genpts+discardcorrupt',
        '-flags', 'low_delay',
        '-i', rtspUrl,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-x264opts', 'keyint=30:min-keyint=30:scenecut=-1',
        '-b:v', '2M',
        '-maxrate', '2.5M',
        '-bufsize', '2M',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '1',                      // 1 second segments
        '-hls_list_size', '5',                 // Keep 5 segments
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_type', 'mpegts',
        '-hls_start_number_source', 'epoch',
        '-start_number', '0',
        '-hls_segment_filename', path.join(outputPath, 'segment%03d.ts'),
        path.join(outputPath, 'playlist.m3u8')
    ];
    
    console.log('Starting FFmpeg with args:', ffmpegArgs);
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    // Store the process
    activeStreams.set(streamId, {
        process: ffmpeg,
        rtspUrl: rtspUrl,
        name: name || `Stream ${streamId}`,
        startTime: new Date()
    });
    
    // Wait for playlist to be created by FFmpeg
    let checkCount = 0;
    const maxChecks = 30; // 15 seconds maximum
    const checkInterval = setInterval(() => {
        const playlistPath = path.join(outputPath, 'playlist.m3u8');
        checkCount++;
        
        if (fs.existsSync(playlistPath)) {
            // Check if playlist has segments
            const content = fs.readFileSync(playlistPath, 'utf8');
            if (content.includes('.ts')) {
                clearInterval(checkInterval);
                res.json({
                    streamId: streamId,
                    streamUrl: `/streams/${streamId}/playlist.m3u8`,
                    name: name || `Stream ${streamId}`,
                    message: 'Stream processing started'
                });
            }
        }
        
        if (checkCount >= maxChecks) {
            clearInterval(checkInterval);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Stream failed to start',
                    message: 'No video segments were generated'
                });
            }
        }
    }, 500);
    
    ffmpeg.stderr.on('data', (data) => {
        console.log(`FFmpeg output: ${data}`);
    });
    
    ffmpeg.on('error', (error) => {
        console.error(`FFmpeg error: ${error}`);
        activeStreams.delete(streamId);
        
        // Notify connected clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'error',
                    streamId: streamId,
                    message: 'Stream processing error'
                }));
            }
        });
    });
    
    ffmpeg.on('close', (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
        activeStreams.delete(streamId);
        
        // Clean up stream files after a delay
        setTimeout(() => {
            fs.rm(outputPath, { recursive: true, force: true }, (err) => {
                if (err) console.error(`Error cleaning up stream ${streamId}:`, err);
            });
        }, 5000);
    });
});

app.post('/api/stream/stop', (req, res) => {
    const { streamId } = req.body;
    
    if (streamId && activeStreams.has(streamId)) {
        const stream = activeStreams.get(streamId);
        stream.process.kill('SIGTERM');
        activeStreams.delete(streamId);
        
        res.json({ message: 'Stream stopped successfully' });
    } else {
        // Stop all streams if no specific ID provided
        activeStreams.forEach((stream, id) => {
            stream.process.kill('SIGTERM');
        });
        activeStreams.clear();
        
        res.json({ message: 'All streams stopped' });
    }
});

app.get('/api/streams', (req, res) => {
    const streams = Array.from(activeStreams.entries()).map(([id, stream]) => ({
        id: id,
        rtspUrl: stream.rtspUrl,
        name: stream.name,
        startTime: stream.startTime,
        uptime: Date.now() - stream.startTime.getTime(),
        streamUrl: `/streams/${id}/playlist.m3u8`
    }));
    
    res.json(streams);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
    console.log(`RTSP Stream Server running on port ${PORT}`);
    cleanupOldStreams(); // Initial cleanup
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    // Stop all active streams
    activeStreams.forEach((stream) => {
        stream.process.kill('SIGTERM');
    });
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});