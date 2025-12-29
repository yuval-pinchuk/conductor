# backend/module.py

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()


class Project(db.Model):
    """Project table"""
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    version = db.Column(db.String(50), nullable=False, default='v1.0.0')
    manager_password_hash = db.Column(db.String(255), nullable=True)
    manager_role = db.Column(db.String(100), nullable=True)
    clock_command = db.Column(db.String(50), nullable=True)  # 'set_time', 'start', 'stop', 'set_target', 'clear_target'
    clock_command_data = db.Column(db.Text, nullable=True)  # JSON string with command parameters
    clock_command_timestamp = db.Column(db.DateTime, nullable=True)
    # Timer fields for Socket.IO-based collaborative timer
    timer_is_running = db.Column(db.Boolean, default=False, nullable=False)
    timer_last_start_time = db.Column(db.DateTime, nullable=True)  # Server timestamp when timer was started
    timer_initial_offset = db.Column(db.Integer, default=0, nullable=False)  # Total seconds elapsed before current run
    timer_target_datetime = db.Column(db.DateTime, nullable=True)  # Target datetime for countdown
    reset_epoch = db.Column(db.Integer, default=0, nullable=False)  # Tracks current reset epoch for log differentiation
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    phases = db.relationship('Phase', backref='project', lazy=True, cascade='all, delete-orphan')
    roles = db.relationship('ProjectRole', backref='project', lazy=True, cascade='all, delete-orphan')
    periodic_scripts = db.relationship('PeriodicScript', backref='project', lazy=True, cascade='all, delete-orphan')
    messages = db.relationship('Message', backref='project', lazy=True, cascade='all, delete-orphan')
    action_logs = db.relationship('ActionLog', backref='project', lazy=True, cascade='all, delete-orphan')
    
    def set_manager_password(self, raw_password: str):
        if raw_password:
            self.manager_password_hash = generate_password_hash(raw_password)
        else:
            self.manager_password_hash = None

    def check_manager_password(self, raw_password: str) -> bool:
        if not self.manager_password_hash:
            return True
        if not raw_password:
            return False
        return check_password_hash(self.manager_password_hash, raw_password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'version': self.version,
            'roles': [pr.role_name for pr in self.roles],
            'is_locked': self.manager_password_hash is not None,
            'manager_role': self.manager_role,
            'clock_command': self.clock_command,
            'clock_command_data': self.clock_command_data,
            'clock_command_timestamp': self.clock_command_timestamp.isoformat() if self.clock_command_timestamp else None
        }


class ProjectRole(db.Model):
    """Project roles table - many-to-many relationship between projects and roles"""
    __tablename__ = 'project_roles'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    role_name = db.Column(db.String(100), nullable=False)
    
    __table_args__ = (db.UniqueConstraint('project_id', 'role_name', name='unique_project_role'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'role_name': self.role_name
        }


class Phase(db.Model):
    """Phase table"""
    __tablename__ = 'phases'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    phase_number = db.Column(db.Integer, nullable=False)
    is_active = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    rows = db.relationship('Row', backref='phase', lazy=True, cascade='all, delete-orphan', order_by='Row.updated_at, Row.id')
    
    __table_args__ = (db.UniqueConstraint('project_id', 'phase_number', name='unique_project_phase'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'phase': self.phase_number,
            'is_active': self.is_active,
            'rows': [row.to_dict() for row in self.rows]
        }


class Row(db.Model):
    """Row table - individual rows within phases"""
    __tablename__ = 'rows'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    phase_id = db.Column(db.Integer, db.ForeignKey('phases.id', ondelete='CASCADE'), nullable=False)
    role = db.Column(db.String(100), nullable=False)
    time = db.Column(db.String(20), nullable=False, default='00:00:00')  # Format: hh:mm:ss or +/-hh:mm:ss
    duration = db.Column(db.String(20), nullable=False, default='00:00')  # Format: mm:ss
    description = db.Column(db.Text, nullable=True)
    script = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(50), nullable=False, default='N/A')  # Passed, Failed, N/A
    script_result = db.Column(db.Boolean, nullable=True)  # True/False/None
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role,
            'time': self.time,
            'duration': self.duration,
            'description': self.description or '',
            'script': self.script or '',
            'status': self.status,
            'scriptResult': self.script_result
        }


