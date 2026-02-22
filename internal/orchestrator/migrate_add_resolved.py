#!/usr/bin/env python3
"""
Simple migration script to add 'resolved' column to tasks and investigation_tasks tables.
Run this once to update your database schema.
"""
import sqlite3
import sys
import os
from pathlib import Path

def get_database_path():
    """Get the database path (same logic as orchestrator/db/db.py)"""
    if sys.platform == "darwin":  # macOS
        base_dir = Path.home() / 'Library' / 'Application Support'
        app_dir = base_dir / 'Agentkube'
    elif sys.platform == "win32":  # Windows
        base_dir = Path(os.environ.get('APPDATA', os.path.expanduser('~')))
        app_dir = base_dir / 'Agentkube'
    else:  # Linux
        base_dir = Path.home() / '.local' / 'share'
        app_dir = base_dir / 'agentkube'
    
    return app_dir / 'app.db'

def migrate():
    """Add resolved column to tasks and investigation_tasks tables."""
    db_path = get_database_path()
    
    print(f"Database location: {db_path}")
    
    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        print("Please run the orchestrator at least once to create the database.")
        sys.exit(1)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if tasks table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
        if not cursor.fetchone():
            print("❌ 'tasks' table doesn't exist. Please run the orchestrator first.")
            sys.exit(1)
        
        # Check if column already exists in tasks table
        cursor.execute("PRAGMA table_info(tasks)")
        tasks_columns = [col[1] for col in cursor.fetchall()]
        
        if 'resolved' not in tasks_columns:
            print("Adding 'resolved' column to 'tasks' table...")
            cursor.execute("ALTER TABLE tasks ADD COLUMN resolved INTEGER DEFAULT 0")
            # Set all existing records to resolved=0 (False)
            cursor.execute("UPDATE tasks SET resolved = 0")
            print("✓ Successfully added 'resolved' to 'tasks' table")
        else:
            print("✓ Column 'resolved' already exists in 'tasks' table")
        
        # Check if investigation_tasks table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='investigation_tasks'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(investigation_tasks)")
            inv_tasks_columns = [col[1] for col in cursor.fetchall()]
            
            if 'resolved' not in inv_tasks_columns:
                print("Adding 'resolved' column to 'investigation_tasks' table...")
                cursor.execute("ALTER TABLE investigation_tasks ADD COLUMN resolved INTEGER DEFAULT 0")
                cursor.execute("UPDATE investigation_tasks SET resolved = 0")
                print("✓ Successfully added 'resolved' to 'investigation_tasks' table")
            else:
                print("✓ Column 'resolved' already exists in 'investigation_tasks' table")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("All tasks have been set to resolved=False (0)")
        print("\nPlease restart your orchestrator server for changes to take effect.")
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("=" * 70)
    print("DATABASE MIGRATION: Adding 'resolved' column")
    print("=" * 70)
    migrate()
