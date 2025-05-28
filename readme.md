# RTSP to HLS Proxy Server

A Docker-based media server proxy that converts RTSP streams to HLS format for web browser playback. Perfect for IP camera streaming and compatible with Portainer deployment.

## Features

- 🎥 **RTSP to HLS Conversion** - Real-time stream conversion using FFmpeg
- 🌐 **Web-based Player** - Built-in HTML5 video player with HLS.js support
- 🔄 **Automatic Stream Management** - Auto-start/stop based on viewer count
- 🐳 **Docker Ready** - Easy deployment with Docker and Portainer
- 📊 **Stream Monitoring** - Real-time status updates and viewer counting
- 🧹 **Auto Cleanup** - Automatic removal of old HLS segments
- ⚡ **Low Latency** - Optimized for minimal delay
- 🔌 **WebSocket Support** - Real-time updates (optional)

## Quick Start

### Using Docker Compose

1. Clone or create the files in a directory
2. Build and run:
```bash
docker-compose up -d
```

### Using Portainer

1. **Stack Deployment**:
   - Go to Stacks → Add Stack
   - Name: `rtsp-proxy`
   - Paste the docker-compose.yml content
   - Deploy the stack

2. **Alternative - Build from Repository**:
   - Create a GitHub repository with all files
   - In Portainer: Stacks → Add Stack → Repository
   - Configure repository settings and deploy

## File Structure

```
rtsp-proxy/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
├── .env.example
├── public/
│   └── index.html
└── streams/           # HLS output directory (auto-created)
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

- `PORT` - HTTP server port (default: 3000)
- `WS_PORT` - WebSocket server port (default: 8080)
- `NODE_ENV` - Environment (production/development)

### Docker Compose Variables

Modify `docker-compose.yml` for:
- Port mappings
- Volume mounts
- Network configuration
- Traefik labels (if using reverse proxy)

## API Endpoints

### Start Stream
```bash
POST /api/stream/start
Content-Type: application/json

{
  "rtspUrl": "rtsp://username:password@camera-ip:554/stream"
}
```

Response:
```json
{
  "streamId": "uuid",
  "hlsUrl": "/streams/uuid/stream.m3u8",
  "status": "new|existing"
}
```

### Stop Stream
```bash
POST /api/stream/stop
Content-Type: application/json

{
  "streamId": "uuid"
}
```

### Get Stream Status
```bash
GET /api/stream/{streamId}/status
```

### List Active Streams
```bash
GET /api/streams
```

### Health Check
```bash
GET /health
```

## Usage

### Web Interface

1. Open browser to `http://your-server:3000`
2. Enter RTSP URL (e.g., `rtsp://admin:pass@192.168.1.100:554/stream`)
3. Click "Start Stream"
4. Video will begin playing after a few seconds

### Programmatic Usage

```javascript
// Start a stream
const response = await fetch('http://localhost:3000/api/stream/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rtspUrl: 'rtsp://...' })
});

const { streamId, hlsUrl } = await response.json();

// Use HLS URL in video player
videoElement.src = `http://localhost:3000${hlsUrl}`;
```

## Supported Cameras

Tested with:
- Hikvision
- Dahua
- Axis
- Foscam
- Amcrest
- Most ONVIF-compatible cameras

### Common RTSP URLs

- **Hikvision**: `rtsp://user:pass@ip:554/Streaming/Channels/101`
- **Dahua**: `rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0`
- **Axis**: `rtsp://user:pass@ip/axis-media/media.amp`

## Performance Tuning

### FFmpeg Options

Modify in `server.js`:
```javascript
.outputOptions([
  '-c:v', 'copy',        // Copy video codec (no transcoding)
  '-c:a', 'aac',         // Audio codec
  '-hls_time', '2',      // Segment duration (seconds)
  '-hls_list_size', '10' // Playlist size
])
```

### For Low Latency

- Reduce `hls_time` to 1 second
- Decrease `hls_list_size` to 3-5
- Enable `lowLatencyMode` in HLS.js

### For High Quality

- Use `-c:v libx264` instead of `copy`
- Add `-preset slow -crf 22`
- Increase bitrate settings

## Troubleshooting

### Stream Won't Start

1. Check RTSP URL is accessible:
```bash
ffplay rtsp://your-url
```

2. Verify network connectivity from container:
```bash
docker exec rtsp-proxy ping camera-ip
```

3. Check logs:
```bash
docker logs rtsp-proxy
```

### High CPU Usage

- Ensure using `-c:v copy` (no transcoding)
- Reduce number of concurrent streams
- Consider hardware acceleration

### Connection Refused

- Check firewall rules
- Verify RTSP port (usually 554)
- Try TCP transport: add `?tcp` to RTSP URL

## Security Considerations

1. **Authentication**: Add authentication middleware for production
2. **HTTPS**: Use reverse proxy (Traefik/Nginx) for SSL
3. **Rate Limiting**: Implement to prevent abuse
4. **Input Validation**: Already included for RTSP URLs
5. **Network Isolation**: Use Docker networks appropriately

## Advanced Deployment

### With Traefik

The docker-compose.yml includes Traefik labels. Configure:
1. Set your domain in labels
2. Ensure Traefik network exists
3. Configure SSL certificates

### Scaling

For multiple instances:
- Use shared storage for HLS files (NFS/S3)
- Implement Redis for stream coordination
- Load balance with Nginx/HAProxy

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use in your projects