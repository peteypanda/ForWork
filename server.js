const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();

// Track active connections
const activeRooms = new Map();

nextApp.prepare().then(() => {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/socket.io/",
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e8,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
  });

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-room', async (room) => {
      console.log(`Socket ${socket.id} joining room: ${room}`);
      
      // Leave all other rooms first
      const currentRooms = Array.from(socket.rooms);
      for (const currentRoom of currentRooms) {
        if (currentRoom !== socket.id) {
          await socket.leave(currentRoom);
        }
      }
      
      // Join new room
      await socket.join(room);
      
      if (!activeRooms.has(room)) {
        activeRooms.set(room, new Set());
      }
      activeRooms.get(room).add(socket.id);

      console.log(`Room ${room} users:`, Array.from(activeRooms.get(room)));
    });

    socket.on('signal', (data) => {
      console.log(`Signal from ${socket.id} to ${data.screenName}:`, data.type);
      
      if (data.screenName) {
        socket.to(data.screenName).emit('signal', {
          ...data,
          from: socket.id
        });
      }
    });

    socket.on('stop-screenshare', (data) => {
      console.log(`Stop screenshare from ${socket.id} to ${data.screenName}`);
      if (data.screenName) {
        io.to(data.screenName).emit('stop-screenshare', {
          from: socket.id
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      for (const [room, users] of activeRooms.entries()) {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          if (users.size === 0) {
            activeRooms.delete(room);
          }
        }
      }
    });
  });

  app.all('*', (req, res) => {
    return nextHandler(req, res);
  });

  const PORT = process.env.PORT || 80;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
