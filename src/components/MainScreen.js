// src/components/MainScreen.js

import React, { useState } from 'react';
import Header from './Header';
import EditableTable from './EditableTable';
import { INITIAL_TABLE_DATA, ALL_AVAILABLE_ROLES } from '../data';
import { Button } from '@mui/material';

const MainScreen = ({ project, role, onLogout }) => {
  // State for the project version
  const [currentVersion, setCurrentVersion] = useState(project.version);
  // Temporary state to hold the version during an edit session
  const [originalVersion, setOriginalVersion] = useState(project.version);
  
  const [isEditing, setIsEditing] = useState(false);
  const [originalTableData, setOriginalTableData] = useState(INITIAL_TABLE_DATA);
  const [currentTableData, setCurrentTableData] = useState(INITIAL_TABLE_DATA);
  const [allRoles, setAllRoles] = useState(ALL_AVAILABLE_ROLES);
  
  const handleToggleEdit = () => {
    if (!isEditing && role === 'Manager') {
      // Create a DEEP CLONE of the table data to prevent mutation
      const clonedData = JSON.parse(JSON.stringify(currentTableData)); 
      
      setOriginalTableData(clonedData);      // <-- Save the deep clone
      setOriginalVersion(currentVersion); 
      setIsEditing(true);
    } else if (isEditing) {
      handleCancel();
    }
  };

  const handleSave = () => {
    // 1. Update the official original state with the current state (still using a deep copy)
    setOriginalTableData(JSON.parse(JSON.stringify(currentTableData))); 
    setOriginalVersion(currentVersion); 
    setIsEditing(false);
    console.log("Changes Saved. New Version:", currentVersion);
  };

  const handleCancel = () => {
    // 2. Revert to the deep clone saved at the start of the session
    setCurrentTableData(originalTableData); 
    setCurrentVersion(originalVersion); 
    setIsEditing(false);
    console.log("Changes Canceled. Reverted to original data and version.");
  };

  return (
    <div>
      <Header
        project={project}
        role={role}
        isEditing={isEditing}
        currentVersion={currentVersion} // <--- PASS CURRENT VERSION
        setCurrentVersion={setCurrentVersion} // <--- PASS SETTER
        onToggleEdit={handleToggleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      
      <div style={{ padding: 20 }}>
        {role !== 'Manager' && isEditing && (
          <p style={{ color: 'red' }}>Note: Only Managers can enter Edit Mode.</p>
        )}
        
        <EditableTable
          tableData={currentTableData}
          setTableData={setCurrentTableData}
          isEditing={isEditing}
          allRoles={allRoles}
          setAllRoles={setAllRoles}
        />
        
        <Button onClick={onLogout} variant="outlined" style={{ marginTop: 20 }}>
          Logout
        </Button>
      </div>
    </div>
  );
};

export default MainScreen;