# MS Photos to Immich Face Migration Tool

Migrate your face labels and person names from **Windows Photos Legacy** (Microsoft Photos) to **Immich** - the self-hosted Google Photos alternative.

If you've spent years tagging faces in Windows Photos and are moving to Immich, this tool helps you transfer all that work instead of starting over.

## The Problem

When migrating from Windows Photos to Immich:
- Immich detects faces but doesn't know who they are
- You have hundreds of named people in Windows Photos
- Manually re-tagging everyone would take forever
- Windows Photos stores face data in a SQLite database that Immich can't read

## The Solution

This tool bridges the gap by:
1. Reading your existing face labels from the Windows Photos database
2. Matching faces by their position in photos (same face = same coordinates)
3. Transferring the names to Immich via its API

## Features

| Feature | Description |
|---------|-------------|
| **Transfer Names** | Match MS Photos people to Immich clusters and transfer names |
| **Assign Faces** | Find unclustered Immich faces that match known MS Photos people |
| **Create Faces** | Create face records for faces MS Photos found but Immich missed |
| **Merge Clusters** | Identify and merge duplicate Immich clusters for the same person |
| **Fix Issues** | Detect clusters containing faces from multiple people |
| **Analytics** | View matching statistics and coverage metrics |
| **Diagnostics** | Understand why certain people couldn't be migrated |

## Screenshots

*Coming soon*

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** (LTS recommended)
- **Windows Photos Legacy database** (`MediaDb.v1.sqlite`)
- **Running Immich instance** with:
  - API access (API key)
  - Direct PostgreSQL database access

### Finding Your Windows Photos Database

The MS Photos Legacy database is typically located at:
```
%LOCALAPPDATA%\Packages\Microsoft.PhotosLegacy_8wekyb3d8bbwe\LocalState\MediaDb.v1.sqlite
```

Or for the newer Windows Photos app:
```
%LOCALAPPDATA%\Packages\Microsoft.Windows.Photos_8wekyb3d8bbwe\LocalState\MediaDb.v1.sqlite
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/ms-photos-legacy-to-immich.git
cd ms-photos-legacy-to-immich
```

### 2. Configure

Copy the example config and edit it:

```bash
cp config.env.example config.env
```

Edit `config.env` with your settings:

```env
# Path to your MS Photos database
MS_PHOTOS_DB=C:/Users/YourName/AppData/Local/Packages/Microsoft.PhotosLegacy_8wekyb3d8bbwe/LocalState/MediaDb.v1.sqlite

# Your Immich server
IMMICH_API_URL=http://localhost:2283
IMMICH_API_KEY=your-api-key-from-immich-settings

# Immich PostgreSQL (check your docker-compose.yml)
IMMICH_DB_HOST=localhost
IMMICH_DB_PORT=5432
IMMICH_DB_NAME=immich
IMMICH_DB_USER=postgres
IMMICH_DB_PASSWORD=your-db-password
```

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt
```

### 4. Frontend Setup

```bash
cd frontend
npm install
```

## Usage

### Quick Start (Windows)

Run both servers with a single command:

```powershell
.\start.ps1
```

### Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## How It Works

### Face Matching Algorithm

The tool matches faces using **position-based matching**:

1. Both MS Photos and Immich store face rectangles (bounding boxes) for each detected face
2. For the same photo, the same face will have similar coordinates in both systems
3. The tool calculates the overlap (IoU - Intersection over Union) between face rectangles
4. Faces with high overlap (>30% by default) are considered matches

### Workflow

1. **Dashboard**: Verify both databases are connected
2. **Analytics**: Run the matching algorithm to see potential matches
3. **Transfer Names**: Review and apply name transfers to Immich
4. **Assign Faces**: Handle unclustered faces that match known people
5. **Merge Clusters**: Clean up duplicate clusters
6. **Fix Issues**: Resolve any clusters with mixed identities

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `MIN_OVERLAP_SCORE` | 0.3 | Minimum IoU score for face matching (0.0-1.0) |
| `MIN_PHOTOS_IN_CLUSTER` | 1 | Minimum photos in cluster to consider |
| `PATH_MAPPINGS` | `{}` | JSON mapping of Immich paths to local paths (for thumbnails) |

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/status` | GET | Connection status for all data sources |
| `/api/stats` | GET | Database statistics |
| `/api/matches/run` | POST | Run matching algorithm |
| `/api/apply` | POST | Apply matches to Immich |
| `/api/validation/run` | POST | Run cluster validation |
| `/api/diagnostics/missing` | GET | Analyze missing people |

## Project Structure

```
ms-photos-legacy-to-immich/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── config.py            # Configuration management
│   ├── database.py          # Database connections
│   ├── immich_client.py     # Immich API client
│   ├── services/
│   │   ├── matching.py      # Face matching algorithms
│   │   ├── cluster_validation.py
│   │   ├── apply_labels.py
│   │   ├── create_faces.py
│   │   ├── thumbnails.py
│   │   └── diagnostics.py
│   └── _archive/            # Development debug scripts
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   └── components/
│   │       ├── Dashboard.tsx
│   │       ├── Analytics.tsx
│   │       ├── TransferNames.tsx
│   │       ├── AssignFaces.tsx
│   │       ├── CreateFaces.tsx
│   │       ├── MergeClusters.tsx
│   │       ├── FixIssues.tsx
│   │       └── Diagnostics.tsx
│   └── ...
├── config.env.example       # Configuration template
└── start.ps1               # Windows startup script
```

## Troubleshooting

### "Database not found"
- Verify the path to `MediaDb.v1.sqlite` is correct
- The database might be locked if Windows Photos is running

### "Cannot connect to Immich API"
- Check that Immich is running
- Verify your API key in Immich Settings > API Keys
- Ensure the URL is correct (include port if needed)

### "Cannot connect to Immich database"
- Check your PostgreSQL credentials
- If using Docker, you may need to expose the database port
- Verify the database name (usually `immich`)

### Low match rate
- Ensure photos are imported with the same file paths
- Try adjusting `MIN_OVERLAP_SCORE` lower (e.g., 0.2)
- Check that faces were detected by both systems

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Related Projects

- [Immich](https://github.com/immich-app/immich) - Self-hosted photo and video backup solution
- [immich-go](https://github.com/simulot/immich-go) - Bulk upload tool for Immich

## Keywords

Windows Photos migration, Microsoft Photos to Immich, face recognition transfer, photo library migration, self-hosted photos, Google Photos alternative, face tagging migration, Windows Photos Legacy, MediaDb.v1.sqlite, Immich face labels
