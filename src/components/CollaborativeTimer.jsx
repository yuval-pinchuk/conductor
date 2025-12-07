// src/components/CollaborativeTimer.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const CollaborativeTimer = ({ projectId, isManager, onTimeUpdate }) => {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [lastStartTime, setLastStartTime] = useState(null);
  const [initialOffset, setInitialOffset] = useState(0);
  const [targetDateTime, setTargetDateTime] = useState(null);
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
        
        // Parse target datetime if present
        if (data.targetDateTime) {
          let parsedTarget = null;
          const timeString = data.targetDateTime.endsWith('Z') || data.targetDateTime.match(/[+-]\d{2}:\d{2}$/)
            ? data.targetDateTime 
            : data.targetDateTime + 'Z';
          parsedTarget = new Date(timeString);
          if (isNaN(parsedTarget.getTime())) {
            console.error('Invalid targetDateTime from server:', data.targetDateTime);
            parsedTarget = null;
          }
          setTargetDateTime(parsedTarget);
        } else {
          setTargetDateTime(null);
        }
        
        // Calculate initial elapsed time
        let initialElapsed = data.initialOffset || 0;
        if (data.isRunning && parsedStartTime && !isNaN(parsedStartTime.getTime())) {
          // Use UTC time to avoid timezone issues
          const now = new Date();
          const elapsedSinceStart = Math.floor((now - parsedStartTime) / 1000);
          initialElapsed += elapsedSinceStart;
        }
        // If we have a target, calculate countdown instead
        if (data.targetDateTime) {
          const parsedTarget = data.targetDateTime.endsWith('Z') || data.targetDateTime.match(/[+-]\d{2}:\d{2}$/)
            ? new Date(data.targetDateTime)
            : new Date(data.targetDateTime + 'Z');
          if (!isNaN(parsedTarget.getTime())) {
            const now = new Date();
            const diffSeconds = Math.floor((parsedTarget - now) / 1000);
            initialElapsed = -diffSeconds; // Invert sign: negative = countdown, positive = count up
          }
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
      setIsConnected(true);
      // Join the timer room for this project
      newSocket.emit('join_timer_room', { project_id: projectId });
    });

    newSocket.on('disconnect', () => {
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
        
        parsedStartTime = new Date(timeString);
        
        // Validate the parsed date
        if (isNaN(parsedStartTime.getTime())) {
          console.error('Invalid date string from server in timerStateUpdate:', {
            original: data.lastStartTime,
            processed: timeString,
            parsed: parsedStartTime
          });
          parsedStartTime = null;
        }
      }
      setLastStartTime(parsedStartTime);
      
      // Parse target datetime if present
      let parsedTarget = null;
      if (data.targetDateTime) {
        let timeString = data.targetDateTime;
        if (!timeString.endsWith('Z') && !timeString.match(/[+-]\d{2}:\d{2}$/)) {
          timeString = timeString + 'Z';
        }
        parsedTarget = new Date(timeString);
        if (isNaN(parsedTarget.getTime())) {
          console.error('Invalid targetDateTime from server:', data.targetDateTime);
          parsedTarget = null;
        }
        setTargetDateTime(parsedTarget);
      } else {
        setTargetDateTime(null);
      }
      
      // Calculate current elapsed time
      let currentElapsed = data.initialOffset || 0;
      
      // If we have a target datetime, calculate countdown/countup
      if (parsedTarget && !isNaN(parsedTarget.getTime())) {
        const now = new Date();
        const diffSeconds = Math.floor((parsedTarget - now) / 1000);
        currentElapsed = -diffSeconds; // Invert sign: negative = countdown, positive = count up
      } else if (data.isRunning && parsedStartTime && !isNaN(parsedStartTime.getTime())) {
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
  const targetDateTimeRef = useRef(targetDateTime);
  const socketRef = useRef(socket);
  const projectIdRef = useRef(projectId);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  // Initialize ref immediately
  onTimeUpdateRef.current = onTimeUpdate;

  // Update refs when values change
  useEffect(() => {
    initialOffsetRef.current = initialOffset;
    lastStartTimeRef.current = lastStartTime;
    isRunningRef.current = isRunning;
    targetDateTimeRef.current = targetDateTime;
    socketRef.current = socket;
    projectIdRef.current = projectId;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [initialOffset, lastStartTime, isRunning, targetDateTime, socket, projectId, onTimeUpdate]);

  // Local counting logic - runs when isRunning or lastStartTime changes
  useEffect(() => {
    
    // If we have a target datetime, always run the interval (countdown mode)
    // Otherwise, check if timer is running
    const hasTarget = targetDateTimeRef.current && targetDateTimeRef.current instanceof Date && !isNaN(targetDateTimeRef.current.getTime());
    const shouldRun = hasTarget || (isRunningRef.current && lastStartTimeRef.current);
    
    if (!shouldRun) {
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
    

    // Calculate elapsed time using refs (always up-to-date)
    const calculateElapsed = () => {
      const now = new Date();
      const currentTarget = targetDateTimeRef.current;
      
      // If we have a target datetime, calculate countdown/countup
      if (currentTarget && currentTarget instanceof Date && !isNaN(currentTarget.getTime())) {
        // Calculate difference: positive = target in future, negative = target passed
        const diffSeconds = Math.floor((currentTarget - now) / 1000);
        // Invert sign for display: negative = countdown (target in future), positive = count up (target passed)
        return -diffSeconds;
      }
      
      // Otherwise, calculate normal elapsed time
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
    setSecondsElapsed(initialElapsed);
    if (onTimeUpdateRef.current) {
      onTimeUpdateRef.current(initialElapsed);
    }

    // Update every second
    const interval = setInterval(() => {
      const currentElapsed = calculateElapsed();
      // Always update state to trigger re-render
      setSecondsElapsed(currentElapsed);
      
      // Note: We allow the timer to count past the target time (negative values = count up)
      
      // Always notify parent component using ref to get latest callback
      const callback = onTimeUpdateRef.current;
      if (callback) {
        try {
          callback(currentElapsed);
        } catch (error) {
          console.error('Error calling onTimeUpdate:', error);
        }
      } else {
        console.warn('onTimeUpdateRef.current is null!');
      }
    }, 1000);


    // Cleanup function
    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, lastStartTime?.getTime(), initialOffset, targetDateTime?.getTime()]); // Include targetDateTime so interval is recreated when target changes

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
        socket.connect();
      }
      return;
    }
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
        socket.connect();
      }
      return;
    }
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
    socket.emit('requestSetTime', { project_id: projectId, total_seconds: totalSeconds });
  }, [socket, projectId, isManager, isConnected]);

  // Handle set target time
  const handleSetTarget = useCallback((targetDateTimeString) => {
    if (!isManager) {
      console.warn('Only managers can set the target time');
      return;
    }
    if (!socket) {
      console.error('Socket not initialized. Cannot set target time.');
      return;
    }
    if (!isConnected && !socket.connected) {
      console.error('Socket not connected. Cannot set target time.');
      return;
    }
    // Convert datetime-local format to ISO string with timezone
    // datetime-local gives us "YYYY-MM-DDTHH:mm" in local time
    // We need to create a Date object to get the proper timezone offset
    let isoString = targetDateTimeString;
    if (targetDateTimeString && !targetDateTimeString.includes('Z') && !targetDateTimeString.match(/[+-]\d{2}:\d{2}$/)) {
      // No timezone info, create Date object to get local timezone
      const localDate = new Date(targetDateTimeString);
      if (!isNaN(localDate.getTime())) {
        // Convert to ISO string (includes timezone offset)
        isoString = localDate.toISOString();
      }
    }
    socket.emit('requestSetTarget', { project_id: projectId, target_datetime: isoString });
  }, [socket, projectId, isManager, isConnected]);

  // Handle clear target time
  const handleClearTarget = useCallback(() => {
    if (!isManager) {
      console.warn('Only managers can clear the target time');
      return;
    }
    if (!socket) {
      console.error('Socket not initialized. Cannot clear target time.');
      return;
    }
    if (!isConnected && !socket.connected) {
      console.error('Socket not connected. Cannot clear target time.');
      return;
    }
    socket.emit('requestClearTarget', { project_id: projectId });
  }, [socket, projectId, isManager, isConnected]);

  return {
    secondsElapsed,
    isRunning,
    formattedTime: formatTime(secondsElapsed),
    targetDateTime,
    handleStart,
    handleStop,
    handleSetTime,
    handleSetTarget,
    handleClearTarget,
    isConnected // Expose connection status for debugging
  };
};

export default CollaborativeTimer;

