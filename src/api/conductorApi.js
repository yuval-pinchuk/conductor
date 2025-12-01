// src/api/conductorApi.js
import { request } from './client';

export const api = {
  // Projects
  getProjects: () => request('/api/projects'),
  getProjectById: (projectId) => request(`/api/projects/${projectId}`),
  updateProjectVersion: (projectId, version) =>
    request(`/api/projects/${projectId}/version`, {
      method: 'PUT',
      body: { version },
    }),
  createClockCommand: (projectId, command, data = {}) =>
    request(`/api/projects/${projectId}/clock-command`, {
      method: 'POST',
      body: { command, data },
    }),
  getClockCommand: (projectId) =>
    request(`/api/projects/${projectId}/clock-command`),
  clearClockCommand: (projectId) =>
    request(`/api/projects/${projectId}/clock-command/clear`, {
      method: 'POST',
    }),

  // Phases
  getPhases: (projectId) => request(`/api/projects/${projectId}/phases`),
  createPhase: (projectId, payload = {}) =>
    request(`/api/projects/${projectId}/phases`, {
      method: 'POST',
      body: payload,
    }),
  deletePhase: (phaseId) =>
    request(`/api/phases/${phaseId}`, { method: 'DELETE' }),
  togglePhaseActive: (phaseId) =>
    request(`/api/phases/${phaseId}/toggle-active`, { method: 'PUT' }),

  // Rows
  createRow: (phaseId, payload) =>
    request(`/api/phases/${phaseId}/rows`, {
      method: 'POST',
      body: payload,
    }),
  updateRow: (rowId, payload) =>
    request(`/api/rows/${rowId}`, {
      method: 'PUT',
      body: payload,
    }),
  deleteRow: (rowId) =>
    request(`/api/rows/${rowId}`, {
      method: 'DELETE',
    }),
  runRowScript: (rowId) =>
    request(`/api/rows/${rowId}/run-script`, { method: 'POST' }),

  // Periodic Scripts
  getPeriodicScripts: (projectId) =>
    request(`/api/projects/${projectId}/periodic-scripts`),
  createPeriodicScript: (projectId, payload) =>
    request(`/api/projects/${projectId}/periodic-scripts`, {
      method: 'POST',
      body: payload,
    }),
  updatePeriodicScript: (scriptId, payload) =>
    request(`/api/periodic-scripts/${scriptId}`, {
      method: 'PUT',
      body: payload,
    }),
  deletePeriodicScript: (scriptId) =>
    request(`/api/periodic-scripts/${scriptId}`, { method: 'DELETE' }),
  executePeriodicScript: (scriptId) =>
    request(`/api/periodic-scripts/${scriptId}/execute`, { method: 'POST' }),

  // Roles
  getProjectRoles: (projectId) => request(`/api/projects/${projectId}/roles`),
  addProjectRole: (projectId, role) =>
    request(`/api/projects/${projectId}/roles`, {
      method: 'POST',
      body: { role },
    }),

  importProject: (payload) =>
    request('/api/projects/import', {
      method: 'POST',
      body: payload,
    }),

  deleteProject: (projectId) =>
    request(`/api/projects/${projectId}`, {
      method: 'DELETE',
    }),

  verifyManagerPassword: (projectId, password) =>
    request(`/api/projects/${projectId}/verify-manager`, {
      method: 'POST',
      body: { password },
    }),

  // Bulk updates
  updateTableData: (projectId, phasesPayload) =>
    request(`/api/projects/${projectId}/table-data`, {
      method: 'PUT',
      body: phasesPayload,
    }),
  updatePeriodicScriptsBulk: (projectId, scriptsPayload) =>
    request(`/api/projects/${projectId}/periodic-scripts/bulk`, {
      method: 'PUT',
      body: scriptsPayload,
    }),

  // User/Login management
  getActiveLogins: (projectId) =>
    request(`/api/projects/${projectId}/active-logins`),
  registerLogin: (projectId, name, role) =>
    request(`/api/projects/${projectId}/login`, {
      method: 'POST',
      body: { name, role },
    }),
  registerLogout: (projectId, name, role) =>
    request(`/api/projects/${projectId}/logout`, {
      method: 'POST',
      body: { name, role },
    }),
};

