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

# Copy package.json first
COPY package.json ./
COPY server.js ./

# Install dependencies using npm install (more forgiving than npm ci)
RUN npm install --only=production

# Copy application files
COPY . .

# Create directories for HLS output and logs
RUN mkdir -p /app/streams /app/logs /app/public

# Expose ports
EXPOSE 3000 8080

# Run the application
CMD ["node", "server.js"]