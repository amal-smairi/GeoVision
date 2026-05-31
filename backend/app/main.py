"""GeoVision Pro — FastAPI Backend"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import httpx, math, json, csv, io
from shapely.geometry import Point, mapping
from shapely.ops import transform
from pyproj import Transformer
from sqlalchemy import Column, Integer, String, Float, Text, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session

# ── DB ────────────────────────────────────────────────────────────────────────
engine = create_engine("sqlite:///./geovision.sqlite", connect_args={"check_same_thread": False})

class Base(DeclarativeBase): pass

class Feature(Base):
    __tablename__ = "features"
    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String)
    ftype    = Column(String, default="Point")
    lat      = Column(Float)
    lon      = Column(Float)
    geometry = Column(Text)   # GeoJSON string
    created  = Column(String)

class Favorite(Base):
    __tablename__ = "favorites"
    id    = Column(Integer, primary_key=True, index=True)
    name  = Column(String, unique=True)
    lat   = Column(Float)
    lon   = Column(Float)
    ftype = Column(String, default="lieu")

Base.metadata.create_all(bind=engine)

def get_db():
    db = Session(engine)
    try: yield db
    finally: db.close()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="GeoVision Pro API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS   = {"User-Agent": "GeoVisionPro/2.0"}

# ── Helpers ───────────────────────────────────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def point_to_utm(lat, lon):
    zone = int((lon + 180) / 6) + 1
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    return epsg

def make_buffer_geojson(lat: float, lon: float, radius_km: float) -> dict:
    epsg = point_to_utm(lat, lon)
    to_utm  = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    to_wgs  = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    pt_utm  = transform(to_utm.transform, Point(lon, lat))
    buf_utm = pt_utm.buffer(radius_km * 1000)
    buf_wgs = transform(to_wgs.transform, buf_utm)
    return mapping(buf_wgs)

SPEEDS = {"walk": 5, "bike": 15, "car": 50}

# ── Geocoding ─────────────────────────────────────────────────────────────────
@app.get("/geocode")
async def geocode(q: str = Query(...), limit: int = 5):
    async with httpx.AsyncClient() as c:
        r = await c.get(NOMINATIM, params={"q": q, "format": "json", "limit": limit}, headers=HEADERS)
    return r.json()

# ── Features ──────────────────────────────────────────────────────────────────
class FeatureIn(BaseModel):
    name: str; lat: float; lon: float
    ftype: Optional[str] = "Point"; created: Optional[str] = ""

@app.get("/features")
def list_features():
    db = Session(engine)
    rows = db.query(Feature).all()
    db.close()
    return [{"id": f.id, "name": f.name, "type": f.ftype, "lat": f.lat,
             "lon": f.lon, "geometry": json.loads(f.geometry) if f.geometry else None, "time": f.created} for f in rows]

@app.post("/features", status_code=201)
def create_feature(body: FeatureIn):
    db = Session(engine)
    geo = json.dumps({"type": "Point", "coordinates": [body.lon, body.lat]})
    f   = Feature(name=body.name, ftype=body.ftype, lat=body.lat, lon=body.lon, geometry=geo, created=body.created)
    db.add(f); db.commit(); db.refresh(f); db.close()
    return {"id": f.id}

@app.delete("/features/{fid}")
def delete_feature(fid: int):
    db = Session(engine)
    f  = db.query(Feature).filter(Feature.id == fid).first()
    if not f: raise HTTPException(404)
    db.delete(f); db.commit(); db.close()
    return {"ok": True}

@app.get("/features/export/csv")
def export_csv():
    db  = Session(engine)
    rows = db.query(Feature).all(); db.close()
    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(["ID","Nom","Type","Latitude","Longitude","Date"])
    for f in rows: w.writerow([f.id, f.name, f.ftype, f.lat, f.lon, f.created])
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=geopoints.csv"})

@app.get("/features/export/geojson")
def export_geojson():
    db   = Session(engine)
    rows = db.query(Feature).all(); db.close()
    fc   = {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "geometry": {"type": "Point", "coordinates": [f.lon, f.lat]},
         "properties": {"id": f.id, "name": f.name, "type": f.ftype, "date": f.created}}
        for f in rows
    ]}
    return StreamingResponse(io.StringIO(json.dumps(fc, ensure_ascii=False)),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=geopoints.geojson"})

# ── Favorites ─────────────────────────────────────────────────────────────────
class FavIn(BaseModel):
    name: str; lat: float; lon: float; ftype: Optional[str] = "lieu"

@app.get("/favorites")
def list_favs():
    db = Session(engine)
    rows = db.query(Favorite).all(); db.close()
    return [{"id": f.id, "name": f.name, "lat": f.lat, "lon": f.lon, "type": f.ftype} for f in rows]

@app.post("/favorites", status_code=201)
def add_fav(body: FavIn):
    db  = Session(engine)
    exists = db.query(Favorite).filter(Favorite.name == body.name).first()
    if exists: db.close(); raise HTTPException(409, "Déjà dans les favoris")
    f = Favorite(name=body.name, lat=body.lat, lon=body.lon, ftype=body.ftype)
    db.add(f); db.commit(); db.refresh(f); db.close()
    return {"id": f.id}

@app.delete("/favorites/{fid}")
def del_fav(fid: int):
    db = Session(engine)
    f  = db.query(Favorite).filter(Favorite.id == fid).first()
    if not f: raise HTTPException(404)
    db.delete(f); db.commit(); db.close()
    return {"ok": True}

# ── Buffer (Shapely) ──────────────────────────────────────────────────────────
@app.get("/analysis/buffer")
async def buffer(q: str, radius_km: float = 1.0):
    async with httpx.AsyncClient() as c:
        r = await c.get(NOMINATIM, params={"q": q, "format": "json", "limit": 1}, headers=HEADERS)
    data = r.json()
    if not data: raise HTTPException(404, "Lieu introuvable")
    lat, lon = float(data[0]["lat"]), float(data[0]["lon"])
    geom = make_buffer_geojson(lat, lon, radius_km)
    return {"center": {"lat": lat, "lon": lon}, "name": data[0]["display_name"], "geometry": geom}

# ── Isochrone (buffer approx) ─────────────────────────────────────────────────
@app.get("/analysis/isochrone")
async def isochrone(q: str, minutes: int = 15, mode: str = "walk"):
    async with httpx.AsyncClient() as c:
        r = await c.get(NOMINATIM, params={"q": q, "format": "json", "limit": 1}, headers=HEADERS)
    data = r.json()
    if not data: raise HTTPException(404, "Lieu introuvable")
    lat, lon  = float(data[0]["lat"]), float(data[0]["lon"])
    speed_kph = SPEEDS.get(mode, 5)
    radius_km = speed_kph * minutes / 60
    geom      = make_buffer_geojson(lat, lon, radius_km)
    return {"center": {"lat": lat, "lon": lon}, "name": data[0]["display_name"],
            "radius_km": round(radius_km, 2), "geometry": geom}

# ── POI ───────────────────────────────────────────────────────────────────────
@app.get("/analysis/poi")
async def poi(q: str, ptype: str = "restaurant", radius_km: float = 2.0):
    async with httpx.AsyncClient() as c:
        r0 = await c.get(NOMINATIM, params={"q": q, "format": "json", "limit": 1}, headers=HEADERS)
    base = r0.json()
    if not base: raise HTTPException(404)
    lat, lon = float(base[0]["lat"]), float(base[0]["lon"])
    d = radius_km / 111.0
    async with httpx.AsyncClient() as c:
        r1 = await c.get(NOMINATIM, params={
            "q": ptype, "format": "json", "limit": 10,
            "bounded": 1, "viewbox": f"{lon-d},{lat+d},{lon+d},{lat-d}"
        }, headers=HEADERS)
    pois = r1.json()
    results = []
    for p in pois:
        plat, plon = float(p["lat"]), float(p["lon"])
        dist = haversine(lat, lon, plat, plon)
        if dist <= radius_km:
            results.append({"name": p["display_name"][:80], "lat": plat, "lon": plon, "dist": round(dist, 2)})
    results.sort(key=lambda x: x["dist"])
    return {"center": {"lat": lat, "lon": lon}, "pois": results}

# ── Country stats (static) ────────────────────────────────────────────────────
STATS = {
  "fr": {"name":"France","population":"67.7M","superficie":"551 695 km²","pib":"38 625 $","densite":"122/km²","capitale":"Paris"},
  "ma": {"name":"Maroc","population":"37.5M","superficie":"710 850 km²","pib":"3 700 $","densite":"53/km²","capitale":"Rabat"},
  "tn": {"name":"Tunisie","population":"12.1M","superficie":"163 610 km²","pib":"3 800 $","densite":"77/km²","capitale":"Tunis"},
  "dz": {"name":"Algérie","population":"45.5M","superficie":"2 381 741 km²","pib":"3 800 $","densite":"19/km²","capitale":"Alger"},
  "de": {"name":"Allemagne","population":"84.1M","superficie":"357 114 km²","pib":"45 723 $","densite":"235/km²","capitale":"Berlin"},
  "es": {"name":"Espagne","population":"47.7M","superficie":"505 990 km²","pib":"28 172 $","densite":"93/km²","capitale":"Madrid"},
  "us": {"name":"États-Unis","population":"331M","superficie":"9 833 520 km²","pib":"63 544 $","densite":"34/km²","capitale":"Washington"},
}

@app.get("/stats/{code}")
def country_stats(code: str):
    if code not in STATS: raise HTTPException(404)
    return STATS[code]

@app.get("/health")
def health(): return {"ok": True}
