// src/components/Header.js

import React, {useState} from 'react';
import { AppBar, Toolbar, Typography, IconButton, TextField, InputAdornment, Button, Badge} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow'; // Play icon
import StopIcon from '@mui/icons-material/Stop';       // Stop icon
import AccessTimeIcon from '@mui/icons-material/AccessTime'; // Clock icon
import ChatIcon from '@mui/icons-material/Chat'; // Chat icon
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'; // PDF download icon
import TableChartIcon from '@mui/icons-material/TableChart'; // Excel export icon
import LinkIcon from '@mui/icons-material/Link'; // Hyperlink icon
import { api } from '../api/conductorApi';

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
    handleToggleClock,
    handleSetTargetClockTime,
    handleClearTargetClockTime,
    targetDateTime,
    isUsingTargetTime,
    isSaving = false,
    unreadMessageCount = 0,
    onChatOpen,
    onChatClose,
    onDocumentsOpen
}) => {
  const [isEditingClock, setIsEditingClock] = useState(false);
  const [tempClockInput, setTempClockInput] = useState(clockTime);
  const [tempTargetDateTime, setTempTargetDateTime] = useState('');
    
  const handleClockEditStart = () => {
      setTempClockInput(clockTime);
      setTempTargetDateTime(targetDateTime || '');
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
  const displayValue = currentVersion && currentVersion.startsWith('v') 
                        ? currentVersion.substring(1) 
                        : (currentVersion || '');

  return (
    <>
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

            {isUsingTargetTime && targetDateTime && (
              <Typography variant="caption" color="inherit">
                Target: {(() => {
                  // targetDateTime is in datetime-local format (YYYY-MM-DDTHH:mm)
                  // Parse it as local time components (not UTC)
                  if (targetDateTime.includes('T')) {
                    const [datePart, timePart] = targetDateTime.split('T');
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hours, minutes] = timePart.split(':').map(Number);
                    // Create Date object using local time components
                    const localDate = new Date(year, month - 1, day, hours, minutes);
                    return localDate.toLocaleString();
                  }
                  return new Date(targetDateTime).toLocaleString();
                })()}
              </Typography>
            )}

            {isManager && isEditingClock && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TextField
                  type="datetime-local"
                  size="small"
                  label="Target Time"
                  value={tempTargetDateTime || targetDateTime || ''}
                  onChange={(e) => {
                    setTempTargetDateTime(e.target.value);
                  }}
                  InputLabelProps={{ shrink: true }}
                  style={{ width: 210, backgroundColor: '#333' }}
                  inputProps={{ style: { color: 'white' } }}
                />
                <Button 
                  size="small" 
                  variant="contained" 
                  color="primary"
                  onClick={() => {
                    if (tempTargetDateTime) {
                      handleSetTargetClockTime(tempTargetDateTime);
                    }
                    setTempTargetDateTime('');
                    setIsEditingClock(false);
                  }}
                  disabled={!tempTargetDateTime}
                >
                  Set
                </Button>
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={() => {
                    setTempTargetDateTime('');
                    setIsEditingClock(false);
                  }}
                >
                  Cancel
                </Button>
                {isUsingTargetTime && (
                  <Button size="small" variant="outlined" color="error" onClick={handleClearTargetClockTime}>
                    Clear
                  </Button>
                )}
              </div>
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
                        disabled={isEditingClock || isUsingTargetTime}
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
              <IconButton color="inherit" onClick={onSave} title="Save Changes" disabled={isSaving}>
                <CheckIcon /> {/* V button */}
              </IconButton>
              <IconButton color="inherit" onClick={onCancel} title="Cancel Changes" disabled={isSaving}>
                <CloseIcon /> {/* X button */}
              </IconButton>
            </>
          ) : (
            <IconButton color="inherit" onClick={onToggleEdit} title="Edit Project">
                <EditIcon /> {/* Pencil button */}
            </IconButton>
          )}
          
          {/* Chat Icon with Unread Badge */}
          <Badge badgeContent={unreadMessageCount} color="error" max={99}>
            <IconButton 
              color="inherit" 
              onClick={() => {
                if (onChatOpen) onChatOpen();
              }} 
              title="Open Chat"
            >
              <ChatIcon />
            </IconButton>
          </Badge>
          
          {/* Related Documents Icon */}
          <IconButton 
            color="inherit" 
            onClick={() => {
              if (onDocumentsOpen) onDocumentsOpen();
            }} 
            title="Related Documents"
          >
            <LinkIcon />
          </IconButton>
          
          {/* Download Action Log Button (Manager Only) */}
          {isManager && project && (
            <IconButton 
              color="inherit" 
              onClick={() => {
                api.downloadActionLogsPDF(project.id, role);
              }} 
              title="Download Action Log"
            >
              <PictureAsPdfIcon />
            </IconButton>
          )}
          
          {/* Export Excel Button (Manager Only) */}
          {isManager && project && (
            <IconButton 
              color="inherit" 
              onClick={() => {
                api.exportProjectExcel(project.id);
              }} 
              title="Export Project to Excel"
            >
              <TableChartIcon />
            </IconButton>
          )}
        </div>
      </Toolbar>
    </AppBar>
    </>
  );
};

export default Header;