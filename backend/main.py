# backend/main.py

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from config import SQLALCHEMY_DATABASE_URI, SQLALCHEMY_TRACK_MODIFICATIONS, SERVER_HOST, SERVER_PORT, DEBUG
from module import db, Project
from api import api
from datetime import datetime

# Initialize SocketIO (will be initialized after app creation)
# Use 'eventlet' or 'gevent' for better async support, fallback to 'threading'
socketio = SocketIO(cors_allowed_origins="*", async_mode='threading', logger=True, engineio_logger=True)

def create_app():
    """Create and configure the Flask application"""
    app = Flask(__name__)
    
    # Configure database
    app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = SQLALCHEMY_TRACK_MODIFICATIONS
    
    # Initialize database
    db.init_app(app)
    
    # Enable CORS for frontend
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Register API blueprint
    app.register_blueprint(api)
    
    # Initialize SocketIO with app
    socketio.init_app(app)
    
    # Socket.IO event handlers
    @socketio.on('connect')
    def handle_connect():
        print('Client connected')
    
    @socketio.on('disconnect')
    def handle_disconnect():
        print('Client disconnected')
    
    @socketio.on('join_timer_room')
    def handle_join_timer_room(data):
        """Join a room for a specific project timer"""
        project_id = data.get('project_id')
        if project_id:
            room = f'timer_{project_id}'
            join_room(room)
            print(f'Client joined room: {room}')
    
    @socketio.on('requestStart')
    def handle_request_start(data):
        """Handle timer start request"""
        try:
            project_id = data.get('project_id')
            if not project_id:
                return
            
            with db.session.begin():
                project = Project.query.get(project_id)
                if not project:
                    return
                
                # Record server timestamp as last start time
                now = datetime.utcnow()
                project.timer_is_running = True
                project.timer_last_start_time = now
                db.session.flush()
                
                # Get the offset before commit
                initial_offset = project.timer_initial_offset
            
            # Broadcast the new state to all clients in the room (after commit)
            room = f'timer_{project_id}'
            emit('timerStateUpdate', {
                'isRunning': True,
                'lastStartTime': now.isoformat() + 'Z',  # Explicitly mark as UTC
                'initialOffset': initial_offset,
                'targetDateTime': project.timer_target_datetime.isoformat() + 'Z' if project.timer_target_datetime else None
            }, room=room)
        except Exception as e:
            print(f'Error in handle_request_start: {e}')
            import traceback
            traceback.print_exc()
    
    @socketio.on('requestStop')
    def handle_request_stop(data):
        """Handle timer stop request"""
        try:
            project_id = data.get('project_id')
            if not project_id:
                return
            
            with db.session.begin():
                project = Project.query.get(project_id)
                if not project:
                    return
                
                # Calculate final elapsed time
                if project.timer_is_running and project.timer_last_start_time:
                    now = datetime.utcnow()
                    elapsed_this_run = int((now - project.timer_last_start_time).total_seconds())
                    project.timer_initial_offset += elapsed_this_run
                    project.timer_is_running = False
                    project.timer_last_start_time = None
                else:
                    project.timer_is_running = False
                
                db.session.flush()
                
                # Get the offset before commit
                final_offset = project.timer_initial_offset
            
            # Broadcast the new state to all clients in the room (after commit)
            room = f'timer_{project_id}'
            emit('timerStateUpdate', {
                'isRunning': False,
                'lastStartTime': None,
                'initialOffset': final_offset,
                'targetDateTime': project.timer_target_datetime.isoformat() + 'Z' if project.timer_target_datetime else None
            }, room=room)
        except Exception as e:
            print(f'Error in handle_request_stop: {e}')
            import traceback
            traceback.print_exc()
    
    @socketio.on('requestSetTime')
    def handle_request_set_time(data):
        """Handle timer set time request"""
        try:
            project_id = data.get('project_id')
            total_seconds = data.get('total_seconds')
            if not project_id or total_seconds is None:
                return
            
            with db.session.begin():
                project = Project.query.get(project_id)
                if not project:
                    return
                
                # Stop the timer first if it's running
                if project.timer_is_running and project.timer_last_start_time:
                    now = datetime.utcnow()
                    elapsed_this_run = int((now - project.timer_last_start_time).total_seconds())
                    project.timer_initial_offset += elapsed_this_run
                
                # Set the new time (total_seconds is the absolute time we want)
                project.timer_initial_offset = total_seconds
                
                # Stop the timer
                project.timer_is_running = False
                project.timer_last_start_time = None
                
                db.session.flush()
                final_offset = project.timer_initial_offset
            
            # Broadcast the new state to all clients in the room
            room = f'timer_{project_id}'
            emit('timerStateUpdate', {
                'isRunning': False,
                'lastStartTime': None,
                'initialOffset': final_offset,
                'targetDateTime': project.timer_target_datetime.isoformat() + 'Z' if project.timer_target_datetime else None
            }, room=room)
        except Exception as e:
            print(f'Error in handle_request_set_time: {e}')
            import traceback
            traceback.print_exc()
    
    @socketio.on('requestSetTarget')
    def handle_request_set_target(data):
        """Handle timer set target time request"""
        try:
            project_id = data.get('project_id')
            target_datetime_str = data.get('target_datetime')
            if not project_id or not target_datetime_str:
                return
            
            with db.session.begin():
                project = Project.query.get(project_id)
                if not project:
                    return
                
                # Parse the target datetime string (comes as ISO string from frontend)
                try:
                    target_datetime = datetime.fromisoformat(target_datetime_str.replace('Z', '+00:00'))
                except ValueError:
                    # Try parsing without timezone
                    target_datetime = datetime.fromisoformat(target_datetime_str)
                
                project.timer_target_datetime = target_datetime
                
                # If timer is running, we need to calculate the offset based on target
                if project.timer_is_running:
                    now = datetime.utcnow()
                    # Calculate seconds until/from target
                    diff_seconds = int((target_datetime - now).total_seconds())
                    # Set initial offset to this difference
                    project.timer_initial_offset = diff_seconds
                    project.timer_last_start_time = now
                else:
                    # Timer not running, just set the target
                    # Calculate what the offset should be when we start
                    now = datetime.utcnow()
                    diff_seconds = int((target_datetime - now).total_seconds())
                    project.timer_initial_offset = diff_seconds
                
                db.session.flush()
                final_offset = project.timer_initial_offset
                final_target = project.timer_target_datetime
            
            # Broadcast the new state to all clients in the room
            room = f'timer_{project_id}'
            emit('timerStateUpdate', {
                'isRunning': project.timer_is_running,
                'lastStartTime': project.timer_last_start_time.isoformat() + 'Z' if project.timer_last_start_time else None,
                'initialOffset': final_offset,
                'targetDateTime': final_target.isoformat() + 'Z' if final_target else None
            }, room=room)
        except Exception as e:
            print(f'Error in handle_request_set_target: {e}')
            import traceback
            traceback.print_exc()
    
    @socketio.on('requestClearTarget')
    def handle_request_clear_target(data):
        """Handle timer clear target time request"""
        try:
            project_id = data.get('project_id')
            if not project_id:
                return
            
            with db.session.begin():
                project = Project.query.get(project_id)
                if not project:
                    return
                
                # Clear target datetime
                project.timer_target_datetime = None
                
                # If timer is running, we need to recalculate offset
                if project.timer_is_running and project.timer_last_start_time:
                    now = datetime.utcnow()
                    elapsed_this_run = int((now - project.timer_last_start_time).total_seconds())
                    # Reset to accumulated time (not countdown)
                    project.timer_initial_offset = elapsed_this_run
                    project.timer_last_start_time = now
                
                db.session.flush()
                final_offset = project.timer_initial_offset
            
            # Broadcast the new state to all clients in the room
            room = f'timer_{project_id}'
            emit('timerStateUpdate', {
                'isRunning': project.timer_is_running,
                'lastStartTime': project.timer_last_start_time.isoformat() + 'Z' if project.timer_last_start_time else None,
                'initialOffset': final_offset,
                'targetDateTime': None
            }, room=room)
        except Exception as e:
            print(f'Error in handle_request_clear_target: {e}')
            import traceback
            traceback.print_exc()
    
    # Create tables
    with app.app_context():
        db.create_all()
    
    return app


if __name__ == '__main__':
    app = create_app()
    socketio.run(app, host=SERVER_HOST, port=SERVER_PORT, debug=DEBUG, allow_unsafe_werkzeug=True)

