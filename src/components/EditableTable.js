// src/components/EditableTable.js

import React, { useState, useRef, useEffect, useMemo, useCallback, memo, useDeferredValue } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, IconButton, TextField, Button,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions, Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { api } from '../api/conductorApi';

// Pre-compile regex patterns outside component for performance
const HHMMSS_STRICT_REGEX = /^[0-9]{2}:[0-5][0-9]:[0-5][0-9]$/; 
const MMSS_STRICT_REGEX = /^[0-5][0-9]:[0-5][0-9]$/;

// Pre-calculated styles for TextField to avoid recalculation
const timeInputTextFieldStyles = {
  '& .MuiInputBase-input': { fontSize: '1rem' }
};

const descriptionTextFieldStyles = {
  direction: 'rtl',
  '& textarea': { textAlign: 'right', fontSize: '1rem' },
  '& .MuiInputBase-input': { fontSize: '1rem' }
};

const scriptTextFieldStyles = {
  direction: 'rtl',
  '& input': { textAlign: 'right', fontSize: '1rem' },
  '& .MuiInputBase-input': { fontSize: '1rem' }
};

// Helper for time input with +/-
const TimeInput = memo(({ value, onChange, format }) => {
  const safeValue = value || '';
  const initialTime = safeValue.startsWith('+') || safeValue.startsWith('-') ? safeValue.substring(1) : safeValue;
  const [time, setTime] = useState(initialTime);
  const [isNegative, setIsNegative] = useState(safeValue.startsWith('-'));

  // Use pre-compiled regex
  const currentRegex = format === 'mm:ss' ? MMSS_STRICT_REGEX : HHMMSS_STRICT_REGEX;
  const isFormatValid = currentRegex.test(time);

  const handleTimeChange = (e) => {
    let newTime = e.target.value.replace(/[^0-9:]/g, ''); // Only allow numbers and colon
    setTime(newTime);
    
    // Always call parent onChange with full value (including sign)
    onChange((isNegative && newTime.length > 0 ? '-' : '') + newTime);
  };
  
  const handleSignToggle = () => {
    const newIsNegative = !isNegative;
    setIsNegative(newIsNegative);
    onChange((newIsNegative ? '-' : '') + time);
  };

return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, direction: 'rtl' }}>
      {/* +/- Toggle only for hh:mm:ss column (Time) */}
      {format !== 'mm:ss' && (
        <Button 
          onClick={handleSignToggle} 
          size="small" 
          variant={isNegative ? 'contained' : 'outlined'}
          color={isNegative ? 'secondary' : 'primary'}
        >
          {isNegative ? '-' : '+'}
        </Button>
      )}
      
      <TextField
        value={time}
        onChange={handleTimeChange}
        size="small"
        placeholder={format === 'mm:ss' ? 'mm:ss' : 'hh:mm:ss'}
        error={!isFormatValid} 
        helperText={!isFormatValid && `הפורמט חייב להיות בדיוק ${format === 'mm:ss' ? 'mm:ss' : 'hh:mm:ss'}`} // Updated helper text
        style={{ width: format === 'mm:ss' ? 95 : 140 }}
        sx={timeInputTextFieldStyles}
        inputProps={{ 
            // Maximum length based on format (5 for mm:ss, 8 for hh:mm:ss)
            maxLength: format === 'mm:ss' ? 5 : 8, 
            pattern: currentRegex.source, // Browser validation hint
            style: { textAlign: 'right', fontSize: '1rem' }
        }}
      />
    </div>
  );
});

// Memoized Table Row Component
const TableRowComponent = memo(({
  row,
  phaseIndex,
  rowIndex,
  globalRowNumber,
  rowTimeSeconds,
  rowStyles,
  isEditing,
  isUserRoleMatch,
  canChangeStatus,
  allRoles,
  handleChange,
  handleRunScript,
  handleRowStatusSelection,
  handleOpenUserInfoModal,
  handleRemoveRow,
  handleDuplicateRow,
  handleMoveRow,
  isManager,
  rowRefs,
  tableData
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = (e) => {
    if (!isEditing) return;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      sourcePhaseIndex: phaseIndex,
      sourceRowIndex: rowIndex,
      rowId: row.id
    }));
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    setIsDragging(false);
    e.currentTarget.style.opacity = '1';
  };

  const handleDragOver = (e) => {
    if (!isEditing) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      const sourcePhaseIndex = dragData.sourcePhaseIndex;
      const sourceRowIndex = dragData.sourceRowIndex;
      
      // Calculate target row index
      // When dropping on a row, we want to insert BEFORE that row (at its index)
      // If moving within same phase and source is before target, we need to adjust
      let targetRowIndex = rowIndex;
      if (sourcePhaseIndex === phaseIndex) {
        if (sourceRowIndex < rowIndex) {
          // Moving down: insert at target index (which shifts everything down)
          targetRowIndex = rowIndex;
        } else {
          // Moving up: insert at target index (source will be removed, so no adjustment needed)
          targetRowIndex = rowIndex;
        }
      }
      
      
      handleMoveRow(sourcePhaseIndex, sourceRowIndex, phaseIndex, targetRowIndex);
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  return (
    <TableRow 
      key={row.id} 
      style={{
        ...rowStyles,
        opacity: isDragging ? 0.5 : 1,
        borderTop: dragOver ? '2px solid #ff9800' : 'none',
        cursor: isEditing ? 'move' : 'default'
      }}
      draggable={isEditing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={el => {
        if (el) rowRefs.current[row.id] = el;
      }}
    >
      {/* Drag Handle - Only in edit mode */}
      {isEditing && (
        <TableCell style={{ width: '30px', padding: '4px', textAlign: 'center' }}>
          <DragIndicatorIcon style={{ color: '#666', cursor: 'grab' }} />
        </TableCell>
      )}
      
      {/* Row Number - Global across all phases */}
      <TableCell align="center" style={{ fontWeight: 'bold', fontSize: '1rem' }}>
        {globalRowNumber}
      </TableCell>
      {/* Role */}
      <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
        {isEditing ? (
          <select
            value={row.role}
            onChange={(e) => handleChange(phaseIndex, rowIndex, 'role', e.target.value)}
            className="role-select-dark"
            style={{ 
              width: '100%', 
              direction: 'rtl', 
              fontSize: '1rem',
              padding: '6px 32px 6px 8px', // 32px on logical right (visual left) for arrow, 8px on logical left (visual right) for text
              border: '1px solid rgba(255, 255, 255, 0.23)',
              borderRadius: '4px',
              backgroundColor: '#1e1e1e',
              color: '#ffffff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center', // 8px from right edge (visual left in RTL) for arrow
              backgroundSize: '12px 12px'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
              e.target.style.backgroundColor = '#2d2d2d';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.23)';
              e.target.style.backgroundColor = '#1e1e1e';
            }}
          >
            {allRoles.map(role => (
              <option key={role} value={role} style={{ backgroundColor: '#1e1e1e', color: '#ffffff' }}>{role}</option>
            ))}
          </select>
        ) : (
          row.role
        )}
      </TableCell>
      
      <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
        {isEditing ? (
            <TimeInput 
            value={row.time}
            onChange={(val) => handleChange(phaseIndex, rowIndex, 'time', val)}
            format="hh:mm:ss" // Pass the expected format
            />
        ) : (
            row.time
        )}
      </TableCell>

      <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
        {isEditing ? (
            <TimeInput 
            value={row.duration}
            onChange={(val) => handleChange(phaseIndex, rowIndex, 'duration', val)}
            format="mm:ss" // Pass the expected format
            />
        ) : (
            row.duration
        )}
      </TableCell>

      {/* Description (Free Text, Expands Row) */}
      <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
        {isEditing ? (
          <TextField
            value={row.description}
            onChange={(e) => handleChange(phaseIndex, rowIndex, 'description', e.target.value)}
            size="small"
            multiline
            fullWidth
            sx={descriptionTextFieldStyles}
          />
        ) : (
          <Typography style={{ whiteSpace: 'pre-wrap', textAlign: 'right', fontSize: '1rem' }}>
            {row.description}
          </Typography>
        )}
      </TableCell>
      
      {/* Script Column */}
      <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
        {isEditing ? (
          <TextField
            value={row.script || ''}
            onChange={(e) => handleChange(phaseIndex, rowIndex, 'script', e.target.value)}
            size="small"
            placeholder="נתיב/נקודת קצה API"
            fullWidth
            sx={scriptTextFieldStyles}
          />
        ) : (
          row.script ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button 
                  variant="contained" 
                  size="small"
                  color="primary"
                  endIcon={<PlayArrowIcon />}
                  onClick={() => handleRunScript(phaseIndex, rowIndex)}
                  sx={{ fontSize: '1rem' }}
                >
                  הרץ סקריפט
                </Button>
                {row.scriptResult !== undefined && (
                  row.scriptResult ? (
                    <CheckIcon color="success" style={{ fontSize: 24 }} />
                  ) : (
                    <CloseIcon color="error" style={{ fontSize: 24 }} />
                  )
                )}
              </div>
            </div>
          ) : (
            <span style={{ color: '#666', fontSize: '1rem' }}>—</span>
          )
        )}
      </TableCell>
      
      {/* Status (Pass/Fail/N/A) Column - V, X, N/A buttons, and User Info for Manager */}
      <TableCell style={{ textAlign: 'right', fontSize: '1rem' }}>
        <div style={{ display: 'flex', width: '100%' }}>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <IconButton
              onClick={() => handleRowStatusSelection(phaseIndex, rowIndex, 'Passed')}
              size="small"
              disabled={!canChangeStatus}
              color={row.status === 'Passed' ? 'success' : 'default'}
              title="עבר"
            >
              <CheckIcon />
            </IconButton>
            <IconButton
              onClick={() => handleRowStatusSelection(phaseIndex, rowIndex, 'Failed')}
              size="small"
              disabled={!canChangeStatus}
              color={row.status === 'Failed' ? 'error' : 'default'}
              title="נכשל"
            >
              <CloseIcon />
            </IconButton>
            <IconButton
              onClick={() => handleRowStatusSelection(phaseIndex, rowIndex, 'N/A')}
              size="small"
              disabled={!canChangeStatus}
              color={row.status === 'N/A' ? 'default' : 'default'}
              title="לא רלוונטי"
              sx={{
                border: row.status === 'N/A' ? '2px solid #999' : '1px solid transparent',
                borderRadius: '4px'
              }}
            >
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>N/A</Typography>
            </IconButton>
            {/* User Info Button for Manager (available always, not just in edit mode) */}
            {isManager && (
              <IconButton
                onClick={() => handleOpenUserInfoModal(row, phaseIndex, rowIndex)}
                size="small"
                color="warning"
                title="שלח התראה למשתמש"
              >
                <WarningIcon />
              </IconButton>
            )}
          </div>
        </div>
      </TableCell>
      
      {/* Actions (Duplicate, Remove) */}
      {isEditing && (
        <TableCell style={{ textAlign: 'center', fontSize: '1rem' }}>
          <IconButton 
            onClick={() => handleDuplicateRow(phaseIndex, rowIndex)} 
            size="small" 
            color="primary"
            title="שכפל שורה"
          >
            <ContentCopyIcon />
          </IconButton>
          <IconButton 
            onClick={() => handleRemoveRow(phaseIndex, rowIndex)} 
            size="small" 
            color="error"
            title="מחק שורה"
          >
            <DeleteIcon />
          </IconButton>
        </TableCell>
      )}
    </TableRow>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Compare row properties
  if (prevProps.row.id !== nextProps.row.id ||
      prevProps.row.role !== nextProps.row.role ||
      prevProps.row.time !== nextProps.row.time ||
      prevProps.row.duration !== nextProps.row.duration ||
      prevProps.row.description !== nextProps.row.description ||
      prevProps.row.script !== nextProps.row.script ||
      prevProps.row.status !== nextProps.row.status ||
      prevProps.row.scriptResult !== nextProps.row.scriptResult) {
    return false;
  }
  
  // Compare other props
  if (prevProps.globalRowNumber !== nextProps.globalRowNumber ||
      prevProps.rowTimeSeconds !== nextProps.rowTimeSeconds ||
      prevProps.isEditing !== nextProps.isEditing ||
      prevProps.canChangeStatus !== nextProps.canChangeStatus ||
      prevProps.isUserRoleMatch !== nextProps.isUserRoleMatch ||
      prevProps.isManager !== nextProps.isManager) {
    return false;
  }
  
  // Compare rowStyles by checking key properties instead of stringifying
  const prevStyles = prevProps.rowStyles || {};
  const nextStyles = nextProps.rowStyles || {};
  if (prevStyles.backgroundColor !== nextStyles.backgroundColor ||
      prevStyles.boxShadow !== nextStyles.boxShadow ||
      prevStyles.borderLeft !== nextStyles.borderLeft ||
      prevStyles.borderRight !== nextStyles.borderRight ||
      prevStyles.borderTop !== nextStyles.borderTop ||
      prevStyles.borderBottom !== nextStyles.borderBottom ||
      prevStyles.border !== nextStyles.border) {
    return false;
  }
  
  // Compare allRoles array efficiently
  const prevRoles = prevProps.allRoles || [];
  const nextRoles = nextProps.allRoles || [];
  if (prevRoles.length !== nextRoles.length) {
    return false;
  }
  for (let i = 0; i < prevRoles.length; i++) {
    if (prevRoles[i] !== nextRoles[i]) {
      return false;
    }
  }
  
  return true;
});

