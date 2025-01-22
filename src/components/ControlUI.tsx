"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';

const screens = [
  { id: 'pid1', name: 'PID 1' },
  { id: 'pid2', name: 'PID 2' },
  { id: 'pid3', name: 'PID 3' },
  { id: 'pid4', name: 'PID 4' },
  { id: 'outbound', name: 'Outbound Dock' },
  { id: 'dockclerk', name: 'Dock Clerk' },
];

export default function ControlUI() {
  const [isSharing, setIsSharing] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null);
  const [isSelectingScreen, setIsSelectingScreen] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const socket = useSocket();

  const addDebugMessage = (message: string) => {
    console.log(message);
    setDebugInfo(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  useEffect(() => {
    if (!socket) {
      addDebugMessage('Waiting for socket connection...');
      return;
    }

    const handleSignal = async (data: any) => {
      if (!peerConnection.current) return;

      try {
        if (data.type === 'answer') {
          addDebugMessage('Received answer');
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === 'candidate' && data.candidate) {
          addDebugMessage('Received ICE candidate');
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Error handling signal:', error);
        addDebugMessage(`Signal error: ${error}`);
        setError('Failed to establish connection');
      }
    };

    socket.on('signal', handleSignal);

    return () => {
      socket.off('signal', handleSignal);
      stopSharing();
    };
  }, [socket]);

  const initializePeerConnection = () => {
    addDebugMessage('Initializing peer connection');
    
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

    if (!peerConnection.current || !socket || !selectedScreen) return;

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        addDebugMessage('Sending ICE candidate');
        socket.emit('signal', {
          type: 'candidate',
          candidate: event.candidate,
          screenName: selectedScreen
        });
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current?.connectionState;
      addDebugMessage(`Connection state changed to: ${state}`);
      
      if (state === 'failed') {
        setError('Connection failed. Attempting to reconnect...');
        setTimeout(() => {
          if (isSharing) {
            addDebugMessage('Attempting to reconnect...');
            confirmSharing();
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
  };

  const startSharing = async () => {
    setError(null);
    setDebugInfo([]);
    setIsSelectingScreen(true);
  };

  const confirmSharing = async () => {
    if (!selectedScreen || !socket) {
      setError('Please select a screen to share');
      return;
    }

    addDebugMessage(`Starting share process for screen: ${selectedScreen}`);
    socket.emit('join-room', selectedScreen);

    try {
      let stream: MediaStream;

      if (screenshot) {
        const img = new Image();
        img.src = URL.createObjectURL(screenshot);
        await new Promise((resolve) => (img.onload = resolve));
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        stream = canvas.captureStream();
        addDebugMessage('Created stream from screenshot');
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: false
        });
        addDebugMessage('Got display media stream');
      }

      streamRef.current = stream;
      initializePeerConnection();

      if (!peerConnection.current) {
        throw new Error('Failed to initialize peer connection');
      }

      stream.getTracks().forEach(track => {
        if (peerConnection.current && streamRef.current) {
          peerConnection.current.addTrack(track, streamRef.current);
        }
      });
      addDebugMessage('Added tracks to peer connection');

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      addDebugMessage('Created and set local description');

      socket.emit('signal', {
        type: 'offer',
        offer,
        screenName: selectedScreen
      });
      addDebugMessage('Sent offer');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsSharing(true);
      setIsSelectingScreen(false);

      stream.getVideoTracks()[0].onended = () => {
        addDebugMessage('Stream ended by user');
        stopSharing();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
      addDebugMessage(`Error: ${error}`);
      setError('Failed to start screen sharing');
      setIsSelectingScreen(false);
    }
  };

  const stopSharing = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (socket && selectedScreen) {
      socket.emit('stop-screenshare', { screenName: selectedScreen });
      addDebugMessage('Sent stop-screenshare signal');
    }

    setIsSharing(false);
    setSelectedScreen(null);
    setScreenshot(null);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-6">Screen Sharing Control</h1>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      <div className="space-y-6 w-full max-w-md">
        <div className="flex space-x-4">
          <button
            onClick={startSharing}
            disabled={isSharing}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Start Sharing
          </button>
          <button
            onClick={stopSharing}
            disabled={!isSharing}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            Stop Sharing
          </button>
        </div>
        <div className="space-y-2">
          <label htmlFor="screenshot-upload" className="block text-sm font-medium text-gray-700">
            Upload Screenshot
          </label>
          <input
            id="screenshot-upload"
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setScreenshot(file);
            }}
            accept="image/*"
            disabled={isSharing}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
      </div>
      <div className="mt-6 w-full max-w-2xl">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full border border-gray-300 rounded-lg"
        />
      </div>
      {isSharing && selectedScreen && (
        <div className="mt-4 text-center">
          <p className="text-green-600 font-semibold">
            Currently sharing to: {screens.find((s) => s.id === selectedScreen)?.name}
            {screenshot ? " (Screenshot)" : ""}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Viewer URL: {`${window.location.origin}/viewer?screen=${selectedScreen}`}
          </p>
        </div>
      )}

      {isSelectingScreen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Select Screen to Share To</h2>
            <select
              value={selectedScreen || ''}
              onChange={(e) => setSelectedScreen(e.target.value)}
              className="w-full mb-4 p-2 border rounded"
            >
              <option value="">Choose a screen</option>
              {screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsSelectingScreen(false)}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmSharing}
                disabled={!selectedScreen}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
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