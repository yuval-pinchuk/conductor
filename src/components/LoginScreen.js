// src/components/LoginScreen.js

import React, { useState, useEffect } from 'react';
import { PROJECTS } from '../data';
import { Select, MenuItem, Button, FormControl, InputLabel } from '@mui/material';

const LoginScreen = ({ onLogin }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [availableRoles, setAvailableRoles] = useState([]);
  
  const selectedProject = PROJECTS.find(p => p.id === selectedProjectId);
  const isLoginEnabled = selectedProjectId && selectedRole;

  // Effect to update roles when project changes
  useEffect(() => {
    setSelectedRole(''); // Reset role when project changes
    if (selectedProject) {
      setAvailableRoles(selectedProject.roles);
    } else {
      setAvailableRoles([]);
    }
  }, [selectedProjectId, selectedProject]);

  const handleLogin = () => {
    if (isLoginEnabled) {
      onLogin({
        project: selectedProject,
        role: selectedRole
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 50 }}>
      <h2>Experiment Manager Login</h2>
      
      <FormControl sx={{ m: 1, minWidth: 300 }}>
        <InputLabel id="project-label">Project</InputLabel>
        <Select
          labelId="project-label"
          value={selectedProjectId}
          label="Project"
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          {PROJECTS.map(p => (
            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl sx={{ m: 1, minWidth: 300 }}>
        <InputLabel id="role-label">Role</InputLabel>
        <Select
          labelId="role-label"
          value={selectedRole}
          label="Role"
          onChange={(e) => setSelectedRole(e.target.value)}
          disabled={!selectedProjectId} // Role is only available after choosing a project
        >
          {availableRoles.map(role => (
            <MenuItem key={role} value={role}>{role}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <Button variant="outlined" color="primary">New</Button>
        <Button 
          variant="contained" 
          color="primary"
          onClick={handleLogin}
          disabled={!isLoginEnabled}
        >
          Log In
        </Button>
      </div>
    </div>
  );
};

export default LoginScreen;