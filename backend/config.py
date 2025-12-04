# backend/config.py

# Flask Server Configuration
SERVER_HOST = '127.0.0.1'
SERVER_PORT = 5000
DEBUG = True

# MySQL Database Configuration
DB_HOST = 'localhost'
DB_PORT = 3306
DB_USER = 'root'
DB_PASSWORD = '9Lper2as!'
DB_NAME = 'conductor'

# Construct MySQL connection string
SQLALCHEMY_DATABASE_URI = f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'

# SQLAlchemy settings
SQLALCHEMY_TRACK_MODIFICATIONS = False
SQLALCHEMY_ECHO = False  # Set to True for SQL query logging

