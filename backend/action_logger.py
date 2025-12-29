# backend/action_logger.py

from module import db, ActionLog
from datetime import datetime
import json


class ActionLogger:
    """Class for logging user actions to the database"""
    
    @staticmethod
    def log_row_status_change(project_id, user_name, user_role, row_id, old_status, new_status, reset_epoch):
        """Log a row status change action"""
        try:
            action_details = {
                'old_status': old_status,
                'new_status': new_status,
                'row_id': row_id
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='row_status_change',
                action_details=json.dumps(action_details),
                row_id=row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging row status change: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_script_execution(project_id, user_name, user_role, row_id, script_path, result, reset_epoch):
        """Log a script execution action"""
        try:
            action_details = {
                'script_path': script_path,
                'row_id': row_id
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='script_execution',
                action_details=json.dumps(action_details),
                script_result=result,
                row_id=row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging script execution: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_phase_activation(project_id, user_name, user_role, phase_id, phase_number, is_active, reset_epoch):
        """Log a phase activation/deactivation action"""
        try:
            action_details = {
                'phase_number': phase_number,
                'is_active': is_active
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='phase_activation',
                action_details=json.dumps(action_details),
                phase_id=phase_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging phase activation: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_reset_statuses(project_id, user_name, user_role, rows_count, reset_epoch):
        """Log a reset all statuses action"""
        try:
            action_details = {
                'rows_count': rows_count,
                'new_status': 'N/A'
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='reset_statuses',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging reset statuses: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_row_edit(project_id, user_name, user_role, row_id, phase_number, old_data=None, new_data=None, reset_epoch=0):
        """Log a row field edit (role, time, duration, description, script changes)
        
        Args:
            project_id: Project ID
            user_name: User name
            user_role: User role
            row_id: Row ID
            phase_number: Phase number
            old_data: Dict of old field values (only changed fields)
            new_data: Dict of new field values (only changed fields)
            reset_epoch: Reset epoch number
        """
        try:
            action_details = {
                'row_id': row_id,
                'phase_number': phase_number
            }
            
            # Add old_data and new_data if provided
            if old_data is not None:
                action_details['old_data'] = old_data
            if new_data is not None:
                action_details['new_data'] = new_data
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='row_edit',
                action_details=json.dumps(action_details),
                row_id=row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging row edit: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_row_add(project_id, user_name, user_role, row_id, phase_number, reset_epoch, row_data=None, row_position_at_action=None):
        """Log a row creation
        
        Args:
            project_id: Project ID
            user_name: User name
            user_role: User role
            row_id: Row ID
            phase_number: Phase number
            reset_epoch: Reset epoch number
            row_data: Optional dict with row content (role, time, duration, description, script)
            row_position_at_action: The 1-based row number at the time of the action (for consistent display)
        """
        try:
            action_details = {
                'row_id': row_id,
                'phase_number': phase_number
            }
            
            # Store row position at action time for consistent display
            if row_position_at_action is not None:
                action_details['row_position_at_action'] = row_position_at_action
            
            # Add row content if provided
            if row_data:
                action_details['row_data'] = {
                    'role': row_data.get('role', ''),
                    'time': row_data.get('time', ''),
                    'duration': row_data.get('duration', ''),
                    'description': row_data.get('description', ''),
                    'script': row_data.get('script', '')
                }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='row_add',
                action_details=json.dumps(action_details),
                row_id=row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging row add: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_row_delete(project_id, user_name, user_role, row_id, phase_number, reset_epoch, row_data=None, row_position_at_action=None):
        """Log a row deletion
        
        Args:
            project_id: Project ID
            user_name: User name
            user_role: User role
            row_id: Row ID
            phase_number: Phase number
            reset_epoch: Reset epoch number
            row_data: Optional dict with row content (role, time, duration, description, script)
            row_position_at_action: The 1-based row number at the time of the action (for consistent display)
        """
        try:
            action_details = {
                'row_id': row_id,
                'phase_number': phase_number
            }
            
            # Store row position at action time for consistent display
            if row_position_at_action is not None:
                action_details['row_position_at_action'] = row_position_at_action
            
            # Add row content if provided
            if row_data:
                action_details['row_data'] = {
                    'role': row_data.get('role', ''),
                    'time': row_data.get('time', ''),
                    'duration': row_data.get('duration', ''),
                    'description': row_data.get('description', ''),
                    'script': row_data.get('script', '')
                }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='row_delete',
                action_details=json.dumps(action_details),
                row_id=row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging row delete: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_row_duplicate(project_id, user_name, user_role, source_row_id, new_row_id, phase_number, reset_epoch):
        """Log a row duplication"""
        try:
            action_details = {
                'source_row_id': source_row_id,
                'new_row_id': new_row_id,
                'phase_number': phase_number
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='row_duplicate',
                action_details=json.dumps(action_details),
                row_id=new_row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging row duplicate: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_row_move(project_id, user_name, user_role, row_id, source_phase, target_phase, old_index=None, new_index=None, row_position_at_move=None, reset_epoch=0):
        """Log a row move/reorder
        
        Args:
            project_id: Project ID
            user_name: User name
            user_role: User role
            row_id: Row ID (new row ID after move)
            source_phase: Source phase number
            target_phase: Target phase number
            old_index: Old position index (0-based, optional)
            new_index: New position index (0-based, optional)
            row_position_at_move: Row's position number at time of move (1-based, for display)
            reset_epoch: Reset epoch number
        """
        try:
            action_details = {
                'row_id': row_id,
                'source_phase': source_phase,
                'target_phase': target_phase
            }
            
            # Add index information if provided
            if old_index is not None:
                action_details['old_index'] = old_index
            if new_index is not None:
                action_details['new_index'] = new_index
            # Store row position at time of move for PDF display (since row IDs change on recreation)
            if row_position_at_move is not None:
                action_details['row_position'] = row_position_at_move
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='row_move',
                action_details=json.dumps(action_details),
                row_id=row_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging row move: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_phase_add(project_id, user_name, user_role, phase_id, phase_number, reset_epoch):
        """Log a phase creation"""
        try:
            action_details = {
                'phase_number': phase_number
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='phase_add',
                action_details=json.dumps(action_details),
                phase_id=phase_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging phase add: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_phase_delete(project_id, user_name, user_role, phase_id, phase_number, reset_epoch):
        """Log a phase deletion"""
        try:
            action_details = {
                'phase_number': phase_number
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='phase_delete',
                action_details=json.dumps(action_details),
                phase_id=phase_id,
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging phase delete: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_version_update(project_id, user_name, user_role, old_version, new_version, reset_epoch):
        """Log a version change"""
        try:
            action_details = {
                'old_version': old_version,
                'new_version': new_version
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='version_update',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging version update: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_role_add(project_id, user_name, user_role, role_name, reset_epoch):
        """Log a role addition"""
        try:
            action_details = {
                'role_name': role_name
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='role_add',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging role add: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_role_delete(project_id, user_name, user_role, role_name, reset_epoch):
        """Log a role deletion"""
        try:
            action_details = {
                'role_name': role_name
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='role_delete',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging role delete: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_script_add(project_id, user_name, user_role, script_id, script_name, reset_epoch):
        """Log a periodic script creation"""
        try:
            action_details = {
                'script_id': script_id,
                'script_name': script_name
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='script_add',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging script add: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_script_update(project_id, user_name, user_role, script_id, script_name, reset_epoch):
        """Log a periodic script update"""
        try:
            action_details = {
                'script_id': script_id,
                'script_name': script_name
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='script_update',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging script update: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_script_delete(project_id, user_name, user_role, script_id, script_name, reset_epoch):
        """Log a periodic script deletion"""
        try:
            action_details = {
                'script_id': script_id,
                'script_name': script_name
            }
            
            action_log = ActionLog(
                project_id=project_id,
                user_name=user_name,
                user_role=user_role,
                action_type='script_delete',
                action_details=json.dumps(action_details),
                reset_epoch=reset_epoch,
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            print(f'Error logging script delete: {e}')
            db.session.rollback()

