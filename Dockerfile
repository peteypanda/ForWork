# Use Node.js LTS
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Build the app
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "run", "dev"]