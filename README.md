# Face Migration Tool - Web Application

A modern web interface for migrating face labels from Windows Photos Legacy to Immich.

## Features

- **Dashboard**: Overview of both databases, connection status, and quick statistics
- **Matching**: Run face position or definitive matching algorithms with configurable parameters
- **Validation**: Detect potential clustering errors in Immich by cross-referencing with MS Photos
- **Apply**: Preview and apply approved matches to rename Immich person clusters

## Prerequisites

- Python 3.10+
- Node.js 18+ (LTS)
- Access to MS Photos SQLite database (`MediaDb.v1.sqlite`)
- Running Immich instance with API access and PostgreSQL database access

## Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# or: source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure (copy and edit the config file)
# Make sure ../../config.env exists with your settings
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install
```

## Running

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
# Build frontend
cd frontend
npm run build

# The built files will be in frontend/dist/
# You can serve them with any static file server
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/status` | GET | Connection status for all data sources |
| `/api/stats` | GET | Detailed statistics from databases |
| `/api/matches/run` | POST | Run matching algorithm |
| `/api/matches/preview` | GET | Quick preview of matches |
| `/api/validation/run` | POST | Run cluster validation |
| `/api/thumbnails/ms/{id}` | GET | Get MS Photos person thumbnail |
| `/api/thumbnails/immich/{id}` | GET | Get Immich cluster thumbnail |
| `/api/apply` | POST | Apply matches to Immich |

## Configuration

The backend reads configuration from `../../config.env`. Required settings:

```env
# MS Photos Database
MS_PHOTOS_DB=../legacy_data/MediaDb.v1.sqlite

# Immich API
IMMICH_API_URL=http://localhost:2283
IMMICH_API_KEY=your-api-key-here

# Immich PostgreSQL
IMMICH_DB_HOST=localhost
IMMICH_DB_PORT=5432
IMMICH_DB_NAME=immich
IMMICH_DB_USER=postgres
IMMICH_DB_PASSWORD=your-password
```

## Architecture

```
webapp/
├── backend/
│   ├── main.py           # FastAPI application
│   ├── config.py         # Configuration management
│   ├── database.py       # Database connections
│   ├── immich_client.py  # Immich API client
│   └── services/
│       ├── matching.py         # Face matching algorithms
│       ├── cluster_validation.py # Cluster error detection
│       └── thumbnails.py       # Thumbnail generation
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Main application
│   │   ├── api.ts        # API client
│   │   ├── types.ts      # TypeScript types
│   │   └── components/
│   │       ├── Dashboard.tsx
│   │       ├── Matching.tsx
│   │       ├── Validation.tsx
│   │       └── Apply.tsx
│   └── ...
└── README.md
```

## License

MIT
