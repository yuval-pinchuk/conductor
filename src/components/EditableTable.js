// src/components/EditableTable.js

import React, { useState } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, IconButton, Select, MenuItem, TextField, Button,
  Typography 
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

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
        inputProps={{ 
            // Maximum length based on format (5 for mm:ss, 8 for hh:mm:ss)
            maxLength: format === 'mm:ss' ? 5 : 8, 
            pattern: currentRegex.source, // Browser validation hint
            style: { textAlign: 'right' }
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
    onRunRowScript }) => {
  
  const [newRole, setNewRole] = useState('');
  
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

  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  };

  return (
      <TableContainer component={Paper} style={{ maxHeight: 'calc(100vh - 150px)', overflow: 'auto', margin: '20px 0', direction: 'rtl' }}>
      
        {/* Periodic Scripts Row */}
        <div style={{ padding: '15px', borderBottom: '2px solid #444', backgroundColor: '#1e1e1e', direction: 'rtl' }}>
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
      
        {/* Manager Controls Area */}
        {isEditing && (
          <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 15, borderBottom: '1px solid #ccc', direction: 'rtl' }}>
          
            {/* Add New Role controls (existing) */}
            <Button variant="contained" onClick={handleAddNewRole} style={{ direction: 'rtl' }}>
              הוסף תפקיד חדש
            </Button>
            {/* ... New Role TextField ... */}
          
            {/* Add New Phase Button (NEW) */}
            <Button variant="contained" color="secondary" onClick={handleAddPhase} style={{ direction: 'rtl' }}>
              הוסף שלב חדש
            </Button>

          </div>
        )}

      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell style={{ width: '5%', textAlign: 'center' }}>#</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right' }}>תפקיד</TableCell>
            <TableCell style={{ width: '15%', textAlign: 'right' }}>זמן</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right' }}>משך</TableCell>
            <TableCell style={{ width: '35%', textAlign: 'right' }}>תיאור</TableCell>
            <TableCell style={{ width: '15%', textAlign: 'right' }}>סקריפט</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right' }}>סטטוס</TableCell>
            {isEditing && <TableCell style={{ width: '5%', textAlign: 'center' }}>פעולות</TableCell>}
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
                      textAlign: 'right'
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
                    const overdueOverlay = 'rgba(255, 193, 7, 0.18)';
                    styles = {
                      ...styles,
                      backgroundColor: styles.backgroundColor === 'transparent' ? overdueOverlay : styles.backgroundColor,
                      boxShadow: `${styles.boxShadow ? `${styles.boxShadow}, ` : ''}0 0 10px rgba(255, 193, 7, 0.4)`,
                      border: styles.border || '1px solid rgba(255, 193, 7, 0.7)',
                    };
                  }

                  return styles;
                };
                
                return ( // <-- Start of the inner return
                <TableRow key={row.id} style={getRowStyles()}>
                  {/* Row Number */}
                  <TableCell align="center" style={{ fontWeight: 'bold' }}>
                    {rowIndex + 1}
                  </TableCell>
                  {/* Role */}
                  <TableCell style={{ textAlign: 'right' }}>
                    {isEditing ? (
                      <Select
                        value={row.role}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'role', e.target.value)}
                        size="small"
                        style={{ width: '100%', direction: 'rtl' }}
                      >
                        {allRoles.map(role => <MenuItem key={role} value={role}>{role}</MenuItem>)}
                      </Select>
                    ) : (
                      row.role
                    )}
                  </TableCell>
                  
                  <TableCell style={{ textAlign: 'right' }}>
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

                  <TableCell style={{ textAlign: 'right' }}>
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
                  <TableCell style={{ textAlign: 'right' }}>
                    {isEditing ? (
                      <TextField
                        value={row.description}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'description', e.target.value)}
                        size="small"
                        multiline
                        fullWidth
                        sx={{ direction: 'rtl', '& textarea': { textAlign: 'right' } }}
                      />
                    ) : (
                      <Typography style={{ whiteSpace: 'pre-wrap', textAlign: 'right' }}>
                        {row.description}
                      </Typography>
                    )}
                  </TableCell>
                  
                  {/* Script Column */}
                  <TableCell style={{ textAlign: 'right' }}>
                    {isEditing ? (
                      <TextField
                        value={row.script || ''}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'script', e.target.value)}
                        size="small"
                        placeholder="נתיב/נקודת קצה API"
                        fullWidth
                        sx={{ direction: 'rtl', '& input': { textAlign: 'right' } }}
                      />
                    ) : (
                      row.script ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', direction: 'rtl' }}>
                          <Button 
                            variant="contained" 
                            size="small"
                            color="primary"
                            endIcon={<PlayArrowIcon />}
                            onClick={() => handleRunScript(phaseIndex, rowIndex)}
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
                      ) : (
                        <span style={{ color: '#666' }}>—</span>
                      )
                    )}
                  </TableCell>
                  
                  {/* Status (Pass/Fail) Column - V and X buttons */}
                  <TableCell style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', direction: 'rtl' }}>
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
                    </div>
                  </TableCell>
                  
                  {/* Actions (Remove) */}
                  {isEditing && (
                    <TableCell style={{ textAlign: 'center' }}>
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
    </TableContainer>
  );
};

export default EditableTable;