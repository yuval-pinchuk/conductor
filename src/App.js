// src/App.js

import React, { useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material'; // <-- Import ThemeProvider and CssBaseline
import darkTheme from './theme'; // <-- Import the custom theme

import LoginScreen from './components/LoginScreen';
import MainScreen from './components/MainScreen';

const App = () => {
  const [loginState, setLoginState] = useState(null);

  const handleLogin = (details) => {
    setLoginState(details);
  };

  const handleLogout = () => {
    setLoginState(null);
  };

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
            onLogout={handleLogout} 
          />
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )}
      </div>
    </ThemeProvider>
  );
};

export default App;