# backend/api.py

from flask import Blueprint, request, jsonify, current_app
from module import db, Project, Phase, Row, PeriodicScript, ProjectRole, User, PendingChange, Message, ActionLog
from sqlalchemy import func, text
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta
import json
import uuid
import requests
from action_logger import ActionLogger

api = Blueprint('api', __name__)


def get_socketio():
    """Get socketio instance from Flask app context"""
    try:
        if hasattr(current_app, 'extensions') and 'socketio' in current_app.extensions:
            return current_app.extensions['socketio']
        from main import socketio
        return socketio
    except (ImportError, RuntimeError):
        return None


# ==================== PROJECT ENDPOINTS ====================

@api.route('/api/projects', methods=['GET'])
def get_projects():
    """Get all projects"""
    projects = Project.query.all()
    return jsonify([project.to_dict() for project in projects]), 200


@api.route('/api/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """Get a specific project"""
    project = Project.query.get_or_404(project_id)
    return jsonify(project.to_dict()), 200


@api.route('/api/projects/<int:project_id>/version', methods=['PUT'])
def update_project_version(project_id):
    """Update project version"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    project.version = data.get('version', project.version)
    project.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(project.to_dict()), 200


@api.route('/api/projects/<int:project_id>/clock-command', methods=['POST'])
def create_clock_command(project_id):
    """Create a clock command that will be applied by all clients"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    command = data.get('command')  # 'set_time', 'start', 'stop', 'set_target', 'clear_target'
    command_data = data.get('data', {})
    
    import json
    project.clock_command = command
    project.clock_command_data = json.dumps(command_data) if command_data else None
    project.clock_command_timestamp = datetime.utcnow()
    project.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(project.to_dict()), 200


@api.route('/api/projects/<int:project_id>/clock-command', methods=['GET'])
def get_clock_command(project_id):
    """Get the latest clock command (used by clients to sync)"""
    project = Project.query.get_or_404(project_id)
    return jsonify({
        'command': project.clock_command,
        'data': json.loads(project.clock_command_data) if project.clock_command_data else None,
        'timestamp': project.clock_command_timestamp.isoformat() if project.clock_command_timestamp else None
    }), 200


@api.route('/api/timer/<int:project_id>', methods=['GET'])
def get_timer_state(project_id):
    """Get the current persistent timer state for Socket.IO-based timer"""
    project = Project.query.get_or_404(project_id)
    
    # Calculate current elapsed time if timer is running
    seconds_elapsed = project.timer_initial_offset
    if project.timer_is_running and project.timer_last_start_time:
        elapsed_since_start = int((datetime.utcnow() - project.timer_last_start_time).total_seconds())
        seconds_elapsed += elapsed_since_start
    
    return jsonify({
        'isRunning': project.timer_is_running,
        'lastStartTime': (project.timer_last_start_time.isoformat() + 'Z') if project.timer_last_start_time else None,
        'initialOffset': project.timer_initial_offset,
        'targetDateTime': (project.timer_target_datetime.isoformat() + 'Z') if project.timer_target_datetime else None,
        'secondsElapsed': seconds_elapsed
    }), 200


@api.route('/api/projects/<int:project_id>/clock-command/clear', methods=['POST'])
def clear_clock_command(project_id):
    """Clear the clock command after it's been processed"""
    project = Project.query.get_or_404(project_id)
    project.clock_command = None
    project.clock_command_data = None
    project.clock_command_timestamp = None
    db.session.commit()
    return jsonify({'message': 'Command cleared'}), 200


@api.route('/api/projects/import', methods=['POST'])
def import_project():
    """Create a new project from uploaded rows"""
    data = request.get_json()
    name = (data.get('name') or '').strip()
    rows_data = data.get('rows') or []
    manager_password = (data.get('managerPassword') or '').strip()
    manager_role = (data.get('managerRole') or '').strip()

    if not name:
        return jsonify({'error': 'Project name is required'}), 400
    if not rows_data:
        return jsonify({'error': 'No rows data provided'}), 400

    existing_project = Project.query.filter(func.lower(Project.name) == name.lower()).first()
    if existing_project:
        return jsonify({'error': 'Project with this name already exists'}), 400

    try:
        project = Project(name=name)
        if manager_password:
            project.set_manager_password(manager_password)
        if manager_role:
            project.manager_role = manager_role
        db.session.add(project)
        db.session.flush()

        role_names = set()
        phases_cache = {}

        for row in rows_data:
            phase_number = row.get('phase')
            if phase_number is None or phase_number == '':
                continue
            try:
                phase_number = int(phase_number)
            except ValueError:
                continue

            if phase_number not in phases_cache:
                phase = Phase(
                    project_id=project.id,
                    phase_number=phase_number,
                    is_active=False
                )
                db.session.add(phase)
                db.session.flush()
                phases_cache[phase_number] = phase

            role_value = (row.get('role') or 'Role').strip() or 'Role'
            time_value = row.get('time') or '00:00:00'
            duration_value = row.get('duration') or '00:00'
            description_value = row.get('description') or ''

            db.session.add(Row(
                phase_id=phases_cache[phase_number].id,
                role=role_value,
                time=time_value,
                duration=duration_value,
                description=description_value,
                script=row.get('script') or '',
                status=row.get('status') or 'N/A',
                script_result=row.get('scriptResult')
            ))

            role_names.add(role_value)

        for role_name in role_names:
            db.session.add(ProjectRole(project_id=project.id, role_name=role_name))

        db.session.commit()
        created_project = Project.query.get(project.id)
        return jsonify(created_project.to_dict()), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 500


@api.route('/api/projects/<int:project_id>/verify-manager', methods=['POST'])
def verify_manager_password(project_id):
    """Verify manager password for locked projects"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    password = data.get('password', '')

    if not project.manager_password_hash:
        return jsonify({'success': True, 'locked': False}), 200

    if project.check_manager_password(password):
        return jsonify({'success': True, 'locked': True}), 200

    return jsonify({'success': False, 'locked': True}), 401


@api.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete an entire project"""
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Project deleted'}), 200


# ==================== PHASE ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/phases', methods=['GET'])
def get_phases(project_id):
    """Get all phases for a project"""
    # Use joinedload to eagerly load rows and avoid N+1 queries
    phases = Phase.query.options(joinedload(Phase.rows)).filter_by(project_id=project_id).order_by(Phase.phase_number).all()
    return jsonify([phase.to_dict() for phase in phases]), 200


@api.route('/api/projects/<int:project_id>/phases', methods=['POST'])
def create_phase(project_id):
    """Create a new phase"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    # Find the next phase number
    max_phase = db.session.query(func.max(Phase.phase_number)).filter_by(project_id=project_id).scalar()
    phase_number = (max_phase or 0) + 1
    
    phase = Phase(
        project_id=project_id,
        phase_number=phase_number,
        is_active=data.get('is_active', False)
    )
    db.session.add(phase)
    db.session.commit()
    return jsonify(phase.to_dict()), 201


@api.route('/api/phases/<int:phase_id>', methods=['DELETE'])
def delete_phase(phase_id):
    """Delete a phase"""
    phase = Phase.query.get_or_404(phase_id)
    db.session.delete(phase)
    db.session.commit()
    return jsonify({'message': 'Phase deleted'}), 200


@api.route('/api/phases/<int:phase_id>/toggle-active', methods=['PUT'])
def toggle_phase_active(phase_id):
    """Toggle phase active status"""
    phase = Phase.query.get_or_404(phase_id)
    data = request.get_json() or {}
    
    # Get old status before toggle
    old_is_active = phase.is_active
    phase.is_active = not phase.is_active
    phase.updated_at = datetime.utcnow()
    db.session.commit()
    
    # Log phase activation (only if user is manager)
    user_name = data.get('user_name', 'Unknown')
    user_role = data.get('user_role', 'Unknown')
    project = Project.query.get(phase.project_id)
    
    # Only log if user is manager
    if project and project.manager_role == user_role:
        ActionLogger.log_phase_activation(
            phase.project_id, 
            user_name, 
            user_role, 
            phase_id, 
            phase.phase_number, 
            phase.is_active,
            project.reset_epoch
        )
    
    # Emit real-time update to all clients
    socketio = get_socketio()
    if socketio:
        socketio.emit('phases_updated', {'project_id': phase.project_id}, room=f'project_{phase.project_id}')
    
    return jsonify(phase.to_dict()), 200


# ==================== ROW ENDPOINTS ====================

@api.route('/api/phases/<int:phase_id>/rows', methods=['POST'])
def create_row(phase_id):
    """Create a new row in a phase"""
    phase = Phase.query.get_or_404(phase_id)
    data = request.get_json()
    
    row = Row(
        phase_id=phase_id,
        role=data.get('role', ''),
        time=data.get('time', '00:00:00'),
        duration=data.get('duration', '00:00'),
        description=data.get('description', ''),
        script=data.get('script', ''),
        status=data.get('status', 'N/A'),
        script_result=data.get('scriptResult')
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@api.route('/api/rows/<int:row_id>', methods=['PUT'])
def update_row(row_id):
    """Update a row"""
    row = Row.query.get_or_404(row_id)
    data = request.get_json()
    
    # Get old status before update for logging
    old_status = row.status
    new_status = data.get('status', row.status)
    
    # Check if any fields other than status are being changed
    role_changed = 'role' in data and data.get('role') != row.role
    time_changed = 'time' in data and data.get('time') != row.time
    duration_changed = 'duration' in data and data.get('duration') != row.duration
    description_changed = 'description' in data and data.get('description') != row.description
    script_changed = 'script' in data and data.get('script') != row.script
    script_result_changed = 'scriptResult' in data and data.get('scriptResult') != row.script_result
    
    # Preserve updated_at if only status is being changed (to maintain row order)
    only_status_changed = (
        not role_changed and 
        not time_changed and 
        not duration_changed and 
        not description_changed and 
        not script_changed and 
        not script_result_changed and
        old_status != new_status
    )
    
    # Store original updated_at if only status is changing
    original_updated_at = row.updated_at if only_status_changed else None
    
    # Only update updated_at if something other than status changed
    if only_status_changed:
        # Use raw SQL to update only status without triggering ON UPDATE CURRENT_TIMESTAMP
        # This preserves the original updated_at timestamp
        # Note: 'rows' is a MySQL reserved word, so we must escape it with backticks
        original_updated_at_str = original_updated_at.strftime('%Y-%m-%d %H:%M:%S')
        
        try:
            # Update both status and updated_at in a single statement
            # In MySQL, when you explicitly set a column with ON UPDATE CURRENT_TIMESTAMP,
            # it should NOT trigger the auto-update. But to be safe, we update both at once.
            db.session.execute(
                text("UPDATE `rows` SET status = :status, updated_at = :updated_at WHERE id = :row_id"),
                {'status': new_status, 'updated_at': original_updated_at_str, 'row_id': row_id}
            )
            db.session.commit()
            
            # Refresh the row object to get updated values
            db.session.refresh(row)
            
            # Log status change if status actually changed
            if old_status != new_status:
                user_name = data.get('user_name', 'Unknown')
                user_role = data.get('user_role', 'Unknown')
                project = row.phase.project
                ActionLogger.log_row_status_change(project.id, user_name, user_role, row_id, old_status, new_status, project.reset_epoch)
            
            # Emit real-time update
            project = row.phase.project
            socketio = get_socketio()
            if socketio:
                socketio.emit('phases_updated', {'project_id': project.id}, room=f'project_{project.id}')
            
            return jsonify(row.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            # Fall back to normal update if raw SQL fails
            row.status = new_status
            row.updated_at = datetime.utcnow()
            db.session.commit()
            if old_status != new_status:
                user_name = data.get('user_name', 'Unknown')
                user_role = data.get('user_role', 'Unknown')
                project = row.phase.project
                ActionLogger.log_row_status_change(project.id, user_name, user_role, row_id, old_status, new_status, project.reset_epoch)
            
            # Emit real-time update
            project = row.phase.project
            socketio = get_socketio()
            if socketio:
                socketio.emit('phases_updated', {'project_id': project.id}, room=f'project_{project.id}')
            
            return jsonify(row.to_dict()), 200
    else:
        # Normal update - let ON UPDATE CURRENT_TIMESTAMP work
        row.role = data.get('role', row.role)
        row.time = data.get('time', row.time)
        row.duration = data.get('duration', row.duration)
        row.description = data.get('description', row.description)
        row.script = data.get('script', row.script)
        row.status = new_status
        row.script_result = data.get('scriptResult', row.script_result)
        row.updated_at = datetime.utcnow()
        db.session.commit()
    
    # Log status change if status actually changed
    if old_status != new_status:
        user_name = data.get('user_name', 'Unknown')
        user_role = data.get('user_role', 'Unknown')
        project = row.phase.project
        ActionLogger.log_row_status_change(project.id, user_name, user_role, row_id, old_status, new_status, project.reset_epoch)
    
    # Emit real-time update
    project = row.phase.project
    socketio = get_socketio()
    if socketio:
        socketio.emit('phases_updated', {'project_id': project.id}, room=f'project_{project.id}')
    
    return jsonify(row.to_dict()), 200


@api.route('/api/rows/<int:row_id>', methods=['DELETE'])
def delete_row(row_id):
    """Delete a row"""
    row = Row.query.get_or_404(row_id)
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Row deleted'}), 200


@api.route('/api/rows/<int:row_id>/run-script', methods=['POST'])
def run_script(row_id):
    """Run a script for a row"""
    row = Row.query.get_or_404(row_id)
    data = request.get_json() or {}
    
    # TODO: Implement actual script execution
    # For now, simulate with random result
    import random
    result = random.choice([True, False])
    
    # Preserve updated_at to maintain row order (only script_result changes)
    # Use raw SQL to update only script_result without triggering ON UPDATE CURRENT_TIMESTAMP
    # Note: 'rows' is a MySQL reserved word, so we must escape it with backticks
    original_updated_at = row.updated_at
    original_updated_at_str = original_updated_at.strftime('%Y-%m-%d %H:%M:%S')
    
    # Use raw SQL to preserve updated_at
    db.session.execute(
        text("UPDATE `rows` SET script_result = :result, updated_at = :updated_at WHERE id = :row_id"),
        {'result': result, 'updated_at': original_updated_at_str, 'row_id': row_id}
    )
    db.session.commit()
    
    # Refresh the row object
    db.session.refresh(row)
    
    # Log script execution
    user_name = data.get('user_name', 'Unknown')
    user_role = data.get('user_role', 'Unknown')
    project = row.phase.project
    script_path = row.script or 'N/A'
    ActionLogger.log_script_execution(project.id, user_name, user_role, row_id, script_path, result, project.reset_epoch)
    
    return jsonify({'result': result}), 200


# ==================== PERIODIC SCRIPT ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/periodic-scripts', methods=['GET'])
def get_periodic_scripts(project_id):
    """Get all periodic scripts for a project"""
    scripts = PeriodicScript.query.filter_by(project_id=project_id).all()
    return jsonify([script.to_dict() for script in scripts]), 200


@api.route('/api/projects/<int:project_id>/periodic-scripts', methods=['POST'])
def create_periodic_script(project_id):
    """Create a new periodic script"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    script = PeriodicScript(
        project_id=project_id,
        name=data.get('name', 'New Script'),
        path=data.get('path', ''),
        status=data.get('status', False)
    )
    db.session.add(script)
    db.session.commit()
    return jsonify(script.to_dict()), 201


