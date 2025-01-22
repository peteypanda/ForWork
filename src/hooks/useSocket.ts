"use client";

import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import io from 'socket.io-client';

export const useSocket = (): Socket | null => {
  const [socket, setSocket] = useState<Socket | null>(null);

  const initSocket = useCallback(() => {
    if (typeof window === "undefined") return null;
    
    console.log('Initializing socket connection');
    const socketIo = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: false
    });

    socketIo.on('connect', () => {
      console.log('Socket connected:', socketIo.id);
      setSocket(socketIo);
    });

    socketIo.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      setSocket(null);
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          socketIo.connect();
        }, 1000);
      }
    });

    socketIo.on('connect_error', (error: Error) => {
      console.error('Connection error:', error);
      setSocket(null);
      
      // Type-safe transport check
      const currentTransports = (socketIo as any).io?.opts?.transports;
      if (Array.isArray(currentTransports) && currentTransports.includes('websocket')) {
        console.log('Falling back to polling');
        (socketIo as any).io.opts.transports = ['polling'];
      }
    });

    socketIo.connect();
    return socketIo;
  }, []);

  useEffect(() => {
    let socketInstance = initSocket();

    return () => {
      console.log('Cleaning up socket connection');
      if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
      }
    };
  }, [initSocket]);

  return socket;
};