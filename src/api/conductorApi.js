// src/api/conductorApi.js
import { request, API_BASE_URL } from './client';

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
  togglePhaseActive: (phaseId, payload = {}) =>
    request(`/api/phases/${phaseId}/toggle-active`, { method: 'PUT', body: payload }),

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
  runRowScript: (rowId, payload = {}) =>
    request(`/api/rows/${rowId}/run-script`, { method: 'POST', body: payload }),

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
  updateTableData: (projectId, phasesPayload, userName, userRole) =>
    request(`/api/projects/${projectId}/table-data`, {
      method: 'PUT',
      body: {
        phases: phasesPayload,
        user_name: userName,
        user_role: userRole
      },
    }),
  updatePeriodicScriptsBulk: (projectId, scriptsPayload, userName, userRole) =>
    request(`/api/projects/${projectId}/periodic-scripts/bulk`, {
      method: 'PUT',
      body: {
        scripts: scriptsPayload,
        user_name: userName,
        user_role: userRole
      },
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
  heartbeat: (projectId, name, role) =>
    request(`/api/projects/${projectId}/heartbeat`, {
      method: 'POST',
      body: { name, role },
    }),

  // User notifications
  createUserNotification: (projectId, targetRole, command, data = {}) =>
    request(`/api/projects/${projectId}/user-notification`, {
      method: 'POST',
      body: { targetRole, command, data },
    }),
  getUserNotification: (projectId, role, name) =>
    request(`/api/projects/${projectId}/user-notification?role=${encodeURIComponent(role)}&name=${encodeURIComponent(name)}`),
  clearUserNotification: (projectId, role, name) =>
    request(`/api/projects/${projectId}/user-notification/clear`, {
      method: 'POST',
      body: { role, name },
    }),

  // Pending Changes
  createPendingChange: (projectId, submittedBy, submittedByRole, changesData) =>
    request(`/api/projects/${projectId}/pending-changes`, {
      method: 'POST',
      body: {
        submitted_by: submittedBy,
        submitted_by_role: submittedByRole,
        changes_data: changesData,
      },
    }),
  getPendingChanges: (projectId, status = 'pending') =>
    request(`/api/projects/${projectId}/pending-changes?status=${status}`),
  acceptPendingChange: (projectId, changeId, reviewedBy) =>
    request(`/api/projects/${projectId}/pending-changes/${changeId}/accept`, {
      method: 'POST',
      body: { reviewed_by: reviewedBy },
    }),
  declinePendingChange: (projectId, changeId, reviewedBy) =>
    request(`/api/projects/${projectId}/pending-changes/${changeId}/decline`, {
      method: 'POST',
      body: { reviewed_by: reviewedBy },
    }),

  // Action Logs
  getActionLogs: (projectId, userRole, filters = {}) => {
    const params = new URLSearchParams({ user_role: userRole, ...filters });
    return request(`/api/projects/${projectId}/action-logs?${params.toString()}`);
  },
  downloadActionLogsPDF: (projectId, userRole) => {
    const url = `${API_BASE_URL}/api/projects/${projectId}/action-logs/pdf?user_role=${encodeURIComponent(userRole)}`;
    window.open(url, '_blank');
  },
  clearActionLogs: (projectId, userRole) =>
    request(`/api/projects/${projectId}/action-logs`, {
      method: 'DELETE',
      body: { user_role: userRole },
    }),
  resetAllStatuses: (projectId, userName, userRole) =>
    request(`/api/projects/${projectId}/reset-statuses`, {
      method: 'POST',
      body: {
        user_name: userName,
        user_role: userRole,
      },
    }),
  exportProjectExcel: (projectId) => {
    const url = `${API_BASE_URL}/api/projects/${projectId}/export-excel`;
    window.open(url, '_blank');
  },
};

