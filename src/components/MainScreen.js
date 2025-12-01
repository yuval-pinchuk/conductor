// src/components/MainScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import EditableTable from './EditableTable';
import { Button, Typography, CircularProgress } from '@mui/material';
import { api } from '../api/conductorApi';

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
  const isManager = role === project.manager_role;
  const [projectDetails, setProjectDetails] = useState(project);
  
  // State for the project version
  const [currentVersion, setCurrentVersion] = useState(project.version);
  // Temporary state to hold the version during an edit session
  const [originalVersion, setOriginalVersion] = useState(project.version);
  
  const [isEditing, setIsEditing] = useState(false);
  const [originalTableData, setOriginalTableData] = useState([]);
  const [currentTableData, setCurrentTableData] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  
  // Phase Activation State
  const [activePhases, setActivePhases] = useState({}); // Example: { 1: true, 2: false }
  
  // Periodic Scripts State
  const [periodicScripts, setPeriodicScripts] = useState([]);
  const [originalPeriodicScripts, setOriginalPeriodicScripts] = useState([]);

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  
  // Clock State Management - initialize from project if available
  const [totalSeconds, setTotalSeconds] = useState(project.clock_total_seconds || 0);
  const [isRunning, setIsRunning] = useState(project.clock_is_running || false);
  const [isCountDown, setIsCountDown] = useState((project.clock_total_seconds || 0) < 0);
  const [targetDateTime, setTargetDateTime] = useState(project.clock_target_datetime || '');
  const [isUsingTargetTime, setIsUsingTargetTime] = useState(project.clock_is_using_target_time || false);
  
  const patchRows = (data, rowId, updates) =>
    data.map(phase => ({
      ...phase,
      rows: phase.rows.map(row =>
        row.id === rowId ? { ...row, ...updates } : row
      ),
    }));

  const applyRowUpdates = (rowId, updates, { syncOriginal = true } = {}) => {
    setCurrentTableData(prev => patchRows(prev, rowId, updates));
    if (syncOriginal) {
      setOriginalTableData(prev => patchRows(prev, rowId, updates));
    }
  };

  const handleRowStatusChange = async (rowId, status) => {
    try {
      await api.updateRow(rowId, { status });
      await loadProjectData(false);
    } catch (error) {
      console.error('Failed to update row status', error);
      setDataError(error.message || 'Failed to update row status');
      await loadProjectData(false);
      throw error;
    }
  };

  const handleRunRowScript = async (rowId) => {
    try {
      const { result } = await api.runRowScript(rowId);
      applyRowUpdates(rowId, { scriptResult: result });
    } catch (error) {
      console.error('Failed to run script', error);
      setDataError(error.message || 'Failed to run script');
      throw error;
    }
  };

  const handleTogglePhaseActivation = async (phase) => {
    if (!isManager) return;
    try {
      const updatedPhase = await api.togglePhaseActive(phase.id);
      setActivePhases(prev => ({
        ...prev,
        [updatedPhase.phase]: !!updatedPhase.is_active
      }));
      const updater = (data) =>
        data.map(p =>
          p.id === updatedPhase.id ? { ...p, is_active: updatedPhase.is_active } : p
        );
      setCurrentTableData(updater);
      setOriginalTableData(updater);
      // Trigger a refresh after a short delay to sync with server
      setTimeout(() => {
        if (!isEditing) {
          loadProjectData(false);
        }
      }, 500);
    } catch (error) {
      console.error('Failed to toggle phase', error);
      setDataError(error.message || 'Failed to toggle phase');
    }
  };

  const handleSetClockTime = async (timeString) => {
    setIsUsingTargetTime(false);
    setTargetDateTime('');
    // Expects input like "+hh:mm:ss" or "-hh:mm:ss"
    const sign = timeString.startsWith('-') ? -1 : 1;
    const parts = timeString.substring(1).split(':').map(Number);
    const seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    const newTotalSeconds = seconds * sign;
    
    setTotalSeconds(newTotalSeconds);
    setIsCountDown(sign === -1);
    
    // Sync to server if manager
    if (isManager) {
      try {
        await api.updateProjectClock(project.id, {
          totalSeconds: newTotalSeconds,
          isRunning: false,
          targetDateTime: null,
          isUsingTargetTime: false
        });
      } catch (error) {
        console.error('Failed to update clock on server', error);
      }
    }
  };
  
  const handleSetTargetClockTime = async (isoString) => {
    if (!isoString) return;
    const targetMs = new Date(isoString).getTime();
    if (Number.isNaN(targetMs)) return;
    setTargetDateTime(isoString);
    setIsUsingTargetTime(true);
    const diffSeconds = Math.floor((Date.now() - targetMs) / 1000);
    setTotalSeconds(diffSeconds);
    setIsCountDown(diffSeconds < 0);
    setIsRunning(false);
    
    // Sync to server if manager
    if (isManager) {
      try {
        await api.updateProjectClock(project.id, {
          totalSeconds: diffSeconds,
          isRunning: false,
          targetDateTime: isoString,
          isUsingTargetTime: true
        });
      } catch (error) {
        console.error('Failed to update clock on server', error);
      }
    }
  };

  const handleClearTargetClockTime = async () => {
    setTargetDateTime('');
    setIsUsingTargetTime(false);
    
    // Sync to server if manager
    if (isManager) {
      try {
        await api.updateProjectClock(project.id, {
          targetDateTime: null,
          isUsingTargetTime: false
        });
      } catch (error) {
        console.error('Failed to update clock on server', error);
      }
    }
  };
  
  const handleToggleClock = async () => {
    if (!isManager || isUsingTargetTime) return;
    const newIsRunning = !isRunning;
    setIsRunning(newIsRunning);
    
    // Sync to server
    try {
      await api.updateProjectClock(project.id, {
        isRunning: newIsRunning
      });
    } catch (error) {
      console.error('Failed to update clock on server', error);
    }
  };

  // Clock Interval Hook
  useInterval(() => {
    if (isUsingTargetTime && targetDateTime) {
      const targetMs = new Date(targetDateTime).getTime();
      if (!Number.isNaN(targetMs)) {
        const diffSeconds = Math.floor((Date.now() - targetMs) / 1000);
        setTotalSeconds(diffSeconds);
        setIsCountDown(diffSeconds < 0);
        
        // Sync to server if manager and running
        if (isManager && isRunning) {
          api.updateProjectClock(project.id, {
            totalSeconds: diffSeconds,
            isUsingTargetTime: true
          }).catch(err => console.error('Failed to sync clock', err));
        }
      }
      return;
    }

    if (!isUsingTargetTime && isRunning) {
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
        
        // Sync to server if manager
        if (isManager) {
          api.updateProjectClock(project.id, {
            totalSeconds: newSeconds
          }).catch(err => console.error('Failed to sync clock', err));
        }
        
        return newSeconds;
      });
    }
  }, (isUsingTargetTime && targetDateTime) || isRunning ? 1000 : null);

  const normalizePhases = useCallback((phases = []) => phases.map(phase => ({
    ...phase,
    rows: Array.isArray(phase.rows) ? phase.rows : [],
  })), []);

  const loadProjectData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setIsLoadingData(true);
    }
    setDataError('');
    try {
      const [projectResponse, phasesResponse, scriptsResponse] = await Promise.all([
        api.getProjectById(project.id),
        api.getPhases(project.id),
        api.getPeriodicScripts(project.id),
      ]);

      setProjectDetails(projectResponse);
      
      // Always sync version from server when not in edit mode
      // When in edit mode, only update if it's the initial load or if version changed on server
      if (!isEditing) {
        setCurrentVersion(projectResponse.version);
        if (isInitialLoad) {
          setOriginalVersion(projectResponse.version);
        }
      } else if (isInitialLoad) {
        setCurrentVersion(projectResponse.version);
        setOriginalVersion(projectResponse.version);
      } else {
        // In edit mode but not initial load - check if version changed on server
        // Only update if it's different from our current version and we haven't edited it
        if (projectResponse.version !== currentVersion && projectResponse.version === originalVersion) {
          setCurrentVersion(projectResponse.version);
        }
      }
      
      // Sync clock state from server (always, for all users)
      if (projectResponse.clock_total_seconds !== undefined) {
        setTotalSeconds(projectResponse.clock_total_seconds);
        setIsCountDown(projectResponse.clock_total_seconds < 0);
      }
      if (projectResponse.clock_is_running !== undefined) {
        setIsRunning(projectResponse.clock_is_running);
      }
      if (projectResponse.clock_target_datetime !== undefined) {
        setTargetDateTime(projectResponse.clock_target_datetime || '');
        setIsUsingTargetTime(projectResponse.clock_is_using_target_time || false);
      }
      
      const normalizedPhases = normalizePhases(phasesResponse);
      
      // If in edit mode, merge changes intelligently (preserve local edits)
      if (isEditing && !isInitialLoad) {
        setCurrentTableData(prevData => {
          // Merge phase activations
          const newActivePhases = normalizedPhases.reduce((acc, phase) => {
            acc[phase.phase] = !!phase.is_active;
            return acc;
          }, {});
          setActivePhases(newActivePhases);
          
          // Merge row status changes and script results
          const mergedPhases = prevData.map(localPhase => {
            const serverPhase = normalizedPhases.find(sp => sp.id === localPhase.id);
            if (!serverPhase) return localPhase;
            
            // Merge rows - update status and scriptResult from server, keep local edits for other fields
            const mergedRows = localPhase.rows.map(localRow => {
              const serverRow = serverPhase.rows.find(sr => sr.id === localRow.id);
              if (!serverRow) return localRow;
              
              // Update status and scriptResult from server, but keep other local edits
              return {
                ...localRow,
                status: serverRow.status,
                scriptResult: serverRow.scriptResult,
              };
            });
            
            // Add any new rows from server
            const newRows = serverPhase.rows.filter(sr => 
              !localPhase.rows.some(lr => lr.id === sr.id)
            );
            
            return {
              ...localPhase,
              is_active: serverPhase.is_active,
              rows: [...mergedRows, ...newRows],
            };
          });
          
          // Add any new phases from server
          const newPhases = normalizedPhases.filter(sp => 
            !prevData.some(lp => lp.id === sp.id)
          );
          
          return [...mergedPhases, ...newPhases];
        });
      } else {
        // Not in edit mode - full sync
        setCurrentTableData(normalizedPhases);
        if (isInitialLoad) {
          setOriginalTableData(JSON.parse(JSON.stringify(normalizedPhases)));
        }
        setActivePhases(
          normalizedPhases.reduce((acc, phase) => {
            acc[phase.phase] = !!phase.is_active;
            return acc;
          }, {})
        );
      }
      
      setAllRoles(projectResponse.roles || []);
      setPeriodicScripts(scriptsResponse);
      if (isInitialLoad) {
        setOriginalPeriodicScripts(JSON.parse(JSON.stringify(scriptsResponse)));
      }
    } catch (error) {
      console.error('Failed to load project data', error);
      if (isInitialLoad) {
        setDataError(error.message || 'Failed to load data');
      }
    } finally {
      if (isInitialLoad) {
        setIsLoadingData(false);
      }
    }
  }, [project.id, normalizePhases, isEditing]);

  useEffect(() => {
    loadProjectData(true);
  }, [project.id]);

  // Poll for updates every 2 seconds when not in edit mode
  useInterval(() => {
    if (!isEditing && !isLoadingData && !isSaving) {
      loadProjectData(false);
    }
  }, 2000);

  const handleToggleEdit = () => {
    if (!isEditing && isManager) {
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

  const handleSave = async () => {
    setIsSaving(true);
    setDataError('');
    try {
      await Promise.all([
        api.updateProjectVersion(project.id, currentVersion),
        api.updateTableData(project.id, currentTableData),
        api.updatePeriodicScriptsBulk(project.id, periodicScripts),
      ]);
      const clonedData = JSON.parse(JSON.stringify(currentTableData));
      const clonedScripts = JSON.parse(JSON.stringify(periodicScripts));
      setOriginalTableData(clonedData);
      setOriginalPeriodicScripts(clonedScripts);
      setOriginalVersion(currentVersion);
      setProjectDetails(prev => ({
        ...prev,
        version: currentVersion,
        roles: allRoles,
      }));
      setIsEditing(false);
      console.log("Changes Saved. New Version:", currentVersion);
    } catch (error) {
      console.error('Failed to save changes', error);
      setDataError(error.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!isManager || isDeletingProject || !projectDetails) return;
    const confirmDelete = window.confirm(`Delete project "${projectDetails.name}"? This cannot be undone.`);
    if (!confirmDelete) return;

    setIsDeletingProject(true);
    setDataError('');
    try {
      await api.deleteProject(projectDetails.id);
      onLogout();
    } catch (error) {
      console.error('Failed to delete project', error);
      setDataError(error.message || 'Failed to delete project');
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleCancel = () => {
    // 2. Revert to the deep clone saved at the start of the session
    setCurrentTableData(originalTableData); 
    setPeriodicScripts(originalPeriodicScripts);
    setCurrentVersion(originalVersion); 
    setIsEditing(false);
    console.log("Changes Canceled. Reverted to original data and version.");
  };

  if (isLoadingData) {
    return (
      <div style={{ padding: 20 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading project data...</Typography>
        {dataError && (
          <Typography color="error" sx={{ mt: 1 }}>
            {dataError}
          </Typography>
        )}
      </div>
    );
  }

  if (dataError) {
    return (
      <div style={{ padding: 20 }}>
        <Typography color="error">{dataError}</Typography>
        <Button variant="contained" sx={{ mt: 2 }} onClick={loadProjectData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Header
        project={projectDetails}
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
        isSaving={isSaving}
        
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
          currentClockSeconds={totalSeconds}
          isClockRunning={isRunning || (isUsingTargetTime && !!targetDateTime)}
          onRowStatusChange={handleRowStatusChange}
          onRunRowScript={handleRunRowScript}
        />
        
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <Button onClick={onLogout} variant="outlined">
            Logout
          </Button>
          {isManager && (
            <Button
              onClick={handleDeleteProject}
              variant="contained"
              color="error"
              disabled={isDeletingProject}
            >
              {isDeletingProject ? 'Deleting...' : 'Delete Project'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainScreen;