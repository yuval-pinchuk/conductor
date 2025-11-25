// src/data.js

export const PROJECTS = [
  { id: 1, name: 'Project Alpha', version: 'v1.2.5', roles: ['Manager', 'Developer', 'Tester', 'Observer'] },
  { id: 2, name: 'Project Beta', version: 'v3.0.1', roles: ['Manager', 'Scientist', 'Technician'] },
  { id: 3, name: 'Project Gamma', version: 'v0.9.0', roles: ['Manager', 'Developer'] },
];

export const INITIAL_TABLE_DATA = [
  {
    phase: 1,
    rows: [
      { id: 101, role: 'Developer', time: '01:00:00', duration: '05:30', description: 'Setup environment and compile core modules.', script: '', status: 'N/A' },
      { id: 102, role: 'Tester', time: '01:05:00', duration: '02:00', description: 'Ran initial smoke tests.', script: '', status: 'N/A' },
    ]
  },
  {
    phase: 2,
    rows: [
      { id: 201, role: 'Manager', time: '01:30:00', duration: '01:00', description: 'Reviewed test plan for phase 2.', script: '', status: 'N/A' },
      { id: 202, role: 'Developer', time: '01:45:00', duration: '15:10', description: 'Executed feature X integration test. This description is very long and should cause the row to expand.', script: '', status: 'N/A' },
    ]
  }
];

export const ALL_AVAILABLE_ROLES = ['Manager', 'Developer', 'Tester', 'Observer', 'Scientist', 'Technician'];