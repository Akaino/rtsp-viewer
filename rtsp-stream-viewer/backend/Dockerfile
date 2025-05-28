# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Install FFmpeg and other dependencies
RUN apk update && \
    apk add --no-cache \
    ffmpeg \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Create streams directory
RUN mkdir -p /usr/src/app/streams

# Copy app source
COPY server.js ./

# Create a non-root user to run the app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src/app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application
CMD ["node", "server.js"]