# backend/action_logger.py

from module import db, ActionLog
from datetime import datetime
import json


class ActionLogger:
    """Class for logging user actions to the database"""
    
    @staticmethod
    def log_row_status_change(project_id, user_name, user_role, row_id, old_status, new_status):
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
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging row status change: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_script_execution(project_id, user_name, user_role, row_id, script_path, result):
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
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging script execution: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_phase_activation(project_id, user_name, user_role, phase_id, phase_number, is_active):
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
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging phase activation: {e}')
            db.session.rollback()
    
    @staticmethod
    def log_reset_statuses(project_id, user_name, user_role, rows_count):
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
                timestamp=datetime.utcnow()
            )
            
            db.session.add(action_log)
            db.session.commit()
        except Exception as e:
            # Log error but don't break main functionality
            print(f'Error logging reset statuses: {e}')
            db.session.rollback()

