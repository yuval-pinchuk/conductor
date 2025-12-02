# backend/api.py

from flask import Blueprint, request, jsonify
from module import db, Project, Phase, Row, PeriodicScript, ProjectRole, User
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

