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

// Middleware
app.use(cors());
app.use(express.json());
app.use('/streams', express.static(STREAM_DIR));

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
    const { rtspUrl } = req.body;
    
    if (!rtspUrl) {
        return res.status(400).json({ error: 'RTSP URL is required' });
    }
    
    // Generate unique stream ID
    const streamId = Date.now().toString();
    const outputPath = path.join(STREAM_DIR, streamId);
    
    // Create directory for this stream
    fs.mkdirSync(outputPath, { recursive: true });
    
    // FFmpeg command to convert RTSP to HLS
    const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', rtspUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', path.join(outputPath, 'segment%03d.ts'),
        path.join(outputPath, 'playlist.m3u8')
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    // Store the process
    activeStreams.set(streamId, {
        process: ffmpeg,
        rtspUrl: rtspUrl,
        startTime: new Date()
    });
    
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
    
    // Wait a moment for FFmpeg to start processing
    setTimeout(() => {
        res.json({
            streamId: streamId,
            streamUrl: `/streams/${streamId}/playlist.m3u8`,
            message: 'Stream processing started'
        });
    }, 100);
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
        startTime: stream.startTime,
        uptime: Date.now() - stream.startTime.getTime()
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