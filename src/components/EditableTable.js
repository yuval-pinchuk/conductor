// src/components/EditableTable.js

import React, { useState } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, IconButton, Checkbox, Select, MenuItem, TextField, Button,
  Typography 
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { ALL_AVAILABLE_ROLES } from '../data';

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
        helperText={!isFormatValid && `Format must be strictly ${format === 'mm:ss' ? 'mm:ss' : 'hh:mm:ss'}`} // Updated helper text
        style={{ width: format === 'mm:ss' ? 95 : 140 }}
        inputProps={{ 
            // Maximum length based on format (5 for mm:ss, 8 for hh:mm:ss)
            maxLength: format === 'mm:ss' ? 5 : 8, 
            pattern: currentRegex.source, // Browser validation hint
        }}
      />
    </div>
  );
};


const EditableTable = ({ tableData, setTableData, isEditing, allRoles, setAllRoles }) => {
  
  const [newRole, setNewRole] = useState('');
  
  const handleChange = (phaseIndex, rowIndex, field, newValue) => {
    const newPhases = [...tableData];
    newPhases[phaseIndex].rows[rowIndex][field] = newValue;
    setTableData(newPhases);
  };

  const handleAddRow = (phaseIndex) => {
    const newRow = { id: Date.now(), role: allRoles[0] || 'Role', time: '00:00:00', duration: '00:00', description: '', status: 'N/A', script: '' };
    const newPhases = [...tableData];
    newPhases[phaseIndex].rows.push(newRow);
    setTableData(newPhases);
  };

  const handleRunScript = (scriptPath) => {
    if (scriptPath) {
      alert(`Simulating script execution:\nPath: ${scriptPath}\n\nCheck console for details.`);
      console.log(`[SCRIPT RUNNER] Attempting to execute script at: ${scriptPath}`);
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

  return (
      <TableContainer component={Paper} style={{ maxHeight: 'calc(100vh - 150px)', overflow: 'auto', margin: '20px 0' }}>
      
        {/* Manager Controls Area */}
        {isEditing && (
          <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 15, borderBottom: '1px solid #ccc' }}>
          
            {/* Add New Role controls (existing) */}
            <Button variant="contained" onClick={handleAddNewRole}>
              Add New Role
            </Button>
            {/* ... New Role TextField ... */}
          
            {/* Add New Phase Button (NEW) */}
            <Button variant="contained" color="secondary" onClick={handleAddPhase}>
              Add New Phase
            </Button>

          </div>
        )}

      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell style={{ width: '10%' }}>Role</TableCell>
            <TableCell style={{ width: '15%' }}>Time (hh:mm:ss)</TableCell>
            <TableCell style={{ width: '10%' }}>Duration (mm:ss)</TableCell>
            <TableCell style={{ width: '35%' }}>Description</TableCell>
            <TableCell style={{ width: '15%' }}>Script</TableCell>
            <TableCell style={{ width: '10%' }}>Status</TableCell>
            {isEditing && <TableCell style={{ width: '5%' }}>Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Data Rows */}
          {tableData.map((phase, phaseIndex) => (
            <React.Fragment key={phase.phase}>
              {/* Phase Header Row */}
                <TableRow style={{ backgroundColor: '#1e1e1e' }}>
                  <TableCell colSpan={isEditing ? 7 : 6} style={{ 
                      fontWeight: 'bold', 
                      backgroundColor: '#1e1e1e' 
                  }}>
                    Phase {phase.phase}
                  
                    {isEditing && (
                      <>
                        {/* Button to ADD Row */}
                        <IconButton onClick={() => handleAddRow(phaseIndex)} size="small" color="primary" title="Add Row">
                          <AddIcon />
                        </IconButton>
                        
                        {/* Button to DELETE Phase (NEW) */} 
                        <IconButton onClick={() => handleRemovePhase(phaseIndex)} size="small" color="secondary" title="Delete Phase">
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>

              {/* Data Rows */}
              {phase.rows.map((row, rowIndex) => (
                <TableRow key={row.id}>
                  {/* Role */}
                  <TableCell>
                    {isEditing ? (
                      <Select
                        value={row.role}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'role', e.target.value)}
                        size="small"
                        style={{ width: '100%' }}
                      >
                        {allRoles.map(role => <MenuItem key={role} value={role}>{role}</MenuItem>)}
                      </Select>
                    ) : (
                      row.role
                    )}
                  </TableCell>
                  
                  <TableCell>
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

                  <TableCell>
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
                  <TableCell>
                    {isEditing ? (
                      <TextField
                        value={row.description}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'description', e.target.value)}
                        size="small"
                        multiline
                        fullWidth
                      />
                    ) : (
                      <Typography style={{ whiteSpace: 'pre-wrap' }}>
                        {row.description}
                      </Typography>
                    )}
                  </TableCell>
                  
                  {/* Script Column */}
                  <TableCell>
                    {isEditing ? (
                      <TextField
                        value={row.script || ''}
                        onChange={(e) => handleChange(phaseIndex, rowIndex, 'script', e.target.value)}
                        size="small"
                        placeholder="Path/API Endpoint"
                        fullWidth
                      />
                    ) : (
                      row.script ? (
                        <Button 
                          variant="contained" 
                          size="small"
                          color="primary"
                          startIcon={<PlayArrowIcon />}
                          onClick={() => handleRunScript(row.script)}
                        >
                          Run Script
                        </Button>
                      ) : (
                        <span style={{ color: '#666' }}>—</span>
                      )
                    )}
                  </TableCell>
                  
                  {/* Status (Pass/Fail/N/A) Column */}
                  <TableCell>
                    <Select
                      value={row.status || 'N/A'} // Assuming data uses 'status' now
                      onChange={(e) => handleChange(phaseIndex, rowIndex, 'status', e.target.value)}
                      size="small"
                      style={{ width: '100%' }}
              // This column is always editable per your request
              // You can use the theme status colors for visual cues if desired
                    >
                      <MenuItem value="Passed">Passed</MenuItem>
                      <MenuItem value="Failed">Failed</MenuItem>
                      <MenuItem value="N/A">N/A</MenuItem>
                    </Select>
                  </TableCell>
                  
                  {/* Actions (Remove) */}
                  {isEditing && (
                    <TableCell>
                      <IconButton onClick={() => handleRemoveRow(phaseIndex, rowIndex)} size="small" color="error">
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default EditableTable;