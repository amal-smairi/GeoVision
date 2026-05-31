# GeoVision Pro - Technical Project Data

## Project Overview

GeoVision Pro is a web-based geospatial application built with a React frontend and a FastAPI backend. The application provides map exploration, place search, favorites, geospatial analysis, measurement tools, layer import, and feature export.

The project is organized as a two-part application:

- `frontend/`: React + Vite single-page application.
- `backend/`: FastAPI service with SQLite persistence and geospatial processing.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend framework | React 18 |
| Frontend build tool | Vite 5 |
| Map rendering | Leaflet |
| Backend framework | FastAPI |
| ASGI server | Uvicorn |
| Database | SQLite |
| ORM | SQLAlchemy 2 |
| Geospatial geometry | Shapely |
| Coordinate projection | PyProj |
| HTTP client | HTTPX |
| External geocoding | OpenStreetMap Nominatim |

## Repository Structure

```text
geovision/
|-- README.md
|-- TECHNICAL_PROJECT_DATA.md
|-- backend/
|   |-- app/
|   |   `-- main.py
|   |-- geovision.sqlite
|   `-- requirements.txt
`-- frontend/
    |-- package.json
    |-- package-lock.json
    |-- vite.config.js
    `-- src/
        |-- App.jsx
        |-- main.jsx
        `-- styles.css
```

## Backend Details

### Backend Entry Point

Main file:

```text
backend/app/main.py
```

The backend exposes a FastAPI application named `app`:

```python
app = FastAPI(title="GeoVision Pro API")
```

### Backend Runtime

Recommended development command:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Backend Dependencies

Declared in `backend/requirements.txt`:

- `fastapi`
- `uvicorn[standard]`
- `shapely`
- `pyproj`
- `numpy`
- `geoalchemy2`
- `sqlalchemy`
- `aiosqlite`
- `httpx`
- `python-multipart`

### Database

The backend uses SQLite through SQLAlchemy:

```text
sqlite:///./geovision.sqlite
```

Database file:

```text
backend/geovision.sqlite
```

Tables are created automatically at backend startup through:

```python
Base.metadata.create_all(bind=engine)
```

### Database Models

#### Feature

Table name:

```text
features
```

Fields:

| Field | Type | Description |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `name` | String | Feature name or address |
| `ftype` | String | Feature type, default `Point` |
| `lat` | Float | Latitude |
| `lon` | Float | Longitude |
| `geometry` | Text | GeoJSON geometry stored as JSON text |
| `created` | String | Creation date/time string |

#### Favorite

Table name:

```text
favorites
```

Fields:

| Field | Type | Description |
| --- | --- | --- |
| `id` | Integer | Primary key |
| `name` | String | Favorite name, unique |
| `lat` | Float | Latitude |
| `lon` | Float | Longitude |
| `ftype` | String | Favorite type, default `lieu` |

## API Endpoints

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns API health status |

Response:

```json
{ "ok": true }
```

### Geocoding

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/geocode?q={query}&limit={limit}` | Searches locations using OpenStreetMap Nominatim |

External service:

```text
https://nominatim.openstreetmap.org/search
```

### Features

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/features` | Lists saved geographic features |
| `POST` | `/features` | Creates a new feature |
| `DELETE` | `/features/{fid}` | Deletes a feature by ID |
| `GET` | `/features/export/csv` | Exports features as CSV |
| `GET` | `/features/export/geojson` | Exports features as GeoJSON |

Create feature request body:

```json
{
  "name": "Place name",
  "lat": 36.8065,
  "lon": 10.1815,
  "ftype": "Point",
  "created": "01/06 12:00"
}
```

### Favorites

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/favorites` | Lists saved favorites |
| `POST` | `/favorites` | Creates a favorite |
| `DELETE` | `/favorites/{fid}` | Deletes a favorite by ID |

Create favorite request body:

```json
{
  "name": "Place name",
  "lat": 36.8065,
  "lon": 10.1815,
  "ftype": "lieu"
}
```

Duplicate favorite names return HTTP `409`.

### Geospatial Analysis

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/analysis/buffer?q={query}&radius_km={radius}` | Creates a buffer polygon around a geocoded place |
| `GET` | `/analysis/isochrone?q={query}&minutes={minutes}&mode={mode}` | Creates an approximate isochrone using a distance buffer |
| `GET` | `/analysis/poi?q={query}&ptype={type}&radius_km={radius}` | Finds nearby points of interest |

Isochrone speed assumptions:

| Mode | Speed |
| --- | --- |
| `walk` | 5 km/h |
| `bike` | 15 km/h |
| `car` | 50 km/h |

The buffer and isochrone endpoints use:

- WGS84 coordinates (`EPSG:4326`)
- Automatic UTM zone selection
- Shapely buffer geometry
- PyProj coordinate transformations

### Country Statistics

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/stats/{code}` | Returns static country statistics |