const EditableTable = ({
    tableData,
    setTableData,
    isEditing,
    allRoles,
    setAllRoles,
    userRole,
    isManager,
    activePhases,
    handleTogglePhaseActivation,
    periodicScripts,
    setPeriodicScripts,
    currentClockSeconds,
    isClockRunning,
    onRowStatusChange,
    onRunRowScript,
    activeLogins = [],
    projectId,
    userName,
    registerRowMove,
    registerRowDuplicate,
    onProcessNotification }) => {
  
  const [newRole, setNewRole] = useState('');
  const [userInfoModal, setUserInfoModal] = useState({ open: false, row: null, phaseIndex: null, rowIndex: null });
  const [lastProcessedNotificationTimestamp, setLastProcessedNotificationTimestamp] = useState(null);
  const [noUserWarning, setNoUserWarning] = useState({ open: false, role: '' });
  const [periodicScriptsHeight, setPeriodicScriptsHeight] = useState(80); // Default estimate
  const [nextRowHeight, setNextRowHeight] = useState(60); // Default estimate for next row display
  const [tableHeaderHeight, setTableHeaderHeight] = useState(53); // Default estimate
  const [renderedRowCount, setRenderedRowCount] = useState(Infinity); // Progressive rendering - start with all rendered
  const rowRefs = useRef({});
  const tableContainerRef = useRef(null);
  const periodicScriptsRef = useRef(null);
  const nextRowRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const blinkIntervalRef = useRef(null);
  
  // Calculate total row count for progressive rendering
  const totalRowCount = useMemo(() => {
    return tableData.reduce((count, phase) => count + phase.rows.length, 0);
  }, [tableData]);
  
  // Progressive rendering: render rows in batches when entering edit mode
  useEffect(() => {
    if (isEditing) {
      // Render first batch immediately (increased from 50 to 150 for faster initial render)
      const initialBatch = Math.min(150, totalRowCount);
      setRenderedRowCount(initialBatch);
      
      // Render remaining rows progressively in background using requestIdleCallback
      if (totalRowCount > initialBatch) {
        let currentCount = initialBatch;
        const batchSize = 50; // Increased from 25 to 50 for faster completion
        let cancelled = false;
        let timeoutId = null;
        let idleId = null;
        
        const renderNextBatch = () => {
          if (cancelled || currentCount >= totalRowCount) return;
          
          currentCount = Math.min(currentCount + batchSize, totalRowCount);
          setRenderedRowCount(currentCount);
          
          if (currentCount < totalRowCount && !cancelled) {
            // Use requestIdleCallback for next batch, fallback to setTimeout
            const scheduler = window.requestIdleCallback || ((cb) => setTimeout(cb, 8));
            idleId = scheduler(renderNextBatch);
          }
        };
        
        // Start progressive rendering immediately after initial batch
        const scheduler = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
        idleId = scheduler(renderNextBatch);
        
        // Cleanup function to cancel progressive rendering
        return () => {
          cancelled = true;
          if (timeoutId) clearTimeout(timeoutId);
          if (idleId && window.cancelIdleCallback) {
            window.cancelIdleCallback(idleId);
          } else if (idleId) {
            // Fallback: if setTimeout was used, we can't cancel it, but cancelled flag prevents execution
            clearTimeout(idleId);
          }
        };
      } else {
        setRenderedRowCount(totalRowCount);
      }
    } else {
      // Reset to render all when not editing (for display mode - no edit components)
      setRenderedRowCount(Infinity);
    }
  }, [isEditing, totalRowCount]);

  // Clean up rowRefs when rows are removed to prevent memory leaks
  useEffect(() => {
    // Clean up refs for rows that no longer exist
    const currentRowIds = new Set();
    tableData.forEach(phase => {
      phase.rows.forEach(row => {
        currentRowIds.add(row.id);
      });
    });
    
    // Remove refs for rows that were deleted
    Object.keys(rowRefs.current).forEach(rowId => {
      if (!currentRowIds.has(parseInt(rowId))) {
        delete rowRefs.current[rowId];
      }
    });
  }, [tableData]);
  
  const parseTimeToSeconds = useCallback((timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const isNegative = timeStr.startsWith('-');
    const cleanTimeStr = isNegative ? timeStr.substring(1) : timeStr;
    const parts = cleanTimeStr.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return isNegative ? -seconds : seconds;
  }, []);

  // Pre-calculate global row numbers for all rows (memoized)
  const globalRowNumbersMap = useMemo(() => {
    const map = new Map();
    let globalCount = 0;
    tableData.forEach((phase, phaseIndex) => {
      phase.rows.forEach((row, rowIndex) => {
        const key = `${phaseIndex}-${rowIndex}`;
        map.set(key, globalCount + 1);
        globalCount++;
      });
    });
    return map;
  }, [tableData]);

  // Defer expensive computations to keep UI responsive during transitions
  const deferredTableData = useDeferredValue(tableData);
  const deferredActivePhases = useDeferredValue(activePhases);
  const deferredCurrentClockSeconds = useDeferredValue(currentClockSeconds);

  // Pre-calculate parsed time values for all rows (memoized)
  // Use deferredTableData to keep in sync with rowStylesMap
  const parsedTimeMap = useMemo(() => {
    const map = new Map();
    deferredTableData.forEach((phase, phaseIndex) => {
      phase.rows.forEach((row, rowIndex) => {
        const key = `${phaseIndex}-${rowIndex}`;
        map.set(key, parseTimeToSeconds(row.time));
      });
    });
    return map;
  }, [deferredTableData, parseTimeToSeconds]);

  // Pre-calculate row styles for all rows (memoized)
  // Uses deferred values to allow React to prioritize rendering over style calculations
  const rowStylesMap = useMemo(() => {
    const stylesMap = new Map();
    
    deferredTableData.forEach((phase, phaseIndex) => {
      const isPhaseActive = !!deferredActivePhases[phase.phase];
      
      phase.rows.forEach((row, rowIndex) => {
        const key = `${phaseIndex}-${rowIndex}`;
        const rowTimeSeconds = parsedTimeMap.get(key);
        const isUserRoleMatch = row.role === userRole;
        const isStatusUnset = !row.status || row.status === 'N/A';
        
        // Calculate if clock has passed row time
        const hasClockPassedRowTime = Boolean(
          isClockRunning &&
          rowTimeSeconds !== null &&
          deferredCurrentClockSeconds >= rowTimeSeconds
        );
        const shouldHighlightOverdue = isStatusUnset && hasClockPassedRowTime;
        
        // Determine row background color based on status
        let baseColor = 'transparent';
        if (row.status === 'Passed') baseColor = 'rgba(76, 175, 80, 0.2)'; // Light green
        else if (row.status === 'Failed') baseColor = 'rgba(244, 67, 54, 0.2)'; // Light red
        
        // Build styles object
        let styles = {
          backgroundColor: baseColor,
          transition: 'background-color 0.2s ease',
        };

        // Special case: user's row that is overdue - use orange/red to make it very visible
        if (isUserRoleMatch && shouldHighlightOverdue) {
          const overdueUserOverlay = 'rgba(255, 152, 0, 0.6)'; // Stronger orange background
          styles = {
            ...styles,
            backgroundColor: overdueUserOverlay,
            boxShadow: 'inset 0 0 0 4px rgba(255, 87, 34, 1), 0 0 25px rgba(255, 152, 0, 1)',
            borderLeft: '8px solid #ff5722', // Thicker orange-red border
            borderRight: '4px solid rgba(255, 87, 34, 0.8)',
            borderTop: '2px solid rgba(255, 152, 0, 0.6)',
            borderBottom: '2px solid rgba(255, 152, 0, 0.6)',
          };
        } else if (isUserRoleMatch) {
          // User's row that is not overdue - blue highlight
          const highlightOverlay = 'rgba(33, 150, 243, 0.18)';
          styles = {
            ...styles,
            backgroundColor: baseColor === 'transparent' ? highlightOverlay : baseColor,
            boxShadow: 'inset 0 0 0 2px rgba(33, 150, 243, 0.55)',
            borderLeft: '4px solid #2196f3',
          };
        } else if (shouldHighlightOverdue) {
          // Overdue row that doesn't belong to user - yellow highlight
          const overdueOverlay = 'rgba(255, 235, 59, 0.4)';
          styles = {
            ...styles,
            backgroundColor: baseColor === 'transparent' ? overdueOverlay : baseColor,
            boxShadow: '0 0 15px rgba(255, 235, 59, 0.7)',
            border: '2px solid rgba(255, 235, 59, 0.9)',
          };
        }
        
        stylesMap.set(key, styles);
      });
    });
    
    return stylesMap;
  }, [deferredTableData, userRole, isManager, isClockRunning, deferredCurrentClockSeconds, deferredActivePhases, parsedTimeMap]);

  // Calculate total rows before current phase for continuous numbering (memoized helper)
  const getGlobalRowNumber = useCallback((phaseIndex, rowIndex) => {
    const key = `${phaseIndex}-${rowIndex}`;
    return globalRowNumbersMap.get(key) || 0;
  }, [globalRowNumbersMap]);
  
  const handleChange = useCallback((phaseIndex, rowIndex, field, newValue) => {
    setTableData(prevData => {
      const newPhases = [...prevData];
      newPhases[phaseIndex] = { ...newPhases[phaseIndex] };
      newPhases[phaseIndex].rows = [...newPhases[phaseIndex].rows];
      newPhases[phaseIndex].rows[rowIndex] = { ...newPhases[phaseIndex].rows[rowIndex], [field]: newValue };
      return newPhases;
    });
  }, []);

  const handleAddRow = useCallback((phaseIndex) => {
    const newRow = { id: Date.now(), role: allRoles[0] || 'Role', time: '00:00:00', duration: '00:00', description: '', status: 'N/A', script: '', scriptResult: undefined };
    setTableData(prevData => {
      const newPhases = [...prevData];
      newPhases[phaseIndex] = { ...newPhases[phaseIndex] };
      newPhases[phaseIndex].rows = [...newPhases[phaseIndex].rows, newRow];
      return newPhases;
    });
  }, [allRoles]);

  const handleRowStatusSelection = useCallback(async (phaseIndex, rowIndex, statusValue) => {
    handleChange(phaseIndex, rowIndex, 'status', statusValue);
    const row = tableData[phaseIndex].rows[rowIndex];
    if (row && typeof onRowStatusChange === 'function') {
      try {
        await onRowStatusChange(row.id, statusValue);
      } catch (error) {
        console.error('Failed to update row status', error);
      }
    }
  }, [handleChange, tableData, onRowStatusChange]);

  const handleRunScript = useCallback(async (phaseIndex, rowIndex) => {
    const row = tableData[phaseIndex].rows[rowIndex];
    if (row?.script && typeof onRunRowScript === 'function') {
      try {
        await onRunRowScript(row.id, row.script);
      } catch (error) {
        console.error('Failed to run script', error);
      }
    }
  }, [tableData, onRunRowScript]);

  const handleRemoveRow = useCallback((phaseIndex, rowIndex) => {
    setTableData(prevData => {
      const newPhases = [...prevData];
      newPhases[phaseIndex] = { ...newPhases[phaseIndex] };
      newPhases[phaseIndex].rows = newPhases[phaseIndex].rows.filter((_, idx) => idx !== rowIndex);
      return newPhases;
    });
  }, []);

  // Track rows that were moved/duplicated to prevent index change notifications
  const movedDuplicatedRowsRef = useRef(new Set());

  const handleDuplicateRow = useCallback((phaseIndex, rowIndex) => {
    const row = tableData[phaseIndex].rows[rowIndex];
    if (!row) return;

    const newRowId = Date.now();
    const duplicatedRow = {
      ...row,
      id: newRowId, // New temporary ID
      scriptResult: undefined // Reset script result
    };

    const targetPosition = rowIndex + 1;
    const phaseNumber = tableData[phaseIndex].phase;
    

    if (isManager) {
      // Manager: directly update state
      setTableData(prevData => {
        const newPhases = [...prevData];
        newPhases[phaseIndex] = { ...newPhases[phaseIndex] };
        const newRows = [...newPhases[phaseIndex].rows];
        newRows.splice(targetPosition, 0, duplicatedRow); // Insert after original
        newPhases[phaseIndex].rows = newRows;
        return newPhases;
      });
    } else {
      // Non-manager: register operation and update state
      if (registerRowDuplicate) {
        registerRowDuplicate(row.id, newRowId, phaseNumber, targetPosition);
      }
      
      setTableData(prevData => {
        const newPhases = [...prevData];
        newPhases[phaseIndex] = { ...newPhases[phaseIndex] };
        const newRows = [...newPhases[phaseIndex].rows];
        newRows.splice(targetPosition, 0, duplicatedRow);
        newPhases[phaseIndex].rows = newRows;
        return newPhases;
      });
    }
  }, [tableData, isManager, registerRowDuplicate]);

  const handleMoveRow = useCallback((sourcePhaseIndex, sourceRowIndex, targetPhaseIndex, targetRowIndex) => {
    if (sourcePhaseIndex === targetPhaseIndex && sourceRowIndex === targetRowIndex) {
      return; // Same position, no move needed
    }

    const sourceRow = tableData[sourcePhaseIndex].rows[sourceRowIndex];
    if (!sourceRow) return;

    const sourcePhaseNumber = tableData[sourcePhaseIndex].phase;
    const targetPhaseNumber = tableData[targetPhaseIndex].phase;
    
    // Calculate the actual final position (1-based) for display
    // After moving, the row will be at targetRowIndex (0-based), which is targetRowIndex + 1 (1-based)
    const finalPosition = targetRowIndex + 1;
    

    if (isManager) {
      // Manager: directly update state
      setTableData(prevData => {
        const newPhases = [...prevData];
        
        // Remove from source
        newPhases[sourcePhaseIndex] = { ...newPhases[sourcePhaseIndex] };
        const sourceRows = [...newPhases[sourcePhaseIndex].rows];
        const [movedRow] = sourceRows.splice(sourceRowIndex, 1);
        newPhases[sourcePhaseIndex].rows = sourceRows;
        
        // Add to target
        newPhases[targetPhaseIndex] = { ...newPhases[targetPhaseIndex] };
        const targetRows = [...newPhases[targetPhaseIndex].rows];
        targetRows.splice(targetRowIndex, 0, movedRow);
        newPhases[targetPhaseIndex].rows = targetRows;
        
        return newPhases;
      });
    } else {
      // Non-manager: register operation and update state
      if (registerRowMove) {
        // Pass sourceRowIndex for calculating source position in description
        registerRowMove(sourceRow.id, sourcePhaseNumber, targetPhaseNumber, targetRowIndex, sourceRowIndex);
      }
      
      setTableData(prevData => {
        const newPhases = [...prevData];
        
        // Remove from source
        newPhases[sourcePhaseIndex] = { ...newPhases[sourcePhaseIndex] };
        const sourceRows = [...newPhases[sourcePhaseIndex].rows];
        const [movedRow] = sourceRows.splice(sourceRowIndex, 1);
        newPhases[sourcePhaseIndex].rows = sourceRows;
        
        // Add to target
        newPhases[targetPhaseIndex] = { ...newPhases[targetPhaseIndex] };
        const targetRows = [...newPhases[targetPhaseIndex].rows];
        targetRows.splice(targetRowIndex, 0, movedRow);
        newPhases[targetPhaseIndex].rows = targetRows;
        
        return newPhases;
      });
    }
  }, [tableData, isManager, registerRowMove]);
  
  const handleAddNewRole = useCallback(() => {
    if (newRole && !allRoles.includes(newRole)) {
      setAllRoles(prev => [...prev, newRole]);
      setNewRole('');
    }
  }, [newRole, allRoles]);

  const handleAddPhase = useCallback(() => {
    setTableData(prevData => {
      const newPhaseNumber = prevData.length > 0 
          ? Math.max(...prevData.map(p => p.phase)) + 1 
          : 1;
      const newPhase = {
          phase: newPhaseNumber,
          rows: [] // Start with no rows
      };
      return [...prevData, newPhase];
    });
  }, []);

  const handleRemovePhase = useCallback((phaseIndex) => {
    setTableData(prevData => prevData.filter((_, idx) => idx !== phaseIndex));
  }, []);

  const handleAddPeriodicScript = useCallback(() => {
    const newScript = { id: Date.now(), name: 'New Script', path: '', status: false };
    setPeriodicScripts(prev => [...prev, newScript]);
  }, []);

  const handleUpdatePeriodicScript = useCallback((scriptId, field, value) => {
    setPeriodicScripts(prev => prev.map(script =>
      script.id === scriptId ? { ...script, [field]: value } : script
    ));
  }, []);

  const handleRemovePeriodicScript = useCallback((scriptId) => {
    setPeriodicScripts(prev => prev.filter(script => script.id !== scriptId));
  }, []);

  const handleResetAllStatuses = useCallback(async () => {
    // Confirmation: Reset all statuses
    const confirmed = window.confirm('האם אתה בטוח שברצונך לאפס את כל הסטטוסים ל-N/A? פעולה זו לא ניתנת לביטול.');
    if (!confirmed) {
      return;
    }
    
    try {
      // Call the API endpoint
      await api.resetAllStatuses(projectId, userName, userRole);
      
      // Update local state
      setTableData(prevData => {
        return prevData.map(phase => ({
          ...phase,
          rows: phase.rows.map(row => ({ ...row, status: 'N/A' }))
        }));
      });
    } catch (error) {
      console.error('Failed to reset statuses', error);
      alert('שגיאה באיפוס הסטטוסים: ' + (error.message || 'Unknown error'));
    }
  }, [projectId, userName, userRole, setTableData]);

  const handleOpenUserInfoModal = useCallback(async (row, phaseIndex, rowIndex) => {
    if (isManager) {
      // Check if there's an active user logged in for this role
      const hasActiveUser = activeLogins.some(login => login.role === row.role);
      
      if (!hasActiveUser) {
        // Show warning that no user is logged in for this role
        setNoUserWarning({ open: true, role: row.role });
        return;
      }
      
      // Manager sends notification to the user with that role
      try {
        await api.createUserNotification(projectId, row.role, 'show_modal', {
          rowId: row.id,
          phaseIndex,
          rowIndex,
          role: row.role,
          time: row.time,
          description: row.description,
          globalRowNumber: getGlobalRowNumber(phaseIndex, rowIndex)
        });
      } catch (error) {
        console.error('Failed to send notification to user', error);
      }
    } else {
      // Regular user opens modal locally
      setUserInfoModal({ open: true, row, phaseIndex, rowIndex });
    }
  }, [isManager, activeLogins, projectId, getGlobalRowNumber]);

  const handleCloseUserInfoModal = useCallback(() => {
    setUserInfoModal({ open: false, row: null, phaseIndex: null, rowIndex: null });
  }, []);

  const handleJumpToRow = useCallback((targetPhaseIndex, targetRowIndex) => {
    handleCloseUserInfoModal();
    
    // Clear any existing blink interval to prevent multiple intervals
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
    
    const rowId = tableData[targetPhaseIndex]?.rows[targetRowIndex]?.id;
    if (rowId && rowRefs.current[rowId] && tableContainerRef.current) {
      const rowElement = rowRefs.current[rowId];
      const containerElement = tableContainerRef.current;
      
      // Calculate the position of the row relative to the container
      const containerRect = containerElement.getBoundingClientRect();
      const rowRect = rowElement.getBoundingClientRect();
      
      // Calculate scroll position to center the row in the container
      const scrollTop = containerElement.scrollTop;
      const rowOffsetTop = rowElement.offsetTop;
      const containerHeight = containerElement.clientHeight;
      const rowHeight = rowElement.offsetHeight;
      
      // Scroll to center the row in the visible area
      const targetScrollTop = rowOffsetTop - (containerHeight / 2) + (rowHeight / 2);
      
      containerElement.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
      
      // Highlight the row with green blinking for 3 seconds
      const originalBg = rowElement.style.backgroundColor;
      let isHighlighted = true;
      blinkIntervalRef.current = setInterval(() => {
        if (isHighlighted) {
          rowElement.style.backgroundColor = 'rgba(76, 175, 80, 0.6)'; // Green
        } else {
          rowElement.style.backgroundColor = originalBg;
        }
        isHighlighted = !isHighlighted;
      }, 300); // Blink every 300ms
      
      setTimeout(() => {
        if (blinkIntervalRef.current) {
          clearInterval(blinkIntervalRef.current);
          blinkIntervalRef.current = null;
        }
        rowElement.style.backgroundColor = originalBg;
      }, 3000); // Stop after 3 seconds
    }
  }, [handleCloseUserInfoModal, tableData]);

  // Find the next relevant row with N/A status (memoized)
  const nextRelevantRow = useMemo(() => {
    for (let phaseIndex = 0; phaseIndex < tableData.length; phaseIndex++) {
      const phase = tableData[phaseIndex];
      for (let rowIndex = 0; rowIndex < phase.rows.length; rowIndex++) {
        const row = phase.rows[rowIndex];
        const isStatusNA = !row.status || row.status === 'N/A';
        
        if (isStatusNA) {
          // Manager sees any N/A row, users only see their role's N/A rows
          if (isManager || row.role === userRole) {
            return {
              row,
              phaseIndex,
              rowIndex,
              globalRowNumber: getGlobalRowNumber(phaseIndex, rowIndex)
            };
          }
        }
      }
    }
    return null;
  }, [tableData, isManager, userRole, getGlobalRowNumber]);

  // Process notification command (for non-manager users)
  // Use functional state update to avoid tableData dependency
  const processNotification = useCallback((command, notificationData) => {
    if (!command || !notificationData) return;
    
    if (command === 'show_modal') {
      // Find the row in tableData using functional state update
      const targetPhaseIndex = notificationData.phaseIndex;
      const targetRowIndex = notificationData.rowIndex;
      
      if (targetPhaseIndex !== undefined && targetRowIndex !== undefined) {
        // Use functional update to access current tableData without dependency
        setTableData(currentData => {
          const phase = currentData[targetPhaseIndex];
          if (phase && phase.rows[targetRowIndex]) {
            const row = phase.rows[targetRowIndex];
            setUserInfoModal({ 
              open: true, 
              row, 
              phaseIndex: targetPhaseIndex, 
              rowIndex: targetRowIndex 
            });
          }
          return currentData; // Return unchanged data
        });
      }
    }
  }, []); // No dependencies - uses functional state update

  // Expose processNotification to parent via callback prop
  useEffect(() => {
    if (onProcessNotification) {
      onProcessNotification(processNotification);
    }
  }, [processNotification, onProcessNotification]);

  // Cleanup blink interval on unmount
  useEffect(() => {
    return () => {
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
        blinkIntervalRef.current = null;
      }
    };
  }, []);

  // Measure periodic scripts height for sticky positioning
  useEffect(() => {
    if (periodicScriptsRef.current) {
      const updateHeight = () => {
        const height = periodicScriptsRef.current?.offsetHeight || 80;
        setPeriodicScriptsHeight(height);
      };
      
      // Defer measurement when entering edit mode to avoid blocking
      if (isEditing) {
        const timeoutId = setTimeout(updateHeight, 0);
        const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        const idleId = idleCallback(updateHeight);
        
        // Update on window resize
        window.addEventListener('resize', updateHeight);
        return () => {
          clearTimeout(timeoutId);
          if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
          window.removeEventListener('resize', updateHeight);
        };
      } else {
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
      }
    }
  }, [periodicScripts, isEditing, isManager]);

  // Measure next row height for sticky positioning
  useEffect(() => {
    if (nextRelevantRow && nextRowRef.current) {
      const updateHeight = () => {
        const height = nextRowRef.current?.offsetHeight || 60;
        setNextRowHeight(height);
      };
      
      // Defer measurement when entering edit mode
      if (isEditing) {
        const timeoutId = setTimeout(updateHeight, 0);
        const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        const idleId = idleCallback(updateHeight);
        
        window.addEventListener('resize', updateHeight);
        return () => {
          clearTimeout(timeoutId);
          if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
          window.removeEventListener('resize', updateHeight);
        };
      } else {
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
      }
    } else if (!nextRelevantRow) {
      // No next row, set height to 0
      setNextRowHeight(0);
    }
  }, [nextRelevantRow, isEditing]);

  // Measure table header height for sticky positioning
  useEffect(() => {
    if (tableHeaderRef.current) {
      const updateHeight = () => {
        const height = tableHeaderRef.current?.offsetHeight || 53;
        setTableHeaderHeight(height);
      };
      
      // Defer measurement when entering edit mode to avoid blocking
      if (isEditing) {
        // Use requestIdleCallback if available, otherwise use setTimeout with requestAnimationFrame
        const idleCallback = window.requestIdleCallback || ((cb) => {
          requestAnimationFrame(() => setTimeout(cb, 0));
        });
        const idleId = idleCallback(updateHeight);
        
        // Also check after a delay to catch any late rendering
        const timeoutId = setTimeout(updateHeight, 150);
        
        window.addEventListener('resize', updateHeight);
        return () => {
          if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
          clearTimeout(timeoutId);
          window.removeEventListener('resize', updateHeight);
        };
      } else {
        // Immediate update when not editing
        const rafId = requestAnimationFrame(updateHeight);
        window.addEventListener('resize', updateHeight);
        return () => {
          cancelAnimationFrame(rafId);
          window.removeEventListener('resize', updateHeight);
        };
      }
    }
  }, [isEditing, tableData]);

  return (
      <TableContainer 
        ref={tableContainerRef}
        component={Paper} 
        style={{ maxHeight: 'calc(100vh - 150px)', overflow: 'auto', margin: '20px 0', direction: 'rtl', position: 'relative' }}
      >
      
        {/* Periodic Scripts Row - Sticky */}
        <div 
          ref={periodicScriptsRef}
          style={{ 
          padding: '15px', 
          borderBottom: '2px solid #444', 
          backgroundColor: '#1e1e1e', 
          direction: 'rtl',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
            {periodicScripts.map((script) => (
              <div
                key={script.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 100
                }}
              >
                {isEditing && isManager ? (
                  <>
                    <TextField
                      value={script.name}
                      onChange={(e) => handleUpdatePeriodicScript(script.id, 'name', e.target.value)}
                      size="small"
                      placeholder="שם סקריפט"
                      style={{ width: 120 }}
                      sx={{
                        direction: 'rtl',
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: '#2d2d2d',
                          color: 'white',
                          '& fieldset': {
                            borderColor: '#555',
                          },
                          '&:hover fieldset': {
                            borderColor: '#777',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#999',
                          },
                        },
                        '& .MuiInputBase-input': {
                          textAlign: 'right',
                        },
                        '& .MuiInputBase-input::placeholder': {
                          color: '#aaa',
                          opacity: 1,
                        },
                      }}
                    />
                    <TextField
                      value={script.path}
                      onChange={(e) => handleUpdatePeriodicScript(script.id, 'path', e.target.value)}
                      size="small"
                      placeholder="נתיב סקריפט"
                      style={{ width: 200 }}
                      sx={{
                        direction: 'rtl',
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: '#2d2d2d',
                          color: 'white',
                          '& fieldset': {
                            borderColor: '#555',
                          },
                          '&:hover fieldset': {
                            borderColor: '#777',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#999',
                          },
                        },
                        '& .MuiInputBase-input': {
                          textAlign: 'right',
                        },
                        '& .MuiInputBase-input::placeholder': {
                          color: '#aaa',
                          opacity: 1,
                        },
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: '50%',
                          backgroundColor: script.status ? '#4caf50' : '#f44336',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: 12,
                          textAlign: 'center',
                          padding: 5,
                          boxSizing: 'border-box'
                        }}
                        title={script.path || 'No path set'}
                      >
                        {script.name || 'Unnamed'}
                      </div>
                      <IconButton
                        onClick={() => handleRemovePeriodicScript(script.id)}
                        size="small"
                        color="error"
                        title="הסר סקריפט"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      backgroundColor: script.status ? '#4caf50' : '#f44336',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: 12,
                      textAlign: 'center',
                      padding: 5,
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}
                    title={`${script.name}${script.path ? `\nPath: ${script.path}` : '\nNo path set'}\nStatus: ${script.status ? 'True' : 'False'}`}
                  >
                    {script.name || 'Unnamed'}
                  </div>
                )}
              </div>
            ))}
            {isEditing && isManager && (
              <IconButton
                onClick={handleAddPeriodicScript}
                size="small"
                color="primary"
                title="הוסף סקריפט תקופתי"
                style={{ marginRight: 10 }}
              >
                <AddIcon />
              </IconButton>
            )}
          </div>
        </div>

        {/* Next Relevant Row Display - Sticky */}
        {nextRelevantRow && (
          <div 
            ref={nextRowRef}
            style={{ 
              padding: '10px 15px', 
              borderBottom: '2px solid #2196f3', 
              backgroundColor: '#0d47a1', 
              direction: 'rtl',
              position: 'sticky',
              top: `${periodicScriptsHeight}px`,
              zIndex: 9,
              display: 'flex',
              alignItems: 'center',
              gap: 15,
              color: 'white',
              fontSize: '1rem'
            }}
          >
            <Typography variant="body1" style={{ fontWeight: 'bold', minWidth: '120px' }}>
              משימה הבאה:
            </Typography>
            <Typography variant="body1" style={{ minWidth: '80px' }}>
              <strong>שורה #{nextRelevantRow.globalRowNumber}</strong>
            </Typography>
            <Typography variant="body1" style={{ minWidth: '100px' }}>
              <strong>תפקיד:</strong> {nextRelevantRow.row.role}
            </Typography>
            <Typography variant="body1" style={{ minWidth: '120px' }}>
              <strong>זמן:</strong> {nextRelevantRow.row.time}
            </Typography>
            <Typography variant="body1" style={{ flex: 1 }}>
              <strong>תיאור:</strong> {nextRelevantRow.row.description || 'אין תיאור'}
            </Typography>
            <Button
              variant="contained"
              color="success"
              size="small"
              onClick={() => handleJumpToRow(nextRelevantRow.phaseIndex, nextRelevantRow.rowIndex)}
              style={{ marginRight: 'auto' }}
            >
              קפוץ לשורה
            </Button>
          </div>
        )}
      
        {/* Manager Controls Area */}
        {isEditing && (
          <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 15, borderBottom: '1px solid #ccc', direction: 'rtl', flexWrap: 'wrap' }}>
          
            {/* Add New Role controls */}
            <TextField
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="שם תפקיד חדש"
              size="small"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddNewRole();
                }
              }}
              sx={{
                direction: 'rtl',
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#2d2d2d',
                  color: 'white',
                  '& fieldset': {
                    borderColor: '#555',
                  },
                  '&:hover fieldset': {
                    borderColor: '#777',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#999',
                  },
                },
                '& .MuiInputBase-input': {
                  textAlign: 'right',
                  fontSize: '1rem'
                },
                '& .MuiInputBase-input::placeholder': {
                  color: '#aaa',
                  opacity: 1,
                },
              }}
            />
            <Button variant="contained" onClick={handleAddNewRole} style={{ direction: 'rtl' }}>
              הוסף תפקיד חדש
            </Button>
          
            {/* Add New Phase Button */}
            <Button variant="contained" color="secondary" onClick={handleAddPhase} style={{ direction: 'rtl' }}>
              הוסף שלב חדש
            </Button>

            {/* Reset All Statuses Button */}
            {isManager && (
              <Button 
                variant="outlined" 
                color="warning" 
                onClick={handleResetAllStatuses}
                style={{ direction: 'rtl' }}
              >
                אפס כל הסטטוסים ל-N/A
              </Button>
            )}

          </div>
        )}

      <Table stickyHeader size="small" sx={{ 
        '& .MuiTableCell-root': { fontSize: '1rem' }, 
        '& .MuiTableHead-root': { 
          position: 'sticky', 
          top: `${periodicScriptsHeight + nextRowHeight}px`, 
          zIndex: 8 
        } 
      }}>
        <TableHead>
          <TableRow ref={tableHeaderRef}>
            {isEditing && <TableCell style={{ width: '3%', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}></TableCell>}
            <TableCell style={{ width: '5%', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>#</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>תפקיד</TableCell>
            <TableCell style={{ width: '15%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>זמן</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>משך</TableCell>
            <TableCell style={{ width: '35%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>תיאור</TableCell>
            <TableCell style={{ width: '15%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>סקריפט</TableCell>
            <TableCell style={{ width: '10%', textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>סטטוס</TableCell>
            {isEditing && <TableCell style={{ width: '5%', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#1e1e1e', position: 'sticky', top: `${periodicScriptsHeight + nextRowHeight}px`, zIndex: 8 }}>פעולות</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Data Rows */}
          {tableData.map((phase, phaseIndex) => {
            const isPhaseActive = !!activePhases[phase.phase];  
            
            return (
                <React.Fragment key={phase.phase}>
                {/* Phase Header Row */}
                <TableRow style={{ backgroundColor: '#1e1e1e' }}>
                  <TableCell colSpan={isEditing ? 9 : 7} style={{ 
                      fontWeight: 'bold', 
                      backgroundColor: '#1e1e1e',
                      textAlign: 'right',
                      fontSize: '1.1rem',
                      position: 'sticky',
                      top: `${periodicScriptsHeight + nextRowHeight + tableHeaderHeight}px`, // Below periodic scripts + next row + table header height
                      zIndex: 7
                  }}>
                    שלב {phase.phase}
                    {/* Phase Activation Toggle */}
                    {isManager && (
                        <IconButton 
                            onClick={() => handleTogglePhaseActivation(phase)} 
                            size="small" 
                            color={isPhaseActive ? 'success' : 'secondary'}
                            title={isPhaseActive ? "פעל שלב" : "השבת שלב"}
                        >
                            {isPhaseActive ? <ToggleOnIcon /> : <ToggleOffIcon />}
                        </IconButton>
                    )}
                    {isPhaseActive && <span style={{ marginRight: 8, color: 'lightgreen' }}>(פעיל)</span>}

                    {isEditing && (
                      <>
                        {/* Button to ADD Row */}
                        <IconButton onClick={() => handleAddRow(phaseIndex)} size="small" color="primary" title="הוסף שורה">
                          <AddIcon />
                        </IconButton>
                        
                        {/* Button to DELETE Phase */} 
                        <IconButton onClick={() => handleRemovePhase(phaseIndex)} size="small" color="secondary" title="מחק שלב">
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>

              {/* Data Rows */}
              {phase.rows.map((row, rowIndex) => {
                // Progressive rendering: calculate global row index
                let globalRowIndex = 0;
                for (let pIdx = 0; pIdx < phaseIndex; pIdx++) {
                  globalRowIndex += tableData[pIdx].rows.length;
                }
                globalRowIndex += rowIndex;
                
                // Skip rendering if beyond progressive render count (only in edit mode)
                if (isEditing && globalRowIndex >= renderedRowCount) {
                  // Render placeholder row to maintain layout
                  return (
                    <TableRow key={`placeholder-${row.id}`} style={{ height: 53 }}>
                      <TableCell colSpan={8} style={{ textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                        טוען...
                      </TableCell>
                    </TableRow>
                  );
                }
                
                // --- ACCESS CONTROL LOGIC---
                const isUserRoleMatch = row.role === userRole;
                const canChangeStatus = isPhaseActive && (isUserRoleMatch || isManager);
                
                // Use memoized parsed time and styles instead of recalculating
                const key = `${phaseIndex}-${rowIndex}`;
                const rowTimeSeconds = parsedTimeMap.get(key);
                const rowStyles = rowStylesMap.get(key) || { backgroundColor: 'transparent', transition: 'background-color 0.2s ease' };
                
                const globalRowNumber = getGlobalRowNumber(phaseIndex, rowIndex);
                
                return (
                  <TableRowComponent
                    key={row.id}
                    row={row}
                    phaseIndex={phaseIndex}
                    rowIndex={rowIndex}
                    globalRowNumber={globalRowNumber}
                    rowTimeSeconds={rowTimeSeconds}
                    rowStyles={rowStyles}
                    isEditing={isEditing}
                    isUserRoleMatch={isUserRoleMatch}
                    canChangeStatus={canChangeStatus}
                    allRoles={allRoles}
                    handleChange={handleChange}
                    handleRunScript={handleRunScript}
                    handleRowStatusSelection={handleRowStatusSelection}
                    handleOpenUserInfoModal={handleOpenUserInfoModal}
                    handleRemoveRow={handleRemoveRow}
                    handleDuplicateRow={handleDuplicateRow}
                    handleMoveRow={handleMoveRow}
                    isManager={isManager}
                    rowRefs={rowRefs}
                    tableData={tableData}
                  />
                );
              })}
            </React.Fragment>
          )})}
        </TableBody>
      </Table>

      {/* User Info Modal */}
      <Dialog 
        open={userInfoModal.open} 
        onClose={handleCloseUserInfoModal}
        maxWidth="sm"
        fullWidth
        dir="rtl"
      >
        <DialogTitle>
          התראה: שורה #{getGlobalRowNumber(userInfoModal.phaseIndex || 0, userInfoModal.rowIndex || 0)}
        </DialogTitle>
        <DialogContent>
          {userInfoModal.row && (
            <div style={{ direction: 'rtl' }}>
              <Typography variant="body1" style={{ marginBottom: 10 }}>
                <strong>תפקיד:</strong> {userInfoModal.row.role}
              </Typography>
              <Typography variant="body1" style={{ marginBottom: 10 }}>
                <strong>זמן:</strong> {userInfoModal.row.time}
              </Typography>
              <Typography variant="body1" style={{ marginBottom: 20 }}>
                <strong>תיאור:</strong> {userInfoModal.row.description || 'אין תיאור'}
              </Typography>
              
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => {
                  // Jump to the row
                  if (userInfoModal.phaseIndex !== null && userInfoModal.rowIndex !== null) {
                    handleJumpToRow(userInfoModal.phaseIndex, userInfoModal.rowIndex);
                  }
                }}
                style={{ marginTop: 10 }}
              >
                קפוץ לשורה
              </Button>
            </div>
          )}
        </DialogContent>
        <DialogActions style={{ direction: 'rtl' }}>
          <Button onClick={handleCloseUserInfoModal}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* No User Warning Dialog */}
      <Dialog 
        open={noUserWarning.open} 
        onClose={() => setNoUserWarning({ open: false, role: '' })}
        maxWidth="sm"
        fullWidth
        dir="rtl"
      >
        <DialogTitle>אזהרה</DialogTitle>
        <DialogContent>
          <Alert severity="warning" style={{ direction: 'rtl', marginBottom: 10 }}>
            אין משתמש מחובר לתפקיד "{noUserWarning.role}" כרגע.
            <br />
            לא ניתן לשלוח התראה למשתמש שאינו מחובר.
          </Alert>
        </DialogContent>
        <DialogActions style={{ direction: 'rtl' }}>
          <Button onClick={() => setNoUserWarning({ open: false, role: '' })}>אישור</Button>
        </DialogActions>
      </Dialog>
    </TableContainer>
  );
};

export default EditableTable;
