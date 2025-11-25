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

const MainScreen = ({ project, role, name, onLogout }) => {
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
  
  // Periodic Scripts State
  const [periodicScripts, setPeriodicScripts] = useState([
    { id: 1, name: 'Health Check', path: '/scripts/health.js', status: true },
    { id: 2, name: 'Backup', path: '/scripts/backup.js', status: false }
  ]);
  const [originalPeriodicScripts, setOriginalPeriodicScripts] = useState([
    { id: 1, name: 'Health Check', path: '/scripts/health.js', status: true },
    { id: 2, name: 'Backup', path: '/scripts/backup.js', status: false }
  ]);
  
  // Clock State Management
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCountDown, setIsCountDown] = useState(false); // Tracks if initial count was negative
  const [targetDateTime, setTargetDateTime] = useState('');
  const [isUsingTargetTime, setIsUsingTargetTime] = useState(false);
  
  const handleTogglePhaseActivation = (phaseNumber) => {
    if (!isManager) return;
    setActivePhases(prev => ({
      ...prev,
      [phaseNumber]: !prev[phaseNumber] // Toggle the status
    }));
  };

  const handleSetClockTime = (timeString) => {
    setIsUsingTargetTime(false);
    setTargetDateTime('');
    // Expects input like "+hh:mm:ss" or "-hh:mm:ss"
    const sign = timeString.startsWith('-') ? -1 : 1;
    const parts = timeString.substring(1).split(':').map(Number);
    const seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    
    setTotalSeconds(seconds * sign);
    setIsCountDown(sign === -1);
  };
  
  const handleSetTargetClockTime = (isoString) => {
    if (!isoString) return;
    const targetMs = new Date(isoString).getTime();
    if (Number.isNaN(targetMs)) return;
    setTargetDateTime(isoString);
    setIsUsingTargetTime(true);
    const diffSeconds = Math.floor((Date.now() - targetMs) / 1000);
    setTotalSeconds(diffSeconds);
    setIsCountDown(diffSeconds < 0);
    setIsRunning(false);
  };

  const handleClearTargetClockTime = () => {
    setTargetDateTime('');
    setIsUsingTargetTime(false);
  };
  
  const handleToggleClock = () => {
    if (!isManager || isUsingTargetTime) return;
    setIsRunning(prev => !prev);
  };

  // Clock Interval Hook
  useInterval(() => {
    if (isUsingTargetTime && targetDateTime) {
      const targetMs = new Date(targetDateTime).getTime();
      if (!Number.isNaN(targetMs)) {
        const diffSeconds = Math.floor((Date.now() - targetMs) / 1000);
        setTotalSeconds(diffSeconds);
        setIsCountDown(diffSeconds < 0);
      }
      return;
    }

    if (!isUsingTargetTime) {
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
    }
  }, (isUsingTargetTime && targetDateTime) || isRunning ? 1000 : null);

  // Periodic Script Execution Hook - runs every 5 seconds
  useInterval(async () => {
    if (periodicScripts.length > 0) {
      const updatedScripts = await Promise.all(
        periodicScripts.map(async (script) => {
          if (script.path) {
            // Simulate script execution - in real implementation, this would call an API
            // Replace this with actual API call that returns boolean
            const result = Math.random() > 0.5; // Simulated result
            
            console.log(`[PERIODIC SCRIPT] ${script.name} (${script.path}): ${result}`);
            return { ...script, status: result };
          }
          return script;
        })
      );
      setPeriodicScripts(updatedScripts);
    }
  }, 5000); // Run every 5 seconds

  const handleToggleEdit = () => {
    if (!isEditing && role === 'Manager') {
      // Create a DEEP CLONE of the table data to prevent mutation
      const clonedData = JSON.parse(JSON.stringify(currentTableData)); 
      const clonedScripts = JSON.parse(JSON.stringify(periodicScripts));
      
      setOriginalTableData(clonedData);      // <-- Save the deep clone
      setOriginalPeriodicScripts(clonedScripts);
      setOriginalVersion(currentVersion); 
      setIsEditing(true);
    } else if (isEditing) {
      handleCancel();
    }
  };

  const handleSave = () => {
    // 1. Update the official original state with the current state (still using a deep copy)
    setOriginalTableData(JSON.parse(JSON.stringify(currentTableData))); 
    setOriginalPeriodicScripts(JSON.parse(JSON.stringify(periodicScripts)));
    setOriginalVersion(currentVersion); 
    setIsEditing(false);
    console.log("Changes Saved. New Version:", currentVersion);
  };

  const handleCancel = () => {
    // 2. Revert to the deep clone saved at the start of the session
    setCurrentTableData(originalTableData); 
    setPeriodicScripts(originalPeriodicScripts);
    setCurrentVersion(originalVersion); 
    setIsEditing(false);
    console.log("Changes Canceled. Reverted to original data and version.");
  };

  return (
    <div>
      <Header
        project={project}
        role={role}
        name={name}
        isEditing={isEditing}
        currentVersion={currentVersion}
        setCurrentVersion={setCurrentVersion}
        
        // Clock Props (NEW)
        clockTime={formatTime(totalSeconds)}
        isRunning={isRunning}
        isManager={isManager}
        handleSetClockTime={handleSetClockTime}
        handleToggleClock={handleToggleClock}
        handleSetTargetClockTime={handleSetTargetClockTime}
        handleClearTargetClockTime={handleClearTargetClockTime}
        targetDateTime={targetDateTime}
        isUsingTargetTime={isUsingTargetTime}
        
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
          periodicScripts={periodicScripts}
          setPeriodicScripts={setPeriodicScripts}
        />
        
        <Button onClick={onLogout} variant="outlined" style={{ marginTop: 20 }}>
          Logout
        </Button>
      </div>
    </div>
  );
};

export default MainScreen;