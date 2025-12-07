// src/components/CollaborativeTimer.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const CollaborativeTimer = ({ projectId, isManager, onTimeUpdate }) => {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [lastStartTime, setLastStartTime] = useState(null);
  const [initialOffset, setInitialOffset] = useState(0);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Format time for display (e.g., "+01:23:45" or "-00:30:00")
  const formatTime = (totalSeconds) => {
    const isNegative = totalSeconds < 0;
    const absSeconds = Math.abs(totalSeconds);
    const hours = Math.floor(absSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (absSeconds % 60).toString().padStart(2, '0');
    return (isNegative ? '-' : '+') + hours + ':' + minutes + ':' + seconds;
  };

  // Initial fetch on mount
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/timer/${projectId}`);
        const data = await response.json();
        
        setInitialOffset(data.initialOffset || 0);
        setIsRunning(data.isRunning || false);
        // Parse UTC time string correctly (avoid timezone issues)
        let parsedStartTime = null;
        if (data.lastStartTime) {
          // Check if string already ends with 'Z' or timezone offset
          const timeString = data.lastStartTime.endsWith('Z') || data.lastStartTime.includes('+') || data.lastStartTime.includes('-', 10)
            ? data.lastStartTime 
            : data.lastStartTime + 'Z';
          parsedStartTime = new Date(timeString);
          // Validate the parsed date
          if (isNaN(parsedStartTime.getTime())) {
            console.error('Invalid date string from server:', data.lastStartTime);
            parsedStartTime = null;
          }
        }
        setLastStartTime(parsedStartTime);
        
        // Calculate initial elapsed time
        let initialElapsed = data.initialOffset || 0;
        if (data.isRunning && parsedStartTime && !isNaN(parsedStartTime.getTime())) {
          // Use UTC time to avoid timezone issues
          const now = new Date();
          const elapsedSinceStart = Math.floor((now - parsedStartTime) / 1000);
          initialElapsed += elapsedSinceStart;
        }
        setSecondsElapsed(initialElapsed);
        
        // Notify parent component of initial time
        if (onTimeUpdate) {
          onTimeUpdate(initialElapsed);
        }
      } catch (error) {
        console.error('Failed to fetch initial timer state', error);
      }
    };

    fetchInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Remove onTimeUpdate from dependencies to prevent infinite loop

  // Socket connection and listeners
  useEffect(() => {
    // Establish Socket.IO connection
    const newSocket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Set socket immediately so handlers can use it
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      // Join the timer room for this project
      newSocket.emit('join_timer_room', { project_id: projectId });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    // Check initial connection state
    if (newSocket.connected) {
      setIsConnected(true);
      newSocket.emit('join_timer_room', { project_id: projectId });
    }

    // Listen for timer state updates from server
    newSocket.on('timerStateUpdate', (data) => {
      console.log('Timer state update received:', data);
      
      setInitialOffset(data.initialOffset || 0);
      setIsRunning(data.isRunning);
      // Parse UTC time string correctly (avoid timezone issues)
      let parsedStartTime = null;
      if (data.lastStartTime) {
        // Backend sends isoformat() + 'Z', so it should already have 'Z'
        // But handle both cases to be safe
        let timeString = data.lastStartTime;
        
        // If it doesn't end with Z and doesn't have timezone info, add Z
        if (!timeString.endsWith('Z') && !timeString.match(/[+-]\d{2}:\d{2}$/)) {
          timeString = timeString + 'Z';
        }
        
        console.log('Parsing date string:', timeString, 'original:', data.lastStartTime);
        parsedStartTime = new Date(timeString);
        
        // Validate the parsed date
        if (isNaN(parsedStartTime.getTime())) {
          console.error('Invalid date string from server in timerStateUpdate:', {
            original: data.lastStartTime,
            processed: timeString,
            parsed: parsedStartTime
          });
          parsedStartTime = null;
        } else {
          console.log('Successfully parsed date:', parsedStartTime);
        }
      }
      setLastStartTime(parsedStartTime);
      
      // Calculate current elapsed time
      let currentElapsed = data.initialOffset || 0;
      if (data.isRunning && parsedStartTime && !isNaN(parsedStartTime.getTime())) {
        // Use UTC time to avoid timezone issues
        const now = new Date();
        const elapsedSinceStart = Math.floor((now - parsedStartTime) / 1000);
        currentElapsed += elapsedSinceStart;
      }
      
      setSecondsElapsed(currentElapsed);
      
      // Notify parent component (use ref to avoid dependency issues)
      if (onTimeUpdate) {
        onTimeUpdate(currentElapsed);
      }
    });

    // Cleanup function
    return () => {
      newSocket.off('timerStateUpdate');
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.disconnect();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Remove onTimeUpdate from dependencies to prevent infinite loop

  // Use refs to store current values for the interval callback
  const initialOffsetRef = useRef(initialOffset);
  const lastStartTimeRef = useRef(lastStartTime);
  const isRunningRef = useRef(isRunning);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  // Initialize ref immediately
  onTimeUpdateRef.current = onTimeUpdate;

  // Update refs when values change
  useEffect(() => {
    initialOffsetRef.current = initialOffset;
    lastStartTimeRef.current = lastStartTime;
    isRunningRef.current = isRunning;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [initialOffset, lastStartTime, isRunning, onTimeUpdate]);

  // Local counting logic - runs when isRunning or lastStartTime changes
  useEffect(() => {
    console.log('Timer effect running with:', { isRunning, lastStartTime, initialOffset });
    
    // Check refs instead of state
    if (!isRunningRef.current || !lastStartTimeRef.current) {
      console.log('Timer not ready - isRunning:', isRunningRef.current, 'lastStartTime:', lastStartTimeRef.current);
      if (!isRunningRef.current) {
        const validOffset = typeof initialOffsetRef.current === 'number' && !isNaN(initialOffsetRef.current) 
          ? initialOffsetRef.current 
          : 0;
        setSecondsElapsed(validOffset);
        if (onTimeUpdateRef.current) {
          onTimeUpdateRef.current(validOffset);
        }
      }
      return;
    }
    
    console.log('Setting up interval - timer is running');

    // Calculate elapsed time using refs (always up-to-date)
    const calculateElapsed = () => {
      const now = new Date();
      const currentStartTime = lastStartTimeRef.current;
      const currentOffset = typeof initialOffsetRef.current === 'number' && !isNaN(initialOffsetRef.current) 
        ? initialOffsetRef.current 
        : 0;
      
      if (!currentStartTime || !(currentStartTime instanceof Date) || isNaN(currentStartTime.getTime())) {
        console.warn('Invalid currentStartTime in calculateElapsed:', currentStartTime);
        return currentOffset;
      }
      
      const elapsedSinceStart = Math.floor((now - currentStartTime) / 1000);
      const total = currentOffset + elapsedSinceStart;
      
      // Ensure we return a valid number
      if (typeof total !== 'number' || isNaN(total) || !isFinite(total)) {
        console.warn('Invalid total calculated:', { currentOffset, elapsedSinceStart, total, now, currentStartTime });
        return currentOffset;
      }
      
      return total;
    };

    // Set initial value
    const initialElapsed = calculateElapsed();
    console.log('Initial elapsed calculated:', initialElapsed, 'from offset:', initialOffsetRef.current, 'startTime:', lastStartTimeRef.current);
    setSecondsElapsed(initialElapsed);
    if (onTimeUpdateRef.current) {
      onTimeUpdateRef.current(initialElapsed);
    }

    // Update every second
    const interval = setInterval(() => {
      const currentElapsed = calculateElapsed();
      console.log('Interval - calculated elapsed:', currentElapsed, 'offset:', initialOffsetRef.current, 'startTime:', lastStartTimeRef.current);
      // Always update state to trigger re-render
      setSecondsElapsed(currentElapsed);
      
      // Always notify parent component using ref to get latest callback
      const callback = onTimeUpdateRef.current;
      if (callback) {
        console.log('Calling onTimeUpdate callback with:', currentElapsed);
        try {
          callback(currentElapsed);
        } catch (error) {
          console.error('Error calling onTimeUpdate:', error);
        }
      } else {
        console.warn('onTimeUpdateRef.current is null!');
      }
    }, 1000);

    console.log('Interval created, dependencies:', { isRunning, lastStartTime, initialOffset });

    // Cleanup function
    return () => {
      console.log('Clearing interval! Dependencies changed or component unmounting');
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, lastStartTime?.getTime(), initialOffset]); // Use timestamp to avoid Date object reference issues

  // Handle start button click
  const handleStart = useCallback(() => {
    if (!isManager) {
      console.warn('Only managers can start the timer');
      return;
    }
    if (!socket) {
      console.error('Socket not initialized. Cannot start timer.');
      return;
    }
    if (!isConnected && !socket.connected) {
      console.error('Socket not connected. Current state:', {
        isConnected,
        socketConnected: socket.connected,
        socketId: socket.id
      });
      // Try to connect if not already connecting
      if (!socket.connecting) {
        console.log('Attempting to reconnect socket...');
        socket.connect();
      }
      return;
    }
    console.log('Emitting requestStart for project:', projectId);
    socket.emit('requestStart', { project_id: projectId });
  }, [socket, projectId, isManager, isConnected]);

  // Handle stop button click
  const handleStop = useCallback(() => {
    if (!isManager) {
      console.warn('Only managers can stop the timer');
      return;
    }
    if (!socket) {
      console.error('Socket not initialized. Cannot stop timer.');
      return;
    }
    if (!isConnected && !socket.connected) {
      console.error('Socket not connected. Current state:', {
        isConnected,
        socketConnected: socket.connected,
        socketId: socket.id
      });
      // Try to connect if not already connecting
      if (!socket.connecting) {
        console.log('Attempting to reconnect socket...');
        socket.connect();
      }
      return;
    }
    console.log('Emitting requestStop for project:', projectId);
    socket.emit('requestStop', { project_id: projectId });
  }, [socket, projectId, isManager, isConnected]);

  // Handle set time
  const handleSetTime = useCallback((totalSeconds) => {
    if (!isManager) {
      console.warn('Only managers can set the timer time');
      return;
    }
    if (!socket) {
      console.error('Socket not initialized. Cannot set timer time.');
      return;
    }
    if (!isConnected && !socket.connected) {
      console.error('Socket not connected. Cannot set timer time.');
      return;
    }
    console.log('Emitting requestSetTime for project:', projectId, 'totalSeconds:', totalSeconds);
    socket.emit('requestSetTime', { project_id: projectId, total_seconds: totalSeconds });
  }, [socket, projectId, isManager, isConnected]);

  return {
    secondsElapsed,
    isRunning,
    formattedTime: formatTime(secondsElapsed),
    handleStart,
    handleStop,
    handleSetTime,
    isConnected // Expose connection status for debugging
  };
};

export default CollaborativeTimer;

