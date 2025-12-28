// src/components/MainScreen.js

import React, { useState, useEffect, useCallback, useRef, startTransition, useDeferredValue } from 'react';
import Header from './Header';
import EditableTable from './EditableTable';
import useCollaborativeTimer from './CollaborativeTimer';
import ProjectChat from './ProjectChat';
import usePageVisibility from '../hooks/usePageVisibility';
import { Button, Typography, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api/conductorApi';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';

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
  const hours = Math.floor(absSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (absSeconds % 60).toString().padStart(2, '0');

  return (isNegative ? '-' : '+') + hours + ':' + minutes + ':' + seconds;
};

// Helper function for efficient deep copying of table data
// Uses manual copy instead of structuredClone for better compatibility
const deepCloneTableData = (data) => {
  return data.map(phase => ({
    ...phase,
    rows: phase.rows.map(row => ({ ...row }))
  }));
};

const MainScreen = ({ project, role, name, onLogout }) => {
  const isManager = role === project.manager_role;
  const isVisible = usePageVisibility();
  const [projectDetails, setProjectDetails] = useState(project);
  
  // State for the project version
  const [currentVersion, setCurrentVersion] = useState(project.version || 'v1.0');
  // Temporary state to hold the version during an edit session
  const [originalVersion, setOriginalVersion] = useState(project.version);
  
  const [isEditing, setIsEditing] = useState(false);
  // Defer the isEditing value to allow React to keep UI responsive during transition
  const deferredIsEditing = useDeferredValue(isEditing);
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
  const [inactiveUserDialogOpen, setInactiveUserDialogOpen] = useState(false);
  
  // Track explicit move/duplicate operations to prevent index change notifications
  const explicitOperationsRef = useRef({ row_moves: [], row_duplicates: [] });
  
  // Track if we just accepted a change with table_data to prevent reload
  const justAcceptedWithTableDataRef = useRef(false);

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  
  // Timer state - managed by CollaborativeTimer hook
  const [totalSeconds, setTotalSeconds] = useState(0);
  
  // Memoize the callback to prevent infinite loops
  const handleTimeUpdate = useCallback((seconds) => {
    setTotalSeconds(seconds);
  }, []);
  
  const timer = useCollaborativeTimer({
    projectId: project.id,
    isManager: isManager,
    onTimeUpdate: handleTimeUpdate
  });
  
  // Extract timer values
  const isRunning = timer.isRunning;
  
  // Target time state for countdown mode
  const [targetDateTime, setTargetDateTime] = useState('');
  const [isUsingTargetTime, setIsUsingTargetTime] = useState(false);
  
  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const lastReadMessageIndexRef = useRef(-1);
  const processedMessageIdsRef = useRef(new Set());
  const processNotificationRef = useRef(null);
  const periodicScriptTimeoutsRef = useRef({}); // Store timeout IDs for each periodic script
  const executePeriodicScriptRef = useRef(null); // Store latest executePeriodicScript function
  
  // Maximum number of processed message IDs to keep in memory (prevents unbounded growth)
  const MAX_PROCESSED_MESSAGE_IDS = 1000;
  
  // Helper function to add message ID with size limiting
  const addProcessedMessageId = useCallback((messageId) => {
    const messageIds = processedMessageIdsRef.current;
    if (messageIds.size >= MAX_PROCESSED_MESSAGE_IDS) {
      // Remove oldest entries (first N entries when converted to array)
      const idsArray = Array.from(messageIds);
      const removeCount = Math.floor(MAX_PROCESSED_MESSAGE_IDS * 0.2); // Remove 20% when limit reached
      idsArray.slice(0, removeCount).forEach(id => messageIds.delete(id));
    }
    messageIds.add(messageId);
  }, []);

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
      await api.updateRow(rowId, { status, user_name: name, user_role: role });
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
      const { result } = await api.runRowScript(rowId, { user_name: name, user_role: role });
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
      const updatedPhase = await api.togglePhaseActive(phase.id, { user_name: name, user_role: role });
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
    } catch (error) {
      console.error('Failed to toggle phase activation', error);
      setDataError(error.message || 'Failed to toggle phase activation');
    }
  };

  // Load project data
  const loadProjectData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoadingData(true);
    }
    setDataError('');
    
    try {
      // Fetch project details
      const projectData = await api.getProjectById(project.id);
      setProjectDetails(projectData);
      setCurrentVersion(projectData.version);
      
      // Fetch phases with rows
      const phasesData = await api.getPhases(project.id);
      const tableData = phasesData.map(phase => ({
        id: phase.id,
        phase: phase.phase,
        is_active: phase.is_active,
        rows: phase.rows.map(row => ({
          id: row.id,
          role: row.role,
          time: row.time,
          duration: row.duration,
          description: row.description,
          script: row.script,
          status: row.status,
          scriptResult: row.scriptResult
        }))
      }));
      
      setCurrentTableData(tableData);
      // Use efficient manual copy instead of structuredClone (faster and more compatible)
      setOriginalTableData(deepCloneTableData(tableData));
      
      // Set active phases
      const activePhasesMap = {};
      phasesData.forEach(phase => {
        activePhasesMap[phase.phase] = !!phase.is_active;
      });
      setActivePhases(activePhasesMap);
      
      // Fetch roles
      const roles = await api.getProjectRoles(project.id);
      setAllRoles(roles);
      
      // Fetch periodic scripts
      const scriptsData = await api.getPeriodicScripts(project.id);
      setPeriodicScripts(scriptsData);
      setOriginalPeriodicScripts(JSON.parse(JSON.stringify(scriptsData)));
      
      // Fetch active logins
      const loginsData = await api.getActiveLogins(project.id);
      setActiveLogins(loginsData);
      
      // Clock state is now managed by CollaborativeTimer via Socket.IO
      // No need to process clock commands here
    } catch (error) {
      console.error('Failed to load project data', error);
      setDataError(error.message || 'Failed to load project data');
    } finally {
        setIsLoadingData(false);
      }
  }, [project.id]);

  // Load data on mount
  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  // Poll for project data updates as fallback (Socket.IO handles real-time updates)
  // This ensures data syncs even if Socket.IO connection drops
  useInterval(() => {
    if (isVisible && !isEditing && !isLoadingData && !justAcceptedWithTableDataRef.current) {
      // Don't reload if we just accepted a change with table_data (to preserve order)
      loadProjectData(false).catch(err => {
          // Silently fail - polling is not critical
        });
    }
  }, 60000); // Poll every 60 seconds as fallback - Socket.IO handles real-time

  // Send heartbeat every 30 seconds to keep session alive and allow stale session cleanup
  useInterval(() => {
    if (isVisible && project.id && name && role && !inactiveUserDialogOpen) {
      api.heartbeat(project.id, name, role)
        .catch((error) => {
          // If heartbeat fails with 404, user is inactive
          if (error.status === 404 || error.message?.includes('Active user not found')) {
            setInactiveUserDialogOpen(true);
          }
          // Silently fail for other errors
        });
    }
  }, 30000); // Heartbeat every 30 seconds

  // Execute a single periodic script and schedule next execution
  const executePeriodicScript = useCallback(async (script) => {
    // Check if already executing - prevent parallel executions
    if (periodicScriptTimeoutsRef.current[script.id] === 'executing') {
      return;
    }
    
    // Mark script as executing immediately to prevent parallel calls
    periodicScriptTimeoutsRef.current[script.id] = 'executing';
    
    try {
      const response = await api.executePeriodicScript(script.id);
      const { result, script: updatedScript } = response;
      
      // Schedule next execution after the returned interval (convert seconds to milliseconds)
      const intervalMs = result.interval * 1000;
      
      // Clear any existing timeout for this script before scheduling a new one
      const existingTimeout = periodicScriptTimeoutsRef.current[script.id];
      if (existingTimeout && typeof existingTimeout === 'number') {
        clearTimeout(existingTimeout);
      }
      
      // Schedule next execution BEFORE updating state to prevent useEffect from re-triggering
      const timeoutId = setTimeout(() => {
        // Clear the timeout ref before executing (will be set again after execution)
        delete periodicScriptTimeoutsRef.current[script.id];
        // Get current script state and execute directly (not from setState callback)
        const currentScripts = periodicScriptsRef.current;
        const currentScript = currentScripts?.find(s => s.id === script.id);
        if (currentScript && executePeriodicScriptRef.current) {
          executePeriodicScriptRef.current(currentScript);
        }
      }, intervalMs);
      
      // Store the actual timeout ID in ref
      periodicScriptTimeoutsRef.current[script.id] = timeoutId;
      
      // Update the script in state with new status AFTER timeout is set
      setPeriodicScripts(prev => {
        return prev.map(s => 
          s.id === script.id 
            ? { ...s, status: result.status, last_executed: updatedScript.last_executed }
            : s
        );
      });
      
    } catch (error) {
      console.error(`Failed to execute periodic script ${script.id} (${script.name}):`, error);
      // Don't schedule next execution on error
      delete periodicScriptTimeoutsRef.current[script.id];
    }
  }, []);

  // Store latest executePeriodicScript function in ref
  useEffect(() => {
    executePeriodicScriptRef.current = executePeriodicScript;
  }, [executePeriodicScript]);

  // Track script IDs to detect when scripts are added/removed (not just status changes)
  const periodicScriptIdsRef = useRef(new Set());
  const periodicScriptsRef = useRef(periodicScripts);
  
  // Update ref when periodicScripts changes
  useEffect(() => {
    periodicScriptsRef.current = periodicScripts;
  }, [periodicScripts]);
  
  // Manage automatic periodic script execution - only trigger on script add/remove, not status changes
  useEffect(() => {
    const currentScripts = periodicScriptsRef.current;
    if (!currentScripts || currentScripts.length === 0) {
      // Clear all timeouts if no scripts
      Object.values(periodicScriptTimeoutsRef.current).forEach(timeoutId => {
        if (typeof timeoutId === 'number') {
          clearTimeout(timeoutId);
        }
      });
      periodicScriptTimeoutsRef.current = {};
      periodicScriptIdsRef.current = new Set();
      return;
    }

    // Get current script IDs
    const currentScriptIds = new Set(currentScripts.map(s => s.id));
    const previousScriptIds = periodicScriptIdsRef.current;
    
    // Check if scripts were added or removed (not just status changed)
    const scriptsChanged = 
      currentScriptIds.size !== previousScriptIds.size ||
      [...currentScriptIds].some(id => !previousScriptIds.has(id)) ||
      [...previousScriptIds].some(id => !currentScriptIds.has(id));
    
    // Update the ref with current IDs
    periodicScriptIdsRef.current = currentScriptIds;
    
    // Cancel timeouts for scripts that no longer exist
    Object.keys(periodicScriptTimeoutsRef.current).forEach(scriptId => {
      if (!currentScriptIds.has(parseInt(scriptId))) {
        const timeoutId = periodicScriptTimeoutsRef.current[scriptId];
        if (typeof timeoutId === 'number') {
          clearTimeout(timeoutId);
        }
        delete periodicScriptTimeoutsRef.current[scriptId];
      }
    });

    // Only execute scripts if they were added (not on every status update)
    if (scriptsChanged) {
      currentScripts.forEach(script => {
        // Only start if not already running (check if timeout exists or is executing)
        const hasTimeout = periodicScriptTimeoutsRef.current[script.id] !== undefined;
        if (!hasTimeout) {
          executePeriodicScript(script);
        }
      });
    }

    // NO cleanup function - we don't want to clear timeouts when dependencies change
    // Timeouts are only cleared:
    // 1. When scripts are removed (handled above in the effect body)
    // 2. When scripts array is empty (handled above)
    // 3. On actual component unmount (handled by React automatically when component is destroyed)
  }, [executePeriodicScript, periodicScripts]); // Need periodicScripts to detect when scripts are first loaded

  const handleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    setDataError('');
    
    try {
      if (isManager) {
        // Manager saves directly
        await api.updateTableData(project.id, currentTableData, name, role);
        await api.updatePeriodicScriptsBulk(project.id, periodicScripts, name, role);
        await api.updateProjectVersion(project.id, currentVersion);
        
        // Update roles
        const currentRoles = await api.getProjectRoles(project.id);
        const currentRoleNames = new Set(currentRoles);
        
        // Add new roles
        for (const roleName of allRoles) {
          if (!currentRoleNames.has(roleName)) {
            await api.addProjectRole(project.id, roleName);
          }
        }
        
        // Note: Role deletion would need a separate endpoint
        
        // Update local state
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
      } else {
        // Non-manager submits pending change
        // Note: We don't include roles here because roles are derived from rows
        // and will be automatically updated when rows are added/modified/deleted
        const changesData = {
          version: currentVersion,
          table_data: currentTableData,
          periodic_scripts: periodicScripts,
          // Include explicit move/duplicate operations to prevent index change notifications
          explicit_operations: {
            row_moves: explicitOperationsRef.current.row_moves,
            row_duplicates: explicitOperationsRef.current.row_duplicates
          }
          // roles: allRoles, // Removed - roles are derived from rows, not independently managed
        };
        
        
        await api.createPendingChange(
          project.id,
          name,
          role,
          changesData
        );
        
        // Clear explicit operations after submission
        explicitOperationsRef.current = { row_moves: [], row_duplicates: [] };
        
        // Revert to original data after submission
        setCurrentTableData(originalTableData);
        setPeriodicScripts(originalPeriodicScripts);
        setCurrentVersion(originalVersion);
        setIsEditing(false);
        alert('שינויים נשלחו לאישור המנהל');
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
    // Clear explicit operations on cancel
    explicitOperationsRef.current = { row_moves: [], row_duplicates: [] };
    setIsEditing(false);
  };
  
  // Callbacks to register move/duplicate operations
  const registerRowMove = useCallback((rowId, sourcePhaseNumber, targetPhaseNumber, targetPosition, sourceRowIndex) => {
    if (!isManager) {
      explicitOperationsRef.current.row_moves.push({
        row_id: rowId,
        source_phase_number: sourcePhaseNumber,
        target_phase_number: targetPhaseNumber,
        target_position: targetPosition,
        source_row_index: sourceRowIndex // Store source position for description
      });
    }
  }, [isManager]);
  
  const registerRowDuplicate = useCallback((sourceRowId, newRowId, targetPhaseNumber, targetPosition) => {
    if (!isManager) {
      explicitOperationsRef.current.row_duplicates.push({
        source_row_id: sourceRowId,
        new_row_id: newRowId, // Track the new duplicated row ID to prevent it from being detected as a new row
        target_phase_number: targetPhaseNumber,
        target_position: targetPosition
      });
    }
  }, [isManager]);

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

  // Socket.IO listener for real-time project data updates
  useEffect(() => {
    if (!project.id) return;

    const socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      socket.emit('join_project_room', { project_id: project.id });
      // Join user-specific room for instant notifications
      if (project.id && role && name) {
        socket.emit('join_user_room', { project_id: project.id, role, name });
      }
    });
    
    socket.on('reconnect', () => {
      socket.emit('join_project_room', { project_id: project.id });
      if (project.id && role && name) {
        socket.emit('join_user_room', { project_id: project.id, role, name });
      }
    });

    socket.on('phases_updated', (data) => {
      if (data.project_id === project.id && !isEditing) {
        // Reload data when phases are updated (status changes, manager approvals, etc.)
        loadProjectData(false).catch(() => {});
      }
    });

    socket.on('pending_changes_notification', (data) => {
      if (data.project_id === project.id && isManager && data.manager_role === role) {
        fetchPendingChanges();
        setReviewModalOpen(true);
      }
    });

    socket.on('user_notification', (data) => {
      // Handle real-time user notifications (e.g., manager nudge)
      if (data.project_id === project.id && data.command && data.data && !isManager) {
        // Process notification immediately via EditableTable's processNotification
        if (processNotificationRef.current) {
          processNotificationRef.current(data.command, data.data);
          // Clear notification from database after processing
          api.clearUserNotification(project.id, role, name).catch(() => {});
        }
      }
    });

    socket.on('pending_changes_updated', (data) => {
      if (data.project_id === project.id && isManager) {
        fetchPendingChanges();
      }
    });

    socket.on('user_deactivated', (data) => {
      if (data.project_id === project.id && data.role === role && data.name === name) {
        setInactiveUserDialogOpen(true);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('reconnect');
      socket.off('phases_updated');
      socket.off('pending_changes_notification');
      socket.off('user_notification');
      socket.off('pending_changes_updated');
      socket.off('user_deactivated');
      socket.disconnect();
    };
  }, [project.id, isEditing, loadProjectData, isManager, role, name, fetchPendingChanges]);

  // Handle accepting a pending change
  const handleAcceptPendingChange = async (changeId) => {
    try {
      const response = await api.acceptPendingChange(project.id, changeId, name);
      
      // If table_data is returned, use it to update local state (preserves row order)
      if (response.table_data) {
        
        // Update currentTableData with the table_data from the submission
        // This preserves the correct row order
        
        setCurrentTableData(response.table_data);
        // Use efficient manual copy instead of structuredClone (faster and more compatible)
        setOriginalTableData(deepCloneTableData(response.table_data));
        
        // Also update active phases
        const activePhasesMap = {};
        response.table_data.forEach(phase => {
          activePhasesMap[phase.phase] = !!phase.is_active;
        });
        setActivePhases(activePhasesMap);
        
        // Set a flag to prevent reload from data_updated notification
        // We'll use a ref to track this
        justAcceptedWithTableDataRef.current = true;
        setTimeout(() => {
          justAcceptedWithTableDataRef.current = false;
        }, 10000); // Prevent reload for 10 seconds after accepting (increased from 5)
      } else {
        // No table_data - refresh from server (normal case)
        await loadProjectData(false);
      }
      
      const updatedChanges = await api.getPendingChanges(project.id, 'pending');
      setPendingChanges(updatedChanges);
      
      // Auto-close modal if all changes in the submission are processed
      if (response.all_processed) {
        setReviewModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to accept pending change', error);
      setDataError(error.message || 'Failed to accept pending change');
    }
  };

  // Handle declining a pending change
  const handleDeclinePendingChange = async (changeId) => {
    try {
      const response = await api.declinePendingChange(project.id, changeId, name);
      const updatedChanges = await api.getPendingChanges(project.id, 'pending');
      setPendingChanges(updatedChanges);
      
      // Auto-close modal if all changes in the submission are processed
      if (response.all_processed) {
        setReviewModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to decline pending change', error);
      setDataError(error.message || 'Failed to decline pending change');
    }
  };

  // Poll for notifications (pending changes for managers, data updates for all users)
  // Socket.IO handles real-time user notifications, polling is fallback only
  useEffect(() => {
    if (project.id && role && name) {
      const interval = setInterval(() => {
        api.getUserNotification(project.id, role, name)
          .then(response => {
            if (response.command === 'pending_changes' && response.data && isManager) {
              // Open review modal and fetch pending changes
              fetchPendingChanges();
              setReviewModalOpen(true);
              // Clear the notification
              api.clearUserNotification(project.id, role, name).catch(() => {});
            } else if (response.command === 'show_modal' && response.data && !isManager) {
              // Fallback: Handle show_modal notification if Socket.IO missed it
              // Socket.IO should handle this in real-time, but polling ensures reliability
              if (processNotificationRef.current) {
                processNotificationRef.current(response.command, response.data);
                // Clear the notification after processing
                api.clearUserNotification(project.id, role, name).catch(() => {});
              }
            } else if (response.command === 'data_updated' && response.data && !isEditing) {
              // Parse notification data to check change_type
              let notificationData = null;
              try {
                notificationData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
              } catch (e) {
                // Ignore parse errors
              }
              
              const changeType = notificationData?.change_type;
              
              // Don't reload for row_move or row_duplicate changes because they require table_data
              // to preserve order, and reloading from backend (ordered by ID) would lose the order.
              // Also don't reload if we just accepted a change with table_data (to preserve order)
              if (changeType !== 'row_move' && changeType !== 'row_duplicate' && !justAcceptedWithTableDataRef.current) {
                // Refresh project data when updates are made
                loadProjectData(false).catch(() => {});
              }
              // Clear the notification
              api.clearUserNotification(project.id, role, name).catch(() => {});
            }
          })
          .catch(err => {
            // Silently fail
          });
      }, 60000); // Poll every 60 seconds as fallback - Socket.IO handles real-time notifications

      return () => clearInterval(interval);
    }
  }, [isManager, project.id, role, name, fetchPendingChanges, loadProjectData, isEditing, processNotificationRef]);

  // Fetch pending changes on mount and periodically
  useEffect(() => {
    if (isManager) {
      fetchPendingChanges();
      const interval = setInterval(fetchPendingChanges, 60000); // Poll every 60 seconds as fallback - Socket.IO handles real-time updates
      return () => clearInterval(interval);
    }
  }, [isManager, fetchPendingChanges]);

  // Sync targetDateTime from timer (must be before any conditional returns)
  useEffect(() => {
    if (timer.targetDateTime !== undefined) {
      if (timer.targetDateTime) {
        // Convert UTC Date to local datetime-local format for input field
        // Get local time components from the UTC date
        const localDate = new Date(timer.targetDateTime);
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        const hours = String(localDate.getHours()).padStart(2, '0');
        const minutes = String(localDate.getMinutes()).padStart(2, '0');
        const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
        setTargetDateTime(datetimeLocal);
        setIsUsingTargetTime(true);
      } else {
        setTargetDateTime('');
        setIsUsingTargetTime(false);
      }
    }
  }, [timer.targetDateTime]);

  if (isLoadingData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  // Clock handlers - use CollaborativeTimer
  // Use totalSeconds directly since it's updated via onTimeUpdate callback
  const clockTime = formatTime(totalSeconds);
  const handleSetClockTime = async (timeString) => {
    if (!isManager) return;
    // Parse time string (+/-hh:mm:ss) to seconds
    const match = timeString.match(/^([+-])(\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const hours = parseInt(match[2], 10);
      const minutes = parseInt(match[3], 10);
      const seconds = parseInt(match[4], 10);
      const totalSecs = sign * (hours * 3600 + minutes * 60 + seconds);
      // Use Socket.IO to set the time
      if (timer.handleSetTime) {
        timer.handleSetTime(totalSecs);
      }
    }
  };

  const handleToggleClock = () => {
    if (!isManager) {
      console.warn('Only managers can toggle the clock');
      return;
    }
    if (!timer.isConnected) {
      console.error('Timer socket not connected. Please wait for connection or check backend server.');
      alert('Timer not connected. Please ensure the backend server is running and try again.');
      return;
    }
    if (timer.isRunning) {
      timer.handleStop();
    } else {
      timer.handleStart();
    }
  };

  const handleSetTargetClockTime = async (targetTime) => {
    if (!isManager) return;
    if (timer.handleSetTarget) {
      timer.handleSetTarget(targetTime);
      setTargetDateTime(targetTime);
      setIsUsingTargetTime(true);
    } else {
      console.error('Timer handleSetTarget not available');
    }
  };

  const handleClearTargetClockTime = async () => {
    if (!isManager) return;
    if (timer.handleClearTarget) {
      timer.handleClearTarget();
      setTargetDateTime('');
      setIsUsingTargetTime(false);
    } else {
      console.error('Timer handleClearTarget not available');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#121212' }}>
      <Header
        project={projectDetails}
        role={role}
        name={name}
        isEditing={deferredIsEditing}
        currentVersion={currentVersion}
        setCurrentVersion={setCurrentVersion}
        onToggleEdit={() => {
          const startTime = performance.now();
          console.log('[Performance] Starting edit mode switch');
          startTransition(() => {
            setIsEditing(true);
            // Log after state update
            setTimeout(() => {
              const endTime = performance.now();
              console.log(`[Performance] Edit mode switch took ${(endTime - startTime).toFixed(2)}ms`);
            }, 0);
          });
        }}
        onSave={handleSave}
        onCancel={handleCancel}
        clockTime={clockTime}
        isRunning={isRunning}
        isManager={isManager}
        handleSetClockTime={handleSetClockTime}
        handleToggleClock={handleToggleClock}
        handleSetTargetClockTime={handleSetTargetClockTime}
        handleClearTargetClockTime={handleClearTargetClockTime}
        targetDateTime={targetDateTime}
        isUsingTargetTime={isUsingTargetTime}
        isSaving={isSaving}
        unreadMessageCount={unreadMessageCount}
        onChatOpen={() => {
          setChatOpen(true);
          // Mark all messages as read when opening chat
          setUnreadMessageCount(0);
          lastReadMessageIndexRef.current = -1; // Will be updated by ProjectChat
          // Clear processed message IDs when opening chat to allow re-processing if needed
          processedMessageIdsRef.current.clear();
          // Clear processed message IDs when opening chat to allow re-processing if needed
          processedMessageIdsRef.current.clear();
        }}
        onChatClose={() => {
          setChatOpen(false);
        }}
      />
      
      {dataError && (
        <Alert severity="error" onClose={() => setDataError('')} sx={{ m: 2 }}>
          {dataError}
        </Alert>
      )}

      <Box sx={{ p: 2 }}>
        <EditableTable
          tableData={currentTableData}
          setTableData={setCurrentTableData}
          isEditing={deferredIsEditing}
          allRoles={allRoles}
          setAllRoles={setAllRoles}
          userRole={role}
          isManager={isManager}
          activePhases={activePhases}
          handleTogglePhaseActivation={handleTogglePhaseActivation}
          periodicScripts={periodicScripts}
          registerRowMove={registerRowMove}
          registerRowDuplicate={registerRowDuplicate}
          setPeriodicScripts={setPeriodicScripts}
          currentClockSeconds={totalSeconds}
          isClockRunning={timer.isRunning || isUsingTargetTime}
          onRowStatusChange={handleRowStatusChange}
          onRunRowScript={handleRunRowScript}
          activeLogins={activeLogins}
          projectId={project.id}
          userName={name}
          onProcessNotification={(callback) => { processNotificationRef.current = callback; }}
        />
        
        <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'space-between', direction: 'ltr' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => onLogout(project.id, name, role)}
            >
              התנתק
            </Button>
            
            {isManager && pendingChanges.length > 0 && (
              <Button
                variant="contained"
                color="warning"
                onClick={() => setReviewModalOpen(true)}
              >
                {pendingChanges.length} בקשות ממתינות
              </Button>
            )}
          </Box>
          
          <Box sx={{ display: 'flex', gap: 2, direction: 'rtl' }}>
          {isManager && (
            <Button
              variant="contained"
              color="error"
                onClick={handleDeleteProject}
              disabled={isDeletingProject}
            >
              {isDeletingProject ? 'Deleting...' : 'Delete Project'}
            </Button>
          )}
            
            {isEditing && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'שומר...' : isManager ? 'שמירה' : 'שליחה לאישור'}
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={handleCancel}
                >
                  ביטול
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* Pending Changes Review Modal (Manager only) */}
      {isManager && (
        <Dialog 
          open={reviewModalOpen} 
          onClose={() => {
            setReviewModalOpen(false);
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
                {(() => {
                  // Helper function to get global row number from row ID
                  // Use originalTableData to get the original position before any moves
                  const getGlobalRowNumberFromId = (rowId) => {
                    if (!rowId) return null;
                    let globalCount = 0;
                    // Use originalTableData to get the original position before moves
                    for (let phaseIndex = 0; phaseIndex < originalTableData.length; phaseIndex++) {
                      const phase = originalTableData[phaseIndex];
                      for (let rowIndex = 0; rowIndex < phase.rows.length; rowIndex++) {
                        globalCount++;
                        if (phase.rows[rowIndex].id === rowId) {
                          return globalCount;
                        }
                      }
                    }
                    return null;
                  };
                  
                  // Group changes by submission_id
                  const groupedBySubmission = {};
                  pendingChanges.forEach(change => {
                    const submissionId = change.submission_id;
                    if (!groupedBySubmission[submissionId]) {
                      groupedBySubmission[submissionId] = [];
                    }
                    groupedBySubmission[submissionId].push(change);
                  });
                  
                  return Object.entries(groupedBySubmission).map(([submissionId, changes]) => {
                    const firstChange = changes[0];
                    const totalChanges = changes.length;
                    const processedCount = changes.filter(c => c.status !== 'pending').length;
                  
                  return (
                      <Box key={submissionId} sx={{ mb: 4, p: 2, border: '1px solid #555', borderRadius: 1, bgcolor: '#1e1e1e' }}>
                        <Box sx={{ mb: 2, pb: 2, borderBottom: '1px solid #555' }}>
                      <Typography variant="h6" gutterBottom>
                            בקשה מ-{firstChange.submitted_by} ({firstChange.submitted_by_role})
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                            תאריך: {new Date(firstChange.created_at).toLocaleString('he-IL')}
                      </Typography>
                          <Typography variant="body2" color="text.secondary">
                            התקדמות: {processedCount} מתוך {totalChanges} שינויים עובדו
                          </Typography>
                            </Box>
                        
                        {changes.map((change) => {
                          if (change.status !== 'pending') {
                            return null; // Skip already processed changes
                          }
                          
                          // Skip table_data changes - they're metadata, not user-visible changes
                          if (change.change_type === 'table_data') {
                            return null;
                          }
                          
                          const changesData = typeof change.changes_data === 'string' 
                            ? JSON.parse(change.changes_data) 
                            : change.changes_data;
                          
                          const getChangeDescription = () => {
                            switch (change.change_type) {
                              case 'row_add':
                                return `הוספת שורה - שלב ${changesData.phase_number || 'N/A'}`;
                              case 'row_update':
                                const updateRowNumber = getGlobalRowNumberFromId(changesData.row_id);
                                return `עדכון שורה #${updateRowNumber || changesData.row_id || 'N/A'}`;
                              case 'row_delete':
                                const deleteRowNumber = getGlobalRowNumberFromId(changesData.row_id);
                                return `מחיקת שורה #${deleteRowNumber || changesData.row_id || 'N/A'}`;
                              case 'row_duplicate':
                                const duplicateRowNumber = getGlobalRowNumberFromId(changesData.source_row_id);
                                return `שכפול שורה #${duplicateRowNumber || changesData.source_row_id || 'N/A'}`;
                              case 'row_move':
                                const moveRowNumber = getGlobalRowNumberFromId(changesData.row_id);
                                const sourcePhase = changesData.source_phase_number || 'N/A';
                                const targetPhase = changesData.target_phase_number || 'N/A';
                                const targetPosition = changesData.target_position !== undefined ? changesData.target_position : null;
                                const sourceRowIndex = changesData.source_row_index !== undefined ? changesData.source_row_index : null;
                                if (sourcePhase === targetPhase && targetPosition !== null && sourceRowIndex !== null) {
                                  const sourcePos = sourceRowIndex + 1; // Convert to 1-based
                                  const targetPos = targetPosition + 1; // Convert to 1-based
                                  return `העברת שורה #${moveRowNumber || changesData.row_id || 'N/A'} ממיקום ${sourcePos} למיקום ${targetPos} בשלב ${sourcePhase}`;
                                } else if (sourcePhase === targetPhase && targetPosition !== null) {
                                  return `העברת שורה #${moveRowNumber || changesData.row_id || 'N/A'} למיקום ${targetPosition + 1} בשלב ${sourcePhase}`;
                                } else if (sourcePhase === targetPhase) {
                                  return `שינוי מיקום שורה #${moveRowNumber || changesData.row_id || 'N/A'} בשלב ${sourcePhase}`;
                                } else {
                                  return `העברת שורה #${moveRowNumber || changesData.row_id || 'N/A'} משלב ${sourcePhase} לשלב ${targetPhase}`;
                                }
                              case 'version':
                                return `שינוי גרסה: ${changesData.new_version || 'N/A'} → ${changesData.old_version || 'N/A'}`;
                              case 'role_add':
                                return `הוספת תפקיד: ${changesData.role || 'N/A'}`;
                              case 'role_delete':
                                return `מחיקת תפקיד: ${changesData.role || 'N/A'}`;
                              case 'script_add':
                                return `הוספת סקריפט: ${changesData.script_data?.name || 'N/A'}`;
                              case 'script_update':
                                return `עדכון סקריפט: ${changesData.old_data?.name || 'N/A'}`;
                              case 'script_delete':
                                return `מחיקת סקריפט: ${changesData.script_data?.name || 'N/A'}`;
                              default:
                                return `שינוי: ${change.change_type}`;
                            }
                          };
                          
                          const getChangeDetails = () => {
                            switch (change.change_type) {
                              case 'row_add':
                                const rowData = changesData.row_data || {};
                                          return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    <Typography variant="body2"><strong>תפקיד:</strong> {rowData.role || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>זמן:</strong> {rowData.time || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>משך:</strong> {rowData.duration || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>תיאור:</strong> {rowData.description || '(ריק)'}</Typography>
                                    {rowData.script && <Typography variant="body2"><strong>סקריפט:</strong> {rowData.script}</Typography>}
                                                  </Box>
                                );
                              case 'row_update':
                                const oldData = changesData.old_data || {};
                                const newData = changesData.new_data || {};
                                          return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    {oldData.role !== newData.role && (
                                      <Typography variant="body2">
                                        <strong>תפקיד:</strong> <span style={{ color: '#51cf66' }}>{newData.role}</span> → <span style={{ color: '#ff6b6b' }}>{oldData.role}</span>
                                                    </Typography>
                                                  )}
                                    {oldData.time !== newData.time && (
                                      <Typography variant="body2">
                                        <strong>זמן:</strong> <span style={{ color: '#51cf66' }}>{newData.time}</span> → <span style={{ color: '#ff6b6b' }}>{oldData.time}</span>
                                                    </Typography>
                                                  )}
                                    {oldData.duration !== newData.duration && (
                                      <Typography variant="body2">
                                        <strong>משך:</strong> <span style={{ color: '#51cf66' }}>{newData.duration}</span> → <span style={{ color: '#ff6b6b' }}>{oldData.duration}</span>
                                                    </Typography>
                                                  )}
                                    {oldData.description !== newData.description && (
                                      <Typography variant="body2">
                                        <strong>תיאור:</strong> <span style={{ color: '#51cf66' }}>{newData.description || '(ריק)'}</span> → <span style={{ color: '#ff6b6b' }}>{oldData.description || '(ריק)'}</span>
                                                    </Typography>
                                                  )}
                                    {oldData.script !== newData.script && (
                                      <Typography variant="body2">
                                        <strong>סקריפט:</strong> <span style={{ color: '#51cf66' }}>{newData.script || '(ריק)'}</span> → <span style={{ color: '#ff6b6b' }}>{oldData.script || '(ריק)'}</span>
                                                    </Typography>
                                                  )}
                                    {oldData.status !== newData.status && (
                                      <Typography variant="body2">
                                        <strong>סטטוס:</strong> <span style={{ color: '#51cf66' }}>{newData.status}</span> → <span style={{ color: '#ff6b6b' }}>{oldData.status}</span>
                                                    </Typography>
                                                  )}
                                                  </Box>
                                );
                              case 'row_delete':
                                const delRowData = changesData.row_data || {};
                                return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    <Typography variant="body2"><strong>תפקיד:</strong> {delRowData.role || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>זמן:</strong> {delRowData.time || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>משך:</strong> {delRowData.duration || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>תיאור:</strong> {delRowData.description || '(ריק)'}</Typography>
                                      </Box>
                                );
                              case 'version':
                                          return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    <Typography variant="body2">
                                      <strong>נוכחי:</strong> <span style={{ color: '#ff6b6b' }}>{changesData.old_version || 'N/A'}</span>
                                                </Typography>
                                    <Typography variant="body2">
                                      <strong>חדש:</strong> <span style={{ color: '#51cf66' }}>{changesData.new_version || 'N/A'}</span>
                                                  </Typography>
                                  </Box>
                                );
                              case 'role_add':
                              case 'role_delete':
                                return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    <Typography variant="body2"><strong>תפקיד:</strong> {changesData.role || 'N/A'}</Typography>
                                                  </Box>
                                );
                              case 'script_add':
                                const addScriptData = changesData.script_data || {};
                                return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    <Typography variant="body2"><strong>שם:</strong> {addScriptData.name || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>נתיב:</strong> {addScriptData.path || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>סטטוס:</strong> {addScriptData.status ? 'פעיל' : 'לא פעיל'}</Typography>
                                      </Box>
                                );
                              case 'script_update':
                                const oldScript = changesData.old_data || {};
                                const newScript = changesData.new_data || {};
                                return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    {oldScript.name !== newScript.name && (
                                      <Typography variant="body2">
                                        <strong>שם:</strong> <span style={{ color: '#51cf66' }}>{newScript.name}</span> → <span style={{ color: '#ff6b6b' }}>{oldScript.name}</span>
                                </Typography>
                                    )}
                                    {oldScript.path !== newScript.path && (
                                      <Typography variant="body2">
                                        <strong>נתיב:</strong> <span style={{ color: '#51cf66' }}>{newScript.path}</span> → <span style={{ color: '#ff6b6b' }}>{oldScript.path}</span>
                                </Typography>
                                    )}
                                    {oldScript.status !== newScript.status && (
                                      <Typography variant="body2">
                                        <strong>סטטוס:</strong> <span style={{ color: '#51cf66' }}>{newScript.status ? 'פעיל' : 'לא פעיל'}</span> → <span style={{ color: '#ff6b6b' }}>{oldScript.status ? 'פעיל' : 'לא פעיל'}</span>
                                      </Typography>
                                    )}
                                  </Box>
                                );
                              case 'script_delete':
                                const delScriptData = changesData.script_data || {};
                                return (
                                  <Box sx={{ direction: 'rtl', mt: 1 }}>
                                    <Typography variant="body2"><strong>שם:</strong> {delScriptData.name || 'N/A'}</Typography>
                                    <Typography variant="body2"><strong>נתיב:</strong> {delScriptData.path || 'N/A'}</Typography>
                              </Box>
                                );
                              default:
                                return null;
                            }
                          };
                          
                          return (
                            <Box key={change.id} sx={{ mb: 2, p: 2, border: '1px solid #444', borderRadius: 1, bgcolor: '#2d2d2d' }}>
                              <Typography variant="subtitle1" gutterBottom>
                                {getChangeDescription()}
                                </Typography>
                              {getChangeDetails()}
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, direction: 'rtl', justifyContent: 'flex-end' }}>
                        <Button
                          variant="contained"
                          color="success"
                                  size="small"
                          onClick={() => handleAcceptPendingChange(change.id)}
                        >
                          אישור
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                                  size="small"
                          onClick={() => handleDeclinePendingChange(change.id)}
                        >
                          דחייה
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
                      </Box>
                    );
                  });
                })()}
              </Box>
            )}
          </DialogContent>
          <DialogActions style={{ direction: 'rtl' }}>
            <Typography variant="body2" sx={{ mr: 2, color: 'text.secondary' }}>
              {pendingChanges.length > 0 && `${pendingChanges.length} שינויים ממתינים`}
            </Typography>
            <Button onClick={() => {
              setReviewModalOpen(false);
            }}>
              סגור
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Inactive User Dialog */}
      <Dialog
        open={inactiveUserDialogOpen}
        onClose={() => {}} // Prevent closing without clicking OK
        disableEscapeKeyDown
      >
        <DialogTitle>המשתמש לא פעיל</DialogTitle>
        <DialogContent>
          <Typography>
            המשתמש שלך הוגדר כלא פעיל. נדרש להתחבר מחדש.
          </Typography>
        </DialogContent>
        <DialogActions style={{ direction: 'rtl' }}>
          <Button
            onClick={() => {
              setInactiveUserDialogOpen(false);
              onLogout();
            }}
            variant="contained"
            color="primary"
          >
            אישור
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* ProjectChat - Always rendered to keep socket connection active */}
      {project && (
        <>
          {/* Hidden ProjectChat when chat is closed - maintains socket connection */}
          {!chatOpen && (
            <div style={{ 
              position: 'absolute', 
              left: '-9999px', 
              width: '1px', 
              height: '1px', 
              overflow: 'hidden',
              pointerEvents: 'none'
            }}>
              <ProjectChat
                key={`chat-${project.id}-${name}`}
                projectId={project.id}
                userId={name}
                userRole={role}
                isVisible={false}
                onNewMessage={(messageIndex, messageId) => {
                  // Increment unread count when chat is closed, but only if we haven't processed this message ID
                  if (messageId && !processedMessageIdsRef.current.has(messageId)) {
                    addProcessedMessageId(messageId);
                    setUnreadMessageCount(prev => prev + 1);
                  } else if (!messageId) {
                    // Fallback: if no ID, still increment (for backwards compatibility)
                    setUnreadMessageCount(prev => prev + 1);
                  }
                }}
              />
            </div>
          )}
          {/* Chat Dialog - shown when chatOpen is true */}
          {chatOpen && (
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '500px',
              maxWidth: '90vw',
              height: '600px',
              maxHeight: '80vh',
              zIndex: 1300,
              backgroundColor: '#1e1e1e',
              border: '1px solid #444',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                padding: '12px 16px',
                backgroundColor: '#2d2d2d',
                borderBottom: '1px solid #444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: '8px 8px 0 0'
              }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>{project?.name || 'Project'} Chat</h3>
                <IconButton 
                  size="small" 
                  onClick={() => setChatOpen(false)}
                  style={{ color: '#fff' }}
                >
                  <CloseIcon />
                </IconButton>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ProjectChat
                  key={`chat-${project.id}-${name}`}
                  projectId={project.id}
                  userId={name}
                  userRole={role}
                  isVisible={true}
                  onNewMessage={(messageIndex, messageId) => {
                    // Chat is open, mark as read (don't increment unread count)
                    lastReadMessageIndexRef.current = messageIndex;
                    // Track this message as processed
                    if (messageId) {
                      addProcessedMessageId(messageId);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MainScreen;
