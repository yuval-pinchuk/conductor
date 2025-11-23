// src/components/Header.js

import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, TextField, InputAdornment} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

const Header = ({ 
    project, 
    role, 
    isEditing, 
    currentVersion, 
    setCurrentVersion, 
    onToggleEdit, 
    onSave, 
    onCancel 
}) => {
    
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

        {/* Center: Project Name and Role */}
        <div style={{ textAlign: 'center' }}>
          <Typography variant="h5" color="inherit">
            {project.name}
          </Typography>
          <Typography variant="subtitle2" color="inherit">
            Role: {role}
          </Typography>
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