Supported country codes:

- `fr`
- `ma`
- `tn`
- `dz`
- `de`
- `es`
- `us`

## Frontend Details

### Frontend Entry Points

Main React mount file:

```text
frontend/src/main.jsx
```

Main application file:

```text
frontend/src/App.jsx
```

Stylesheet:

```text
frontend/src/styles.css
```

### Frontend Runtime

Development command:

```bash
cd frontend
npm run dev
```

Production build command:

```bash
cd frontend
npm run build
```

Preview command:

```bash
cd frontend
npm run preview
```

### Frontend Dependencies

Declared in `frontend/package.json`:

- `react`
- `react-dom`
- `leaflet`

Development dependencies:

- `vite`
- `@vitejs/plugin-react`

### API Proxy

The frontend uses `/api` as the API base path:

```javascript
const API = '/api'
```

Vite proxies frontend API calls to the backend:

```javascript
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8000',
    rewrite: p => p.replace(/^\/api/, '')
  }
}
```

This means a frontend request to:

```text
/api/features
```

is forwarded to:

```text
http://127.0.0.1:8000/features
```

## Frontend Functional Modules

### Explorer

Main features:

- Interactive Leaflet map.
- Location search with autocomplete through `/api/geocode`.
- Place marker creation.
- Favorite management.
- Current mouse coordinates display.
- Zoom and center display.
- Basemap switching.
- Browser geolocation support.

Basemaps:

- CARTO Voyager
- Esri World Imagery
- OpenTopoMap
- CARTO Dark

### Analysis

Main features:

- Buffer creation around a searched location.
- Approximate isochrone generation.
- Nearby point-of-interest search.
- Static country statistics lookup.

Backend endpoints used:

- `/api/analysis/buffer`
- `/api/analysis/isochrone`
- `/api/analysis/poi`
- `/api/stats/{code}`

### Layers

Main features:

- GeoJSON file import.
- WMS layer addition.
- Active imported layer list.

### Measures

Main features:

- Distance measurement.
- Area measurement.
- Bearing/azimuth measurement.
- Measurement history.

Measurements are calculated client-side using JavaScript helper functions.

### Attributes

Main features:

- Feature table.
- Text filtering.
- Row selection.
- Feature deletion.
- CSV export.
- GeoJSON export.
- Map navigation to selected feature.

## External Services

| Service | Purpose |
| --- | --- |
| OpenStreetMap Nominatim | Geocoding and POI search |
| CARTO tile servers | Basemap tiles |
| Esri ArcGIS tile server | Satellite imagery |
| OpenTopoMap tile server | Topographic tiles |
| WMS services | User-provided map layers |

## Data Formats

### GeoJSON

Used for:

- Feature geometry storage.
- Feature export.
- Imported map layers.
- Buffer and isochrone geometries.

### CSV

Used for:

- Feature export.

CSV columns:

```text
ID, Nom, Type, Latitude, Longitude, Date
```

## Development Setup

### Backend Setup

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

Default backend URL:

```text
http://127.0.0.1:8000
```

FastAPI documentation URL:

```text
http://127.0.0.1:8000/docs
```

## Runtime Notes

- The backend allows all origins through CORS.
- The frontend communicates with the backend through the Vite `/api` proxy in development.
- SQLite is stored locally in the backend directory.
- The geocoding and POI features require internet access because they call Nominatim.
- Map tiles require internet access unless cached by the browser.
- Isochrone generation is approximate and does not use a routing engine or road network graph.

## Known Technical Limitations

- Authentication and user accounts are not implemented.
- There is no explicit database migration system.
- The SQLite database path is relative to the backend process working directory.
- Nominatim rate limits and usage policy should be considered for production deployment.
- Isochrones are circular buffer approximations, not real travel-time polygons.
- POI search is based on Nominatim bounded search, not a dedicated POI database.
- Some exports are generated both backend-side and frontend-side.

## Suggested Production Improvements

- Add environment-based configuration for database path, CORS origins, and external service URLs.
- Add Alembic migrations for database schema management.
- Add backend tests for API endpoints and geospatial helpers.
- Add frontend tests for critical workflows.
- Replace approximate isochrones with a routing engine such as OSRM, Valhalla, GraphHopper, or OpenRouteService.
- Add request validation limits for search, radius, and export operations.
- Add error handling for external service failures and rate limiting.
- Add authentication if multiple users or private data are required.
