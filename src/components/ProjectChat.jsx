// src/components/ProjectChat.jsx

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

const ProjectChat = ({ projectId, userId, userRole, onNewMessage, isVisible = true }) => {
  // State Management
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  // Ref for messages container to auto-scroll
  const messagesEndRef = useRef(null);
  // Ref to store socket for cleanup
  const socketRef = useRef(null);

  // Socket URL: Define const SOCKET_URL
  const SOCKET_URL = 'http://localhost:5000';

  // Part 2 & 3: Data Flow within loadChatData
  useEffect(() => {
    // Define loadChatData function that encapsulates all setup logic
    const loadChatData = async () => {
      try {
        // Initial History Fetch (Persistence): Use fetch API to get historical messages
        const response = await fetch(`${API_BASE_URL}/api/chat/history/${projectId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch chat history: ${response.statusText}`);
        }
        
        // Parse the JSON response
        const historyData = await response.json();
        
        // Use setMessages to populate the state with the historical data
        // Transform the API response to match the expected message format
        const formattedMessages = historyData.map(msg => ({
          id: msg.id, // Include ID for deduplication
          user: msg.user || msg.userName || 'Unknown',
          userName: msg.userName || msg.user || 'Unknown',
          userRole: msg.userRole || 'Unknown',
          message: msg.message || msg.content || '',
          timestamp: msg.timestamp || new Date().toISOString()
        }));
        
        setMessages(formattedMessages);

        // Socket Connection & Listeners: Establish Socket.IO connection after history is loaded
        const newSocket = io(SOCKET_URL, {
          transports: ['websocket', 'polling']
        });

        // Socket Storage: Store the created socket object
        setSocket(newSocket);
        socketRef.current = newSocket;

        // Connection event handlers
        newSocket.on('connect', () => {
          setIsConnected(true);
          // Join the project room
          newSocket.emit('join_chat_room', { project_id: projectId });
        });

        newSocket.on('disconnect', () => {
          setIsConnected(false);
        });

        // Receive Listener: Set up listener for receiveMessage event
        // The handler must append the new message object to the existing messages array
        newSocket.on('receiveMessage', (data) => {
          // Update messages state by appending the new message object
          const newMessage = {
            id: data.id, // Include ID for deduplication
            user: data.user || data.userId || 'Unknown',
            userName: data.userName || data.user || data.userId || 'Unknown',
            userRole: data.userRole || data.role || 'Unknown',
            message: data.message,
            timestamp: data.timestamp || new Date().toISOString()
          };
          setMessages(prevMessages => {
            // Deduplication: Check if message already exists (by ID or by timestamp + user + message)
            const isDuplicate = prevMessages.some(msg => {
              if (data.id && msg.id === data.id) return true;
              // Fallback: check by timestamp, user, and message content
              return msg.timestamp === newMessage.timestamp &&
                     msg.user === newMessage.user &&
                     msg.message === newMessage.message;
            });
            
            if (isDuplicate) {
              return prevMessages; // Don't add duplicate
            }
            
            const updated = [...prevMessages, newMessage];
            // Notify parent about new message (for unread count)
            // Only notify if this is a new message (not a duplicate we just filtered)
            if (onNewMessage && !isDuplicate) {
              onNewMessage(updated.length - 1, newMessage.id || data.id);
            }
            return updated;
          });
        });
      } catch (error) {
        console.error('Error loading chat data:', error);
        // Even if history fetch fails, still try to connect to socket
        const newSocket = io(SOCKET_URL, {
          transports: ['websocket', 'polling']
        });
        setSocket(newSocket);
        socketRef.current = newSocket;

        newSocket.on('connect', () => {
          setIsConnected(true);
          newSocket.emit('join_chat_room', { project_id: projectId });
        });

        newSocket.on('disconnect', () => {
          setIsConnected(false);
        });

        newSocket.on('receiveMessage', (data) => {
          const newMessage = {
            id: data.id, // Include ID for deduplication
            user: data.user || data.userId || 'Unknown',
            userName: data.userName || data.user || data.userId || 'Unknown',
            userRole: data.userRole || data.role || 'Unknown',
            message: data.message,
            timestamp: data.timestamp || new Date().toISOString()
          };
          setMessages(prevMessages => {
            // Deduplication: Check if message already exists (by ID or by timestamp + user + message)
            const isDuplicate = prevMessages.some(msg => {
              if (data.id && msg.id === data.id) return true;
              // Fallback: check by timestamp, user, and message content
              return msg.timestamp === newMessage.timestamp &&
                     msg.user === newMessage.user &&
                     msg.message === newMessage.message;
            });
            
            if (isDuplicate) {
              return prevMessages; // Don't add duplicate
            }
            
            const updated = [...prevMessages, newMessage];
            // Only notify if this is a new message (not a duplicate we just filtered)
            if (onNewMessage && !isDuplicate) {
              onNewMessage(updated.length - 1, newMessage.id || data.id);
            }
            return updated;
          });
        });
      }
    };

    // Invocation: Call loadChatData() at the end of the useEffect hook
    loadChatData();
    
    // Cleanup: Return a cleanup function that calls newSocket.disconnect()
    return () => {
      if (socketRef.current) {
        socketRef.current.off('receiveMessage');
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Dependency array includes projectId to reconnect if user switches projects

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Part 3: Sending Messages
  const handleSendMessage = async (e) => {
    e.preventDefault(); // Prevent default form action

    // Check if socket is connected and input is not empty
    if (socket && socket.connected && input.trim()) {
      const messageData = {
        projectId: projectId,
        userId: userId,
        userName: userId,
        userRole: userRole,
        message: input.trim()
      };

      // Emit sendMessage event with projectId and message content
      socket.emit('sendMessage', messageData);

      // Clear the input state after sending
      setInput('');
    }
  };

  // Part 4: Component Render
  // If not visible, maintain socket connection but don't render UI
  if (!isVisible) {
    return <div style={{ display: 'none' }} />;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#1e1e1e',
      border: '1px solid #444',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Connection Status Indicator */}
      <div style={{
        padding: '8px 16px',
        backgroundColor: '#2d2d2d',
        borderBottom: '1px solid #444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isConnected ? '#4caf50' : '#f44336'
          }} />
          <span style={{ color: '#aaa', fontSize: '12px' }}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Message Display: Scrollable container */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            color: '#888',
            textAlign: 'center',
            padding: '20px',
            fontStyle: 'italic'
          }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMyMessage = msg.userRole === userRole;
            return (
            <div
              key={msg.id || `${msg.timestamp}-${msg.user}-${index}`}
              style={{
                padding: '10px 14px',
                backgroundColor: isMyMessage ? '#4caf50' : '#2d2d2d',
                borderRadius: '8px',
                alignSelf: isMyMessage ? 'flex-end' : 'flex-start',
                maxWidth: '70%',
                border: isMyMessage ? 'none' : '1px solid #444',
                marginLeft: isMyMessage ? 'auto' : '0',
                marginRight: isMyMessage ? '0' : 'auto'
              }}
            >
              <div style={{
                fontSize: '12px',
                color: isMyMessage ? '#e8f5e9' : '#aaa',
                marginBottom: '4px',
                fontWeight: 'bold'
              }}>
                {isMyMessage ? `You (${msg.userRole || 'Unknown'})` : `${msg.userName || msg.user} (${msg.userRole || 'Unknown'})`}
              </div>
              <div style={{
                color: isMyMessage ? '#fff' : '#fff',
                fontSize: '14px',
                wordWrap: 'break-word'
              }}>
                {msg.message}
              </div>
              {msg.timestamp && (
                <div style={{
                  fontSize: '10px',
                  color: isMyMessage ? '#e8f5e9' : '#888',
                  marginTop: '4px'
                }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
          );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        style={{
          padding: '12px 16px',
          backgroundColor: '#2d2d2d',
          borderTop: '1px solid #444',
          display: 'flex',
          gap: '8px'
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={!isConnected}
          style={{
            flex: 1,
            padding: '10px 14px',
            backgroundColor: '#1e1e1e',
            border: '1px solid #444',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '14px',
            outline: 'none'
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={!isConnected || !input.trim()}
          style={{
            padding: '10px 20px',
            backgroundColor: isConnected && input.trim() ? '#1976d2' : '#555',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: isConnected && input.trim() ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'background-color 0.2s'
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ProjectChat;

