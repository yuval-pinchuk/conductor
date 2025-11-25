// src/components/MainScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import EditableTable from './EditableTable';
import { INITIAL_TABLE_DATA, ALL_AVAILABLE_ROLES } from '../data';
import { Button } from '@mui/material';

const useInterval = (callback, delay) => {
  const savedCallback = React.useRef();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay !== null) {
      let id = setInterval(() => savedCallback.current(), delay);
      return () => clearInterval(id);
    }
  }, [delay]);
};

// Clock Logic Component
const formatTime = (totalSeconds) => {
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);
  const hours = String(Math.floor(absSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((absSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(absSeconds % 60).padStart(2, '0');
  return (isNegative ? '-' : '+') + hours + ':' + minutes + ':' + seconds;
};

const MainScreen = ({ project, role, onLogout }) => {
  const isManager = role === 'Manager';
  
  // State for the project version
  const [currentVersion, setCurrentVersion] = useState(project.version);
  // Temporary state to hold the version during an edit session
  const [originalVersion, setOriginalVersion] = useState(project.version);
  
  const [isEditing, setIsEditing] = useState(false);
  const [originalTableData, setOriginalTableData] = useState(INITIAL_TABLE_DATA);
  const [currentTableData, setCurrentTableData] = useState(INITIAL_TABLE_DATA);
  const [allRoles, setAllRoles] = useState(ALL_AVAILABLE_ROLES);
  
  // Phase Activation State
  const [activePhases, setActivePhases] = useState({}); // Example: { 1: true, 2: false }
  
  // Clock State Management
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCountDown, setIsCountDown] = useState(false); // Tracks if initial count was negative
  
  const handleTogglePhaseActivation = (phaseNumber) => {
    if (!isManager) return;
    setActivePhases(prev => ({
      ...prev,
      [phaseNumber]: !prev[phaseNumber] // Toggle the status
    }));
  };

  const handleSetClockTime = (timeString) => {
    // Expects input like "+hh:mm:ss" or "-hh:mm:ss"
    const sign = timeString.startsWith('-') ? -1 : 1;
    const parts = timeString.substring(1).split(':').map(Number);
    const seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    
    setTotalSeconds(seconds * sign);
    setIsCountDown(sign === -1);
  };
  
  const handleToggleClock = () => {
    if (!isManager) return;
    setIsRunning(prev => !prev);
  };

  // Clock Interval Hook
  useInterval(() => {
    setTotalSeconds(prevSeconds => {
      let newSeconds = prevSeconds;
      
      // If counting down (negative time), decrease until zero, then switch to count-up
      if (isCountDown && newSeconds < 0) {
        newSeconds += 1; // Count up towards zero
      } 
      // If counting up (positive time or countdown finished)
      else {
        if (newSeconds < 0) { // Should only hit this right at the switch point from negative to positive
          newSeconds = 0;
        }
        newSeconds += 1; // Count forward
      }
      
      return newSeconds;
    });
  }, isRunning ? 1000 : null);

  const handleToggleEdit = () => {
    if (!isEditing && role === 'Manager') {
      // Create a DEEP CLONE of the table data to prevent mutation
      const clonedData = JSON.parse(JSON.stringify(currentTableData)); 
      
      setOriginalTableData(clonedData);      // <-- Save the deep clone
      setOriginalVersion(currentVersion); 
      setIsEditing(true);
    } else if (isEditing) {
      handleCancel();
    }
  };

  const handleSave = () => {
    // 1. Update the official original state with the current state (still using a deep copy)
    setOriginalTableData(JSON.parse(JSON.stringify(currentTableData))); 
    setOriginalVersion(currentVersion); 
    setIsEditing(false);
    console.log("Changes Saved. New Version:", currentVersion);
  };

  const handleCancel = () => {
    // 2. Revert to the deep clone saved at the start of the session
    setCurrentTableData(originalTableData); 
    setCurrentVersion(originalVersion); 
    setIsEditing(false);
    console.log("Changes Canceled. Reverted to original data and version.");
  };

  return (
    <div>
      <Header
        project={project}
        role={role}
        isEditing={isEditing}
        currentVersion={currentVersion}
        setCurrentVersion={setCurrentVersion}
        
        // Clock Props (NEW)
        clockTime={formatTime(totalSeconds)}
        isRunning={isRunning}
        isManager={isManager}
        handleSetClockTime={handleSetClockTime}
        handleToggleClock={handleToggleClock}
        
        onToggleEdit={handleToggleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      
      <div style={{ padding: 20 }}>
        {role !== 'Manager' && isEditing && (
          <p style={{ color: 'red' }}>Note: Only Managers can enter Edit Mode.</p>
        )}
        
        <EditableTable
          tableData={currentTableData}
          setTableData={setCurrentTableData}
          isEditing={isEditing}
          allRoles={allRoles}
          setAllRoles={setAllRoles}
          userRole={role}
          isManager={isManager}
          activePhases={activePhases}
          handleTogglePhaseActivation={handleTogglePhaseActivation}
        />
        
        <Button onClick={onLogout} variant="outlined" style={{ marginTop: 20 }}>
          Logout
        </Button>
      </div>
    </div>
  );
};

export default MainScreen;