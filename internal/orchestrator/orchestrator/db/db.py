import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

def get_app_data_directory():
    """Get the appropriate application data directory for the current platform."""
    if sys.platform == "win32":
        # Windows: Use APPDATA
        base_dir = Path(os.environ.get('APPDATA', os.path.expanduser('~')))
        app_dir = base_dir / 'Agentkube'
    elif sys.platform == "darwin":
        # macOS: Use ~/Library/Application Support
        base_dir = Path.home() / 'Library' / 'Application Support'
        app_dir = base_dir / 'Agentkube'
    else:
        # Linux: Use ~/.local/share
        base_dir = Path.home() / '.local' / 'share'
        app_dir = base_dir / 'agentkube'
    
    # Create the directory if it doesn't exist
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir

def get_database_path():
    """Get the full path to the database file."""
    app_data_dir = get_app_data_directory()
    db_path = app_data_dir / 'app.db'
    
    # Ensure the parent directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    return db_path

# Database configuration with proper path
database_path = get_database_path()
SQLALCHEMY_DATABASE_URL = f"sqlite:///{database_path}"

# SQLAlchemy engine
# Note: check_same_thread=False is needed only for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    echo=False  # Set to True for SQL debugging
)

# SessionLocal class will be used to create database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# get DB session
def get_db():
    """
    Dependency function that yields a SQLAlchemy session
    and ensures it's closed after use
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()