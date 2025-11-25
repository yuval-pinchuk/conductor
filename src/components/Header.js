// src/components/Header.js

import React, {useState} from 'react';
import { AppBar, Toolbar, Typography, IconButton, TextField, InputAdornment, Button} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow'; // Play icon
import StopIcon from '@mui/icons-material/Stop';       // Stop icon
import AccessTimeIcon from '@mui/icons-material/AccessTime'; // Clock icon

const Header = ({ 
    project, 
    role,
    name,
    isEditing, 
    currentVersion, 
    setCurrentVersion, 
    onToggleEdit, 
    onSave, 
    onCancel,
    clockTime,
    isRunning,
    isManager,
    handleSetClockTime,
    handleToggleClock
}) => {
  const [isEditingClock, setIsEditingClock] = useState(false);
  const [tempClockInput, setTempClockInput] = useState(clockTime);
    
  const handleClockEditStart = () => {
      setTempClockInput(clockTime);
      setIsEditingClock(true);
  };

  const handleClockEditSave = () => {
      // Simple regex check for format (+/-hh:mm:ss)
      const timeRegex = /^[+-]\d{2}:\d{2}:\d{2}$/;
      if (timeRegex.test(tempClockInput)) {
          handleSetClockTime(tempClockInput);
          setIsEditingClock(false);
      } else {
          alert("Invalid time format. Use +/-hh:mm:ss.");
      }
  };
    
  // Handler to restrict input to numbers and dots (and enforce v prefix)
  const handleVersionChange = (e) => {
      // 1. Filter input: Only allow digits (0-9) and periods (.).
      const numericPart = e.target.value.replace(/[^0-9.]/g, ''); 
      // 2. Prepend 'v' and update state
      setCurrentVersion(`v${numericPart}`); 
  };
  
  // We only pass the numeric part to the TextField
  const displayValue = currentVersion.startsWith('v') 
                        ? currentVersion.substring(1) 
                        : currentVersion;

  return (
    <AppBar position="static">
      <Toolbar style={{ justifyContent: 'space-between' }}>
        {/* Left Corner: Version (Editable when isEditing) */}
          {isEditing ? (
            <TextField
              value={displayValue} // <-- Use only the numeric part for input
              onChange={handleVersionChange}
              size="small"
              variant="outlined"
              style={{ width: 100, backgroundColor: '#333' }}
              InputProps={{
                  startAdornment: (
                      // This creates the non-editable 'v' prefix
                      <InputAdornment position="start">v</InputAdornment>
                  ),
                  style: { padding: 4, color: 'white' }
              }}
           />
          ) : (
            <Typography variant="h6" color="inherit">
              {currentVersion}
            </Typography>
          )}

        {/* Center: Project, Role, and Name - side by side, same size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Typography variant="h6" color="inherit" style={{ minWidth: 150, textAlign: 'center' }}>
            {project.name}
          </Typography>
          <Typography variant="h6" color="inherit" style={{ minWidth: 150, textAlign: 'center' }}>
            {role}
          </Typography>
          <Typography variant="h6" color="inherit" style={{ minWidth: 150, textAlign: 'center' }}>
            {name}
          </Typography>
        </div>
        {/* Clock Display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AccessTimeIcon color="primary" />
            
            {isEditingClock ? (
                <>
                    <TextField
                        value={tempClockInput}
                        onChange={(e) => setTempClockInput(e.target.value)}
                        size="small"
                        placeholder="+hh:mm:ss"
                        style={{ width: 120, backgroundColor: '#333' }}
                        inputProps={{ style: { padding: 4, color: 'white' } }}
                    />
                    <Button size="small" variant="contained" onClick={handleClockEditSave}>Save</Button>
                    <Button size="small" variant="outlined" onClick={() => setIsEditingClock(false)}>Cancel</Button>
                </>
            ) : (
                <Typography variant="h5" style={{ color: isRunning ? 'red' : 'inherit' }}>
                    {clockTime}
                </Typography>
            )}
            
            {/* Manager-only Clock Controls */}
            {isManager && (
                <>
                    {!isEditingClock && (
                        <IconButton color="primary" onClick={handleClockEditStart} size="small" title="Edit Time">
                            <EditIcon style={{ fontSize: 16 }} />
                        </IconButton>
                    )}
                    <IconButton 
                        color={isRunning ? 'secondary' : 'primary'} 
                        onClick={handleToggleClock} 
                        size="small"
                        title={isRunning ? "Stop Clock" : "Start Clock"}
                        disabled={isEditingClock}
                    >
                        {isRunning ? <StopIcon /> : <PlayArrowIcon />}
                    </IconButton>
                </>
            )}
        </div>
        {/* Right Corner: Edit/Save/Cancel */}
        <div>
          {isEditing ? (
            <>
              <IconButton color="inherit" onClick={onSave} title="Save Changes">
                <CheckIcon /> {/* V button */}
              </IconButton>
              <IconButton color="inherit" onClick={onCancel} title="Cancel Changes">
                <CloseIcon /> {/* X button */}
              </IconButton>
            </>
          ) : (
            <IconButton color="inherit" onClick={onToggleEdit} title="Edit Project">
              <EditIcon /> {/* Pencil button */}
            </IconButton>
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default Header;