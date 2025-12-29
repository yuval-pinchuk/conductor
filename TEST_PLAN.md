# Test Plan for Performance Optimizations

This test plan verifies that all performance optimizations have been implemented correctly without breaking existing functionality.

## Changes Implemented

1. ✅ **Fixed hardcoded Socket URL in ProjectChat.jsx** - Uses `API_BASE_URL` instead of hardcoded localhost
2. ✅ **Moved patchRows function outside component** - Prevents function recreation on every render
3. ✅ **Replaced JSON.parse/stringify with efficient deepClone functions** - Better performance and data type handling
   - Created `deepCloneArray` function for periodic scripts
   - Replaced all JSON.parse/stringify calls in MainScreen.js

---

## Test Categories

### 1. Socket URL Fix (ProjectChat.jsx)

#### Test 1.1: Chat Connection in Development
**Steps:**
1. Start the application in development mode (default port 5000)
2. Log in to the application
3. Open the chat (click chat icon in header)
4. Send a message

**Expected Result:**
- Chat connects successfully
- Messages are sent and received
- No console errors related to Socket.IO connection

**Pass Criteria:** ✅ Chat works without errors

---

#### Test 1.2: Chat Connection with Different API URL (If Applicable)
**Steps:**
1. Set environment variable `REACT_APP_API_BASE_URL` to a different URL
2. Restart the application
3. Log in and open chat
4. Send a message

**Expected Result:**
- Chat connects to the configured API URL
- Messages work correctly

**Pass Criteria:** ✅ Chat uses configured API URL

---

### 2. patchRows Function Optimization

#### Test 2.1: Script Execution Result Update
**Steps:**
1. Log in to the application
2. Navigate to a project with rows that have scripts
3. Click the script execution button on a row
4. Wait for script to complete

**Expected Result:**
- Script result indicator (✓ or ✗) appears after execution
- The result updates immediately without page refresh
- No console errors

**Pass Criteria:** ✅ Script results update correctly

---

#### Test 2.2: Multiple Script Executions
**Steps:**
1. Execute scripts on multiple rows in sequence
2. Verify each result updates independently
3. Toggle edit mode on/off (triggers re-renders)
4. Execute another script

**Expected Result:**
- Each row's script result updates independently
- Results persist after edit mode toggle
- No unexpected behavior

**Pass Criteria:** ✅ All script results update correctly

---

#### Test 2.3: Script Execution with Multiple Phases
**Steps:**
1. Navigate to a project with multiple phases
2. Execute a script on a row in Phase 2
3. Verify only that row updates, not rows in other phases

**Expected Result:**
- Only the target row's script result updates
- Other rows remain unchanged
- Phase separation is maintained

**Pass Criteria:** ✅ Only target row updates

---

### 3. Deep Clone Optimization (JSON.parse/stringify Replacement)

#### Test 3.1: Save Operation with Table Data and Scripts
**Steps:**
1. Log in as manager
2. Make edits to table data (change row values, add rows, etc.)
3. Make edits to periodic scripts (enable/disable, modify)
4. Click Save (✓ button)
5. Verify changes are saved
6. Refresh the page
7. Verify changes persist

**Expected Result:**
- Save operation completes successfully
- All changes are persisted to database
- After refresh, all changes are still present
- No console errors

**Pass Criteria:** ✅ Save operations work correctly

---

#### Test 3.2: Cancel Operation After Edits
**Steps:**
1. Log in as manager
2. Make edits to table data and periodic scripts
3. Click Cancel (✗ button)
4. Verify changes are reverted

**Expected Result:**
- All edits are reverted
- Original data is restored
- No data corruption

**Pass Criteria:** ✅ Cancel reverts changes correctly

---

#### Test 3.3: Load Project Data
**Steps:**
1. Log in to application
2. Navigate to a project
3. Verify all data loads correctly:
   - Phases and rows
   - Periodic scripts
   - Roles
   - Active logins

**Expected Result:**
- All data loads correctly
- No missing data
- No console errors
- Original data is properly cloned for comparison

**Pass Criteria:** ✅ All data loads correctly

---

#### Test 3.4: Accept Pending Change (Non-Manager Flow)
**Steps:**
1. Log in as non-manager
2. Make edits and submit pending changes
3. Log in as manager
4. Accept the pending change
5. Verify changes are applied correctly

**Expected Result:**
- Pending change is accepted
- Changes are applied to table data
- Original data is properly cloned after acceptance
- No data loss or corruption

**Pass Criteria:** ✅ Pending changes work correctly

---

#### Test 3.5: Periodic Scripts Data Integrity
**Steps:**
1. Log in as manager
2. Enable/disable periodic scripts
3. Save changes
4. Verify script status persists
5. Make additional changes and save again
6. Verify all changes persist

**Expected Result:**
- Script status changes are saved
- All script properties (name, path, status, last_executed) are preserved
- No data type corruption (booleans remain booleans, dates remain dates)

**Pass Criteria:** ✅ Periodic scripts data integrity maintained

---

### 4. Integration Tests

#### Test 4.1: Full Workflow - Edit and Save
**Steps:**
1. Log in as manager
2. Edit multiple rows (change role, time, duration, description, script)
3. Add new rows
4. Delete rows
5. Move rows between phases
6. Duplicate rows
7. Edit periodic scripts
8. Save all changes
9. Refresh page
10. Verify all changes persisted

