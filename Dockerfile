FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose HTTP port and MQTT port
EXPOSE 3000
EXPOSE 1883

# Default command (can be overridden)
CMD ["npm", "run", "start:backend"]
