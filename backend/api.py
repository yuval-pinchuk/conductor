# backend/api.py

from flask import Blueprint, request, jsonify
from module import db, Project, Phase, Row, PeriodicScript, ProjectRole, User, PendingChange
from sqlalchemy import func
from datetime import datetime
import json

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
    """Create a pending change request from a non-manager user"""
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    
    submitted_by = data.get('submitted_by', '').strip()
    submitted_by_role = data.get('submitted_by_role', '').strip()
    change_type = data.get('change_type', 'all')  # 'table_data', 'version', 'periodic_scripts', 'all'
    changes_data = data.get('changes_data', {})
    
    if not submitted_by or not submitted_by_role:
        return jsonify({'error': 'submitted_by and submitted_by_role are required'}), 400
    
    # Create pending change
    pending_change = PendingChange(
        project_id=project_id,
        submitted_by=submitted_by,
        submitted_by_role=submitted_by_role,
        change_type=change_type,
        changes_data=json.dumps(changes_data),
        status='pending'
    )
    
    db.session.add(pending_change)
    db.session.commit()
    
    # Notify manager if they're logged in
    manager_role = project.manager_role
    if manager_role:
        manager_user = User.query.filter_by(
            project_id=project_id,
            role=manager_role,
            is_active=True
        ).first()
        
        if manager_user:
            manager_user.notification_command = 'pending_changes'
            manager_user.notification_data = json.dumps({
                'pending_change_id': pending_change.id,
                'submitted_by': submitted_by,
                'submitted_by_role': submitted_by_role
            })
            manager_user.notification_timestamp = datetime.utcnow()
            db.session.commit()
    
    return jsonify(pending_change.to_dict()), 201


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


