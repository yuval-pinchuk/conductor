// src/components/EditableTable.js

import React, { useState, useRef, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, IconButton, Select, MenuItem, TextField, Button,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions, Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import { api } from '../api/conductorApi';

// Helper for time input with +/-
const TimeInput = ({ value, onChange, format }) => {
  const initialTime = value.startsWith('+') || value.startsWith('-') ? value.substring(1) : value;
  const [time, setTime] = useState(initialTime);
  const [isNegative, setIsNegative] = useState(value.startsWith('-'));
  
  // Regex for hh:mm:ss or mm:ss structure
  const HHMMSS_STRICT_REGEX = /^[0-9]{2}:[0-5][0-9]:[0-5][0-9]$/; 
  const MMSS_STRICT_REGEX = /^[0-5][0-9]:[0-5][0-9]$/;

  const currentRegex = format === 'mm:ss' ? MMSS_STRICT_REGEX : HHMMSS_STRICT_REGEX;
  const isFormatValid = currentRegex.test(time);

  const handleTimeChange = (e) => {
    let newTime = e.target.value.replace(/[^0-9:]/g, ''); // Only allow numbers and colon
    setTime(newTime);
    
    // Always call parent onChange with full value (including sign)
    onChange((isNegative && newTime.length > 0 ? '-' : '') + newTime);
  };
  
  const handleSignToggle = () => {
    const newIsNegative = !isNegative;
    setIsNegative(newIsNegative);
    onChange((newIsNegative ? '-' : '') + time);
  };

return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, direction: 'rtl' }}>
      {/* +/- Toggle only for hh:mm:ss column (Time) */}
      {format !== 'mm:ss' && (
        <Button 
          onClick={handleSignToggle} 
          size="small" 
          variant={isNegative ? 'contained' : 'outlined'}
          color={isNegative ? 'secondary' : 'primary'}
        >
          {isNegative ? '-' : '+'}
        </Button>
      )}
      
      <TextField
        value={time}
        onChange={handleTimeChange}
        size="small"
        placeholder={format === 'mm:ss' ? 'mm:ss' : 'hh:mm:ss'}
        error={!isFormatValid} 
        helperText={!isFormatValid && `הפורמט חייב להיות בדיוק ${format === 'mm:ss' ? 'mm:ss' : 'hh:mm:ss'}`} // Updated helper text
        style={{ width: format === 'mm:ss' ? 95 : 140 }}
        sx={{
          '& .MuiInputBase-input': { fontSize: '1rem' }
        }}
        inputProps={{ 
            // Maximum length based on format (5 for mm:ss, 8 for hh:mm:ss)
            maxLength: format === 'mm:ss' ? 5 : 8, 
            pattern: currentRegex.source, // Browser validation hint
            style: { textAlign: 'right', fontSize: '1rem' }
        }}
      />
    </div>
  );
};