@api.route('/api/periodic-scripts/<int:script_id>', methods=['PUT'])
def update_periodic_script(script_id):
    """Update a periodic script"""
    script = PeriodicScript.query.get_or_404(script_id)
    data = request.get_json()
    
    script.name = data.get('name', script.name)
    script.path = data.get('path', script.path)
    script.status = data.get('status', script.status)
    script.updated_at = datetime.utcnow()
    
    db.session.commit()
    return jsonify(script.to_dict()), 200


@api.route('/api/periodic-scripts/<int:script_id>', methods=['DELETE'])
def delete_periodic_script(script_id):
    """Delete a periodic script"""
    script = PeriodicScript.query.get_or_404(script_id)
    db.session.delete(script)
    db.session.commit()
    return jsonify({'message': 'Script deleted'}), 200


@api.route('/api/periodic-scripts/<int:script_id>/execute', methods=['POST'])
def execute_periodic_script(script_id):
    """Execute a periodic script and update status"""
    script = PeriodicScript.query.get_or_404(script_id)
    
    try:
        # Execute the script at the given path
        # response = requests.get(script.path, timeout=30)
        # response.raise_for_status()
        
        # Parse the response JSON
        # result_data = response.json()
        
        # Extract status and interval from response
        # status = result_data.get('status', False)
        # interval = result_data.get('interval', 60)  # Default to 60 seconds if not provided
        status = not script.status
        if status:
            interval = 5
        else:
            interval = 5

        # Validate interval is an integer
        if not isinstance(interval, int) or interval < 0:
            interval = 60
        
        # Update script status and last_executed timestamp
        script.status = bool(status)
        script.last_executed = datetime.utcnow()
        script.updated_at = datetime.utcnow()
        db.session.commit()
        
        # Return result with status and interval, plus updated script
        return jsonify({
            'result': {
                'status': status,
                'interval': interval
            },
            'script': script.to_dict()
        }), 200
        
    except requests.exceptions.RequestException as e:
        # If script execution fails, log error and return error response
        current_app.logger.error(f'Failed to execute periodic script {script_id} at {script.path}: {str(e)}')
        return jsonify({
            'error': f'Failed to execute script: {str(e)}',
            'result': {
                'status': False,
                'interval': 60  # Default interval on error
            },
            'script': script.to_dict()
        }), 500
    except (ValueError, KeyError) as e:
        # If response parsing fails, log error and return error response
        current_app.logger.error(f'Failed to parse periodic script {script_id} response: {str(e)}')
        return jsonify({
            'error': f'Invalid script response format: {str(e)}',
            'result': {
                'status': False,
                'interval': 60  # Default interval on error
            },
            'script': script.to_dict()
        }), 500


# ==================== ROLE ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/roles', methods=['GET'])
def get_project_roles(project_id):
    """Get all roles for a project"""
    roles = ProjectRole.query.filter_by(project_id=project_id).all()
    return jsonify([role.role_name for role in roles]), 200


