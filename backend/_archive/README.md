# Archive - Development Debug Scripts

These scripts are **not required** for the app's functionality. They were used during development to reverse-engineer the database structure of Microsoft Photos Legacy.

## Purpose

The MS Photos Legacy SQLite database (`MediaDb.v1.sqlite`) is not publicly documented. These scripts were created to:

- Explore and understand the database schema
- Debug face-to-person relationships
- Compare database backups to identify data loss
- Investigate encoding and collation issues

## Files

| Script | Purpose |
|--------|---------|
| `debug_schema.py` | Initial schema exploration - lists tables and columns |
| `debug_clusters.py` | Investigates FaceCluster table structure |
| `debug_cluster_faces.py` | Debugs face-to-cluster linking |
| `debug_encoding.py` | Compares SQL vs Python case-insensitivity |
| `debug_excluded.py` | Explores ExcludedFace/ExcludedPerson tables |
| `debug_faces.py` | Counts faces and identifies people without face data |
| `debug_item_link.py` | Debugs Person_ItemCount vs actual data |
| `debug_names.py` | Compares person names between MS Photos and Immich |
| `diagnose_missing.py` | Categorizes why people weren't migrated |
| `explore_shared_db.py` | Explores the MS Photos shared database |
| `compare_databases.py` | Compares current vs backup databases |

## Usage

These scripts require paths to be configured before running. Edit the path constants at the top of each file to point to your local database files.

Example:
```python
# Update this path to your MS Photos database location
DB_PATH = Path("path/to/your/MediaDb.v1.sqlite")
```

Run any script directly:
```bash
python debug_schema.py
```
