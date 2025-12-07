# backend/api.py

from flask import Blueprint, request, jsonify
from module import db, Project, Phase, Row, PeriodicScript, ProjectRole, User, PendingChange
from sqlalchemy import func
from datetime import datetime
import json
import uuid

api = Blueprint('api', __name__)


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
    phases = Phase.query.filter_by(project_id=project_id).order_by(Phase.phase_number).all()
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
    phase.is_active = not phase.is_active
    phase.updated_at = datetime.utcnow()
    db.session.commit()
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
    
    row.role = data.get('role', row.role)
    row.time = data.get('time', row.time)
    row.duration = data.get('duration', row.duration)
    row.description = data.get('description', row.description)
    row.script = data.get('script', row.script)
    row.status = data.get('status', row.status)
    row.script_result = data.get('scriptResult', row.script_result)
    row.updated_at = datetime.utcnow()
    
    db.session.commit()
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
    
    # TODO: Implement actual script execution
    # For now, simulate with random result
    import random
    result = random.choice([True, False])
    
    row.script_result = result
    row.updated_at = datetime.utcnow()
    db.session.commit()
    
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
    
    # TODO: Implement actual script execution
    # For now, simulate with random result
    import random
    result = random.choice([True, False])
    
    script.status = result
    script.last_executed = datetime.utcnow()
    script.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'result': result, 'script': script.to_dict()}), 200


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
    """Get all active logins for a project"""
    active_users = User.query.filter_by(project_id=project_id, is_active=True).all()
    return jsonify([user.to_dict() for user in active_users]), 200


@api.route('/api/projects/<int:project_id>/login', methods=['POST'])
def register_login(project_id):
    """Register a user login - marks role as taken"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    name = (data.get('name') or '').strip()
    role = (data.get('role') or '').strip()
    
    if not name or not role:
        return jsonify({'error': 'Name and role are required'}), 400
    
    # Check if role is already taken
    existing_active = User.query.filter_by(
        project_id=project_id, 
        role=role, 
        is_active=True
    ).first()
    
    if existing_active:
        return jsonify({
            'error': f'Role "{role}" is already in use by {existing_active.name}'
        }), 409
    
    # Create or update user record
    user = User.query.filter_by(
        project_id=project_id,
        role=role,
        name=name
    ).first()
    
    if user:
        # Update existing user
        user.is_active = True
        user.last_login = datetime.utcnow()
    else:
        # Create new user
        user = User(
            project_id=project_id,
            role=role,
            name=name,
            is_active=True,
            last_login=datetime.utcnow()
        )
        db.session.add(user)
    
    db.session.commit()
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
        return jsonify({'message': 'Logout successful'}), 200
    else:
        return jsonify({'error': 'Active login not found'}), 404


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
    
    return jsonify({
        'command': user.notification_command,
        'data': json.loads(user.notification_data) if user.notification_data else None,
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
                if not phase_number:
                    continue
                
                new_rows = phase_data.get('rows', [])
                current_rows = current_rows_by_phase.get(phase_number, {})
                current_row_ids = set(current_rows.keys())
                new_row_ids = {row.get('id') for row in new_rows if row.get('id')}
                
                # Find added rows (rows in new but not in current)
                for new_row in new_rows:
                    row_id = new_row.get('id')
                    if not row_id or row_id not in current_row_ids:
                        # This is a new row
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
                
                # Find modified rows
                for new_row in new_rows:
                    row_id = new_row.get('id')
                    if row_id and row_id in current_row_ids:
                        current_row = current_rows[row_id]
                        # Check if row was actually modified
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
                deleted_row_ids = current_row_ids - new_row_ids
                for row_id in deleted_row_ids:
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
                row.role = new_data.get('role', row.role)
                row.time = new_data.get('time', row.time)
                row.duration = new_data.get('duration', row.duration)
                row.description = new_data.get('description', row.description)
                row.script = new_data.get('script', row.script)
                row.status = new_data.get('status', row.status)
                row.updated_at = datetime.utcnow()
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
                user.notification_command = 'data_updated'
                user.notification_data = json.dumps({
                    'change_type': change_type,
                    'message': 'Project data has been updated'
                })
                user.notification_timestamp = datetime.utcnow()
        
        db.session.commit()
        
        # Check if all changes in this submission are processed
        submission_id = pending_change.submission_id
        remaining_pending = PendingChange.query.filter_by(
            project_id=project_id,
            submission_id=submission_id,
            status='pending'
        ).count()
        
        return jsonify({
            'message': 'Change accepted',
            'submission_id': submission_id,
            'remaining_pending': remaining_pending,
            'all_processed': remaining_pending == 0
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
    
        # Check if all changes in this submission are processed
        submission_id = pending_change.submission_id
        remaining_pending = PendingChange.query.filter_by(
            project_id=project_id,
            submission_id=submission_id,
            status='pending'
        ).count()
        
        return jsonify({
            'message': 'Change declined',
            'submission_id': submission_id,
            'remaining_pending': remaining_pending,
            'all_processed': remaining_pending == 0
        }, 200)
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