class PeriodicScript(db.Model):
    """Periodic scripts table"""
    __tablename__ = 'periodic_scripts'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    path = db.Column(db.String(500), nullable=False)
    status = db.Column(db.Boolean, default=False)
    last_executed = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'path': self.path,
            'status': self.status,
            'last_executed': self.last_executed.isoformat() if self.last_executed else None
        }


class User(db.Model):
    """User table - for login tracking"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    role = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    notification_command = db.Column(db.String(50), nullable=True)  # 'show_modal'
    notification_data = db.Column(db.Text, nullable=True)  # JSON string with notification data
    notification_timestamp = db.Column(db.DateTime, nullable=True)
    last_login = db.Column(db.DateTime, nullable=True)
    last_seen = db.Column(db.DateTime, nullable=True)  # Updated by heartbeat, used to detect stale sessions
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'project_id': self.project_id,
            'role': self.role,
            'is_active': self.is_active,
            'notification_command': self.notification_command,
            'notification_data': self.notification_data,
            'notification_timestamp': self.notification_timestamp.isoformat() if self.notification_timestamp else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None
        }


class PendingChange(db.Model):
    """Pending changes table - stores edit requests from non-managers"""
    __tablename__ = 'pending_changes'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    submission_id = db.Column(db.String(255), nullable=False, index=True)  # Groups changes from the same submission
    submitted_by = db.Column(db.String(255), nullable=False)
    submitted_by_role = db.Column(db.String(100), nullable=False)
    change_type = db.Column(db.String(50), nullable=False)  # 'row_add', 'row_update', 'row_delete', 'version', 'role_add', 'role_delete', 'script_add', 'script_update', 'script_delete'
    changes_data = db.Column(db.Text, nullable=False)  # JSON string
    status = db.Column(db.String(20), nullable=False, default='pending')  # 'pending', 'accepted', 'declined'
    reviewed_by = db.Column(db.String(255), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'submission_id': self.submission_id,
            'submitted_by': self.submitted_by,
            'submitted_by_role': self.submitted_by_role,
            'change_type': self.change_type,
            'changes_data': self.changes_data,
            'status': self.status,
            'reviewed_by': self.reviewed_by,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Message(db.Model):
    """Chat messages table - stores persistent chat history"""
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    user_name = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    user_role = db.Column(db.String(100), nullable=True)
    user_id = db.Column(db.String(255), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'userName': self.user_name,
            'user': self.user_name,
            'message': self.content,
            'content': self.content,
            'userRole': self.user_role or 'Unknown',
            'userId': self.user_id,
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None
        }


class RelatedDocument(db.Model):
    """Related documents table - stores links to related documents (URLs or local files)"""
    __tablename__ = 'related_documents'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(1000), nullable=False)
    is_local_file = db.Column(db.Boolean, default=False, nullable=False)
    order_index = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'name': self.name,
            'url': self.url,
            'is_local_file': self.is_local_file,
            'order_index': self.order_index,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None
        }


class ActionLog(db.Model):
    """Action log table - stores user actions for auditing"""
    __tablename__ = 'action_logs'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    user_name = db.Column(db.String(255), nullable=False)
    user_role = db.Column(db.String(100), nullable=False)
    action_type = db.Column(db.String(50), nullable=False)  # 'row_status_change', 'script_execution', 'phase_activation'
    action_details = db.Column(db.Text, nullable=True)  # JSON string for flexible data storage
    script_result = db.Column(db.Boolean, nullable=True)  # Only for script executions
    row_id = db.Column(db.Integer, nullable=True)  # For row-related actions
    phase_id = db.Column(db.Integer, nullable=True)  # For phase-related actions
    reset_epoch = db.Column(db.Integer, default=0, nullable=False, index=True)  # Tracks which reset epoch this log belongs to
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    def to_dict(self):
        import json
        return {
            'id': self.id,
            'project_id': self.project_id,
            'user_name': self.user_name,
            'user_role': self.user_role,
            'action_type': self.action_type,
            'action_details': json.loads(self.action_details) if self.action_details else None,
            'script_result': self.script_result,
            'row_id': self.row_id,
            'phase_id': self.phase_id,
            'reset_epoch': self.reset_epoch,
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None
        }
