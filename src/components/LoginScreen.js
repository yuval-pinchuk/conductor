// src/components/LoginScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  Select,
  MenuItem,
  Button,
  FormControl,
  InputLabel,
  TextField,
  CircularProgress,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Alert,
  Box,
  IconButton,
  InputAdornment,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import * as XLSX from 'xlsx';
import { api } from '../api/conductorApi';

const DEFAULT_TIME = '00:00:00';
const DEFAULT_DURATION = '00:00';

const LoginScreen = ({ onLogin }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [userName, setUserName] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [availableRoles, setAvailableRoles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeLogins, setActiveLogins] = useState([]); // Track which roles are currently in use

  // New project modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPassword, setNewProjectPassword] = useState('');
  const [newProjectManagerRole, setNewProjectManagerRole] = useState('');
  const [showManagerPassword, setShowManagerPassword] = useState(false);
  const [showNewProjectPassword, setShowNewProjectPassword] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [isSubmittingNewProject, setIsSubmittingNewProject] = useState(false);

  const resetCreateProjectState = () => {
    setNewProjectName('');
    setNewProjectPassword('');
    setNewProjectManagerRole('');
    setImportRows([]);
    setSelectedFileName('');
    setImportError('');
  };

  const fetchProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setLoadError('');
    try {
      const data = await api.getProjects();
      setProjects(data);
      return data;
    } catch (error) {
      console.error('Failed to load projects', error);
      setLoadError(error.message || 'Failed to load projects');
      return [];
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const requiresManagerPassword = selectedRole === selectedProject?.manager_role && selectedProject?.is_locked;
  const isLoginEnabled = Boolean(
    selectedProjectId &&
    selectedRole &&
    userName.trim() !== '' &&
    !isLoadingProjects &&
    (!requiresManagerPassword || managerPassword.trim() !== '')
  );

  // Effect to update roles when project changes
  useEffect(() => {
    setSelectedRole(''); // Reset role when project changes
    if (selectedProject && Array.isArray(selectedProject.roles)) {
      setAvailableRoles(selectedProject.roles);
    } else {
      setAvailableRoles([]);
    }
  }, [selectedProjectId, selectedProject]);

  // Fetch active logins when project changes
  useEffect(() => {
    if (selectedProjectId) {
      api.getActiveLogins(selectedProjectId)
        .then(logins => {
          setActiveLogins(logins);
        })
        .catch(err => {
          console.error('Failed to fetch active logins', err);
          setActiveLogins([]);
        });
    } else {
      setActiveLogins([]);
    }
  }, [selectedProjectId]);

  // Poll for active logins every 2 seconds
  useEffect(() => {
    if (!selectedProjectId) return;
    
    const interval = setInterval(() => {
      api.getActiveLogins(selectedProjectId)
        .then(logins => {
          setActiveLogins(logins);
        })
        .catch(err => {
          // Silently fail - polling is not critical
        });
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedProjectId]);

  useEffect(() => {
    setLoginError('');
    if (selectedRole !== selectedProject?.manager_role) {
      setManagerPassword('');
    }
  }, [selectedRole, selectedProjectId, selectedProject]);

  const handleLogin = async () => {
    if (!isLoginEnabled) return;
    setLoginError('');

    // Check if role is already taken
    const isRoleTaken = activeLogins.some(login => login.role === selectedRole);
    if (isRoleTaken) {
      const takenBy = activeLogins.find(login => login.role === selectedRole);
      setLoginError(`Role "${selectedRole}" is already in use by ${takenBy.name}`);
      return;
    }

    if (requiresManagerPassword) {
      try {
        await api.verifyManagerPassword(selectedProjectId, managerPassword);
      } catch (error) {
        console.error('Manager password verification failed', error);
        setLoginError(error.message || 'Invalid manager password');
        return;
      }
    }

    // Register the login
    try {
      await api.registerLogin(selectedProjectId, userName.trim(), selectedRole);
    } catch (error) {
      console.error('Failed to register login', error);
      setLoginError(error.message || 'Failed to register login. Role may be taken.');
      return;
    }

    onLogin({
      project: selectedProject,
      role: selectedRole,
      name: userName.trim()
    });
  };

  const handleOpenCreateModal = () => {
    resetCreateProjectState();
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    if (isSubmittingNewProject) return;
    setIsCreateModalOpen(false);
    resetCreateProjectState();
  };

const numberToTimeString = (value) => {
  if (typeof value !== 'number') return null;
  const totalSeconds = Math.round(value * 24 * 60 * 60);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

const normalizeDuration = (value, fallback) => {
  if (value == null || value === '') return fallback;
  
  // If it's a number, determine if it's Excel time serial or plain minutes
  if (typeof value === 'number') {
    // Excel time serials are typically between 0 and 1 (fraction of a day)
    // If value is >= 1, treat it as minutes
    // If value is < 1, treat it as Excel time serial (days)
    if (value >= 1) {
      // Treat as minutes
      const totalSeconds = Math.round(value * 60);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${minutes}:${seconds}`;
    } else {
      // Treat as Excel time serial (fraction of a day)
      const totalSeconds = Math.round(value * 24 * 60 * 60);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
  }
  
  // If it's a string, parse and normalize to mm:ss
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    
    // Check if it's already in mm:ss format
    const mmssPattern = /^(\d{1,2}):(\d{2})$/;
    const mmssMatch = trimmed.match(mmssPattern);
    if (mmssMatch) {
      const minutes = String(parseInt(mmssMatch[1], 10)).padStart(2, '0');
      const seconds = String(parseInt(mmssMatch[2], 10)).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
    
    // Check if it's in hh:mm:ss format, extract mm:ss
    const hhmmssPattern = /^(\d{1,2}):(\d{2}):(\d{2})$/;
    const hhmmssMatch = trimmed.match(hhmmssPattern);
    if (hhmmssMatch) {
      const minutes = String(parseInt(hhmmssMatch[2], 10)).padStart(2, '0');
      const seconds = String(parseInt(hhmmssMatch[3], 10)).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
    
    // If it's just a number as string (minutes), convert to mm:ss
    const numValue = Number(trimmed);
    if (!Number.isNaN(numValue)) {
      const totalSeconds = Math.round(numValue * 60); // Treat as minutes
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
    
    // If no pattern matches, return as-is (might be invalid, but preserve it)
    return trimmed;
  }
  
  return fallback;
};

const normalizeTimeValue = (value, fallback, mode = 'time') => {
    if (value == null || value === '') return fallback;
  if (mode === 'time') {
    if (typeof value === 'number') {
      return numberToTimeString(value) || fallback;
    }
    if (typeof value === 'string') {
      return value.trim() || fallback;
    }
    return fallback;
  }
  // duration: normalize to mm:ss format
  if (mode === 'duration') {
    return normalizeDuration(value, fallback);
  }
  return fallback;
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportError('');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const parsedRows = rows
        .map((row) => {
          const normalized = {};
          Object.keys(row).forEach((key) => {
            const normalizedKey = key.toString().trim().toLowerCase();
            normalized[normalizedKey] = row[key];
          });

          const phaseValue = normalized.phase ?? normalized['phase'];
          const roleValue = normalized.role ?? normalized['role'];
          const timeValue = normalized.time ?? normalized['time'];
          const durationValue = normalized.duration ?? normalized['duration'];
          const descriptionValue = normalized.description ?? normalized['description'];

          if (phaseValue === undefined || phaseValue === '') {
            return null;
          }

          const phaseNumber = Number(phaseValue);
          if (Number.isNaN(phaseNumber)) {
            return null;
          }

          return {
            phase: phaseNumber,
            role: (roleValue || 'Role').toString().trim() || 'Role',
            time: normalizeTimeValue(timeValue, DEFAULT_TIME, 'time'),
            duration: normalizeTimeValue(durationValue, DEFAULT_DURATION, 'duration'),
            description: descriptionValue?.toString() || '',
          };
        })
        .filter(Boolean);

      if (parsedRows.length === 0) {
        setImportError('No valid rows found in the uploaded file.');
        setImportRows([]);
      } else {
        setImportRows(parsedRows);
        setImportError('');
        setSelectedFileName(file.name);
      }
    } catch (error) {
      console.error('Failed to parse Excel file', error);
      setImportError(error.message || 'Failed to parse Excel file');
      setImportRows([]);
      setSelectedFileName('');
    }
  };

  const handleCreateProject = async () => {
    const trimmedName = newProjectName.trim();
    const trimmedPassword = newProjectPassword.trim();
    const trimmedManagerRole = newProjectManagerRole.trim();
    if (!trimmedName) {
      setImportError('Project name is required.');
      return;
    }
    if (importRows.length === 0) {
      setImportError('Please upload an Excel file with at least one row.');
      return;
    }
    if (!trimmedManagerRole) {
      setImportError('Manager role is required.');
      return;
    }

    setIsSubmittingNewProject(true);
    setImportError('');
    try {
      const createdProject = await api.importProject({
        name: trimmedName,
        rows: importRows,
        managerPassword: trimmedPassword || undefined,
        managerRole: newProjectManagerRole.trim() || undefined,
      });
      await fetchProjects();
      setSelectedProjectId(createdProject.id);
      if (trimmedPassword) {
        setManagerPassword(trimmedPassword);
      } else {
        setManagerPassword('');
      }
      setIsCreateModalOpen(false);
      resetCreateProjectState();
    } catch (error) {
      console.error('Failed to create project', error);
      setImportError(error.message || 'Failed to create project');
    } finally {
      setIsSubmittingNewProject(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 50 }}>
      <h2>CONDUCTOR</h2>
      {isLoadingProjects && <CircularProgress size={28} />}
      {loadError && (
        <Typography color="error" sx={{ mt: 1 }}>
          {loadError}
        </Typography>
      )}
      {loginError && !isLoadingProjects && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {loginError}
        </Alert>
      )}
      
      <TextField
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        label="Name"
        required
        sx={{ m: 1, minWidth: 300 }}
      />

      <FormControl sx={{ m: 1, minWidth: 300 }} disabled={isLoadingProjects}>
        <InputLabel id="project-label">Project</InputLabel>
        <Select
          labelId="project-label"
          value={selectedProjectId}
          label="Project"
          onChange={(e) => {
            const value = e.target.value;
            setSelectedProjectId(value === '' ? '' : Number(value));
          }}
        >
          {projects.map(p => (
            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl sx={{ m: 1, minWidth: 300 }} disabled={!selectedProjectId || isLoadingProjects}>
        <InputLabel id="role-label">Role</InputLabel>
        <Select
          labelId="role-label"
          value={selectedRole}
          label="Role"
          onChange={(e) => setSelectedRole(e.target.value)}
        >
          {availableRoles.map(role => {
            const isRoleTaken = activeLogins.some(login => login.role === role);
            const takenBy = activeLogins.find(login => login.role === role);
            return (
              <MenuItem 
                key={role} 
                value={role}
                disabled={isRoleTaken}
                sx={{
                  opacity: isRoleTaken ? 0.5 : 1,
                }}
              >
                {role}{isRoleTaken ? ` (in use by ${takenBy?.name})` : ''}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>

      {requiresManagerPassword && (
        <TextField
          value={managerPassword}
          onChange={(e) => setManagerPassword(e.target.value)}
          label="Manager Password"
          type={showManagerPassword ? 'text' : 'password'}
          required
          sx={{ m: 1, minWidth: 300 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowManagerPassword(prev => !prev)}
                  edge="end"
                  size="small"
                >
                  {showManagerPassword ? <Visibility /> : <VisibilityOff />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <Button variant="outlined" color="primary" onClick={handleOpenCreateModal}>
          New
        </Button>
        <Button 
          variant="contained" 
          color="primary"
          onClick={handleLogin}
          disabled={!isLoginEnabled}
        >
          Log In
        </Button>
      </div>

      <Dialog
        open={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {importError && <Alert severity="error">{importError}</Alert>}
            <TextField
              label="Project Name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              required
              fullWidth
            />
            <Button
              variant="outlined"
              component="label"
            >
              {selectedFileName ? 'Change Excel File' : 'Upload Excel File'}
              <input
                type="file"
                hidden
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
              />
            </Button>
            <TextField
              label="Manager Password (optional)"
              type={showNewProjectPassword ? 'text' : 'password'}
              value={newProjectPassword}
              onChange={(e) => setNewProjectPassword(e.target.value)}
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowNewProjectPassword(prev => !prev)}
                      edge="end"
                      size="small"
                    >
                      {showNewProjectPassword ? <Visibility /> : <VisibilityOff />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            {importRows.length > 0 && (
              <FormControl fullWidth>
                <InputLabel id="manager-role-label">Manager Role (required)</InputLabel>
                <Select
                  labelId="manager-role-label"
                  value={newProjectManagerRole}
                  label="Manager Role (required)"
                  onChange={(e) => setNewProjectManagerRole(e.target.value)}
                  required
                >
                  {[...new Set(importRows.map(r => r.role))].map(role => (
                    <MenuItem key={role} value={role}>{role}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {selectedFileName && (
              <Typography variant="body2">
                Selected file: {selectedFileName}
              </Typography>
            )}
            {importRows.length > 0 && (
              <Box>
                <Typography variant="body2">
                  Parsed rows: {importRows.length}
                </Typography>
                <Typography variant="body2">
                  Detected phases: {[...new Set(importRows.map(r => r.phase))].sort((a, b) => a - b).join(', ')}
                </Typography>
                <Typography variant="body2">
                  Unique roles: {[...new Set(importRows.map(r => r.role))].join(', ')}
                </Typography>
              </Box>
            )}
            <Typography variant="caption">
              Expected columns: Phase, Role, Time (hh:mm:ss), Duration (mm:ss), Description. Column names are case-insensitive.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateModal} disabled={isSubmittingNewProject}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            variant="contained"
            disabled={isSubmittingNewProject}
          >
            {isSubmittingNewProject ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default LoginScreen;