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
} from '@mui/material';
import * as XLSX from 'xlsx';
import { api } from '../api/conductorApi';

const DEFAULT_TIME = '00:00:00';
const DEFAULT_DURATION = '00:00';

const LoginScreen = ({ onLogin }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [userName, setUserName] = useState('');
  const [availableRoles, setAvailableRoles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadError, setLoadError] = useState('');

  // New project modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [importRows, setImportRows] = useState([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [isSubmittingNewProject, setIsSubmittingNewProject] = useState(false);

  const resetCreateProjectState = () => {
    setNewProjectName('');
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
  const isLoginEnabled = Boolean(selectedProjectId && selectedRole && userName.trim() !== '' && !isLoadingProjects);

  // Effect to update roles when project changes
  useEffect(() => {
    setSelectedRole(''); // Reset role when project changes
    if (selectedProject && Array.isArray(selectedProject.roles)) {
      setAvailableRoles(selectedProject.roles);
    } else {
      setAvailableRoles([]);
    }
  }, [selectedProjectId, selectedProject]);

  const handleLogin = () => {
    if (isLoginEnabled) {
      onLogin({
        project: selectedProject,
        role: selectedRole,
        name: userName.trim()
      });
    }
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

  const numberToTimeString = (value, mode = 'time') => {
    if (typeof value !== 'number') return null;
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    if (mode === 'duration') {
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const normalizeTimeValue = (value, fallback, mode = 'time') => {
    if (value == null || value === '') return fallback;
    if (typeof value === 'number') {
      return numberToTimeString(value, mode) || fallback;
    }
    if (typeof value === 'string') {
      return value.trim() || fallback;
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
    if (!trimmedName) {
      setImportError('Project name is required.');
      return;
    }
    if (importRows.length === 0) {
      setImportError('Please upload an Excel file with at least one row.');
      return;
    }

    setIsSubmittingNewProject(true);
    setImportError('');
    try {
      const createdProject = await api.importProject({
        name: trimmedName,
        rows: importRows,
      });
      await fetchProjects();
      setSelectedProjectId(createdProject.id);
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
      <h2>Experiment Manager Login</h2>
      {isLoadingProjects && <CircularProgress size={28} />}
      {loadError && (
        <Typography color="error" sx={{ mt: 1 }}>
          {loadError}
        </Typography>
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
          {availableRoles.map(role => (
            <MenuItem key={role} value={role}>{role}</MenuItem>
          ))}
        </Select>
      </FormControl>

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