const EditableTable = ({
    tableData,
    setTableData,
    isEditing,
    allRoles,
    setAllRoles,
    userRole,
    isManager,
    activePhases,
    handleTogglePhaseActivation,
    periodicScripts,
    setPeriodicScripts,
    currentClockSeconds,
    isClockRunning,
    onRowStatusChange,
    onRunRowScript,
    activeLogins = [],
    projectId,
    userName }) => {
  
  const [newRole, setNewRole] = useState('');
  const [userInfoModal, setUserInfoModal] = useState({ open: false, row: null, phaseIndex: null, rowIndex: null });
  const [lastProcessedNotificationTimestamp, setLastProcessedNotificationTimestamp] = useState(null);
  const [noUserWarning, setNoUserWarning] = useState({ open: false, role: '' });
  const [periodicScriptsHeight, setPeriodicScriptsHeight] = useState(80); // Default estimate
  const [nextRowHeight, setNextRowHeight] = useState(60); // Default estimate for next row display
  const [tableHeaderHeight, setTableHeaderHeight] = useState(53); // Default estimate
  const rowRefs = useRef({});
  const tableContainerRef = useRef(null);
  const periodicScriptsRef = useRef(null);
  const nextRowRef = useRef(null);
  const tableHeaderRef = useRef(null);
  
  const handleChange = (phaseIndex, rowIndex, field, newValue) => {
    const newPhases = [...tableData];
    newPhases[phaseIndex].rows[rowIndex][field] = newValue;
    setTableData(newPhases);
  };

  const handleAddRow = (phaseIndex) => {
    const newRow = { id: Date.now(), role: allRoles[0] || 'Role', time: '00:00:00', duration: '00:00', description: '', status: 'N/A', script: '', scriptResult: undefined };
    const newPhases = [...tableData];
    newPhases[phaseIndex].rows.push(newRow);
    setTableData(newPhases);
  };

  const handleRowStatusSelection = async (phaseIndex, rowIndex, statusValue) => {
    handleChange(phaseIndex, rowIndex, 'status', statusValue);
    const row = tableData[phaseIndex].rows[rowIndex];
    if (row && typeof onRowStatusChange === 'function') {
      try {
        await onRowStatusChange(row.id, statusValue);
      } catch (error) {
        console.error('Failed to update row status', error);
      }
    }
  };

  const handleRunScript = async (phaseIndex, rowIndex) => {
    const row = tableData[phaseIndex].rows[rowIndex];
    if (row?.script && typeof onRunRowScript === 'function') {
      try {
        await onRunRowScript(row.id, row.script);
      } catch (error) {
        console.error('Failed to run script', error);
      }
    }
  };

  const handleRemoveRow = (phaseIndex, rowIndex) => {
    const newPhases = [...tableData];
    newPhases[phaseIndex].rows.splice(rowIndex, 1);
    // If phase is empty, optionally remove phase here
    setTableData(newPhases);
  };
  
  const handleAddNewRole = () => {
    if (newRole && !allRoles.includes(newRole)) {
      setAllRoles([...allRoles, newRole]);
      setNewRole('');
    }
  };

  const handleAddPhase = () => {
    // Determine the next phase number
    const newPhaseNumber = tableData.length > 0 
        ? Math.max(...tableData.map(p => p.phase)) + 1 
        : 1;

    const newPhase = {
        phase: newPhaseNumber,
        rows: [] // Start with no rows
    };
    setTableData([...tableData, newPhase]);
  };

  const handleRemovePhase = (phaseIndex) => {
    // 1. Create a shallow copy of the phase array
    const newPhases = [...tableData];
    
    // 2. Remove the phase at the specified index
    newPhases.splice(phaseIndex, 1);
    
    // 3. Update the state
    setTableData(newPhases);
  };

  const handleAddPeriodicScript = () => {
    const newScript = { id: Date.now(), name: 'New Script', path: '', status: false };
    setPeriodicScripts([...periodicScripts, newScript]);
  };

  const handleUpdatePeriodicScript = (scriptId, field, value) => {
    const updatedScripts = periodicScripts.map(script =>
      script.id === scriptId ? { ...script, [field]: value } : script
    );
    setPeriodicScripts(updatedScripts);
  };

  const handleRemovePeriodicScript = (scriptId) => {
    setPeriodicScripts(periodicScripts.filter(script => script.id !== scriptId));
  };

  const handleResetAllStatuses = () => {
    // Show confirmation dialog
    const confirmed = window.confirm('האם אתה בטוח שברצונך לאפס את כל הסטטוסים ל-N/A? פעולה זו לא ניתנת לביטול.');
    if (!confirmed) {
      return;
    }
    
    const newPhases = tableData.map(phase => ({
      ...phase,
      rows: phase.rows.map(row => ({ ...row, status: 'N/A' }))
    }));
    setTableData(newPhases);
    
    // Update all rows via API
    newPhases.forEach(phase => {
      phase.rows.forEach(row => {
        if (row.id && typeof onRowStatusChange === 'function') {
          onRowStatusChange(row.id, 'N/A').catch(err => {
            console.error('Failed to update row status', err);
          });
        }
      });
    });
  };

  const handleOpenUserInfoModal = async (row, phaseIndex, rowIndex) => {
    if (isManager) {
      // Check if there's an active user logged in for this role
      const hasActiveUser = activeLogins.some(login => login.role === row.role);
      
      if (!hasActiveUser) {
        // Show warning that no user is logged in for this role
        setNoUserWarning({ open: true, role: row.role });
        return;
      }
      
      // Manager sends notification to the user with that role
      try {
        await api.createUserNotification(projectId, row.role, 'show_modal', {
          rowId: row.id,
          phaseIndex,
          rowIndex,
          role: row.role,
          time: row.time,
          description: row.description,
          globalRowNumber: getGlobalRowNumber(phaseIndex, rowIndex)
        });
      } catch (error) {
        console.error('Failed to send notification to user', error);
      }
    } else {
      // Regular user opens modal locally
      setUserInfoModal({ open: true, row, phaseIndex, rowIndex });
    }
  };

  const handleCloseUserInfoModal = () => {
    setUserInfoModal({ open: false, row: null, phaseIndex: null, rowIndex: null });
  };

  const handleJumpToRow = (targetPhaseIndex, targetRowIndex) => {
    handleCloseUserInfoModal();
    const rowId = tableData[targetPhaseIndex]?.rows[targetRowIndex]?.id;
    if (rowId && rowRefs.current[rowId] && tableContainerRef.current) {
      const rowElement = rowRefs.current[rowId];
      const containerElement = tableContainerRef.current;
      
      // Calculate the position of the row relative to the container
      const containerRect = containerElement.getBoundingClientRect();
      const rowRect = rowElement.getBoundingClientRect();
      
      // Calculate scroll position to center the row in the container
      const scrollTop = containerElement.scrollTop;
      const rowOffsetTop = rowElement.offsetTop;
      const containerHeight = containerElement.clientHeight;
      const rowHeight = rowElement.offsetHeight;
      
      // Scroll to center the row in the visible area
      const targetScrollTop = rowOffsetTop - (containerHeight / 2) + (rowHeight / 2);
      
      containerElement.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
      
      // Highlight the row with green blinking for 3 seconds
      const originalBg = rowElement.style.backgroundColor;
      let isHighlighted = true;
      const blinkInterval = setInterval(() => {
        if (isHighlighted) {
          rowElement.style.backgroundColor = 'rgba(76, 175, 80, 0.6)'; // Green
        } else {
          rowElement.style.backgroundColor = originalBg;
        }
        isHighlighted = !isHighlighted;
      }, 300); // Blink every 300ms
      
      setTimeout(() => {
        clearInterval(blinkInterval);
        rowElement.style.backgroundColor = originalBg;
      }, 3000); // Stop after 3 seconds
    }
  };

  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  };

  // Calculate total rows before current phase for continuous numbering
  const getGlobalRowNumber = (phaseIndex, rowIndex) => {
    let count = 0;
    for (let i = 0; i < phaseIndex; i++) {
      count += tableData[i]?.rows?.length || 0;
    }
    return count + rowIndex + 1;
  };

  // Find the next relevant row with N/A status
  const getNextRelevantRow = () => {
    for (let phaseIndex = 0; phaseIndex < tableData.length; phaseIndex++) {
      const phase = tableData[phaseIndex];
      for (let rowIndex = 0; rowIndex < phase.rows.length; rowIndex++) {
        const row = phase.rows[rowIndex];
        const isStatusNA = !row.status || row.status === 'N/A';
        
        if (isStatusNA) {
          // Manager sees any N/A row, users only see their role's N/A rows
          if (isManager || row.role === userRole) {
            return {
              row,
              phaseIndex,
              rowIndex,
              globalRowNumber: getGlobalRowNumber(phaseIndex, rowIndex)
            };
          }
        }
      }
    }
    return null;
  };

  const nextRelevantRow = getNextRelevantRow();

  // Process notification command (for non-manager users)
  const processNotification = (command, notificationData) => {
    if (!command || !notificationData) return;
    
    if (command === 'show_modal') {
      // Find the row in tableData
      const targetPhaseIndex = notificationData.phaseIndex;
      const targetRowIndex = notificationData.rowIndex;
      
      if (targetPhaseIndex !== undefined && targetRowIndex !== undefined) {
        const phase = tableData[targetPhaseIndex];
        if (phase && phase.rows[targetRowIndex]) {
          const row = phase.rows[targetRowIndex];
          setUserInfoModal({ 
            open: true, 
            row, 
            phaseIndex: targetPhaseIndex, 
            rowIndex: targetRowIndex 
          });
        }
      }
    }
  };

  // Poll for notifications (for non-manager users)
  useEffect(() => {
    if (!isManager && projectId && userRole && userName) {
      const interval = setInterval(() => {
        api.getUserNotification(projectId, userRole, userName)
          .then(response => {
            if (response.command && response.timestamp) {
              if (response.timestamp !== lastProcessedNotificationTimestamp) {
                processNotification(response.command, response.data);
                setLastProcessedNotificationTimestamp(response.timestamp);
                // Clear the notification after processing
                api.clearUserNotification(projectId, userRole, userName).catch(() => {});
              }
            }
          })
          .catch(err => {
            // Silently fail - polling is not critical
          });
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isManager, projectId, userRole, userName, lastProcessedNotificationTimestamp, tableData]);

  // Measure periodic scripts height for sticky positioning
  useEffect(() => {
    if (periodicScriptsRef.current) {
      const updateHeight = () => {
        const height = periodicScriptsRef.current?.offsetHeight || 80;
        setPeriodicScriptsHeight(height);
      };
      updateHeight();
      // Update on window resize
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }
  }, [periodicScripts, isEditing, isManager]);

  // Measure next row height for sticky positioning
  useEffect(() => {
    if (nextRelevantRow && nextRowRef.current) {
      const updateHeight = () => {
        const height = nextRowRef.current?.offsetHeight || 60;
        setNextRowHeight(height);
      };
      updateHeight();
      // Update on window resize
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    } else if (!nextRelevantRow) {
      // No next row, set height to 0
      setNextRowHeight(0);
    }
  }, [nextRelevantRow, isEditing]);

  // Measure table header height for sticky positioning
  useEffect(() => {
    if (tableHeaderRef.current) {
      const updateHeight = () => {
        const height = tableHeaderRef.current?.offsetHeight || 53;
        setTableHeaderHeight(height);
      };
      // Use requestAnimationFrame to ensure the table is rendered
      const rafId = requestAnimationFrame(() => {
        updateHeight();
        // Also check after a small delay to catch any late rendering
        setTimeout(updateHeight, 100);
      });
      // Update on window resize
      window.addEventListener('resize', updateHeight);
      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', updateHeight);
      };
    }
  }, [isEditing, tableData]);

  return (
      <TableContainer 
        ref={tableContainerRef}
        component={Paper} 
        style={{ maxHeight: 'calc(100vh - 150px)', overflow: 'auto', margin: '20px 0', direction: 'rtl', position: 'relative' }}
      >
      
        {/* Periodic Scripts Row - Sticky */}
        <div 
          ref={periodicScriptsRef}
          style={{ 
          padding: '15px', 
          borderBottom: '2px solid #444', 
          backgroundColor: '#1e1e1e', 
          direction: 'rtl',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
            {periodicScripts.map((script) => (
              <div
                key={script.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 100
                }}
              >
                {isEditing && isManager ? (
                  <>
                    <TextField
                      value={script.name}
                      onChange={(e) => handleUpdatePeriodicScript(script.id, 'name', e.target.value)}
                      size="small"
                      placeholder="שם סקריפט"
                      style={{ width: 120 }}
                      sx={{
                        direction: 'rtl',
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: '#2d2d2d',
                          color: 'white',
                          '& fieldset': {
                            borderColor: '#555',
                          },
                          '&:hover fieldset': {
                            borderColor: '#777',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#999',
                          },
                        },
                        '& .MuiInputBase-input': {
                          textAlign: 'right',
                        },
                        '& .MuiInputBase-input::placeholder': {
                          color: '#aaa',
                          opacity: 1,
                        },
                      }}
                    />
                    <TextField
                      value={script.path}
                      onChange={(e) => handleUpdatePeriodicScript(script.id, 'path', e.target.value)}
                      size="small"
                      placeholder="נתיב סקריפט"
                      style={{ width: 200 }}
                      sx={{
                        direction: 'rtl',
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: '#2d2d2d',
                          color: 'white',
                          '& fieldset': {
                            borderColor: '#555',
                          },
                          '&:hover fieldset': {
                            borderColor: '#777',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#999',
                          },
                        },
                        '& .MuiInputBase-input': {
                          textAlign: 'right',
                        },
                        '& .MuiInputBase-input::placeholder': {
                          color: '#aaa',
                          opacity: 1,
                        },
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: '50%',
                          backgroundColor: script.status ? '#4caf50' : '#f44336',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: 12,
                          textAlign: 'center',
                          padding: 5,
                          boxSizing: 'border-box'
                        }}
                        title={script.path || 'No path set'}
                      >
                        {script.name || 'Unnamed'}
                      </div>
                      <IconButton
                        onClick={() => handleRemovePeriodicScript(script.id)}
                        size="small"
                        color="error"
                        title="הסר סקריפט"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      backgroundColor: script.status ? '#4caf50' : '#f44336',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: 12,
                      textAlign: 'center',
                      padding: 5,
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}
                    title={`${script.name}${script.path ? `\nPath: ${script.path}` : '\nNo path set'}\nStatus: ${script.status ? 'True' : 'False'}`}
                  >
                    {script.name || 'Unnamed'}
                  </div>
                )}
              </div>
            ))}
            {isEditing && isManager && (
              <IconButton
                onClick={handleAddPeriodicScript}
                size="small"
                color="primary"
                title="הוסף סקריפט תקופתי"
                style={{ marginRight: 10 }}
              >
                <AddIcon />
              </IconButton>
            )}
          </div>
        </div>

        {/* Next Relevant Row Display - Sticky */}
        {nextRelevantRow && (
          <div 
            ref={nextRowRef}
            style={{ 
              padding: '10px 15px', 
              borderBottom: '2px solid #2196f3', 
              backgroundColor: '#0d47a1', 
              direction: 'rtl',
              position: 'sticky',
              top: `${periodicScriptsHeight}px`,
              zIndex: 9,
              display: 'flex',
              alignItems: 'center',
              gap: 15,
              color: 'white',
              fontSize: '1rem'
            }}
          >
            <Typography variant="body1" style={{ fontWeight: 'bold', minWidth: '120px' }}>
              משימה הבאה:
            </Typography>
            <Typography variant="body1" style={{ minWidth: '80px' }}>
              <strong>שורה #{nextRelevantRow.globalRowNumber}</strong>
            </Typography>
            <Typography variant="body1" style={{ minWidth: '100px' }}>
              <strong>תפקיד:</strong> {nextRelevantRow.row.role}
            </Typography>
            <Typography variant="body1" style={{ minWidth: '120px' }}>
              <strong>זמן:</strong> {nextRelevantRow.row.time}
            </Typography>
            <Typography variant="body1" style={{ flex: 1 }}>
              <strong>תיאור:</strong> {nextRelevantRow.row.description || 'אין תיאור'}
            </Typography>
            <Button
              variant="contained"
              color="success"
              size="small"
              onClick={() => handleJumpToRow(nextRelevantRow.phaseIndex, nextRelevantRow.rowIndex)}
              style={{ marginRight: 'auto' }}
            >
              קפוץ לשורה
            </Button>
          </div>
        )}
      
        {/* Manager Controls Area */}
        {isEditing && (
          <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 15, borderBottom: '1px solid #ccc', direction: 'rtl', flexWrap: 'wrap' }}>
          
            {/* Add New Role controls (existing) */}
            <Button variant="contained" onClick={handleAddNewRole} style={{ direction: 'rtl' }}>
              הוסף תפקיד חדש
            </Button>
            {/* ... New Role TextField ... */}
          
            {/* Add New Phase Button (NEW) */}
            <Button variant="contained" color="secondary" onClick={handleAddPhase} style={{ direction: 'rtl' }}>
              הוסף שלב חדש
            </Button>

            {/* Reset All Statuses Button */}
            {isManager && (
              <Button 
                variant="outlined" 
                color="warning" 
                onClick={handleResetAllStatuses}
                style={{ direction: 'rtl' }}
              >
                אפס כל הסטטוסים ל-N/A
              </Button>
            )}

          </div>
        )}

      <Table stickyHeader size="small" sx={{ 
        '& .MuiTableCell-root': { fontSize: '1rem' }, 
        '& .MuiTableHead-root': { 
          position: 'sticky', 
          top: `${periodicScriptsHeight + nextRowHeight}px`, 
          zIndex: 8 
        } 
      }}>
        <TableHead>
          <TableRow ref={tableHeaderRef}>
            <TableCell style={{ width: '5%', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>#</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>תפקיד</TableCell>
            <TableCell style={{ width: '15%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>זמן</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>משך</TableCell>
            <TableCell style={{ width: '35%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>תיאור</TableCell>
            <TableCell style={{ width: '15%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>סקריפט</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>סטטוס</TableCell>
            {isEditing && <TableCell style={{ width: '5%', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>פעולות</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Data Rows */}
          {tableData.map((phase, phaseIndex) => {
            const isPhaseActive = !!activePhases[phase.phase];  
            
            return (
                <React.Fragment key={phase.phase}>
                {/* Phase Header Row */}
                <TableRow style={{ backgroundColor: '#1e1e1e' }}>
                  <TableCell colSpan={isEditing ? 8 : 7} style={{ 
                      fontWeight: 'bold', 
                      backgroundColor: '#1e1e1e',
                      textAlign: 'right',
                      fontSize: '1.1rem',
                      position: 'sticky',
                      top: `${periodicScriptsHeight + nextRowHeight + tableHeaderHeight}px`, // Below periodic scripts + next row + table header height
                      zIndex: 7
                  }}>
                    שלב {phase.phase}
                    {/* Phase Activation Toggle */}
                    {isManager && (
                        <IconButton 
                            onClick={() => handleTogglePhaseActivation(phase)} 
                            size="small" 
                            color={isPhaseActive ? 'success' : 'secondary'}
                            title={isPhaseActive ? "פעל שלב" : "השבת שלב"}
                        >
                            {isPhaseActive ? <ToggleOnIcon /> : <ToggleOffIcon />}
                        </IconButton>
                    )}
                    {isPhaseActive && <span style={{ marginRight: 8, color: 'lightgreen' }}>(פעיל)</span>}

                    {isEditing && (
                      <>
                        {/* Button to ADD Row */}
                        <IconButton onClick={() => handleAddRow(phaseIndex)} size="small" color="primary" title="הוסף שורה">
                          <AddIcon />
                        </IconButton>
                        
                        {/* Button to DELETE Phase */} 
                        <IconButton onClick={() => handleRemovePhase(phaseIndex)} size="small" color="secondary" title="מחק שלב">
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>

              {/* Data Rows */}
              {phase.rows.map((row, rowIndex) => {

                // --- ACCESS CONTROL LOGIC---
                const isUserRoleMatch = row.role === userRole;
                const canChangeStatus = isPhaseActive && (isUserRoleMatch || isManager);
                
                const rowTimeSeconds = parseTimeToSeconds(row.time);
                const isStatusUnset = !row.status || row.status === 'N/A';
                const hasClockPassedRowTime = Boolean(
                  isClockRunning &&
                  currentClockSeconds >= 0 &&
                  rowTimeSeconds !== null &&
                  currentClockSeconds >= rowTimeSeconds
                );
                const shouldHighlightOverdue = isStatusUnset && hasClockPassedRowTime;
                
                // Determine row background color based on status
                const getRowBackgroundColor = () => {
                  if (row.status === 'Passed') return 'rgba(76, 175, 80, 0.2)'; // Light green
                  if (row.status === 'Failed') return 'rgba(244, 67, 54, 0.2)'; // Light red
                  return 'transparent'; // Default/N/A
                };

                const getRowStyles = () => {
                  const baseColor = getRowBackgroundColor();
                  let styles = {
                    backgroundColor: baseColor,
                    transition: 'background-color 0.2s ease',
                  };

                  if (isUserRoleMatch) {
                    const highlightOverlay = 'rgba(33, 150, 243, 0.18)';
                    styles = {
                      ...styles,
                      backgroundColor: baseColor === 'transparent' ? highlightOverlay : baseColor,
                      boxShadow: 'inset 0 0 0 2px rgba(33, 150, 243, 0.55)',
                      borderLeft: '4px solid #2196f3',
                    };
                  }

                  if (shouldHighlightOverdue) {
                    const overdueOverlay = 'rgba(255, 235, 59, 0.4)'; // More highlighted yellow
                    styles = {
                      ...styles,
                      backgroundColor: styles.backgroundColor === 'transparent' ? overdueOverlay : styles.backgroundColor,
                      boxShadow: `${styles.boxShadow ? `${styles.boxShadow}, ` : ''}0 0 15px rgba(255, 235, 59, 0.7)`,
                      border: styles.border || '2px solid rgba(255, 235, 59, 0.9)',
                    };
                  }

                  return styles;
                };
                
                const globalRowNumber = getGlobalRowNumber(phaseIndex, rowIndex);
                return ( // <-- Start of the inner return
                <TableRow 
                  key={row.id} 
                  style={getRowStyles()}
                  ref={el => {
                    if (el) rowRefs.current[row.id] = el;
                  }}
                >
                  {/* Row Number - Global across all phases */}
                  <TableCell align="center" style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    {globalRowNumber}
                  </TableCell>
                  {/* Role */}
                  <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
                    {isEditing ? (
                      <Select
                        value={row.role}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'role', e.target.value)}
                        size="small"
                        style={{ width: '100%', direction: 'rtl', fontSize: '1rem' }}
                        sx={{ '& .MuiSelect-select': { fontSize: '1rem' } }}
                      >
                        {allRoles.map(role => <MenuItem key={role} value={role} sx={{ fontSize: '1rem' }}>{role}</MenuItem>)}
                      </Select>
                    ) : (
                      row.role
                    )}
                  </TableCell>
                  
                  <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
                    {isEditing ? (
                        <TimeInput 
                        value={row.time}
                        onChange={(val) => handleChange(phaseIndex, rowIndex, 'time', val)}
                        format="hh:mm:ss" // Pass the expected format
                        />
                    ) : (
                        row.time
                    )}
                  </TableCell>

                  <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
                    {isEditing ? (
                        <TimeInput 
                        value={row.duration}
                        onChange={(val) => handleChange(phaseIndex, rowIndex, 'duration', val)}
                        format="mm:ss" // Pass the expected format
                        />
                    ) : (
                        row.duration
                    )}
                  </TableCell>

                  {/* Description (Free Text, Expands Row) */}
                  <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
                    {isEditing ? (
                      <TextField
                        value={row.description}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'description', e.target.value)}
                        size="small"
                        multiline
                        fullWidth
                        sx={{ 
                          direction: 'rtl', 
                          '& textarea': { textAlign: 'right', fontSize: '1rem' },
                          '& .MuiInputBase-input': { fontSize: '1rem' }
                        }}
                      />
                    ) : (
                      <Typography style={{ whiteSpace: 'pre-wrap', textAlign: 'right', fontSize: '1rem' }}>
                        {row.description}
                      </Typography>
                    )}
                  </TableCell>
                  
                  {/* Script Column */}
                  <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
                    {isEditing ? (
                      <TextField
                        value={row.script || ''}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'script', e.target.value)}
                        size="small"
                        placeholder="נתיב/נקודת קצה API"
                        fullWidth
                        sx={{ 
                          direction: 'rtl', 
                          '& input': { textAlign: 'right', fontSize: '1rem' },
                          '& .MuiInputBase-input': { fontSize: '1rem' }
                        }}
                      />
                    ) : (
                      row.script ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button 
                              variant="contained" 
                              size="small"
                              color="primary"
                              endIcon={<PlayArrowIcon />}
                              onClick={() => handleRunScript(phaseIndex, rowIndex)}
                              sx={{ fontSize: '1rem' }}
                            >
                              הרץ סקריפט
                            </Button>
                            {row.scriptResult !== undefined && (
                              row.scriptResult ? (
                                <CheckIcon color="success" style={{ fontSize: 24 }} />
                              ) : (
                                <CloseIcon color="error" style={{ fontSize: 24 }} />
                              )
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#666', fontSize: '1rem' }}>—</span>
                      )
                    )}
                  </TableCell>
                  
                  {/* Status (Pass/Fail/N/A) Column - V, X, N/A buttons, and User Info for Manager */}
                  <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
                    <div style={{ display: 'flex', width: '100%' }}>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <IconButton
                          onClick={() => handleRowStatusSelection(phaseIndex, rowIndex, 'Passed')}
                          size="small"
                          disabled={!canChangeStatus}
                          color={row.status === 'Passed' ? 'success' : 'default'}
                          title="עבר"
                        >
                          <CheckIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleRowStatusSelection(phaseIndex, rowIndex, 'Failed')}
                          size="small"
                          disabled={!canChangeStatus}
                          color={row.status === 'Failed' ? 'error' : 'default'}
                          title="נכשל"
                        >
                          <CloseIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleRowStatusSelection(phaseIndex, rowIndex, 'N/A')}
                          size="small"
                          disabled={!canChangeStatus}
                          color={row.status === 'N/A' ? 'default' : 'default'}
                          title="לא רלוונטי"
                          sx={{
                            border: row.status === 'N/A' ? '2px solid #999' : '1px solid transparent',
                            borderRadius: '4px'
                          }}
                        >
                          <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>N/A</Typography>
                        </IconButton>
                        {/* User Info Button for Manager (available always, not just in edit mode) */}
                        {isManager && (
                          <IconButton
                            onClick={() => handleOpenUserInfoModal(row, phaseIndex, rowIndex)}
                            size="small"
                            color="warning"
                            title="שלח התראה למשתמש"
                          >
                            <WarningIcon />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  {/* Actions (Remove) */}
                  {isEditing && (
                    <TableCell style={{ textAlign: 'center', fontSize: '1rem' }}>
                      <IconButton onClick={() => handleRemoveRow(phaseIndex, rowIndex)} size="small" color="error">
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
                );
              })}
            </React.Fragment>
          )})}
        </TableBody>
      </Table>

      {/* User Info Modal */}
      <Dialog 
        open={userInfoModal.open} 
        onClose={handleCloseUserInfoModal}
        maxWidth="sm"
        fullWidth
        dir="rtl"
      >
        <DialogTitle>
          התראה: שורה #{getGlobalRowNumber(userInfoModal.phaseIndex || 0, userInfoModal.rowIndex || 0)}
        </DialogTitle>
        <DialogContent>
          {userInfoModal.row && (
            <div style={{ direction: 'rtl' }}>
              <Typography variant="body1" style={{ marginBottom: 10 }}>
                <strong>תפקיד:</strong> {userInfoModal.row.role}
              </Typography>
              <Typography variant="body1" style={{ marginBottom: 10 }}>
                <strong>זמן:</strong> {userInfoModal.row.time}
              </Typography>
              <Typography variant="body1" style={{ marginBottom: 20 }}>
                <strong>תיאור:</strong> {userInfoModal.row.description || 'אין תיאור'}
              </Typography>
              
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => {
                  // Jump to the row
                  if (userInfoModal.phaseIndex !== null && userInfoModal.rowIndex !== null) {
                    handleJumpToRow(userInfoModal.phaseIndex, userInfoModal.rowIndex);
                  }
                }}
                style={{ marginTop: 10 }}
              >
                קפוץ לשורה
              </Button>
            </div>
          )}
        </DialogContent>
        <DialogActions style={{ direction: 'rtl' }}>
          <Button onClick={handleCloseUserInfoModal}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* No User Warning Dialog */}
      <Dialog 
        open={noUserWarning.open} 
        onClose={() => setNoUserWarning({ open: false, role: '' })}
        maxWidth="sm"
        fullWidth
        dir="rtl"
      >
        <DialogTitle>אזהרה</DialogTitle>
        <DialogContent>
          <Alert severity="warning" style={{ direction: 'rtl', marginBottom: 10 }}>
            אין משתמש מחובר לתפקיד "{noUserWarning.role}" כרגע.
            <br />
            לא ניתן לשלוח התראה למשתמש שאינו מחובר.
          </Alert>
        </DialogContent>
        <DialogActions style={{ direction: 'rtl' }}>
          <Button onClick={() => setNoUserWarning({ open: false, role: '' })}>אישור</Button>
        </DialogActions>
      </Dialog>
    </TableContainer>
  );
};

export default EditableTable;