@api.route('/api/projects/<int:project_id>/pending-changes/<int:change_id>/accept-row', methods=['POST'])
def accept_pending_change_row(project_id, change_id):
    """Accept a single row change from a pending change"""
    project = Project.query.get_or_404(project_id)
    pending_change = PendingChange.query.filter_by(
        project_id=project_id,
        id=change_id,
        status='pending'
    ).first_or_404()
    
    data = request.get_json()
    row_id = data.get('row_id')
    row_action = data.get('action')  # 'update', 'create', 'delete'
    row_data = data.get('row_data')
    reviewed_by = data.get('reviewed_by', '').strip()
    
    if not row_id and row_action != 'create':
        return jsonify({'error': 'row_id is required for update/delete'}), 400
    
    try:
        changes_data = json.loads(pending_change.changes_data)
        change_type = pending_change.change_type
        
        if row_action == 'update' and row_data:
            # Update the row directly
            row = Row.query.get(row_id)
            if row:
                row.role = row_data.get('role', row.role)
                row.time = row_data.get('time', row.time)
                row.duration = row_data.get('duration', row.duration)
                row.description = row_data.get('description', row.description)
                row.script = row_data.get('script', row.script)
                row.status = row_data.get('status', row.status)
                row.updated_at = datetime.utcnow()
                db.session.commit()
                
                # Update the row in pending changes to match the current database state
                # This prevents the frontend from thinking the row was deleted
                if 'table_data' in changes_data:
                    for phase in changes_data['table_data']:
                        if 'rows' in phase:
                            for r in phase['rows']:
                                if r.get('id') == row_id:
                                    # Update the row in changes_data to match what we just applied
                                    r['role'] = row.role
                                    r['time'] = row.time
                                    r['duration'] = row.duration
                                    r['description'] = row.description
                                    r['script'] = row.script
                                    r['status'] = row.status
                                    if row.script_result is not None:
                                        r['scriptResult'] = row.script_result
                                    break
                    pending_change.changes_data = json.dumps(changes_data)
                    db.session.commit()
                
                # Check if all changes are processed
                if _are_all_changes_processed(changes_data, change_type):
                    pending_change.status = 'accepted'
                    if reviewed_by:
                        pending_change.reviewed_by = reviewed_by
                    pending_change.reviewed_at = datetime.utcnow()
                    db.session.commit()
                
                return jsonify({'message': 'Row change accepted'}), 200
                
        elif row_action == 'create' and row_data:
            # Create the row
            phase_id = data.get('phase_id')
            if not phase_id:
                return jsonify({'error': 'phase_id is required for create'}), 400
                
            row = Row(
                phase_id=phase_id,
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
            
            # Remove this row from pending changes (find by matching properties since it has no ID yet)
            if 'table_data' in changes_data:
                for phase in changes_data['table_data']:
                    if 'rows' in phase:
                        phase['rows'] = [
                            r for r in phase['rows'] 
                            if not (
                                r.get('role') == row_data.get('role') and 
                                r.get('time') == row_data.get('time') and 
                                r.get('description') == row_data.get('description') and
                                not r.get('id')  # New rows don't have IDs
                            )
                        ]
                pending_change.changes_data = json.dumps(changes_data)
                db.session.commit()
            
            # Check if all changes are processed
            if _are_all_changes_processed(changes_data, change_type):
                pending_change.status = 'accepted'
                if reviewed_by:
                    pending_change.reviewed_by = reviewed_by
                pending_change.reviewed_at = datetime.utcnow()
                db.session.commit()
            
            return jsonify({'message': 'Row created'}), 200
            
        elif row_action == 'delete':
            # Delete the row
            row = Row.query.get(row_id)
            if row:
                db.session.delete(row)
                db.session.commit()
                
                # Remove this row from pending changes
                if 'table_data' in changes_data:
                    for phase in changes_data['table_data']:
                        if 'rows' in phase:
                            phase['rows'] = [r for r in phase['rows'] if r.get('id') != row_id]
                    pending_change.changes_data = json.dumps(changes_data)
                    db.session.commit()
                
                # Check if all changes are processed
                if _are_all_changes_processed(changes_data, change_type):
                    pending_change.status = 'accepted'
                    if reviewed_by:
                        pending_change.reviewed_by = reviewed_by
                    pending_change.reviewed_at = datetime.utcnow()
                    db.session.commit()
                
                return jsonify({'message': 'Row deleted'}), 200
        
        return jsonify({'error': 'Invalid action or missing data'}), 400
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def _are_all_changes_processed(changes_data, change_type):
    """Check if all changes in changes_data have been processed.
    Since we can only process rows individually via this endpoint,
    we check if all rows are processed. Other change types (version, scripts, roles)
    would need to be processed via the general accept endpoint."""
    # Check table_data changes - if change_type is 'table_data' or 'all'
    if change_type in ('all', 'table_data'):
        if 'table_data' in changes_data:
            # Check if any phase has any rows remaining
            for phase in changes_data['table_data']:
                if 'rows' in phase and len(phase['rows']) > 0:
                    return False
    
    # If change_type is 'table_data', we're done checking
    if change_type == 'table_data':
        return True
    
    # For 'all' change type, we can only mark as accepted if:
    # 1. All rows are processed (checked above)
    # 2. There are no other change types that need processing
    # Since version/scripts/roles can't be processed individually,
    # we only mark as accepted if they don't exist in changes_data
    if change_type == 'all':
        # Check if version exists and needs processing
        if 'version' in changes_data and changes_data.get('version'):
            return False
        
        # Check if periodic_scripts exist and need processing
        if 'periodic_scripts' in changes_data and len(changes_data.get('periodic_scripts', [])) > 0:
            return False
        
        # Check if roles exist and need processing
        if 'roles' in changes_data and len(changes_data.get('roles', [])) > 0:
            return False
    
    return True


@api.route('/api/projects/<int:project_id>/pending-changes/<int:change_id>/accept', methods=['POST'])
def accept_pending_change(project_id, change_id):
    """Accept a pending change and apply it"""
    project = Project.query.get_or_404(project_id)
    pending_change = PendingChange.query.filter_by(
        project_id=project_id,
        id=change_id,
        status='pending'
    ).first_or_404()
    
    data = request.get_json()
    reviewed_by = data.get('reviewed_by', '').strip()
    
    if not reviewed_by:
        return jsonify({'error': 'reviewed_by is required'}), 400
    
    changes_data = json.loads(pending_change.changes_data)
    change_type = pending_change.change_type
    
    try:
        # Apply the changes based on type
        if change_type in ('all', 'version') and 'version' in changes_data:
            project.version = changes_data['version']
        
        if change_type in ('all', 'table_data') and 'table_data' in changes_data:
            # Apply table data changes (phases and rows) - reuse logic from update_table_data
            table_data = changes_data['table_data']
            
            # Get existing phases
            existing_phases = {p.phase_number: p for p in Phase.query.filter_by(project_id=project_id).all()}
            existing_phase_numbers = set(existing_phases.keys())
            new_phase_numbers = {phase.get('phase') for phase in table_data if phase.get('phase')}
            
            # Delete phases that are not in the new data
            phases_to_delete = existing_phase_numbers - new_phase_numbers
            for phase_num in phases_to_delete:
                phase = existing_phases.get(phase_num)
                if phase:
                    db.session.delete(phase)
            
            # Update or create phases and rows
            for phase_data in table_data:
                phase_number = phase_data.get('phase')
                if not phase_number:
                    continue
                
                phase = existing_phases.get(phase_number)
                if not phase:
                    phase = Phase(project_id=project_id, phase_number=phase_number, is_active=False)
                    db.session.add(phase)
                    db.session.flush()  # Get the phase ID
                
                # Update rows
                existing_rows = {r.id: r for r in Row.query.filter_by(phase_id=phase.id).all()}
                existing_row_ids = set(existing_rows.keys())
                new_row_ids = {row.get('id') for row in phase_data.get('rows', []) if row.get('id')}
                
                # Delete rows that are not in the new data
                rows_to_delete = existing_row_ids - new_row_ids
                for row_id in rows_to_delete:
                    row = existing_rows.get(row_id)
                    if row:
                        db.session.delete(row)
                
                # Update or create rows
                for row_data in phase_data.get('rows', []):
                    row_id = row_data.get('id')
                    if row_id and row_id in existing_rows:
                        # Update existing row
                        row = existing_rows[row_id]
                        row.role = row_data.get('role', row.role)
                        row.time = row_data.get('time', row.time)
                        row.duration = row_data.get('duration', row.duration)
                        row.description = row_data.get('description', row.description)
                        row.script = row_data.get('script', row.script)
                        row.status = row_data.get('status', row.status)
                        row.script_result = row_data.get('scriptResult', row.script_result)
                        row.updated_at = datetime.utcnow()
                    else:
                        # Create new row
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
        
        if change_type in ('all', 'periodic_scripts') and 'periodic_scripts' in changes_data:
            # Apply periodic scripts changes - reuse logic from update_periodic_scripts_bulk
            scripts_data = changes_data['periodic_scripts']
            
            # Get existing scripts
            existing_scripts = {s.id: s for s in PeriodicScript.query.filter_by(project_id=project_id).all()}
            existing_script_ids = set(existing_scripts.keys())
            new_script_ids = {script.get('id') for script in scripts_data if script.get('id')}
            
            # Delete scripts that are not in the new data
            scripts_to_delete = existing_script_ids - new_script_ids
            for script_id in scripts_to_delete:
                script = existing_scripts.get(script_id)
                if script:
                    db.session.delete(script)
            
            # Update or create scripts
            for script_data in scripts_data:
                script_id = script_data.get('id')
                if script_id and script_id in existing_scripts:
                    # Update existing script
                    script = existing_scripts[script_id]
                    script.name = script_data.get('name', script.name)
                    script.path = script_data.get('path', script.path)
                    script.status = script_data.get('status', script.status)
                    script.updated_at = datetime.utcnow()
                else:
                    # Create new script
                    script = PeriodicScript(
                        project_id=project_id,
                        name=script_data.get('name', ''),
                        path=script_data.get('path', ''),
                        status=script_data.get('status', False)
                    )
                    db.session.add(script)
        
        # Save roles if provided
        if change_type in ('all', 'roles') and 'roles' in changes_data:
            new_roles = changes_data['roles']
            if isinstance(new_roles, list):
                # Get existing roles
                existing_roles = {r.role_name for r in ProjectRole.query.filter_by(project_id=project_id).all()}
                
                # Add new roles that don't exist
                for role_name in new_roles:
                    if role_name and role_name not in existing_roles:
                        project_role = ProjectRole(project_id=project_id, role_name=role_name)
                        db.session.add(project_role)
        
        # Mark as accepted
        pending_change.status = 'accepted'
        pending_change.reviewed_by = reviewed_by
        pending_change.reviewed_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'message': 'Pending change accepted',
            'pending_change': pending_change.to_dict(),
            'changes_data': changes_data
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to apply changes: {str(e)}'}), 500


@api.route('/api/projects/<int:project_id>/pending-changes/<int:change_id>/decline', methods=['POST'])
def decline_pending_change(project_id, change_id):
    """Decline a pending change"""
    project = Project.query.get_or_404(project_id)
    pending_change = PendingChange.query.filter_by(
        project_id=project_id,
        id=change_id,
        status='pending'
    ).first_or_404()
    
    data = request.get_json()
    reviewed_by = data.get('reviewed_by', '').strip()
    
    if not reviewed_by:
        return jsonify({'error': 'reviewed_by is required'}), 400
    
    pending_change.status = 'declined'
    pending_change.reviewed_by = reviewed_by
    pending_change.reviewed_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify(pending_change.to_dict()), 200

