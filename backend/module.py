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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    phases = db.relationship('Phase', backref='project', lazy=True, cascade='all, delete-orphan')
    roles = db.relationship('ProjectRole', backref='project', lazy=True, cascade='all, delete-orphan')
    periodic_scripts = db.relationship('PeriodicScript', backref='project', lazy=True, cascade='all, delete-orphan')
    
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
    rows = db.relationship('Row', backref='phase', lazy=True, cascade='all, delete-orphan', order_by='Row.id')
    
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
            'status': self.status
        }


class User(db.Model):
    """User table - for login tracking"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    role = db.Column(db.String(100), nullable=False)
    last_login = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'project_id': self.project_id,
            'role': self.role
        }