@api.route('/api/projects/<int:project_id>/roles', methods=['POST'])
def add_project_role(project_id):
    """Add a new role to a project"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    role_name = data.get('role')
    
    if not role_name:
        return jsonify({'error': 'Role name required'}), 400
    
    # Check if role already exists
    existing = ProjectRole.query.filter_by(project_id=project_id, role_name=role_name).first()
    if existing:
        return jsonify({'error': 'Role already exists'}), 400
    
    project_role = ProjectRole(project_id=project_id, role_name=role_name)
    db.session.add(project_role)
    db.session.commit()
    return jsonify(project_role.to_dict()), 201


# ==================== BULK UPDATE ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/table-data', methods=['PUT'])
def update_table_data(project_id):
    """Bulk update table data (phases and rows)"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()  # Array of phases with rows
    
    try:
        # Clear existing phases and rows
        Phase.query.filter_by(project_id=project_id).delete()
        
        # Recreate phases and rows
        for phase_data in data:
            phase = Phase(
                project_id=project_id,
                phase_number=phase_data['phase'],
                is_active=phase_data.get('is_active', False)
            )
            db.session.add(phase)
            db.session.flush()  # Get phase.id
            
            for row_data in phase_data.get('rows', []):
                row = Row(
                    phase_id=phase.id,
                    role=row_data.get('role', ''),
                    time=row_data.get('time', '00:00:00'),
                    duration=row_data.get('duration', '00:00'),
                    description=row_data.get('description', ''),
                    script=row_data.get('script', ''),
                    status=row_data.get('status', 'N/A'),
                    script_result=row_data.get('scriptResult')
                )
                db.session.add(row)
        
        db.session.commit()
        
        # Emit real-time update to all clients
        socketio = get_socketio()
        if socketio:
            socketio.emit('phases_updated', {'project_id': project_id}, room=f'project_{project_id}')
        
        return jsonify({'message': 'Table data updated'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api.route('/api/projects/<int:project_id>/periodic-scripts/bulk', methods=['PUT'])
def update_periodic_scripts_bulk(project_id):
    """Bulk update periodic scripts"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()  # Array of scripts
    
    try:
        # Clear existing scripts
        PeriodicScript.query.filter_by(project_id=project_id).delete()
        
        # Recreate scripts
        for script_data in data:
            script = PeriodicScript(
                project_id=project_id,
                name=script_data.get('name', ''),
                path=script_data.get('path', ''),
                status=script_data.get('status', False)
            )
            db.session.add(script)
        
        db.session.commit()
        return jsonify({'message': 'Periodic scripts updated'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ==================== USER/LOGIN ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/active-logins', methods=['GET'])
def get_active_logins(project_id):
    """Get all active logins for a project, auto-deactivating stale sessions"""
    from datetime import timedelta
    
    # Auto-deactivate users who haven't sent a heartbeat in 2+ hours
    stale_threshold = datetime.utcnow() - timedelta(hours=2)
    stale_users = User.query.filter(
        User.project_id == project_id,
        User.is_active == True,
        User.last_seen != None,
        User.last_seen < stale_threshold
    ).all()
    
    for user in stale_users:
        user.is_active = False
    
    if stale_users:
        socketio = get_socketio()
        if socketio:
            # Emit to each deactivated user individually
            for user in stale_users:
                user_room = f'user_{project_id}_{user.role}_{user.name}'
                socketio.emit('user_deactivated', {
                    'project_id': project_id,
                    'role': user.role,
                    'name': user.name
                }, room=user_room)
            
            # Emit general active logins update
            socketio.emit('active_logins_updated', {'project_id': project_id}, room=f'project_{project_id}')
        
        db.session.commit()
    
    active_users = User.query.filter_by(project_id=project_id, is_active=True).all()
    return jsonify([user.to_dict() for user in active_users]), 200


@api.route('/api/projects/<int:project_id>/login', methods=['POST'])
def register_login(project_id):
    """Register a user login - marks role as taken. Reactivates inactive users."""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    name = (data.get('name') or '').strip()
    role = (data.get('role') or '').strip()
    
    if not name or not role:
        return jsonify({'error': 'Name and role are required'}), 400
    
    # Check if role is already taken by an active user
    existing_active = User.query.filter_by(
        project_id=project_id, 
        role=role, 
        is_active=True
    ).first()
    
    if existing_active:
        return jsonify({
            'error': f'Role "{role}" is already in use by {existing_active.name}'
        }), 409
    
    # Create or update user record (reactivates inactive users)
    user = User.query.filter_by(
        project_id=project_id,
        role=role,
        name=name
    ).first()
    
    if user:
        # Reactivate existing user (even if they were previously inactive)
        user.is_active = True
        user.last_login = datetime.utcnow()
        user.last_seen = datetime.utcnow()
    else:
        # Create new user
        user = User(
            project_id=project_id,
            role=role,
            name=name,
            is_active=True,
            last_login=datetime.utcnow(),
            last_seen=datetime.utcnow()
        )
        db.session.add(user)
    
    db.session.commit()
    
    # Emit Socket.IO event for active logins update
    socketio = get_socketio()
    if socketio:
        socketio.emit('active_logins_updated', {'project_id': project_id}, room=f'project_{project_id}')
    
    return jsonify(user.to_dict()), 200


@api.route('/api/projects/<int:project_id>/logout', methods=['POST'])
def register_logout(project_id):
    """Register a user logout - frees up the role"""
    # Handle both JSON and FormData (for sendBeacon)
    if request.is_json:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        role = (data.get('role') or '').strip()
    else:
        # Handle FormData (from sendBeacon)
        name = (request.form.get('name') or '').strip()
        role = (request.form.get('role') or '').strip()
    
    if not name or not role:
        return jsonify({'error': 'Name and role are required'}), 400
    
    # Find and deactivate the user
    user = User.query.filter_by(
        project_id=project_id,
        role=role,
        name=name,
        is_active=True
    ).first()
    
    if user:
        user.is_active = False
        db.session.commit()
        
        # Emit Socket.IO event for active logins update
        socketio = get_socketio()
        if socketio:
            socketio.emit('active_logins_updated', {'project_id': project_id}, room=f'project_{project_id}')
        
        return jsonify({'message': 'Logout successful'}), 200
    else:
        return jsonify({'error': 'Active login not found'}), 404


@api.route('/api/projects/<int:project_id>/heartbeat', methods=['POST'])
def heartbeat(project_id):
    """Update last_seen timestamp for a user to indicate they're still active"""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    role = (data.get('role') or '').strip()
    
    if not name or not role:
        return jsonify({'error': 'Name and role are required'}), 400
    
    user = User.query.filter_by(
        project_id=project_id,
        role=role,
        name=name,
        is_active=True
    ).first()
    
    if user:
        user.last_seen = datetime.utcnow()
        db.session.commit()
        return jsonify({'message': 'Heartbeat received'}), 200
    else:
        return jsonify({'error': 'Active user not found'}), 404


@api.route('/api/projects/<int:project_id>/user-notification', methods=['POST'])
def create_user_notification(project_id):
    """Create a notification for a specific user (by role)"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    target_role = (data.get('targetRole') or '').strip()
    command = data.get('command')  # 'show_modal'
    notification_data = data.get('data', {})
    
    if not target_role:
        return jsonify({'error': 'Target role is required'}), 400
    
    # Find the active user with that role
    user = User.query.filter_by(
        project_id=project_id,
        role=target_role,
        is_active=True
    ).first()
    
    if not user:
        return jsonify({'error': f'No active user found with role "{target_role}"'}), 404
    
    # Set notification for that user
    import json
    user.notification_command = command
    user.notification_data = json.dumps(notification_data) if notification_data else None
    user.notification_timestamp = datetime.utcnow()
    db.session.commit()
    
    # Emit Socket.IO event to user-specific room for instant notification
    socketio = get_socketio()
    if socketio:
        user_room = f'user_{project_id}_{target_role}_{user.name}'
        socketio.emit('user_notification', {
            'project_id': project_id,
            'command': command,
            'data': notification_data
        }, room=user_room)
    
    return jsonify(user.to_dict()), 200


@api.route('/api/projects/<int:project_id>/user-notification', methods=['GET'])
def get_user_notification(project_id):
    """Get notification for the current user (by role and name)"""
    project = Project.query.get_or_404(project_id)
    role = request.args.get('role', '').strip()
    name = request.args.get('name', '').strip()
    
    if not role or not name:
        return jsonify({'error': 'Role and name are required'}), 400
    
    user = User.query.filter_by(
        project_id=project_id,
        role=role,
        name=name,
        is_active=True
    ).first()
    
    if not user:
        return jsonify({
            'command': None,
            'data': None,
            'timestamp': None
        }), 200
    
    notification_command = user.notification_command
    notification_data = json.loads(user.notification_data) if user.notification_data else None
    
    return jsonify({
        'command': notification_command,
        'data': notification_data,
        'timestamp': user.notification_timestamp.isoformat() if user.notification_timestamp else None
    }), 200


@api.route('/api/projects/<int:project_id>/user-notification/clear', methods=['POST'])
def clear_user_notification(project_id):
    """Clear notification for the current user"""
    data = request.get_json()
    role = (data.get('role') or '').strip()
    name = (data.get('name') or '').strip()
    
    if not role or not name:
        return jsonify({'error': 'Role and name are required'}), 400
    
    user = User.query.filter_by(
        project_id=project_id,
        role=role,
        name=name,
        is_active=True
    ).first()
    
    if user:
        user.notification_command = None
        user.notification_data = None
        user.notification_timestamp = None
        db.session.commit()
        return jsonify({'message': 'Notification cleared'}), 200
    else:
        return jsonify({'error': 'Active user not found'}), 404


# ==================== PENDING CHANGES ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/pending-changes', methods=['POST'])
def create_pending_change(project_id):
    """Create pending change requests from a non-manager user - creates individual records for each change"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    submitted_by = data.get('submitted_by', '').strip()
    submitted_by_role = data.get('submitted_by_role', '').strip()
    changes_data = data.get('changes_data', {})
    
    if not submitted_by or not submitted_by_role:
        return jsonify({'error': 'submitted_by and submitted_by_role are required'}), 400
    
    # Generate a unique submission_id (using UUID)
    submission_id = str(uuid.uuid4())
    
    created_changes = []
    
    # Track whether this submission includes structural changes that require table_data
    # (row_move, row_duplicate, row_add, row_delete, etc.)
    has_structural_changes = False
    
    # Store table_data with the submission if provided (for preserving row order)
    # We will only create a PendingChange for it if structural changes exist
    table_data_for_submission = None
    if 'table_data' in changes_data:
        table_data_for_submission = changes_data['table_data']
    
    try:
        # Get current project data for comparison
        current_version = project.version
        current_phases = Phase.query.filter_by(project_id=project_id).all()
        current_phases_dict = {p.phase_number: p for p in current_phases}
        current_roles = [pr.role_name for pr in ProjectRole.query.filter_by(project_id=project_id).all()]
        current_scripts = PeriodicScript.query.filter_by(project_id=project_id).all()
        current_scripts_dict = {s.id: s for s in current_scripts}
        
        # Process version change
        if 'version' in changes_data and changes_data['version'] != current_version:
            version_change = PendingChange(
        project_id=project_id,
                submission_id=submission_id,
        submitted_by=submitted_by,
        submitted_by_role=submitted_by_role,
                change_type='version',
                changes_data=json.dumps({
                    'old_version': current_version,
                    'new_version': changes_data['version']
                }),
        status='pending'
    )
            db.session.add(version_change)
            created_changes.append(version_change)
        
        # Track rows involved in explicit move/duplicate operations to prevent duplicate notifications
        moved_rows = set()  # Rows that were explicitly moved
        duplicated_rows = set()  # Rows that were explicitly duplicated
        
        # Process explicit row_move and row_duplicate operations first
        if 'explicit_operations' in changes_data:
            explicit_ops = changes_data['explicit_operations']
            
            
            # Process row_move operations
            for move_op in explicit_ops.get('row_moves', []):
                row_id = move_op.get('row_id')
                source_phase_number = move_op.get('source_phase_number')
                target_phase_number = move_op.get('target_phase_number')
                target_position = move_op.get('target_position', 0)
                
                
                if row_id and source_phase_number is not None and target_phase_number is not None:
                    moved_rows.add(row_id)
                    source_row_index = move_op.get('source_row_index')  # Get source position for description
                    row_move = PendingChange(
                        project_id=project_id,
                        submission_id=submission_id,
                        submitted_by=submitted_by,
                        submitted_by_role=submitted_by_role,
                        change_type='row_move',
                        changes_data=json.dumps({
                            'row_id': row_id,
                            'source_phase_number': source_phase_number,
                            'target_phase_number': target_phase_number,
                            'target_position': target_position,
                            'source_row_index': source_row_index  # Store source position
                        }),
                        status='pending'
                    )
                    db.session.add(row_move)
                    created_changes.append(row_move)
                    has_structural_changes = True
            
            # Process row_duplicate operations
            for dup_op in explicit_ops.get('row_duplicates', []):
                source_row_id = dup_op.get('source_row_id')
                new_row_id = dup_op.get('new_row_id')  # The temporary ID of the duplicated row
                target_phase_number = dup_op.get('target_phase_number')
                target_position = dup_op.get('target_position', 0)
                
                
                if source_row_id and target_phase_number is not None:
                    duplicated_rows.add(source_row_id)
                    if new_row_id:
                        duplicated_rows.add(new_row_id)  # Track the new duplicated row ID to prevent it from being detected as a new row
                    row_duplicate = PendingChange(
                        project_id=project_id,
                        submission_id=submission_id,
                        submitted_by=submitted_by,
                        submitted_by_role=submitted_by_role,
                        change_type='row_duplicate',
                        changes_data=json.dumps({
                            'source_row_id': source_row_id,
                            'new_row_id': new_row_id,  # Store temporary ID so we can update it later
                            'target_phase_number': target_phase_number,
                            'target_position': target_position
                        }),
                        status='pending'
                    )
                    db.session.add(row_duplicate)
                    created_changes.append(row_duplicate)
                    has_structural_changes = True
        
        # Process table data changes (rows)
        if 'table_data' in changes_data:
            table_data = changes_data['table_data']
            
            # Build maps of current rows by phase
            current_rows_by_phase = {}
            for phase in current_phases:
                current_rows_by_phase[phase.phase_number] = {r.id: r for r in Row.query.filter_by(phase_id=phase.id).all()}
            
            # Process each phase in the new data
            for phase_data in table_data:
                phase_number = phase_data.get('phase')
                if phase_number is None or phase_number == '':
                    continue
                
                new_rows = phase_data.get('rows', [])
                current_rows = current_rows_by_phase.get(phase_number, {})
                current_row_ids = set(current_rows.keys())
                new_row_ids = {row.get('id') for row in new_rows if row.get('id')}
                
                # Find added rows (rows in new but not in current)
                for new_row in new_rows:
                    row_id = new_row.get('id')
                    if not row_id or row_id not in current_row_ids:
                        # This is a new row (skip if it's a duplicate - already handled)
                        if row_id in duplicated_rows:
                            continue
                        phase_obj = current_phases_dict.get(phase_number)
                        if not phase_obj:
                            # Phase doesn't exist yet, we'll need phase_id later
                            phase_id = None
                        else:
                            phase_id = phase_obj.id
                        
                        row_add = PendingChange(
                            project_id=project_id,
                            submission_id=submission_id,
                            submitted_by=submitted_by,
                            submitted_by_role=submitted_by_role,
                            change_type='row_add',
                            changes_data=json.dumps({
                                'phase_number': phase_number,
                                'phase_id': phase_id,
                                'row_data': {
                                    'role': new_row.get('role', ''),
                                    'time': new_row.get('time', '00:00:00'),
                                    'duration': new_row.get('duration', '00:00'),
                                    'description': new_row.get('description', ''),
                                    'script': new_row.get('script', ''),
                                    'status': new_row.get('status', 'N/A')
                                }
                            }),
                            status='pending'
                        )
                        db.session.add(row_add)
                        created_changes.append(row_add)
                        has_structural_changes = True
                
                # Find modified rows (check ALL rows including moved ones for content changes)
                for new_row in new_rows:
                    row_id = new_row.get('id')
                    if row_id and row_id in current_row_ids:
                        # For moved rows, we need to find them in ANY phase's current_rows
                        # since they may have moved from a different phase
                        current_row = current_rows.get(row_id)
                        if not current_row and row_id in moved_rows:
                            # Row was moved from another phase, find it there
                            for other_phase_rows in current_rows_by_phase.values():
                                if row_id in other_phase_rows:
                                    current_row = other_phase_rows[row_id]
                                    break
                        
                        if not current_row:
                            continue
                        
                        # Check if row was actually modified (content change, not just position)
                        if (current_row.role != new_row.get('role', current_row.role) or
                            current_row.time != new_row.get('time', current_row.time) or
                            current_row.duration != new_row.get('duration', current_row.duration) or
                            (current_row.description or '') != (new_row.get('description') or '') or
                            (current_row.script or '') != (new_row.get('script') or '') or
                            current_row.status != new_row.get('status', current_row.status)):
                            
                            row_update = PendingChange(
                                project_id=project_id,
                                submission_id=submission_id,
                                submitted_by=submitted_by,
                                submitted_by_role=submitted_by_role,
                                change_type='row_update',
                                changes_data=json.dumps({
                                    'row_id': row_id,
                                    'old_data': {
                                        'role': current_row.role,
                                        'time': current_row.time,
                                        'duration': current_row.duration,
                                        'description': current_row.description or '',
                                        'script': current_row.script or '',
                                        'status': current_row.status
                                    },
                                    'new_data': {
                                        'role': new_row.get('role', current_row.role),
                                        'time': new_row.get('time', current_row.time),
                                        'duration': new_row.get('duration', current_row.duration),
                                        'description': new_row.get('description', ''),
                                        'script': new_row.get('script', ''),
                                        'status': new_row.get('status', current_row.status)
                                    }
                                }),
                                status='pending'
                            )
                            db.session.add(row_update)
                            created_changes.append(row_update)
                
                # Find deleted rows (rows in current but not in new)
                # Skip rows that were moved - they appear deleted in source phase but are handled by row_move
                deleted_row_ids = current_row_ids - new_row_ids
                for row_id in deleted_row_ids:
                    # Skip rows that were explicitly moved - they're handled by row_move operation
                    if row_id in moved_rows:
                        continue
                    
                    current_row = current_rows[row_id]
                    row_delete = PendingChange(
                        project_id=project_id,
                        submission_id=submission_id,
                        submitted_by=submitted_by,
                        submitted_by_role=submitted_by_role,
                        change_type='row_delete',
                        changes_data=json.dumps({
                            'row_id': row_id,
                            'row_data': {
                                'role': current_row.role,
                                'time': current_row.time,
                                'duration': current_row.duration,
                                'description': current_row.description or '',
                                'script': current_row.script or '',
                                'status': current_row.status
                            }
                        }),
                        status='pending'
                    )
                    db.session.add(row_delete)
                    created_changes.append(row_delete)
                    has_structural_changes = True
        
        # Process role changes (only if explicitly provided)
        # Note: Roles are typically derived from rows, so we only process explicit role changes
        if 'roles' in changes_data and changes_data['roles'] is not None:
            new_roles = set(changes_data['roles'])
            current_roles_set = set(current_roles)
            
            # Only process if there are actual differences
            if new_roles != current_roles_set:
                # Added roles
                added_roles = new_roles - current_roles_set
                for role in added_roles:
                    role_add = PendingChange(
                        project_id=project_id,
                        submission_id=submission_id,
                        submitted_by=submitted_by,
                        submitted_by_role=submitted_by_role,
                        change_type='role_add',
                        changes_data=json.dumps({'role': role}),
                        status='pending'
                    )
                    db.session.add(role_add)
                    created_changes.append(role_add)
                
                # Deleted roles
                deleted_roles = current_roles_set - new_roles
                for role in deleted_roles:
                    role_delete = PendingChange(
                        project_id=project_id,
                        submission_id=submission_id,
                        submitted_by=submitted_by,
                        submitted_by_role=submitted_by_role,
                        change_type='role_delete',
                        changes_data=json.dumps({'role': role}),
                        status='pending'
                    )
                    db.session.add(role_delete)
                    created_changes.append(role_delete)
        
        # After processing all changes, conditionally create table_data change
        # Only when structural changes exist and table_data was provided
        if has_structural_changes and table_data_for_submission is not None:
            table_data_change = PendingChange(
                project_id=project_id,
                submission_id=submission_id,
                submitted_by=submitted_by,
                submitted_by_role=submitted_by_role,
                change_type='table_data',
                changes_data=json.dumps({'table_data': table_data_for_submission}),
                status='pending'
            )
            db.session.add(table_data_change)
            created_changes.append(table_data_change)
        
        # Process periodic script changes
        if 'periodic_scripts' in changes_data:
            new_scripts = changes_data['periodic_scripts']
            new_scripts_dict = {s.get('id'): s for s in new_scripts if s.get('id')}
            current_script_ids = set(current_scripts_dict.keys())
            new_script_ids = set(new_scripts_dict.keys())
            
            # Added scripts
            added_script_ids = new_script_ids - current_script_ids
            for script_id in added_script_ids:
                new_script = new_scripts_dict[script_id]
                script_add = PendingChange(
                    project_id=project_id,
                    submission_id=submission_id,
                    submitted_by=submitted_by,
                    submitted_by_role=submitted_by_role,
                    change_type='script_add',
                    changes_data=json.dumps({
                        'script_data': {
                            'name': new_script.get('name', ''),
                            'path': new_script.get('path', ''),
                            'status': new_script.get('status', False)
                        }
                    }),
                    status='pending'
                )
                db.session.add(script_add)
                created_changes.append(script_add)
            
            # Modified scripts
            modified_script_ids = new_script_ids & current_script_ids
            for script_id in modified_script_ids:
                current_script = current_scripts_dict[script_id]
                new_script = new_scripts_dict[script_id]
                
                # Check if script was actually modified
                if (current_script.name != new_script.get('name', current_script.name) or
                    current_script.path != new_script.get('path', current_script.path) or
                    current_script.status != new_script.get('status', current_script.status)):
                    
                    script_update = PendingChange(
                        project_id=project_id,
                        submission_id=submission_id,
                        submitted_by=submitted_by,
                        submitted_by_role=submitted_by_role,
                        change_type='script_update',
                        changes_data=json.dumps({
                            'script_id': script_id,
                            'old_data': {
                                'name': current_script.name,
                                'path': current_script.path,
                                'status': current_script.status
                            },
                            'new_data': {
                                'name': new_script.get('name', current_script.name),
                                'path': new_script.get('path', current_script.path),
                                'status': new_script.get('status', current_script.status)
                            }
                        }),
                        status='pending'
                    )
                    db.session.add(script_update)
                    created_changes.append(script_update)
            
            # Deleted scripts
            deleted_script_ids = current_script_ids - new_script_ids
            for script_id in deleted_script_ids:
                current_script = current_scripts_dict[script_id]
                script_delete = PendingChange(
                    project_id=project_id,
                    submission_id=submission_id,
                    submitted_by=submitted_by,
                    submitted_by_role=submitted_by_role,
                    change_type='script_delete',
                    changes_data=json.dumps({
                        'script_id': script_id,
                        'script_data': {
                            'name': current_script.name,
                            'path': current_script.path,
                            'status': current_script.status
                        }
                    }),
                    status='pending'
                )
                db.session.add(script_delete)
                created_changes.append(script_delete)
        
        db.session.commit()
        
        # Notify manager if they're logged in and we created changes
        if created_changes and project.manager_role:
            manager_user = User.query.filter_by(
                project_id=project_id,
                role=project.manager_role,
                is_active=True
            ).first()
            
            if manager_user:
                manager_user.notification_command = 'pending_changes'
                manager_user.notification_data = json.dumps({
                    'submission_id': submission_id,
                    'submitted_by': submitted_by,
                    'submitted_by_role': submitted_by_role,
                    'change_count': len(created_changes)
                })
                manager_user.notification_timestamp = datetime.utcnow()
                db.session.commit()
                
                # Emit Socket.IO event for instant notification
                socketio = get_socketio()
                if socketio:
                    socketio.emit('pending_changes_notification', {
                        'project_id': project_id,
                        'manager_role': project.manager_role
                    }, room=f'project_{project_id}')
        
        return jsonify({
            'submission_id': submission_id,
            'created_changes': [change.to_dict() for change in created_changes],
            'count': len(created_changes)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api.route('/api/projects/<int:project_id>/pending-changes', methods=['GET'])
def get_pending_changes(project_id):
    """Get all pending changes for a project"""
    project = Project.query.get_or_404(project_id)
    
    status_filter = request.args.get('status', 'pending')  # 'pending', 'all', 'accepted', 'declined'
    
    query = PendingChange.query.filter_by(project_id=project_id)
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)
    
    # Filter out table_data changes - they are internal metadata, not user-visible changes
    query = query.filter(PendingChange.change_type != 'table_data')
    
    pending_changes = query.order_by(PendingChange.created_at.desc()).all()
    return jsonify([pc.to_dict() for pc in pending_changes]), 200


@api.route('/api/projects/<int:project_id>/pending-changes/<int:change_id>/accept', methods=['POST'])
def accept_pending_change(project_id, change_id):
    """Accept an individual pending change and apply it"""
    project = Project.query.get_or_404(project_id)
    pending_change = PendingChange.query.filter_by(
        project_id=project_id,
        id=change_id,
        status='pending'
    ).first_or_404()
    
    data = request.get_json()
    reviewed_by = data.get('reviewed_by', '').strip()
    
    try:
        changes_data = json.loads(pending_change.changes_data)
        change_type = pending_change.change_type
        
        # Apply the change based on type
        if change_type == 'version':
            project.version = changes_data['new_version']
            db.session.commit()
                
        elif change_type == 'row_add':
            phase_number = changes_data.get('phase_number')
            phase_id = changes_data.get('phase_id')
            row_data = changes_data.get('row_data', {})
            
            # Get or create phase if needed
            if not phase_id:
                phase = Phase.query.filter_by(
                    project_id=project_id,
                    phase_number=phase_number
                ).first()
                if not phase:
                    phase = Phase(project_id=project_id, phase_number=phase_number, is_active=False)
                    db.session.add(phase)
                    db.session.flush()
                phase_id = phase.id
                
            row = Row(
                phase_id=phase_id,
                role=row_data.get('role', ''),
                time=row_data.get('time', '00:00:00'),
                duration=row_data.get('duration', '00:00'),
                description=row_data.get('description', ''),
                script=row_data.get('script', ''),
                status=row_data.get('status', 'N/A')
            )
            db.session.add(row)
            db.session.commit()
            
        elif change_type == 'row_update':
            row_id = changes_data.get('row_id')
            new_data = changes_data.get('new_data', {})
            
            row = Row.query.get(row_id)
            if row:
                # Use raw SQL to preserve updated_at (avoid ON UPDATE CURRENT_TIMESTAMP trigger)
                original_updated_at = row.updated_at
                sql = """
                    UPDATE `rows` 
                    SET role = :role, time = :time, duration = :duration, 
                        description = :description, script = :script, status = :status,
                        updated_at = :updated_at
                    WHERE id = :row_id
                """
                db.session.execute(db.text(sql), {
                    'role': new_data.get('role', row.role),
                    'time': new_data.get('time', row.time),
                    'duration': new_data.get('duration', row.duration),
                    'description': new_data.get('description', row.description),
                    'script': new_data.get('script', row.script),
                    'status': new_data.get('status', row.status),
                    'updated_at': original_updated_at,
                    'row_id': row_id
                })
                db.session.commit()
            
        elif change_type == 'row_delete':
            row_id = changes_data.get('row_id')
            row = Row.query.get(row_id)
            if row:
                db.session.delete(row)
                db.session.commit()
                
        elif change_type == 'role_add':
            role_name = changes_data.get('role')
            # Check if role already exists
            existing_role = ProjectRole.query.filter_by(
                project_id=project_id,
                role_name=role_name
            ).first()
            if not existing_role:
                role = ProjectRole(project_id=project_id, role_name=role_name)
                db.session.add(role)
                db.session.commit()
                
        elif change_type == 'role_delete':
            role_name = changes_data.get('role')
            role = ProjectRole.query.filter_by(
                project_id=project_id,
                role_name=role_name
            ).first()
            if role:
                db.session.delete(role)
                db.session.commit()
                
        elif change_type == 'script_add':
            script_data = changes_data.get('script_data', {})
            script = PeriodicScript(
                project_id=project_id,
                name=script_data.get('name', ''),
                path=script_data.get('path', ''),
                status=script_data.get('status', False)
            )
            db.session.add(script)
            db.session.commit()
            
        elif change_type == 'script_update':
            script_id = changes_data.get('script_id')
            new_data = changes_data.get('new_data', {})
            
            script = PeriodicScript.query.get(script_id)
            if script and script.project_id == project_id:
                script.name = new_data.get('name', script.name)
                script.path = new_data.get('path', script.path)
                script.status = new_data.get('status', script.status)
                db.session.commit()
                
        elif change_type == 'script_delete':
            script_id = changes_data.get('script_id')
            script = PeriodicScript.query.get(script_id)
            if script and script.project_id == project_id:
                db.session.delete(script)
                db.session.commit()
        
        elif change_type == 'row_duplicate':
            source_row_id = changes_data.get('source_row_id')
            target_phase_number = changes_data.get('target_phase_number')
            target_position = changes_data.get('target_position', 0)
            
            
            # Get source row
            source_row = Row.query.get(source_row_id)
            if not source_row:
                return jsonify({'error': 'Source row not found'}), 404
            
            # Get target phase
            target_phase = Phase.query.filter_by(
                project_id=project_id,
                phase_number=target_phase_number
            ).first()
            if not target_phase:
                return jsonify({'error': 'Target phase not found'}), 404
            
            # Create duplicate row with same data
            new_row = Row(
                phase_id=target_phase.id,
                role=source_row.role,
                time=source_row.time,
                duration=source_row.duration,
                description=source_row.description,
                script=source_row.script,
                status=source_row.status
            )
            db.session.add(new_row)
            db.session.flush()
            
            
            # To preserve position, get table_data from the submission and use it to reorder
            submission_id = pending_change.submission_id
            table_data_change = PendingChange.query.filter_by(
                project_id=project_id,
                submission_id=submission_id,
                change_type='table_data',
                status='pending'
            ).first()
            
            if table_data_change:
                table_data_json = json.loads(table_data_change.changes_data)
                table_data = table_data_json.get('table_data')
                
                if table_data:
                    # Find the target phase in table_data and update the new row's ID in table_data
                    for phase_data in table_data:
                        if phase_data.get('phase') == target_phase_number:
                            phase_rows = phase_data.get('rows', [])
                            # Update the temporary ID in table_data with the actual new row ID
                            new_row_id_temp = changes_data.get('new_row_id')
                            
                            for row_data in phase_rows:
                                row_id = row_data.get('id')
                                # Compare as strings to handle type mismatches
                                if str(row_id) == str(new_row_id_temp):
                                    row_data['id'] = new_row.id
                                    break
                            
                            
                            # Update the table_data_change.changes_data with the modified table_data
                            # so it can be retrieved later with the correct row ID
                            table_data_json['table_data'] = table_data
                            table_data_change.changes_data = json.dumps(table_data_json)
                            db.session.add(table_data_change)
                            db.session.commit()  # Commit to ensure it's saved before we retrieve it later
                            
                            
                            # Note: table_data will be returned in the response and used by frontend
                            # to preserve order. The frontend will use it instead of reloading from backend.
                            break
            
            db.session.commit()
            
        elif change_type == 'row_move':
            row_id = changes_data.get('row_id')
            source_phase_number = changes_data.get('source_phase_number')
            target_phase_number = changes_data.get('target_phase_number')
            target_position = changes_data.get('target_position', 0)
            
            
            # Get row to move
            row = Row.query.get(row_id)
            if not row:
                return jsonify({'error': 'Row not found'}), 404
            
            # Get target phase
            target_phase = Phase.query.filter_by(
                project_id=project_id,
                phase_number=target_phase_number
            ).first()
            if not target_phase:
                return jsonify({'error': 'Target phase not found'}), 404
            
            # Move row to target phase
            
            # If same phase, we need to preserve position using table_data
            if source_phase_number == target_phase_number:
                # Get table_data from submission to preserve order
                submission_id = pending_change.submission_id
                table_data_change = PendingChange.query.filter_by(
                    project_id=project_id,
                    submission_id=submission_id,
                    change_type='table_data',
                    status='pending'
                ).first()
                
                if table_data_change:
                    table_data_json = json.loads(table_data_change.changes_data)
                    table_data = table_data_json.get('table_data')
                    
                    
                    # Note: Position is preserved by frontend using table_data on reload
                    # The phase_id doesn't change for same-phase moves, so no DB update needed
                else:
                    # No table_data found - this shouldn't happen, but handle gracefully
                    pass
            else:
                # Different phase - update phase_id
                row.phase_id = target_phase.id
                row.updated_at = datetime.utcnow()
            
            db.session.commit()
        
        # Mark change as accepted
        pending_change.status = 'accepted'
        if reviewed_by:
            pending_change.reviewed_by = reviewed_by
            pending_change.reviewed_at = datetime.utcnow()
            db.session.commit()
        
        # Notify all active users about the update (except the manager who made the change)
        active_users = User.query.filter_by(
            project_id=project_id,
            is_active=True
        ).all()
        
        for user in active_users:
            if user.role != project.manager_role or user.name != reviewed_by:
                # For row_move and row_duplicate, we don't send data_updated notifications
                # because these changes require table_data to preserve order, and other users
                # would reload from the backend (ordered by ID) and lose the correct order.
                # Instead, they will get the update through the normal polling mechanism
                # which will eventually show the changes, but without preserving order.
                # TODO: In the future, we could include table_data in the notification.
                if change_type not in ['row_move', 'row_duplicate']:
                    user.notification_command = 'data_updated'
                    user.notification_data = json.dumps({
                        'change_type': change_type,
                        'message': 'Project data has been updated'
                    })
                    user.notification_timestamp = datetime.utcnow()
        
        db.session.commit()
        
        # Check if all changes in this submission are processed
        submission_id = pending_change.submission_id
        
        # Get table_data from submission if available (for preserving row order)
        # Also mark table_data change as accepted if we're accepting row_move or row_duplicate
        # For row_duplicate, the table_data was already modified in the handler above
        # So we need to get it from the same source or update the stored version
        table_data_for_response = None
        if change_type in ['row_move', 'row_duplicate']:
            table_data_change = PendingChange.query.filter_by(
                project_id=project_id,
                submission_id=submission_id,
                change_type='table_data',
                status='pending'
            ).first()
            
            if table_data_change:
                table_data_json = json.loads(table_data_change.changes_data)
                table_data_for_response = table_data_json.get('table_data')
                
                # For row_duplicate, the table_data was modified in the handler above
                # We need to update the stored version with the modified table_data
                # The modified table_data should be in the same object that was modified
                # But since we're getting a fresh copy here, we need to check if it was modified
                # Actually, the modification was done in-place on the table_data object,
                # but we're getting a fresh copy from JSON, so the modification is lost.
                # We need to re-apply the modification or use the modified version.
                
                # Mark table_data change as accepted (so it doesn't show as pending)
                table_data_change.status = 'accepted'
                if reviewed_by:
                    table_data_change.reviewed_by = reviewed_by
                    table_data_change.reviewed_at = datetime.utcnow()
                db.session.commit()
                
                # Update row IDs in table_data to match current database state
                # Also update the database with the correct row order from table_data
                if table_data_for_response:
                    current_phases = Phase.query.filter_by(project_id=project_id).all()
                    current_phases_dict = {p.phase_number: p for p in current_phases}
                    # Build a map of all rows by ID for easy lookup
                    all_current_rows_dict = {}
                    for phase in current_phases:
                        phase_rows = Row.query.filter_by(phase_id=phase.id).all()
                        for row in phase_rows:
                            all_current_rows_dict[row.id] = row
                    
                    for phase_data in table_data_for_response:
                        phase_number = phase_data.get('phase')
                        if phase_number in current_phases_dict:
                            phase = current_phases_dict[phase_number]
                            phase_data['id'] = phase.id
                            phase_data['is_active'] = phase.is_active
                            
                            # Get current rows in this phase
                            current_rows = Row.query.filter_by(phase_id=phase.id).all()
                            current_rows_dict = {r.id: r for r in current_rows}
                            
                            # Map table_data rows to current rows and UPDATE with current DB values
                            # This ensures we only use table_data for ORDER, not for content
                            # (content changes require separate row_update approval)
                            updated_rows = []
                            for row_data in phase_data.get('rows', []):
                                row_id = row_data.get('id')
                                if row_id in current_rows_dict:
                                    # Row exists in this phase - use current DB values
                                    db_row = current_rows_dict[row_id]
                                    updated_rows.append({
                                        'id': db_row.id,
                                        'role': db_row.role,
                                        'time': db_row.time,
                                        'duration': db_row.duration,
                                        'description': db_row.description or '',
                                        'script': db_row.script or '',
                                        'status': db_row.status,
                                        'script_result': db_row.script_result
                                    })
                                elif row_id in all_current_rows_dict:
                                    # Row was moved from another phase - use current DB values
                                    db_row = all_current_rows_dict[row_id]
                                    updated_rows.append({
                                        'id': db_row.id,
                                        'role': db_row.role,
                                        'time': db_row.time,
                                        'duration': db_row.duration,
                                        'description': db_row.description or '',
                                        'script': db_row.script or '',
                                        'status': db_row.status,
                                        'script_result': db_row.script_result
                                    })
                                else:
                                    # Try to find matching row by data (for newly created rows)
                                    matched = False
                                    for current_row in current_rows:
                                        if (current_row.role == row_data.get('role') and
                                            current_row.time == row_data.get('time') and
                                            current_row.duration == row_data.get('duration') and
                                            current_row.description == row_data.get('description', '') and
                                            current_row.script == row_data.get('script', '') and
                                            current_row.status == row_data.get('status', 'N/A')):
                                            updated_rows.append({
                                                'id': current_row.id,
                                                'role': current_row.role,
                                                'time': current_row.time,
                                                'duration': current_row.duration,
                                                'description': current_row.description or '',
                                                'script': current_row.script or '',
                                                'status': current_row.status,
                                                'script_result': current_row.script_result
                                            })
                                            matched = True
                                            break
                                    # If no match found, skip this row (doesn't exist in DB)
                            phase_data['rows'] = updated_rows
                    
                    # Update the database with the correct row order from table_data
                    # This ensures getPhases returns rows in the correct order
                    # We update updated_at timestamps in the order they appear in table_data
                    base_time = datetime.utcnow()
                    for phase_data in table_data_for_response:
                        phase_number = phase_data.get('phase')
                        if phase_number in current_phases_dict:
                            phase = current_phases_dict[phase_number]
                            phase_rows = phase_data.get('rows', [])
                            # Update updated_at for each row in order (with small increments)
                            for position, row_data in enumerate(phase_rows):
                                row_id = row_data.get('id')
                                if row_id and row_id in all_current_rows_dict:
                                    db_row = all_current_rows_dict[row_id]
                                    # Set updated_at to base_time + position seconds
                                    # This ensures rows are ordered by updated_at in the same order as table_data
                                    db_row.updated_at = base_time + timedelta(seconds=position)
                                    db.session.add(db_row)
                    
                    db.session.commit()
        
        # Count remaining pending changes (excluding table_data which is internal metadata)
        remaining_pending = PendingChange.query.filter(
            PendingChange.project_id == project_id,
            PendingChange.submission_id == submission_id,
            PendingChange.status == 'pending',
            PendingChange.change_type != 'table_data'
        ).count()
        
        # Emit real-time update to all clients
        socketio = get_socketio()
        if socketio:
            socketio.emit('phases_updated', {'project_id': project_id}, room=f'project_{project_id}')
            socketio.emit('pending_changes_updated', {'project_id': project_id}, room=f'project_{project_id}')
        
        return jsonify({
            'message': 'Change accepted',
            'submission_id': submission_id,
            'remaining_pending': remaining_pending,
            'all_processed': remaining_pending == 0,
            'table_data': table_data_for_response  # Include table_data for frontend to use
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api.route('/api/projects/<int:project_id>/pending-changes/<int:change_id>/decline', methods=['POST'])
def decline_pending_change(project_id, change_id):
    """Decline an individual pending change"""
    project = Project.query.get_or_404(project_id)
    pending_change = PendingChange.query.filter_by(
        project_id=project_id,
        id=change_id,
        status='pending'
    ).first_or_404()
    
    data = request.get_json()
    reviewed_by = data.get('reviewed_by', '').strip()
    
    try:
        # Mark change as declined
        pending_change.status = 'declined'
        if reviewed_by:
            pending_change.reviewed_by = reviewed_by
            pending_change.reviewed_at = datetime.utcnow()
        db.session.commit()
        
        submission_id = pending_change.submission_id
        change_type = pending_change.change_type
        
        # If declining a structural change (row_move, row_duplicate), also decline table_data
        # since table_data is only meaningful with structural changes
        if change_type in ['row_move', 'row_duplicate']:
            table_data_change = PendingChange.query.filter_by(
                project_id=project_id,
                submission_id=submission_id,
                change_type='table_data',
                status='pending'
            ).first()
            if table_data_change:
                table_data_change.status = 'declined'
                if reviewed_by:
                    table_data_change.reviewed_by = reviewed_by
                    table_data_change.reviewed_at = datetime.utcnow()
                db.session.commit()
    
        # Check if all changes in this submission are processed (excluding table_data)
        remaining_pending = PendingChange.query.filter(
            PendingChange.project_id == project_id,
            PendingChange.submission_id == submission_id,
            PendingChange.status == 'pending',
            PendingChange.change_type != 'table_data'
        ).count()
        
        # Emit real-time update to all clients
        socketio = get_socketio()
        if socketio:
            socketio.emit('phases_updated', {'project_id': project_id}, room=f'project_{project_id}')
            socketio.emit('pending_changes_updated', {'project_id': project_id}, room=f'project_{project_id}')
        
        return jsonify({
            'message': 'Change declined',
            'submission_id': submission_id,
            'remaining_pending': remaining_pending,
            'all_processed': remaining_pending == 0
        }, 200)
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ==================== CHAT ENDPOINTS ====================

@api.route('/api/chat/history/<int:project_id>', methods=['GET'])
def get_chat_history(project_id):
    """Get chat message history for a project"""
    try:
        # Query messages from database: SELECT user_name, content, timestamp 
        # FROM messages WHERE project_id = project_id ORDER BY timestamp ASC
        messages = Message.query.filter_by(project_id=project_id).order_by(Message.timestamp.asc()).all()
        
        # Serialize query results into JSON array
        return jsonify([msg.to_dict() for msg in messages]), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== ACTION LOG ENDPOINTS ====================

@api.route('/api/projects/<int:project_id>/action-logs', methods=['GET'])
def get_action_logs(project_id):
    """Get action logs for a project (manager only)"""
    project = Project.query.get_or_404(project_id)
    
    # Verify manager access
    user_role = request.args.get('user_role', '').strip()
    if not user_role or user_role != project.manager_role:
        return jsonify({'error': 'Only managers can view action logs'}), 403
    
    try:
        # Get optional filters
        action_type = request.args.get('action_type')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        user_name = request.args.get('user_name')
        
        # Build query - only show logs from current reset epoch
        query = ActionLog.query.filter_by(project_id=project_id, reset_epoch=project.reset_epoch)
        
        if action_type:
            query = query.filter_by(action_type=action_type)
        
        if user_name:
            query = query.filter_by(user_name=user_name)
        
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(ActionLog.timestamp >= start_dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(ActionLog.timestamp <= end_dt)
            except ValueError:
                pass
        
        # Order by timestamp descending (most recent first)
        logs = query.order_by(ActionLog.timestamp.desc()).all()
        
        return jsonify([log.to_dict() for log in logs]), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api.route('/api/projects/<int:project_id>/action-logs/pdf', methods=['GET'])
def get_action_logs_pdf(project_id):
    """Generate and download action logs as PDF (manager only)"""
    project = Project.query.get_or_404(project_id)
    
    # Verify manager access
    user_role = request.args.get('user_role', '').strip()
    if not user_role or user_role != project.manager_role:
        return jsonify({'error': 'Only managers can download action logs'}), 403
    
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from io import BytesIO
        import os
        try:
            from bidi.algorithm import get_display
            HAS_BIDI = True
        except ImportError:
            HAS_BIDI = False
            # Fallback: simple Hebrew detection and reversal
            def get_display(text):
                # Check if text contains Hebrew characters (U+0590 to U+05FF)
                if any('\u0590' <= char <= '\u05FF' for char in text):
                    # Reverse the string for RTL display
                    return text[::-1]
                return text
        
        # Helper function to process text for RTL display
        def process_rtl_text(text):
            """Process text for RTL display using bidi algorithm or simple reversal"""
            if HAS_BIDI:
                return get_display(text)
            else:
                return get_display(text)
        
        # Register Hebrew-supporting font (DejaVu Sans)
        # Try to find DejaVu Sans font in common locations
        font_paths = [
            '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',  # Linux
            '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',  # macOS
            'C:/Windows/Fonts/arial.ttf',  # Windows (Arial supports Hebrew)
            'C:/Windows/Fonts/calibri.ttf',  # Windows (Calibri supports Hebrew)
        ]
        
        hebrew_font_name = 'Helvetica'  # Fallback to Helvetica
        hebrew_font_bold_name = 'Helvetica-Bold'
        
        # Try to register a Hebrew-supporting font
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    pdfmetrics.registerFont(TTFont('HebrewFont', font_path))
                    pdfmetrics.registerFont(TTFont('HebrewFont-Bold', font_path))
                    hebrew_font_name = 'HebrewFont'
                    hebrew_font_bold_name = 'HebrewFont-Bold'
                    break
                except Exception:
                    continue
        
        # If DejaVu Sans is not found, try to use system fonts that support Hebrew
        # Arial and Calibri on Windows typically support Hebrew
        if hebrew_font_name == 'Helvetica':
            # Try Windows fonts
            windows_fonts = [
                ('C:/Windows/Fonts/arial.ttf', 'Arial'),
                ('C:/Windows/Fonts/calibri.ttf', 'Calibri'),
                ('C:/Windows/Fonts/tahoma.ttf', 'Tahoma'),
            ]
            for font_path, font_name in windows_fonts:
                if os.path.exists(font_path):
                    try:
                        pdfmetrics.registerFont(TTFont('HebrewFont', font_path))
                        pdfmetrics.registerFont(TTFont('HebrewFont-Bold', font_path))
                        hebrew_font_name = 'HebrewFont'
                        hebrew_font_bold_name = 'HebrewFont-Bold'
                        break
                    except Exception:
                        continue
        
        # Get action logs for the project - only from current reset epoch
        logs = ActionLog.query.filter_by(project_id=project_id, reset_epoch=project.reset_epoch).order_by(ActionLog.timestamp.asc()).all()
        
        # Calculate row index mapping (row_id -> row_index)
        # Load all phases and rows, order by phase_number and row ID to get consistent global row index
        phases = Phase.query.filter_by(project_id=project_id).order_by(Phase.phase_number).all()
        row_id_to_index = {}
        global_row_index = 1
        
        for phase in phases:
            rows = Row.query.filter_by(phase_id=phase.id).order_by(Row.id).all()
            for row in rows:
                row_id_to_index[row.id] = global_row_index
                global_row_index += 1
        
        # Create PDF in memory
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        
        # Container for the 'Flowable' objects
        elements = []
        
        # Define styles with Hebrew font support
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            textColor=colors.HexColor('#000000'),
            spaceAfter=12,
            alignment=1,  # Center alignment
            fontName=hebrew_font_bold_name
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#000000'),
            spaceAfter=6,
            fontName=hebrew_font_name
        )
        
        # Create a normal style with Hebrew font
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontName=hebrew_font_name
        )
        
        # Create RTL paragraph styles for table cells
        rtl_table_header_style = ParagraphStyle(
            'RTLTableHeader',
            parent=styles['Normal'],
            fontName=hebrew_font_bold_name,
            fontSize=10,
            alignment=2,  # RIGHT alignment
            textColor=colors.whitesmoke
        )
        
        rtl_table_cell_style = ParagraphStyle(
            'RTLTableCell',
            parent=styles['Normal'],
            fontName=hebrew_font_name,
            fontSize=8,
            alignment=2,  # RIGHT alignment
            textColor=colors.black
        )
        
        # Title
        title = Paragraph(f"Action Log - {project.name} (Reset Epoch {project.reset_epoch})", title_style)
        elements.append(title)
        elements.append(Spacer(1, 0.2*inch))
        
        # Project info
        info_text = f"Project: {project.name}<br/>Reset Epoch: {project.reset_epoch}<br/>Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}<br/>Total Actions: {len(logs)}"
        info_para = Paragraph(info_text, normal_style)
        elements.append(info_para)
        elements.append(Spacer(1, 0.2*inch))
        
        if not logs:
            no_data = Paragraph("No action logs found for this project.", normal_style)
            elements.append(no_data)
        else:
            # Hebrew translation dictionaries
            column_headers_he = {
                'Timestamp': 'תאריך ושעה',
                'User': 'משתמש',
                'Role': 'תפקיד',
                'Action': 'פעולה',
                'Details': 'פרטים',
                'Script Result': 'תוצאת סקריפט'
            }
            
            action_type_map_he = {
                'row_status_change': 'שינוי סטטוס שורה',
                'script_execution': 'הרצת סקריפט',
                'phase_activation': 'הפעלת שלב',
                'reset_statuses': 'איפוס כל הסטטוסים'
            }
            
            status_messages_he = {
                'Success': 'הצלחה',
                'Failed': 'כשלון',
                'Activated': 'הופעל',
                'Deactivated': 'בוטל',
                'N/A': 'ללא סטטוס',
                'Passed': 'עבר'
            }
            
            details_text_he = {
                'Row #': 'שורה #',
                'Phase': 'שלב',
                'Reset': 'איפוס',
                'rows to N/A': 'שורות ל-ללא סטטוס'
            }
            
            # Prepare table data - RTL order (rightmost column first)
            # Original order: Timestamp, User, Role, Action, Details, Script Result
            # RTL order: Script Result, Details, Action, Role, User, Timestamp
            # Use Paragraph objects with RTL direction for proper Hebrew rendering
            # Process Hebrew text through bidi algorithm for correct RTL display
            table_data = [[
                Paragraph(process_rtl_text(column_headers_he['Script Result']), rtl_table_header_style),
                Paragraph(process_rtl_text(column_headers_he['Details']), rtl_table_header_style),
                Paragraph(process_rtl_text(column_headers_he['Action']), rtl_table_header_style),
                Paragraph(process_rtl_text(column_headers_he['Role']), rtl_table_header_style),
                Paragraph(process_rtl_text(column_headers_he['User']), rtl_table_header_style),
                Paragraph(process_rtl_text(column_headers_he['Timestamp']), rtl_table_header_style)
            ]]
            
            for log in logs:
                # Format timestamp
                timestamp_str = log.timestamp.strftime('%Y-%m-%d %H:%M:%S') if log.timestamp else status_messages_he['N/A']
                
                # Format action type in Hebrew
                action_display = action_type_map_he.get(log.action_type, log.action_type)
                
                # Format details in Hebrew
                details_str = status_messages_he['N/A']
                if log.action_details:
                    try:
                        details = json.loads(log.action_details)
                        if log.action_type == 'row_status_change':
                            old_status = status_messages_he.get(details.get('old_status', 'N/A'), details.get('old_status', 'N/A'))
                            new_status = status_messages_he.get(details.get('new_status', 'N/A'), details.get('new_status', 'N/A'))
                            row_index = row_id_to_index.get(log.row_id, log.row_id)  # Use row index, fallback to row_id if not found
                            details_str = f"{details_text_he['Row #']}{row_index}: {old_status} ← {new_status}"
                        elif log.action_type == 'script_execution':
                            script_path = details.get('script_path', status_messages_he['N/A'])
                            row_index = row_id_to_index.get(log.row_id, log.row_id)  # Use row index, fallback to row_id if not found
                            details_str = f"{details_text_he['Row #']}{row_index}: {script_path}"
                        elif log.action_type == 'phase_activation':
                            status = status_messages_he['Activated'] if details.get('is_active') else status_messages_he['Deactivated']
                            phase_num = details.get('phase_number', status_messages_he['N/A'])
                            details_str = f"{details_text_he['Phase']} {phase_num}: {status}"
                        elif log.action_type == 'reset_statuses':
                            rows_count = details.get('rows_count', 0)
                            details_str = f"{details_text_he['Reset']} {rows_count} {details_text_he['rows to N/A']}"
                    except:
                        details_str = log.action_details[:50]  # Truncate if not JSON
                
                # Format script result in Hebrew
                script_result_str = status_messages_he['N/A']
                if log.script_result is not None:
                    script_result_str = status_messages_he['Success'] if log.script_result else status_messages_he['Failed']
                
                # Append in RTL order: Script Result, Details, Action, Role, User, Timestamp
                # Convert all cells to Paragraph objects with RTL direction for proper Hebrew rendering
                # Process all text through bidi algorithm for correct RTL display
                table_data.append([
                    Paragraph(process_rtl_text(script_result_str), rtl_table_cell_style),
                    Paragraph(process_rtl_text(details_str), rtl_table_cell_style),
                    Paragraph(process_rtl_text(action_display), rtl_table_cell_style),
                    Paragraph(process_rtl_text(log.user_role), rtl_table_cell_style),
                    Paragraph(process_rtl_text(log.user_name), rtl_table_cell_style),
                    Paragraph(process_rtl_text(timestamp_str), rtl_table_cell_style)
                ])
            
            # Create table with Hebrew font support - RTL column widths (reversed)
            # Original widths: [1.5*inch, 1*inch, 1*inch, 1.2*inch, 2*inch, 1*inch]
            # RTL widths: [1*inch, 2*inch, 1.2*inch, 1*inch, 1*inch, 1.5*inch]
            table = Table(table_data, colWidths=[1*inch, 2*inch, 1.2*inch, 1*inch, 1*inch, 1.5*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),  # RTL alignment
                ('FONTNAME', (0, 0), (-1, 0), hebrew_font_bold_name),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
                ('FONTNAME', (0, 1), (-1, -1), hebrew_font_name),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            
            elements.append(table)
        
        # Build PDF
        doc.build(elements)
        
        # Get PDF data
        buffer.seek(0)
        pdf_data = buffer.getvalue()
        buffer.close()
        
        # Return PDF as response
        from flask import Response
        response = Response(pdf_data, mimetype='application/pdf')
        response.headers['Content-Disposition'] = f'attachment; filename=action_log_{project.name}_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.pdf'
        return response
        
    except ImportError:
        return jsonify({'error': 'PDF generation library (reportlab) not installed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api.route('/api/projects/<int:project_id>/action-logs', methods=['DELETE'])
def clear_action_logs(project_id):
    """Clear all action logs for a project (manager only)"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    
    # Verify manager access
    user_role = data.get('user_role', '').strip()
    if not user_role or user_role != project.manager_role:
        return jsonify({'error': 'Only managers can clear action logs'}), 403
    
    try:
        # Delete all action logs for this project
        deleted_count = ActionLog.query.filter_by(project_id=project_id).delete()
        db.session.commit()
        
        return jsonify({
            'message': 'Action logs cleared successfully',
            'deleted_count': deleted_count
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@api.route('/api/projects/<int:project_id>/reset-statuses', methods=['POST'])
def reset_all_statuses(project_id):
    """Reset all row statuses to N/A and increment reset epoch (manager only)"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    
    # Verify manager access
    user_role = data.get('user_role', '').strip()
    user_name = data.get('user_name', '').strip()
    
    if not user_role or user_role != project.manager_role:
        return jsonify({'error': 'Only managers can reset statuses'}), 403
    
    try:
        # Increment reset epoch to start a new log session
        project.reset_epoch += 1
        new_reset_epoch = project.reset_epoch
        
        # Get all rows for this project
        phases = Phase.query.filter_by(project_id=project_id).all()
        rows_count = 0
        
        for phase in phases:
            rows = Row.query.filter_by(phase_id=phase.id).all()
            for row in rows:
                row.status = 'N/A'
                row.updated_at = datetime.utcnow()
                rows_count += 1
        
        db.session.commit()
        
        # Log the reset_statuses action with the new reset_epoch
        ActionLogger.log_reset_statuses(project_id, user_name, user_role, rows_count, new_reset_epoch)
        
        return jsonify({
            'message': 'All statuses reset successfully',
            'rows_reset': rows_count,
            'reset_epoch': new_reset_epoch
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
