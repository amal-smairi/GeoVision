# GeoVision Pro v2 — React + FastAPI + SQLite/Shapely

## Stack
| Couche | Technologie |
|--------|-------------|
| Frontend | React + Vite + Leaflet |
| Backend | Python FastAPI |
| Géospatial | Shapely + PyProj |
| Base de données | SQLite (SQLAlchemy) |
| Géocodage | OpenStreetMap Nominatim |

## Lancement rapide

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend (autre terminal)
```bash
cd frontend
npm install
npm run dev
```

Ouvrir : **http://localhost:5173**

## Architecture

```
geovision/
├── backend/
│   ├── app/main.py        ← API FastAPI + Shapely + SQLAlchemy
│   ├── geovision.sqlite   ← créé automatiquement
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx        ← Application React complète
    │   ├── styles.css     ← Design GeoVision
    │   └── main.jsx
    ├── index.html
    ├── package.json
    └── vite.config.js     ← proxy /api → http://127.0.0.1:8000
```

## Endpoints API principaux
- `GET /geocode?q=...&limit=5` — Géocodage Nominatim
- `GET /features` / `POST /features` / `DELETE /features/{id}` — CRUD entités
- `GET /favorites` / `POST /favorites` / `DELETE /favorites/{id}` — Favoris
- `GET /analysis/buffer?q=...&radius_km=2` — Zone tampon (Shapely)
- `GET /analysis/isochrone?q=...&minutes=15&mode=walk` — Isochrone approx.
- `GET /analysis/poi?q=...&ptype=restaurant&radius_km=2` — Proximité POI
- `GET /stats/{code}` — Statistiques pays
- `GET /features/export/csv` — Export CSV
- `GET /features/export/geojson` — Export GeoJSON
