# Use Node.js 18 Alpine as base image
FROM node:24-alpine

# Install FFmpeg and other dependencies
RUN apk update --no-cache
RUN apk upgrade --no-cache
RUN apk add --no-cache bash
RUN apk add --no-cache ffmpeg
RUN apk add --no-cache curl

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package.json ./

# Install app dependencies
RUN npm install --production

# Create streams directory
RUN mkdir -p /usr/src/app/streams

# Copy app source
COPY server.js ./

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application
CMD ["node", "server.js"]