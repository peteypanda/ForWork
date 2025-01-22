"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';

export default function ViewerUI() {
  const [isConnected, setIsConnected] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const socket = useSocket();

  const addDebugMessage = (message: string) => {
    console.log(message);
    setDebugInfo(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  useEffect(() => {
    const initConnection = async () => {
      if (!socket) {
        addDebugMessage('Waiting for socket connection...');
        return;
      }

      addDebugMessage('Socket initialized');

      const urlParams = new URLSearchParams(window.location.search);
      const screen = urlParams.get('screen');
      
      if (screen) {
        addDebugMessage(`Joining room: ${screen}`);
        socket.emit('join-room', screen);
        await new Promise(resolve => setTimeout(resolve, 1000));
        initializePeerConnection(screen);
      } else {
        addDebugMessage('No screen parameter found in URL');
      }
    };

    initConnection();

    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, [socket]);

  const initializePeerConnection = (screen: string) => {
    if (!socket) return;

    addDebugMessage('Initializing peer connection');

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    try {
      peerConnection.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10
      });

      peerConnection.current.ontrack = (event) => {
        addDebugMessage('Received track');
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setIsConnected(true);
        }
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDebugMessage('Sending ICE candidate');
          socket.emit('signal', {
            type: 'candidate',
            candidate: event.candidate,
            screenName: screen
          });
        }
      };

      peerConnection.current.onconnectionstatechange = () => {
        const state = peerConnection.current?.connectionState;
        addDebugMessage(`Connection state changed to: ${state}`);
        
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          setIsConnected(false);
          setTimeout(() => {
            if (isConnected) {
              addDebugMessage('Attempting to reconnect...');
              initializePeerConnection(screen);
            }
          }, 2000);
        }
      };

      peerConnection.current.oniceconnectionstatechange = () => {
        const state = peerConnection.current?.iceConnectionState;
        addDebugMessage(`ICE connection state: ${state}`);
        if (state === 'failed') {
          peerConnection.current?.restartIce();
        }
      };

      socket.on('signal', async (data) => {
        try {
          addDebugMessage(`Received signal: ${data.type}`);
          if (!peerConnection.current) return;

          if (data.type === 'offer') {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            
            socket.emit('signal', {
              type: 'answer',
              answer,
              screenName: screen
            });
          } else if (data.type === 'candidate' && data.candidate) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        } catch (error) {
          addDebugMessage(`Error handling signal: ${error}`);
        }
      });

      socket.on('stop-screenshare', () => {
        addDebugMessage('Received stop-screenshare signal');
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setIsConnected(false);
      });

    } catch (error) {
      addDebugMessage(`Error setting up peer connection: ${error}`);
      setIsConnected(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-contain ${isConnected ? 'opacity-100' : 'opacity-0'}`}
      />
      {!isConnected && (
        <div className="text-white text-2xl text-center p-4">
          Waiting for connection...
        </div>
      )}
      {/* Debug information */}
      <div className="fixed bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-4 max-h-48 overflow-auto">
        <h3 className="font-bold mb-2">Debug Info:</h3>
        {debugInfo.map((msg, i) => (
          <div key={i} className="text-sm">{msg}</div>
        ))}
      </div>
    </div>
  );
}