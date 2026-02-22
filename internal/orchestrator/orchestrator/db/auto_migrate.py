"""
Automatic database migration utility.
Compares SQLAlchemy model definitions with actual database schema
and applies necessary migrations automatically on application startup.
"""

import sqlite3
import logging
from typing import Dict, List, Tuple, Any
from sqlalchemy import inspect
from sqlalchemy.types import String, Integer, JSON, DateTime

from orchestrator.db.db import engine, get_database_path, Base

logger = logging.getLogger(__name__)


def get_sqlalchemy_columns(table_name: str) -> Dict[str, Any]:
    """Get column definitions from SQLAlchemy models."""
    mapper = None

    # Find the table in registered models
    for mapper_reg in Base.registry.mappers:
        if mapper_reg.class_.__tablename__ == table_name:
            mapper = mapper_reg
            break

    if not mapper:
        return {}

    columns = {}
    for column in mapper.columns:
        columns[column.name] = {
            'type': column.type,
            'nullable': column.nullable,
            'primary_key': column.primary_key
        }

    return columns


def get_database_columns(table_name: str, db_path: str) -> Dict[str, Any]:
    """Get actual columns from the SQLite database."""
    if not db_path:
        return {}

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        cursor.execute(f"PRAGMA table_info({table_name})")
        rows = cursor.fetchall()

        columns = {}
        for row in rows:
            # row format: (cid, name, type, notnull, dflt_value, pk)
            col_name = row[1]
            col_type = row[2]
            not_null = row[3]
            is_pk = row[5]

            columns[col_name] = {
                'type': col_type,
                'nullable': not not_null,
                'primary_key': bool(is_pk)
            }

        return columns

    finally:
        conn.close()


def sqlalchemy_type_to_sqlite(sa_type) -> str:
    """Convert SQLAlchemy type to SQLite type string."""
    if isinstance(sa_type, String):
        if sa_type.length:
            return f"VARCHAR({sa_type.length})"
        return "TEXT"
    elif isinstance(sa_type, Integer):
        return "INTEGER"
    elif isinstance(sa_type, JSON):
        return "TEXT"  # SQLite stores JSON as TEXT
    elif isinstance(sa_type, DateTime):
        return "DATETIME"
    else:
        # Default to TEXT for unknown types
        return "TEXT"


def find_missing_columns(table_name: str) -> List[Tuple[str, str, bool]]:
    """
    Find columns that exist in SQLAlchemy models but not in database.
    Returns list of (column_name, column_type, nullable) tuples.
    """
    db_path = get_database_path()

    # Check if database exists
    if not db_path.exists():
        logger.info(f"Database does not exist yet at {db_path}")
        return []

    # Check if table exists
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
    if not cursor.fetchone():
        conn.close()
        logger.info(f"Table '{table_name}' does not exist in database yet")
        return []
    conn.close()

    sa_columns = get_sqlalchemy_columns(table_name)
    db_columns = get_database_columns(table_name, db_path)

    missing = []
    for col_name, col_info in sa_columns.items():
        if col_name not in db_columns and not col_info['primary_key']:
            # Skip primary key columns (they're created with the table)
            sqlite_type = sqlalchemy_type_to_sqlite(col_info['type'])
            nullable = col_info['nullable']
            missing.append((col_name, sqlite_type, nullable))

    return missing


def apply_migrations(table_name: str, missing_columns: List[Tuple[str, str, bool]]) -> bool:
    """Apply missing column migrations to the database."""
    if not missing_columns:
        return True

    db_path = get_database_path()
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        for col_name, col_type, nullable in missing_columns:
            # SQLite ALTER TABLE only supports adding nullable columns
            # For NOT NULL columns, we add them as nullable
            sql = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"

            logger.info(f"Adding column: {table_name}.{col_name} ({col_type})")
            cursor.execute(sql)

        conn.commit()
        logger.info(f"Successfully added {len(missing_columns)} column(s) to {table_name}")
        return True

    except sqlite3.Error as e:
        conn.rollback()
        logger.error(f"Failed to apply migrations to {table_name}: {e}")
        return False

    finally:
        conn.close()


def auto_migrate_all_tables() -> bool:
    """
    Automatically migrate all registered SQLAlchemy tables.
    Returns True if all migrations succeeded, False otherwise.
    """
    logger.info("Starting automatic database migration...")

    db_path = get_database_path()

    # Check if database exists
    if not db_path.exists():
        logger.info(f"Database does not exist yet. Will be created on first use.")
        return True

    all_success = True
    total_columns_added = 0

    # Get all registered tables
    for mapper in Base.registry.mappers:
        table_name = mapper.class_.__tablename__

        # Find missing columns
        missing_columns = find_missing_columns(table_name)

        if missing_columns:
            logger.info(f"Found {len(missing_columns)} missing column(s) in table '{table_name}'")

            # Apply migrations
            success = apply_migrations(table_name, missing_columns)

            if success:
                total_columns_added += len(missing_columns)
            else:
                all_success = False
                logger.error(f"Migration failed for table '{table_name}'")

    if total_columns_added > 0:
        logger.info(f"Auto-migration complete! Added {total_columns_added} column(s)")
    else:
        logger.info("Database schema is up to date")

    return all_success


def migrate_on_startup():
    """
    Main entry point for automatic migrations on application startup.
    This function should be called during application initialization.
    """
    try:
        logger.info("Checking database schema")
        success = auto_migrate_all_tables()
        if success:
            logger.info("Database migrations completed successfully")
        else:
            logger.warning("Some database migrations failed - check logs above")

        return success

    except Exception as e:
        logger.error(f"Unexpected error during auto-migration: {e}")
        import traceback
        traceback.print_exc()
        return False
