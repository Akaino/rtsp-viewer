FROM node:18-alpine

# Install FFmpeg and other dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    git

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create directories for HLS output and logs
RUN mkdir -p /app/streams /app/logs

# Expose ports
EXPOSE 3010 8090

# Run the application
CMD ["node", "server.js"]