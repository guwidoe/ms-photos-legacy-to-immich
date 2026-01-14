"""Debug encoding differences."""

from database import get_ms_photos_connection

with get_ms_photos_connection() as conn:
    c = conn.cursor()
    
    # Method 1: SQL LOWER()
    c.execute("SELECT DISTINCT LOWER(Person_Name) FROM Person WHERE Person_Name IS NOT NULL AND Person_Name != '' AND TRIM(Person_Name) != ''")
    sql_lower = set(r[0] for r in c.fetchall())
    print(f"SQL LOWER(): {len(sql_lower)} unique")
    
    # Method 2: Get original and Python .lower()
    c.execute("SELECT DISTINCT Person_Name FROM Person WHERE Person_Name IS NOT NULL AND Person_Name != '' AND TRIM(Person_Name) != ''")
    python_lower = set(r[0].lower() for r in c.fetchall())
    print(f"Python .lower(): {len(python_lower)} unique")
    
    # Find differences
    only_in_sql = sql_lower - python_lower
    only_in_python = python_lower - sql_lower
    
    print(f"Only in SQL result: {len(only_in_sql)}")
    print(f"Only in Python result: {len(only_in_python)}")
    
    if only_in_sql:
        print(f"Sample SQL-only: {list(only_in_sql)[:5]}")
    if only_in_python:
        print(f"Sample Python-only: {list(only_in_python)[:5]}")