**Expected Result:**
- All operations complete successfully
- All changes persist after refresh
- No data corruption or loss
- No console errors

**Pass Criteria:** ✅ Full workflow works correctly

---

#### Test 4.2: Large Dataset Performance
**Steps:**
1. Log in to a project with many rows (50+ rows, 5+ phases)
2. Perform various operations:
   - Edit rows
   - Run scripts
   - Save changes
3. Monitor browser performance (use DevTools Performance tab)

**Expected Result:**
- Operations complete without significant lag
- No memory leaks (memory usage doesn't continuously grow)
- Save operations complete within reasonable time

**Pass Criteria:** ✅ Performance is acceptable for large datasets

---

#### Test 4.3: Rapid Operations
**Steps:**
1. Quickly perform multiple operations:
   - Toggle edit mode multiple times
   - Run scripts rapidly on different rows
   - Save and cancel multiple times
2. Verify application remains stable

**Expected Result:**
- Application remains stable
- No race conditions
- All operations complete correctly
- No console errors

**Pass Criteria:** ✅ Application handles rapid operations correctly

---

### 5. Edge Cases

#### Test 5.1: Empty Data
**Steps:**
1. Create a new project (or use one with no rows)
2. Verify application loads without errors
3. Add a row and save
4. Verify save works

**Expected Result:**
- Application handles empty data gracefully
- No errors when cloning empty arrays
- Operations work correctly after adding data

**Pass Criteria:** ✅ Empty data handled correctly

---

#### Test 5.2: Special Characters in Data
**Steps:**
1. Add rows with special characters:
   - Hebrew text in descriptions
   - Special symbols in scripts
   - Unicode characters
2. Save and verify persistence

**Expected Result:**
- Special characters are preserved correctly
- No encoding issues
- Data displays correctly after save

**Pass Criteria:** ✅ Special characters handled correctly

---

#### Test 5.3: Null/Undefined Values
**Steps:**
1. Verify handling of nullable fields:
   - Script results (can be null)
   - Last executed dates (can be null)
2. Save and verify

**Expected Result:**
- Null values are preserved correctly
- No errors when cloning objects with null values
- Data integrity maintained

**Pass Criteria:** ✅ Null values handled correctly

---

## Performance Verification

### Memory Usage
**Steps:**
1. Open browser DevTools → Memory tab
2. Take heap snapshot
3. Use the application for 10 minutes:
   - Edit rows
   - Save changes
   - Run scripts
   - Toggle edit mode
4. Take another heap snapshot
5. Compare memory usage

**Expected Result:**
- Memory usage doesn't grow continuously
- No memory leaks detected
- Memory is freed when appropriate

**Pass Criteria:** ✅ No memory leaks

---

### Function Reference Stability (patchRows)
**Verification:**
1. Add temporary console.log in applyRowUpdates:
   ```javascript
   console.log('patchRows reference:', patchRows);
   ```
2. Trigger multiple re-renders (toggle edit mode, etc.)
3. Check console - function reference should be stable

**Expected Result:**
- patchRows function reference remains constant
- Function is not recreated on each render

**Pass Criteria:** ✅ Function reference is stable

---

## Regression Tests

Verify that the following existing features still work:

1. ✅ Row editing (role, time, duration, description, script)
2. ✅ Row status changes
3. ✅ Row addition/deletion
4. ✅ Row duplication
5. ✅ Row moving (drag and drop)
6. ✅ Phase activation/deactivation
7. ✅ Periodic script management
8. ✅ Pending changes workflow
9. ✅ Chat functionality
10. ✅ Timer functionality
11. ✅ Action logs
12. ✅ Excel export
13. ✅ PDF download

---

## Test Execution Checklist

- [ ] Test 1.1: Chat Connection in Development
- [ ] Test 1.2: Chat Connection with Different API URL (if applicable)
- [ ] Test 2.1: Script Execution Result Update
- [ ] Test 2.2: Multiple Script Executions
- [ ] Test 2.3: Script Execution with Multiple Phases
- [ ] Test 3.1: Save Operation with Table Data and Scripts
- [ ] Test 3.2: Cancel Operation After Edits
- [ ] Test 3.3: Load Project Data
- [ ] Test 3.4: Accept Pending Change
- [ ] Test 3.5: Periodic Scripts Data Integrity
- [ ] Test 4.1: Full Workflow - Edit and Save
- [ ] Test 4.2: Large Dataset Performance
- [ ] Test 4.3: Rapid Operations
- [ ] Test 5.1: Empty Data
- [ ] Test 5.2: Special Characters in Data
- [ ] Test 5.3: Null/Undefined Values
- [ ] Memory Usage Verification
- [ ] Function Reference Stability Check
- [ ] All Regression Tests

---

## Expected Outcomes

After completing all tests:

1. **Functionality:** All existing features work as before
2. **Performance:** Slight improvement in performance (less function recreation, faster cloning)
3. **Memory:** No memory leaks introduced
4. **Compatibility:** Works in all supported browsers
5. **Data Integrity:** All data operations preserve data correctly

---

## Notes

- All tests should be performed in both Chrome and Firefox (minimum)
- If any test fails, document the issue and investigate
- Performance improvements may be subtle but should be measurable with DevTools
- The deepClone optimization is particularly important for maintaining data type integrity (dates, booleans, nulls)

