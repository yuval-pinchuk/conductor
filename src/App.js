// src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material'; // <-- Import ThemeProvider and CssBaseline
import darkTheme from './theme'; // <-- Import the custom theme

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

  // Function to send logout using sendBeacon (works even when page is unloading)
  const sendLogoutBeacon = (projectId, name, role) => {
    if (!projectId || !name || !role) return;

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5000';
    const url = `${API_BASE_URL}/api/projects/${projectId}/logout`;
    const data = JSON.stringify({ name, role });
    
    // Use sendBeacon for reliable logout even when page is closing
    if (navigator.sendBeacon) {
      const blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback to synchronous XMLHttpRequest (less reliable but better than nothing)
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, false); // false = synchronous
      xhr.setRequestHeader('Content-Type', 'application/json');
      try {
        xhr.send(data);
      } catch (e) {
        // Ignore errors - page is closing anyway
      }
    }
  };

  // Handle window/tab close
  useEffect(() => {
    const handlePageUnload = () => {
      const currentLogin = loginStateRef.current;
      if (currentLogin && currentLogin.project && currentLogin.name && currentLogin.role) {
        sendLogoutBeacon(
          currentLogin.project.id,
          currentLogin.name,
          currentLogin.role
        );
      }
    };

    // Use both pagehide (more reliable) and beforeunload (fallback)
    // pagehide fires when the page is being unloaded (more reliable than beforeunload)
    window.addEventListener('pagehide', handlePageUnload);
    window.addEventListener('beforeunload', handlePageUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageUnload);
      window.removeEventListener('beforeunload', handlePageUnload);
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