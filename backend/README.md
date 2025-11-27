# Conductor Backend

Flask backend server for the Conductor application.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Configure MySQL database:
   - Update `config.py` with your MySQL credentials
   - Create the database: `CREATE DATABASE conductor_db;`

3. Run the server:
```bash
python main.py
```

The server will start on `http://127.0.0.1:5000`

## API Endpoints

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/<id>` - Get a specific project
- `PUT /api/projects/<id>/version` - Update project version

### Phases
- `GET /api/projects/<id>/phases` - Get all phases for a project
- `POST /api/projects/<id>/phases` - Create a new phase
- `DELETE /api/phases/<id>` - Delete a phase
- `PUT /api/phases/<id>/toggle-active` - Toggle phase active status

### Rows
- `POST /api/phases/<id>/rows` - Create a new row
- `PUT /api/rows/<id>` - Update a row
- `DELETE /api/rows/<id>` - Delete a row
- `POST /api/rows/<id>/run-script` - Run script for a row

### Periodic Scripts
- `GET /api/projects/<id>/periodic-scripts` - Get all periodic scripts
- `POST /api/projects/<id>/periodic-scripts` - Create a new periodic script
- `PUT /api/periodic-scripts/<id>` - Update a periodic script
- `DELETE /api/periodic-scripts/<id>` - Delete a periodic script
- `POST /api/periodic-scripts/<id>/execute` - Execute a periodic script

### Roles
- `GET /api/projects/<id>/roles` - Get all roles for a project
- `POST /api/projects/<id>/roles` - Add a new role to a project

### Bulk Updates
- `PUT /api/projects/<id>/table-data` - Bulk update table data
- `PUT /api/projects/<id>/periodic-scripts/bulk` - Bulk update periodic scripts

