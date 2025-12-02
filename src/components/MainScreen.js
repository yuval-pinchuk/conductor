// src/components/MainScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import EditableTable from './EditableTable';
import { Button, Typography, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Box, Accordion, AccordionSummary, AccordionDetails, Divider, Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import EditIcon from '@mui/icons-material/Edit';
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
  
  // Active Logins State
  const [activeLogins, setActiveLogins] = useState([]);
  
  // Pending Changes State
  const [pendingChanges, setPendingChanges] = useState([]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedPendingChange, setSelectedPendingChange] = useState(null);

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  
  // Clock State Management - pure front-end state
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCountDown, setIsCountDown] = useState(false);
  const [targetDateTime, setTargetDateTime] = useState('');
  const [isUsingTargetTime, setIsUsingTargetTime] = useState(false);
  const [lastProcessedCommandTimestamp, setLastProcessedCommandTimestamp] = useState(null);
  
  // Use ref to track current time for accurate synchronization
  const totalSecondsRef = React.useRef(0);
  
  // Keep ref in sync with state
  React.useEffect(() => {
    totalSecondsRef.current = totalSeconds;
  }, [totalSeconds]);
  
  const processClockCommand = (command, commandDataJson) => {
    if (!command) return;
    
    let commandData = {};
    if (commandDataJson) {
      // commandDataJson can be either a string (from project response) or already parsed object (from API)
      if (typeof commandDataJson === 'string') {
        try {
          commandData = JSON.parse(commandDataJson);
        } catch (e) {
          console.error('Failed to parse clock command data', e);
          return;
        }
      } else {
        commandData = commandDataJson;
      }
    }
    
    switch (command) {
      case 'set_time':
        if (commandData.totalSeconds !== undefined) {
          setTotalSeconds(commandData.totalSeconds);
          setIsCountDown(commandData.totalSeconds < 0);
          setIsUsingTargetTime(false);
          setTargetDateTime('');
          setIsRunning(false);
        }
        break;
      case 'start':
        if (!isUsingTargetTime) {
          // Set the exact time from the command, then start
          if (commandData.totalSeconds !== undefined) {
            setTotalSeconds(commandData.totalSeconds);
            setIsCountDown(commandData.totalSeconds < 0);
          }
          setIsRunning(true);
        }
        break;
      case 'stop':
        // Set the exact time from the command when stopping
        if (commandData.totalSeconds !== undefined) {
          setTotalSeconds(commandData.totalSeconds);
          setIsCountDown(commandData.totalSeconds < 0);
        }
        setIsRunning(false);
        break;
      case 'set_target':
        if (commandData.targetDateTime) {
          setTargetDateTime(commandData.targetDateTime);
          setIsUsingTargetTime(true);
          if (commandData.totalSeconds !== undefined) {
            setTotalSeconds(commandData.totalSeconds);
            setIsCountDown(commandData.totalSeconds < 0);
          }
          setIsRunning(false);
        }
        break;
      case 'clear_target':
        setTargetDateTime('');
        setIsUsingTargetTime(false);
        break;
      default:
        console.warn('Unknown clock command:', command);
    }
  };

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
    
    // Broadcast command to all clients if manager
    if (isManager) {
      try {
        await api.createClockCommand(project.id, 'set_time', {
          totalSeconds: newTotalSeconds
        });
      } catch (error) {
        console.error('Failed to broadcast clock command', error);
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
    
    // Broadcast command to all clients if manager
    if (isManager) {
      try {
        await api.createClockCommand(project.id, 'set_target', {
          targetDateTime: isoString,
          totalSeconds: diffSeconds
        });
      } catch (error) {
        console.error('Failed to broadcast clock command', error);
      }
    }
  };

  const handleClearTargetClockTime = async () => {
    setTargetDateTime('');
    setIsUsingTargetTime(false);
    
    // Broadcast command to all clients if manager
    if (isManager) {
      try {
        await api.createClockCommand(project.id, 'clear_target', {});
      } catch (error) {
        console.error('Failed to broadcast clock command', error);
      }
    }
  };
  
  const handleToggleClock = async () => {
    if (!isManager || isUsingTargetTime) return;
    const newIsRunning = !isRunning;
    
    // Use ref to get the most current time value (avoids stale state)
    const currentTime = totalSecondsRef.current;
    
    if (!newIsRunning) {
      // When stopping, immediately set the time locally to prevent drift
      setTotalSeconds(currentTime);
      setIsCountDown(currentTime < 0);
      setIsRunning(false);
    } else {
      setIsRunning(true);
    }
    
    // Broadcast command to all clients with the exact time
    try {
      await api.createClockCommand(project.id, newIsRunning ? 'start' : 'stop', {
        totalSeconds: currentTime
      });
    } catch (error) {
      console.error('Failed to broadcast clock command', error);
    }
  };

  // Clock Interval Hook - runs entirely on front-end
  useInterval(() => {
    if (isUsingTargetTime && targetDateTime) {
      const targetMs = new Date(targetDateTime).getTime();
      if (!Number.isNaN(targetMs)) {
        const diffSeconds = Math.floor((Date.now() - targetMs) / 1000);
        setTotalSeconds(diffSeconds);
        setIsCountDown(diffSeconds < 0);
        totalSecondsRef.current = diffSeconds;
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
        
        // Update ref immediately for accurate synchronization
        totalSecondsRef.current = newSeconds;
        
        return newSeconds;
      });
    }
  }, (isUsingTargetTime && targetDateTime) || isRunning ? 1000 : null);
  
  // Poll for clock commands every 200ms for better synchronization
  useInterval(() => {
    if (!isLoadingData && !isSaving) {
      api.getClockCommand(project.id)
        .then(response => {
          if (response.command && response.timestamp) {
            if (response.timestamp !== lastProcessedCommandTimestamp) {
              processClockCommand(response.command, response.data || null);
              setLastProcessedCommandTimestamp(response.timestamp);
            }
          }
        })
        .catch(err => {
          // Silently fail - command polling is not critical
        });
    }
  }, 200);

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
      
      // Fetch active logins
      try {
        const loginsResponse = await api.getActiveLogins(project.id);
        setActiveLogins(loginsResponse);
      } catch (error) {
        console.error('Failed to fetch active logins', error);
        setActiveLogins([]);
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

  // Poll for active logins every 2 seconds
  useInterval(() => {
    if (!isLoadingData && !isSaving) {
      api.getActiveLogins(project.id)
        .then(logins => {
          setActiveLogins(logins);
        })
        .catch(err => {
          // Silently fail - polling is not critical
        });
    }
  }, 2000);

  const handleToggleEdit = () => {
    if (!isEditing) {
      // Allow both managers and non-managers to edit
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
      if (isManager) {
        // Manager saves directly
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
      } else {
        // Non-manager submits pending change
        const changesData = {
          version: currentVersion,
          table_data: currentTableData,
          periodic_scripts: periodicScripts,
          roles: allRoles, // Include roles in the change request
        };
        
        await api.createPendingChange(
          project.id,
          name,
          role,
          'all',
          changesData
        );
        
        // Revert to original data after submission
        setCurrentTableData(originalTableData);
        setPeriodicScripts(originalPeriodicScripts);
        setCurrentVersion(originalVersion);
        setIsEditing(false);
        alert('שינויים נשלחו לאישור המנהל');
        console.log("Changes submitted for approval");
      }
    } catch (error) {
      console.error('Failed to save/submit changes', error);
      setDataError(error.message || 'Failed to save/submit changes');
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

  // Fetch pending changes (for managers)
  const fetchPendingChanges = useCallback(async () => {
    if (!isManager) return;
    try {
      const changes = await api.getPendingChanges(project.id, 'pending');
      setPendingChanges(changes);
    } catch (error) {
      console.error('Failed to fetch pending changes', error);
    }
  }, [isManager, project.id]);

  // Handle accepting a pending change
  const handleAcceptPendingChange = async (changeId) => {
    try {
      await api.acceptPendingChange(project.id, changeId, name);
      
      // Refresh data from server (changes are already applied on backend)
      await loadProjectData(false);
      const updatedChanges = await api.getPendingChanges(project.id, 'pending');
      setPendingChanges(updatedChanges);
      
      // Only close modal if no more pending changes
      if (updatedChanges.length === 0) {
        setReviewModalOpen(false);
        setSelectedPendingChange(null);
      }
    } catch (error) {
      console.error('Failed to accept pending change', error);
      setDataError(error.message || 'Failed to accept pending change');
    }
  };

  // Handle declining a pending change
  const handleDeclinePendingChange = async (changeId) => {
    try {
      await api.declinePendingChange(project.id, changeId, name);
      const updatedChanges = await api.getPendingChanges(project.id, 'pending');
      setPendingChanges(updatedChanges);
      
      // Only close modal if no more pending changes
      if (updatedChanges.length === 0) {
        setReviewModalOpen(false);
        setSelectedPendingChange(null);
      }
    } catch (error) {
      console.error('Failed to decline pending change', error);
      setDataError(error.message || 'Failed to decline pending change');
    }
  };

  // Poll for pending changes notifications (for managers)
  useEffect(() => {
    if (isManager && project.id && role && name) {
      const interval = setInterval(() => {
        api.getUserNotification(project.id, role, name)
          .then(response => {
            if (response.command === 'pending_changes' && response.data) {
              // Open review modal and fetch pending changes
              fetchPendingChanges();
              setReviewModalOpen(true);
              // Clear the notification
              api.clearUserNotification(project.id, role, name).catch(() => {});
            }
          })
          .catch(err => {
            // Silently fail
          });
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isManager, project.id, role, name, fetchPendingChanges]);

  // Fetch pending changes on mount and periodically
  useEffect(() => {
    if (isManager) {
      fetchPendingChanges();
      const interval = setInterval(fetchPendingChanges, 5000);
      return () => clearInterval(interval);
    }
  }, [isManager, fetchPendingChanges]);

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
          activeLogins={activeLogins}
          projectId={project.id}
          userName={name}
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

      {/* Pending Changes Review Modal (Manager only) */}
      {isManager && (
        <Dialog 
          open={reviewModalOpen} 
          onClose={() => {
            setReviewModalOpen(false);
            setSelectedPendingChange(null);
          }}
          maxWidth="md"
          fullWidth
          dir="rtl"
        >
          <DialogTitle>בקשות שינויים ממתינות לאישור</DialogTitle>
          <DialogContent>
            {pendingChanges.length === 0 ? (
              <Typography>אין בקשות שינויים ממתינות</Typography>
            ) : (
              <Box>
                {pendingChanges.map((change) => {
                  const changesData = typeof change.changes_data === 'string' 
                    ? JSON.parse(change.changes_data) 
                    : change.changes_data;
                  
                  // Compare with current data to show actual changes
                  const versionChanged = changesData.version && changesData.version !== currentVersion;
                  const tableDataChanged = changesData.table_data && JSON.stringify(changesData.table_data) !== JSON.stringify(currentTableData);
                  const scriptsChanged = changesData.periodic_scripts && JSON.stringify(changesData.periodic_scripts) !== JSON.stringify(periodicScripts);
                  
                  // Helper to calculate global row number
                  const getGlobalRowNumber = (tableData, phaseIndex, rowIndex) => {
                    let count = 0;
                    for (let i = 0; i < phaseIndex; i++) {
                      count += tableData[i]?.rows?.length || 0;
                    }
                    return count + rowIndex + 1;
                  };
                  
                  // Analyze table data changes
                  const getTableChanges = () => {
                    if (!changesData.table_data) return null;
                    
                    const currentPhases = new Map(currentTableData.map((p, idx) => [p.phase, { ...p, index: idx }]));
                    const newPhases = new Map(changesData.table_data.map((p, idx) => [p.phase, { ...p, index: idx }]));
                    
                    const addedPhases = [];
                    const modifiedPhases = [];
                    const deletedPhases = [];
                    
                    // Find added and modified phases
                    newPhases.forEach((newPhase, phaseNum) => {
                      const currentPhase = currentPhases.get(phaseNum);
                      if (!currentPhase) {
                        addedPhases.push(newPhase);
                      } else {
                        const currentRows = new Map(currentPhase.rows.map((r, idx) => [r.id, { ...r, index: idx }]));
                        const newRows = new Map(newPhase.rows.map((r, idx) => [r.id, { ...r, index: idx }]));
                        
                        const addedRows = [];
                        const modifiedRows = [];
                        const deletedRows = [];
                        
                        newRows.forEach((newRow, rowId) => {
                          const currentRow = currentRows.get(rowId);
                          if (!currentRow) {
                            addedRows.push({ ...newRow, phaseIndex: newPhase.index });
                          } else if (JSON.stringify(newRow) !== JSON.stringify(currentRow)) {
                            modifiedRows.push({ 
                              old: currentRow, 
                              new: newRow,
                              phaseIndex: currentPhase.index,
                              oldRowIndex: currentRow.index,
                              newRowIndex: newRow.index
                            });
                          }
                        });
                        
                        currentRows.forEach((currentRow, rowId) => {
                          if (!newRows.has(rowId)) {
                            deletedRows.push({ 
                              ...currentRow, 
                              phaseIndex: currentPhase.index,
                              rowIndex: currentRow.index
                            });
                          }
                        });
                        
                        if (addedRows.length > 0 || modifiedRows.length > 0 || deletedRows.length > 0) {
                          modifiedPhases.push({
                            phase: phaseNum,
                            phaseIndex: currentPhase.index,
                            addedRows,
                            modifiedRows,
                            deletedRows
                          });
                        }
                      }
                    });
                    
                    // Find deleted phases
                    currentPhases.forEach((currentPhase, phaseNum) => {
                      if (!newPhases.has(phaseNum)) {
                        deletedPhases.push(currentPhase);
                      }
                    });
                    
                    return { addedPhases, modifiedPhases, deletedPhases };
                  };
                  
                  // Analyze scripts changes
                  const getScriptsChanges = () => {
                    if (!changesData.periodic_scripts) return null;
                    
                    const currentScripts = new Map(periodicScripts.map(s => [s.id, s]));
                    const newScripts = new Map(changesData.periodic_scripts.map(s => [s.id, s]));
                    
                    const added = [];
                    const modified = [];
                    const deleted = [];
                    
                    newScripts.forEach((newScript, id) => {
                      const currentScript = currentScripts.get(id);
                      if (!currentScript) {
                        added.push(newScript);
                      } else if (JSON.stringify(newScript) !== JSON.stringify(currentScript)) {
                        modified.push({ old: currentScript, new: newScript });
                      }
                    });
                    
                    currentScripts.forEach((currentScript, id) => {
                      if (!newScripts.has(id)) {
                        deleted.push(currentScript);
                      }
                    });
                    
                    return { added, modified, deleted };
                  };
                  
                  const tableChanges = getTableChanges();
                  const scriptsChanges = getScriptsChanges();
                  
                  return (
                    <Box key={change.id} sx={{ mb: 3, p: 2, border: '1px solid #ccc', borderRadius: 1, direction: 'rtl' }}>
                      <Typography variant="h6" gutterBottom>
                        בקשה מ-{change.submitted_by} ({change.submitted_by_role})
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        תאריך: {new Date(change.created_at).toLocaleString('he-IL')}
                      </Typography>
                      
                      <Divider sx={{ my: 2 }} />
                      
                      {/* Version Changes */}
                      {versionChanged && (
                        <Accordion sx={{ 
                          mb: 1,
                          bgcolor: '#2d2d2d',
                          color: 'white',
                          '&:before': { display: 'none' },
                          '& .MuiAccordionSummary-root': {
                            bgcolor: '#1e1e1e',
                            minHeight: '48px',
                            '&:hover': { bgcolor: '#333' }
                          },
                          '& .MuiAccordionDetails-root': {
                            bgcolor: '#2d2d2d',
                            color: 'white'
                          }
                        }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <EditIcon sx={{ color: '#2196f3' }} />
                              <Typography><strong>שינוי גרסה</strong></Typography>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', direction: 'rtl' }}>
                              <Typography><strong>נוכחי:</strong> <span style={{ color: '#ff6b6b' }}>{currentVersion}</span></Typography>
                              <Typography>→</Typography>
                              <Typography><strong>חדש:</strong> <span style={{ color: '#51cf66' }}>{changesData.version}</span></Typography>
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      )}
                      
                      {/* Table Data Changes */}
                      {tableDataChanged && tableChanges && (
                        <Accordion sx={{ 
                          mb: 1,
                          bgcolor: '#2d2d2d',
                          color: 'white',
                          '&:before': { display: 'none' },
                          '& .MuiAccordionSummary-root': {
                            bgcolor: '#1e1e1e',
                            minHeight: '48px',
                            '&:hover': { bgcolor: '#333' }
                          },
                          '& .MuiAccordionDetails-root': {
                            bgcolor: '#2d2d2d',
                            color: 'white'
                          }
                        }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <EditIcon sx={{ color: '#2196f3' }} />
                              <Typography><strong>שינויים בטבלה</strong></Typography>
                              {tableChanges.addedPhases.length > 0 && (
                                <Chip label={`+${tableChanges.addedPhases.length} שלבים`} color="success" size="small" sx={{ bgcolor: '#4caf50', color: 'white' }} />
                              )}
                              {tableChanges.modifiedPhases.length > 0 && (
                                <Chip label={`${tableChanges.modifiedPhases.length} שלבים שונו`} color="warning" size="small" sx={{ bgcolor: '#ff9800', color: 'white' }} />
                              )}
                              {tableChanges.deletedPhases.length > 0 && (
                                <Chip label={`-${tableChanges.deletedPhases.length} שלבים`} color="error" size="small" sx={{ bgcolor: '#f44336', color: 'white' }} />
                              )}
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails>
                            {/* Added Phases */}
                            {tableChanges.addedPhases.length > 0 && (
                              <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#51cf66' }} gutterBottom>
                                  <AddCircleIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                                  שלבים שנוספו:
                                </Typography>
                                {tableChanges.addedPhases.map(phase => (
                                  <Box key={phase.phase} sx={{ ml: 2, mb: 1 }}>
                                    <Typography><strong>שלב {phase.phase}</strong> - {phase.rows?.length || 0} שורות</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                            
                            {/* Modified Phases */}
                            {tableChanges.modifiedPhases.length > 0 && (
                              <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#ff9800' }} gutterBottom>
                                  <EditIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                                  שלבים ששונו:
                                </Typography>
                                {tableChanges.modifiedPhases.map(({ phase, addedRows, modifiedRows, deletedRows }) => (
                                  <Box key={phase} sx={{ ml: 2, mb: 2, p: 1, bgcolor: '#1e1e1e', borderRadius: 1 }}>
                                    <Typography><strong>שלב {phase}</strong></Typography>
                                    {addedRows.length > 0 && (
                                      <Box sx={{ mt: 1 }}>
                                        <Typography variant="body2" sx={{ color: '#51cf66', mb: 1 }} gutterBottom>
                                          שורות שנוספו ({addedRows.length}):
                                        </Typography>
                                        {addedRows.map((addedRow, idx) => {
                                          // Calculate what the row number would be in the new data
                                          const newPhaseIndex = changesData.table_data.findIndex(p => p.phase === phase);
                                          const newRowIndex = changesData.table_data[newPhaseIndex]?.rows?.findIndex(r => r.id === addedRow.id);
                                          const newGlobalRowNumber = newRowIndex !== undefined && newRowIndex !== -1 
                                            ? getGlobalRowNumber(changesData.table_data, newPhaseIndex, newRowIndex)
                                            : null;
                                          
                                          return (
                                            <Accordion 
                                              key={idx} 
                                              sx={{ 
                                                mb: 1,
                                                bgcolor: '#2d2d2d',
                                                color: 'white',
                                                '&:before': { display: 'none' },
                                                '& .MuiAccordionSummary-root': {
                                                  bgcolor: '#1e1e1e',
                                                  minHeight: '48px',
                                                  '&:hover': { bgcolor: '#333' }
                                                },
                                                '& .MuiAccordionDetails-root': {
                                                  bgcolor: '#2d2d2d',
                                                  color: 'white'
                                                }
                                              }}
                                            >
                                              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}>
                                                <Typography>
                                                  <strong>שורה חדשה</strong> {newGlobalRowNumber && `(יהיה #${newGlobalRowNumber})`} - שלב {phase}
                                                </Typography>
                                              </AccordionSummary>
                                              <AccordionDetails>
                                                <Box sx={{ direction: 'rtl' }}>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>תפקיד:</strong> {addedRow.role}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>זמן:</strong> {addedRow.time}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>משך:</strong> {addedRow.duration}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>תיאור:</strong> {addedRow.description || '(ריק)'}
                                                  </Typography>
                                                  {addedRow.script && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>סקריפט:</strong> {addedRow.script}
                                                    </Typography>
                                                  )}
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>סטטוס:</strong> {addedRow.status}
                                                  </Typography>
                                                  <Box sx={{ display: 'flex', gap: 1, mt: 2, direction: 'rtl', justifyContent: 'flex-end' }}>
                                                    <Button
                                                      variant="contained"
                                                      color="success"
                                                      size="small"
                                                      onClick={async () => {
                                                        // Accept row addition - create the row
                                                        try {
                                                          const phaseObj = await api.getPhases(project.id);
                                                          const phaseData = phaseObj.find(p => p.phase === phase);
                                                          if (phaseData) {
                                                            await api.acceptPendingChangeRow(
                                                              project.id,
                                                              change.id,
                                                              null,
                                                              'create',
                                                              {
                                                                role: addedRow.role,
                                                                time: addedRow.time,
                                                                duration: addedRow.duration,
                                                                description: addedRow.description,
                                                                script: addedRow.script,
                                                                status: addedRow.status
                                                              },
                                                              phaseData.id
                                                            );
                                                            await loadProjectData(false);
                                                            const updatedChanges = await api.getPendingChanges(project.id, 'pending');
                                                            setPendingChanges(updatedChanges);
                                                          }
                                                        } catch (error) {
                                                          console.error('Failed to accept row addition', error);
                                                          setDataError(error.message || 'Failed to accept row addition');
                                                        }
                                                      }}
                                                    >
                                                      אישור
                                                    </Button>
                                                    <Button
                                                      variant="contained"
                                                      color="error"
                                                      size="small"
                                                      onClick={async () => {
                                                        // Decline row addition - remove from pending changes
                                                        try {
                                                          // Update pending change to remove this row
                                                          const updatedChanges = await api.getPendingChanges(project.id, 'pending');
                                                          setPendingChanges(updatedChanges);
                                                        } catch (error) {
                                                          console.error('Failed to decline row addition', error);
                                                        }
                                                      }}
                                                    >
                                                      דחייה
                                                    </Button>
                                                  </Box>
                                                </Box>
                                              </AccordionDetails>
                                            </Accordion>
                                          );
                                        })}
                                      </Box>
                                    )}
                                    {modifiedRows.length > 0 && (
                                      <Box sx={{ mt: 1 }}>
                                        <Typography variant="body2" color="warning.main" gutterBottom>
                                          שורות ששונו ({modifiedRows.length}):
                                        </Typography>
                                        {modifiedRows.map(({ old, new: newRow, phaseIndex, oldRowIndex }, idx) => {
                                          return (
                                            <Accordion 
                                              key={idx} 
                                              sx={{ 
                                                mb: 1,
                                                bgcolor: '#2d2d2d',
                                                color: 'white',
                                                '&:before': { display: 'none' },
                                                '& .MuiAccordionSummary-root': {
                                                  bgcolor: '#1e1e1e',
                                                  minHeight: '48px',
                                                  '&:hover': { bgcolor: '#333' }
                                                },
                                                '& .MuiAccordionDetails-root': {
                                                  bgcolor: '#2d2d2d',
                                                  color: 'white'
                                                }
                                              }}
                                            >
                                              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}>
                                                <Typography>
                                                  <strong>שורה שונתה</strong> - שלב {phase}
                                                </Typography>
                                              </AccordionSummary>
                                              <AccordionDetails>
                                                <Box sx={{ direction: 'rtl' }}>
                                                  {old.role !== newRow.role && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>תפקיד:</strong> <span style={{ color: '#ff6b6b' }}>{old.role}</span> → <span style={{ color: '#51cf66' }}>{newRow.role}</span>
                                                    </Typography>
                                                  )}
                                                  {old.time !== newRow.time && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>זמן:</strong> <span style={{ color: '#ff6b6b' }}>{old.time}</span> → <span style={{ color: '#51cf66' }}>{newRow.time}</span>
                                                    </Typography>
                                                  )}
                                                  {old.duration !== newRow.duration && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>משך:</strong> <span style={{ color: '#ff6b6b' }}>{old.duration}</span> → <span style={{ color: '#51cf66' }}>{newRow.duration}</span>
                                                    </Typography>
                                                  )}
                                                  {old.description !== newRow.description && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>תיאור:</strong> <span style={{ color: '#ff6b6b' }}>{old.description || '(ריק)'}</span> → <span style={{ color: '#51cf66' }}>{newRow.description || '(ריק)'}</span>
                                                    </Typography>
                                                  )}
                                                  {old.script !== newRow.script && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>סקריפט:</strong> <span style={{ color: '#ff6b6b' }}>{old.script || '(ריק)'}</span> → <span style={{ color: '#51cf66' }}>{newRow.script || '(ריק)'}</span>
                                                    </Typography>
                                                  )}
                                                  {old.status !== newRow.status && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>סטטוס:</strong> <span style={{ color: '#ff6b6b' }}>{old.status}</span> → <span style={{ color: '#51cf66' }}>{newRow.status}</span>
                                                    </Typography>
                                                  )}
                                                  <Box sx={{ display: 'flex', gap: 1, mt: 2, direction: 'rtl', justifyContent: 'flex-end' }}>
                                                    <Button
                                                      variant="contained"
                                                      color="success"
                                                      size="small"
                                                      onClick={async () => {
                                                        // Accept row change - apply the new values
                                                        try {
                                                          await api.acceptPendingChangeRow(
                                                            project.id,
                                                            change.id,
                                                            old.id,
                                                            'update',
                                                            {
                                                              role: newRow.role,
                                                              time: newRow.time,
                                                              duration: newRow.duration,
                                                              description: newRow.description,
                                                              script: newRow.script,
                                                              status: newRow.status
                                                            }
                                                          );
                                                          await loadProjectData(false);
                                                          const updatedChanges = await api.getPendingChanges(project.id, 'pending');
                                                          setPendingChanges(updatedChanges);
                                                        } catch (error) {
                                                          console.error('Failed to accept row change', error);
                                                          setDataError(error.message || 'Failed to accept row change');
                                                        }
                                                      }}
                                                    >
                                                      אישור
                                                    </Button>
                                                    <Button
                                                      variant="contained"
                                                      color="error"
                                                      size="small"
                                                      onClick={async () => {
                                                        // Decline row change - remove from pending changes
                                                        try {
                                                          // The row stays as-is, we just need to refresh to see updated pending changes
                                                          const updatedChanges = await api.getPendingChanges(project.id, 'pending');
                                                          setPendingChanges(updatedChanges);
                                                        } catch (error) {
                                                          console.error('Failed to decline row change', error);
                                                        }
                                                      }}
                                                    >
                                                      דחייה
                                                    </Button>
                                                  </Box>
                                                </Box>
                                              </AccordionDetails>
                                            </Accordion>
                                          );
                                        })}
                                      </Box>
                                    )}
                                    {deletedRows.length > 0 && (
                                      <Box sx={{ mt: 1 }}>
                                        <Typography variant="body2" sx={{ color: '#f44336' }} gutterBottom>
                                          שורות שנמחקו ({deletedRows.length}):
                                        </Typography>
                                        {deletedRows.map((deletedRow, idx) => {
                                          return (
                                            <Accordion 
                                              key={idx} 
                                              sx={{ 
                                                mb: 1,
                                                bgcolor: '#2d2d2d',
                                                color: 'white',
                                                '&:before': { display: 'none' },
                                                '& .MuiAccordionSummary-root': {
                                                  bgcolor: '#1e1e1e',
                                                  minHeight: '48px',
                                                  '&:hover': { bgcolor: '#333' }
                                                },
                                                '& .MuiAccordionDetails-root': {
                                                  bgcolor: '#2d2d2d',
                                                  color: 'white'
                                                }
                                              }}
                                            >
                                              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}>
                                                <Typography>
                                                  <strong>שורה שנמחקה</strong> - שלב {phase}
                                                </Typography>
                                              </AccordionSummary>
                                              <AccordionDetails>
                                                <Box sx={{ direction: 'rtl' }}>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>תפקיד:</strong> {deletedRow.role}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>זמן:</strong> {deletedRow.time}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>משך:</strong> {deletedRow.duration}
                                                  </Typography>
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>תיאור:</strong> {deletedRow.description || '(ריק)'}
                                                  </Typography>
                                                  {deletedRow.script && (
                                                    <Typography variant="body2" sx={{ mb: 1 }}>
                                                      <strong>סקריפט:</strong> {deletedRow.script}
                                                    </Typography>
                                                  )}
                                                  <Typography variant="body2" sx={{ mb: 1 }}>
                                                    <strong>סטטוס:</strong> {deletedRow.status}
                                                  </Typography>
                                                  <Box sx={{ display: 'flex', gap: 1, mt: 2, direction: 'rtl', justifyContent: 'flex-end' }}>
                                                    <Button
                                                      variant="contained"
                                                      color="success"
                                                      size="small"
                                                      onClick={async () => {
                                                        // Accept deletion - delete the row
                                                        try {
                                                          await api.acceptPendingChangeRow(
                                                            project.id,
                                                            change.id,
                                                            deletedRow.id,
                                                            'delete',
                                                            null
                                                          );
                                                          await loadProjectData(false);
                                                          const updatedChanges = await api.getPendingChanges(project.id, 'pending');
                                                          setPendingChanges(updatedChanges);
                                                        } catch (error) {
                                                          console.error('Failed to accept row deletion', error);
                                                          setDataError(error.message || 'Failed to accept row deletion');
                                                        }
                                                      }}
                                                    >
                                                      אישור
                                                    </Button>
                                                    <Button
                                                      variant="contained"
                                                      color="error"
                                                      size="small"
                                                      onClick={async () => {
                                                        // Decline deletion - keep the row (remove from changes)
                                                        try {
                                                          const updatedChanges = await api.getPendingChanges(project.id, 'pending');
                                                          setPendingChanges(updatedChanges);
                                                        } catch (error) {
                                                          console.error('Failed to decline row deletion', error);
                                                        }
                                                      }}
                                                    >
                                                      דחייה
                                                    </Button>
                                                  </Box>
                                                </Box>
                                              </AccordionDetails>
                                            </Accordion>
                                          );
                                        })}
                                      </Box>
                                    )}
                                  </Box>
                                ))}
                              </Box>
                            )}
                            
                            {/* Deleted Phases */}
                            {tableChanges.deletedPhases.length > 0 && (
                              <Box>
                                <Typography variant="subtitle2" sx={{ color: '#f44336' }} gutterBottom>
                                  <RemoveCircleIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                                  שלבים שנמחקו:
                                </Typography>
                                {tableChanges.deletedPhases.map(phase => (
                                  <Box key={phase.phase} sx={{ ml: 2, mb: 1 }}>
                                    <Typography><strong>שלב {phase.phase}</strong> - {phase.rows?.length || 0} שורות</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </AccordionDetails>
                        </Accordion>
                      )}
                      
                      {/* Periodic Scripts Changes */}
                      {scriptsChanged && scriptsChanges && (
                        <Accordion sx={{ 
                          mb: 1,
                          bgcolor: '#2d2d2d',
                          color: 'white',
                          '&:before': { display: 'none' },
                          '& .MuiAccordionSummary-root': {
                            bgcolor: '#1e1e1e',
                            minHeight: '48px',
                            '&:hover': { bgcolor: '#333' }
                          },
                          '& .MuiAccordionDetails-root': {
                            bgcolor: '#2d2d2d',
                            color: 'white'
                          }
                        }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <EditIcon sx={{ color: '#2196f3' }} />
                              <Typography><strong>שינויים בסקריפטים תקופתיים</strong></Typography>
                              {scriptsChanges.added.length > 0 && (
                                <Chip label={`+${scriptsChanges.added.length}`} color="success" size="small" sx={{ bgcolor: '#4caf50', color: 'white' }} />
                              )}
                              {scriptsChanges.modified.length > 0 && (
                                <Chip label={`${scriptsChanges.modified.length} שונו`} color="warning" size="small" sx={{ bgcolor: '#ff9800', color: 'white' }} />
                              )}
                              {scriptsChanges.deleted.length > 0 && (
                                <Chip label={`-${scriptsChanges.deleted.length}`} color="error" size="small" sx={{ bgcolor: '#f44336', color: 'white' }} />
                              )}
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails>
                            {/* Added Scripts */}
                            {scriptsChanges.added.length > 0 && (
                              <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#51cf66' }} gutterBottom>
                                  <AddCircleIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                                  סקריפטים שנוספו:
                                </Typography>
                                {scriptsChanges.added.map(script => (
                                  <Box key={script.id} sx={{ ml: 2, mb: 0.5 }}>
                                    <Typography><strong>{script.name}</strong> - {script.path}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                            
                            {/* Modified Scripts */}
                            {scriptsChanges.modified.length > 0 && (
                              <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#ff9800' }} gutterBottom>
                                  <EditIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                                  סקריפטים ששונו:
                                </Typography>
                                {scriptsChanges.modified.map(({ old, new: newScript }, idx) => (
                                  <Box key={idx} sx={{ ml: 2, mb: 1, p: 1, bgcolor: '#1e1e1e', borderRadius: 1 }}>
                                    <Typography><strong>{old.name}</strong></Typography>
                                    {old.name !== newScript.name && (
                                      <Typography variant="body2" display="block" sx={{ mt: 0.5 }}>
                                        שם: <span style={{ color: '#ff6b6b' }}>{old.name}</span> → <span style={{ color: '#51cf66' }}>{newScript.name}</span>
                                      </Typography>
                                    )}
                                    {old.path !== newScript.path && (
                                      <Typography variant="body2" display="block" sx={{ mt: 0.5 }}>
                                        נתיב: <span style={{ color: '#ff6b6b' }}>{old.path}</span> → <span style={{ color: '#51cf66' }}>{newScript.path}</span>
                                      </Typography>
                                    )}
                                    {old.status !== newScript.status && (
                                      <Typography variant="body2" display="block" sx={{ mt: 0.5 }}>
                                        סטטוס: <span style={{ color: '#ff6b6b' }}>{old.status ? 'פעיל' : 'לא פעיל'}</span> → <span style={{ color: '#51cf66' }}>{newScript.status ? 'פעיל' : 'לא פעיל'}</span>
                                      </Typography>
                                    )}
                                  </Box>
                                ))}
                              </Box>
                            )}
                            
                            {/* Deleted Scripts */}
                            {scriptsChanges.deleted.length > 0 && (
                              <Box>
                                <Typography variant="subtitle2" sx={{ color: '#f44336' }} gutterBottom>
                                  <RemoveCircleIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                                  סקריפטים שנמחקו:
                                </Typography>
                                {scriptsChanges.deleted.map(script => (
                                  <Box key={script.id} sx={{ ml: 2, mb: 0.5 }}>
                                    <Typography><strong>{script.name}</strong> - {script.path}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </AccordionDetails>
                        </Accordion>
                      )}
                      
                      <Divider sx={{ my: 2 }} />
                      
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, direction: 'rtl', justifyContent: 'flex-end' }}>
                        <Button
                          variant="contained"
                          color="success"
                          onClick={() => handleAcceptPendingChange(change.id)}
                          sx={{ minWidth: 100 }}
                        >
                          אישור
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          onClick={() => handleDeclinePendingChange(change.id)}
                          sx={{ minWidth: 100 }}
                        >
                          דחייה
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </DialogContent>
          <DialogActions style={{ direction: 'rtl' }}>
            <Typography variant="body2" sx={{ mr: 2, color: 'text.secondary' }}>
              {pendingChanges.length > 0 && `${pendingChanges.length} בקשות ממתינות`}
            </Typography>
            <Button onClick={() => {
              setReviewModalOpen(false);
              setSelectedPendingChange(null);
            }}>
              סגור
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
};

export default MainScreen;