import sqlite3
import os
import logging
from datetime import datetime

logger = logging.getLogger("Database")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "telemetry.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    logger.info(f"Initializing SQLite database at: {DB_PATH}")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Configure WAL mode for fast non-blocking concurrent writes
    cursor.execute("PRAGMA journal_mode=WAL;")
    
    # Create Sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Create Telemetry table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        speed REAL NOT NULL,
        soc REAL NOT NULL,
        torque INTEGER NOT NULL,
        temp REAL NOT NULL,
        range INTEGER NOT NULL,
        accel INTEGER NOT NULL,
        brake INTEGER NOT NULL,
        front_dist INTEGER NOT NULL,
        left_dist INTEGER NOT NULL,
        right_dist INTEGER NOT NULL,
        ttc REAL NOT NULL,
        collision_warn INTEGER NOT NULL,
        bsd_left INTEGER NOT NULL,
        bsd_right INTEGER NOT NULL,
        alarm_level INTEGER NOT NULL,
        fault_flags INTEGER NOT NULL,
        drive_mode TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    """)
    conn.commit()
    conn.close()

def create_session(name: str = None) -> int:
    if not name:
        name = f"Session {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sessions (name) VALUES (?);", (name,))
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    logger.info(f"Created new logging session #{session_id}: '{name}'")
    return session_id

def log_telemetry(session_id: int, data: dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO telemetry (
            session_id, timestamp, seq, speed, soc, torque, temp, range, accel, brake,
            front_dist, left_dist, right_dist, ttc, collision_warn, bsd_left, bsd_right,
            alarm_level, fault_flags, drive_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            session_id,
            data["timestamp"],
            data.get("seq", 0), # Default to 0 if not tracked
            data["speed"],
            data["soc"],
            data["torque"],
            data["temp"],
            data["range"],
            data["accel"],
            data["brake"],
            data["frontDist"],
            data["leftDist"],
            data["rightDist"],
            data["ttc"],
            data["collisionWarn"],
            data["bsdLeft"],
            data["bsdRight"],
            data["alarmLevel"],
            data["faultFlags"],
            data["driveMode"]
        ))
        conn.commit()
    except Exception as e:
        logger.error(f"Error logging telemetry to DB: {e}")
    finally:
        conn.close()

def get_all_sessions() -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC;")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_session_telemetry(session_id: int) -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM telemetry WHERE session_id = ? ORDER BY timestamp ASC;", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]
