// src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material'; // <-- Import ThemeProvider and CssBaseline
import darkTheme from './theme'; // <-- Import the custom theme
import { API_BASE_URL } from './config';
import LoginScreen from './components/LoginScreen';
import MainScreen from './components/MainScreen';
import { api } from './api/conductorApi';

const App = () => {
  const [loginState, setLoginState] = useState(null);
  const loginStateRef = useRef(null);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    loginStateRef.current = loginState;
  }, [loginState]);

  const handleLogin = (details) => {
    setLoginState(details);
  };

  const handleLogout = async (projectId, name, role) => {
    // Register logout to free up the role
    if (projectId && name && role) {
      try {
        await api.registerLogout(projectId, name, role);
      } catch (error) {
        console.error('Failed to register logout', error);
        // Continue with logout even if API call fails
      }
    }
    setLoginState(null);
  };

  // Function to send logout using multiple methods for reliability
  const sendLogoutBeacon = (projectId, name, role) => {
    if (!projectId || !name || !role) {
      console.log('sendLogoutBeacon: Missing parameters', { projectId, name, role });
      return;
    }

    const url = `${API_BASE_URL}/api/projects/${projectId}/logout`;
    const data = { name, role };
    
    // Try multiple methods for maximum reliability
    let sent = false;
    
    // Method 1: Use fetch with keepalive (most reliable for modern browsers)
    if (typeof fetch !== 'undefined') {
      try {
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          keepalive: true, // This ensures the request continues even after page unload
        }).catch(() => {}); // Ignore errors
        sent = true;
      } catch (e) {
        // Fall through to other methods
      }
    }
    
    // Method 2: Use sendBeacon as fallback
    if (!sent && navigator.sendBeacon) {
      try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('role', role);
        sent = navigator.sendBeacon(url, formData);
      } catch (e) {
        // Fall through to XMLHttpRequest
      }
    }
    
    // Method 3: Synchronous XMLHttpRequest as last resort
    if (!sent) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, false); // false = synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(data));
      } catch (e) {
        // All methods failed
        console.error('Failed to send logout request:', e);
      }
    }
  };

  // Handle window/tab close
  useEffect(() => {
    const handlePageUnload = (e) => {
      const currentLogin = loginStateRef.current;
      console.log('Page unloading, current login state:', currentLogin);
      if (currentLogin && currentLogin.project && currentLogin.name && currentLogin.role) {
        console.log('Sending logout request for:', currentLogin.name, currentLogin.role);
        // Send logout request
        sendLogoutBeacon(
          currentLogin.project.id,
          currentLogin.name,
          currentLogin.role
        );
      } else {
        console.log('No active login to logout');
      }
    };

    // Use multiple events for better coverage
    // pagehide is most reliable for modern browsers (fires in both mobile and desktop)
    // beforeunload fires before pagehide in some browsers
    // unload is legacy but still used by some browsers
    window.addEventListener('pagehide', handlePageUnload, { capture: true });
    window.addEventListener('beforeunload', handlePageUnload, { capture: true });
    window.addEventListener('unload', handlePageUnload, { capture: true });

    return () => {
      window.removeEventListener('pagehide', handlePageUnload, { capture: true });
      window.removeEventListener('beforeunload', handlePageUnload, { capture: true });
      window.removeEventListener('unload', handlePageUnload, { capture: true });
    };
  }, []);

  return (
    // Wrap the entire app with ThemeProvider
    <ThemeProvider theme={darkTheme}>
      {/* CssBaseline resets basic styles and applies the theme background */}
      <CssBaseline /> 
      <div className="App" style={{ minHeight: '100vh', backgroundColor: darkTheme.palette.background.default }}>
        {loginState ? (
          <MainScreen 
            project={loginState.project} 
            role={loginState.role}
            name={loginState.name}
            onLogout={() => handleLogout(loginState.project.id, loginState.name, loginState.role)} 
          />
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )}
      </div>
    </ThemeProvider>
  );
};

export default App;