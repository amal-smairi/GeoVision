import React, { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'

const API = '/api'

// ── helpers ───────────────────────────────────────────────────────────────────
function haversine(lat1,lon1,lat2,lon2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}
function bearing(lat1,lon1,lat2,lon2){
  const φ1=lat1*Math.PI/180,φ2=lat2*Math.PI/180,Δλ=(lon2-lon1)*Math.PI/180
  const y=Math.sin(Δλ)*Math.cos(φ2),x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ)
  return((Math.atan2(y,x)*180/Math.PI)+360)%360
}
function computeArea(pts){
  let area=0; const n=pts.length
  for(let i=0;i<n;i++){
    const j=(i+1)%n,latMid=(pts[i][0]+pts[j][0])/2
    const xi=pts[i][1]*111.32*Math.cos(latMid*Math.PI/180),yi=pts[i][0]*111.32
    const xj=pts[j][1]*111.32*Math.cos(latMid*Math.PI/180),yj=pts[j][0]*111.32
    area+=xi*yj-xj*yi
  }
  return Math.abs(area)/2
}
function fmt(d=new Date()){return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({msg,type}){
  if(!msg) return null
  return <div className={`toast show ${type}`}>{msg}</div>
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [page, setPage]     = useState('explorer')
  const [toast, setToast]   = useState({msg:'',type:'success'})
  const [features, setFeatures] = useState([])
  const [favorites, setFavorites] = useState([])
  const toastTimer = useRef(null)

  function showToast(msg,type='success'){
    setToast({msg,type})
    clearTimeout(toastTimer.current)
    toastTimer.current=setTimeout(()=>setToast({msg:'',type:'success'}),3000)
  }

  // load DB data on mount
  useEffect(()=>{
    fetch(`${API}/features`).then(r=>r.json()).then(setFeatures).catch(()=>{})
    fetch(`${API}/favorites`).then(r=>r.json()).then(setFavorites).catch(()=>{})
  },[])

  async function addFeature(name,lat,lon,ftype='Point'){
    const res = await fetch(`${API}/features`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,lat,lon,ftype,created:fmt()})})
    const data= await res.json()
    const newF={id:data.id,name,lat,lon,type:ftype,time:fmt()}
    setFeatures(f=>[newF,...f])
    return data.id
  }

  async function deleteFeature(id){
    await fetch(`${API}/features/${id}`,{method:'DELETE'})
    setFeatures(f=>f.filter(x=>x.id!==id))
    showToast('Entité supprimée','info')
  }

  async function addFavorite(name,lat,lon,ftype){
    try{
      const res=await fetch(`${API}/favorites`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name,lat,lon,ftype})})
      if(res.status===409){showToast('Déjà dans les favoris','info');return}
      const data=await res.json()
      setFavorites(f=>[...f,{id:data.id,name,lat,lon,type:ftype}])
      showToast('Ajouté aux favoris ⭐','success')
    }catch(e){showToast('Erreur','error')}
  }

  async function deleteFavorite(id){
    await fetch(`${API}/favorites/${id}`,{method:'DELETE'})
    setFavorites(f=>f.filter(x=>x.id!==id))
  }

  // shared map ref for explorer (so child pages can fly to it)
  const explorerMapRef = useRef(null)

  function flyToExplorer(lat,lon){
    setPage('explorer')
    setTimeout(()=>{
      if(explorerMapRef.current) explorerMapRef.current.flyTo([lat,lon],15,{duration:1.5})
    },120)
  }

  return(
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
          <span>GeoVision <strong>Pro</strong></span>
        </div>
        <nav className="nav-tabs">
          {[['explorer','Explorer'],['analysis','Analyse'],['layers','Couches'],
            ['measures','Mesures'],['attributes','Attributs']].map(([id,label])=>(
            <button key={id} className={`nav-tab${page===id?' active':''}`} onClick={()=>setPage(id)}>{label}</button>
          ))}
        </nav>
      </header>

      <main className="main-content">
        {page==='explorer'  && <ExplorerPage mapRef={explorerMapRef} showToast={showToast} addFeature={addFeature} favorites={favorites} addFavorite={addFavorite} deleteFavorite={deleteFavorite}/>}
        {page==='analysis'  && <AnalysisPage showToast={showToast} explorerMapRef={explorerMapRef} flyToExplorer={flyToExplorer}/>}
        {page==='layers'    && <LayersPage   showToast={showToast} explorerMapRef={explorerMapRef} flyToExplorer={flyToExplorer}/>}
        {page==='measures'  && <MeasuresPage showToast={showToast}/>}
        {page==='attributes'&& <AttributesPage features={features} deleteFeature={deleteFeature} showToast={showToast} flyToExplorer={flyToExplorer}/>}
      </main>

      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPLORER PAGE
// ══════════════════════════════════════════════════════════════════════════════
function ExplorerPage({mapRef,showToast,addFeature,favorites,addFavorite,deleteFavorite}){
  const mapEl   = useRef(null)
  const mapObj  = useRef(null)
  const markerRef = useRef(null)
  const drawnRef  = useRef(null)
  const [query,setQuery]   = useState('')
  const [suggestions,setSuggestions] = useState([])
  const [showSug,setShowSug] = useState(false)
  const [result,setResult] = useState(null)
  const [liveCoords,setLiveCoords] = useState({lat:'—',lon:'—'})
  const [zoom,setZoom]     = useState(12)
  const [center,setCenter] = useState({lat:36.806,lon:10.181})
  const [activeBase,setActiveBase] = useState('voyager')
  const sugTimer = useRef(null)
  const baseLayers = useRef({})

  useEffect(()=>{
    const tiles={
      voyager:  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19}),
      satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
      topo:     L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17}),
      dark:     L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}),
    }
    baseLayers.current=tiles
    const m=L.map(mapEl.current,{zoomControl:false,attributionControl:false}).setView([36.8065,10.1815],12)
    tiles.voyager.addTo(m)
    L.control.attribution({position:'bottomright',prefix:false}).addTo(m)
    drawnRef.current=L.featureGroup().addTo(m)
    m.on('mousemove',e=>{setLiveCoords({lat:e.latlng.lat.toFixed(5),lon:e.latlng.lng.toFixed(5)})})
    m.on('zoomend moveend',()=>{setZoom(m.getZoom());const c=m.getCenter();setCenter({lat:c.lat.toFixed(3),lon:c.lng.toFixed(3)})})
    mapObj.current=m
    mapRef.current=m
    return()=>{ m.remove(); mapRef.current=null }
  },[])

  function switchBase(key){
    const m=mapObj.current; if(!m) return
    Object.values(baseLayers.current).forEach(l=>m.removeLayer(l))
    baseLayers.current[key].addTo(m)
    setActiveBase(key)
  }

  async function fetchSuggestions(q){
    if(q.length<3){setSuggestions([]);setShowSug(false);return}
    try{
      const r=await fetch(`${API}/geocode?q=${encodeURIComponent(q)}&limit=5`)
      const data=await r.json(); setSuggestions(data); setShowSug(data.length>0)
    }catch(e){showToast('Erreur suggestions','error')}
  }

  function handleInput(e){
    const v=e.target.value; setQuery(v)
    clearTimeout(sugTimer.current)
    sugTimer.current=setTimeout(()=>fetchSuggestions(v),350)
  }

  async function handleSearch(e){
    e&&e.preventDefault(); setShowSug(false)
    if(!query.trim()) return
    try{
      const r=await fetch(`${API}/geocode?q=${encodeURIComponent(query)}&limit=1`)
      const data=await r.json()
      if(data.length) applyResult(data[0])
      else showToast('Aucun résultat','error')
    }catch(e){showToast('Erreur réseau','error')}
  }

  async function applyResult(res){
    const lat=parseFloat(res.lat),lon=parseFloat(res.lon)
    const m=mapObj.current; if(!m) return
    m.flyTo([lat,lon],15,{duration:1.5})
    if(markerRef.current) m.removeLayer(markerRef.current)
    const icon=L.divIcon({className:'custom-div-icon',html:"<div class='pulse-marker'></div>",iconSize:[14,14],iconAnchor:[7,7]})
    markerRef.current=L.marker([lat,lon],{icon}).addTo(m)
      .bindPopup(`<strong>${res.display_name.slice(0,80)}</strong><br><span style="font-family:monospace;font-size:12px">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>`)
    setResult({name:res.display_name,lat,lon,type:res.type||'lieu'})
    await addFeature(res.display_name,lat,lon,res.type||'Point')
    showToast('Lieu localisé avec succès','success')
  }

  function locateMe(){
    navigator.geolocation.getCurrentPosition(pos=>{
      const{latitude,longitude}=pos.coords
      const m=mapObj.current; if(!m) return
      m.flyTo([latitude,longitude],15,{duration:1.5})
      L.circleMarker([latitude,longitude],{radius:8,fillColor:'#10b981',color:'white',weight:2,fillOpacity:1})
        .addTo(drawnRef.current).bindPopup('📍 Votre position').openPopup()
      showToast('Position localisée','success')
    },()=>showToast('Géolocalisation refusée','error'))
  }

  function copyCoords(){
    if(!result) return
    navigator.clipboard.writeText(`${result.lat.toFixed(6)}, ${result.lon.toFixed(6)}`)
    showToast('Coordonnées copiées !','success')
  }

  return(
    <div className="page-explorer">
      <div className="explorer-sidebar">
        <div className="search-box">
          <form onSubmit={handleSearch} className="search-form" autoComplete="off">
            <div style={{position:'relative'}}>
              <input className="search-input" value={query} onChange={handleInput}
                placeholder="Rechercher un lieu…" onBlur={()=>setTimeout(()=>setShowSug(false),200)}/>
              {showSug&&<div className="search-suggestions">
                {suggestions.map((s,i)=>(
                  <div key={i} className="suggestion-item" onMouseDown={()=>{
                    setQuery(s.display_name.slice(0,60)); setShowSug(false); applyResult(s)
                  }}>{s.display_name.slice(0,70)}{s.display_name.length>70?'…':''}</div>
                ))}
              </div>}
            </div>
            <button type="submit" className="btn-primary">🔍</button>
          </form>
        </div>

        {result&&<div className="result-panel">
          <div className="result-address">{result.name.slice(0,100)}</div>
          <div className="result-coords">
            <span>Lat: <strong>{result.lat.toFixed(6)}</strong></span>
            <span>Lon: <strong>{result.lon.toFixed(6)}</strong></span>
            <span className="result-type">{result.type}</span>
          </div>
          <div className="result-actions">
            <button className="btn-sm" onClick={copyCoords}>📋 Copier</button>
            <button className="btn-sm" onClick={()=>addFavorite(result.name,result.lat,result.lon,result.type)}>⭐ Favori</button>
            <button className="btn-sm">🗺️ Itinéraire</button>
          </div>
        </div>}

        <div className="sidebar-section">
          <div className="section-title">Fonds de carte</div>
          <div className="basemap-grid">
            {[['voyager','Voyager'],['satellite','Satellite'],['topo','Topo'],['dark','Sombre']].map(([k,l])=>(
              <div key={k} className={`basemap-item${activeBase===k?' active':''}`} onClick={()=>switchBase(k)}>{l}</div>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-title">Favoris</div>
          <div className="list-scroll">
            {favorites.length===0?<p className="empty-state">Aucun favori</p>:
              favorites.map(f=>(
                <div key={f.id} className="history-item">
                  <span style={{color:'#f59e0b'}}>★</span>
                  <span onClick={()=>mapObj.current?.flyTo([f.lat,f.lon],15,{duration:1.5})} style={{cursor:'pointer',flex:1}}>{f.name.slice(0,40)}…</span>
                  <button className="btn-icon-sm" onClick={()=>deleteFavorite(f.id)}>✕</button>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <div className="map-container">
        <div className="map-toolbar">
          <button className="toolbar-btn" onClick={()=>mapObj.current?.zoomIn()}>+</button>
          <button className="toolbar-btn" onClick={()=>mapObj.current?.zoomOut()}>−</button>
          <button className="toolbar-btn" onClick={()=>mapObj.current?.setView([36.8065,10.1815],12)} title="Réinitialiser">⌂</button>
          <button className="toolbar-btn" onClick={locateMe} title="Ma position">◎</button>
          <button className="toolbar-btn" onClick={()=>document.documentElement.requestFullscreen?.()} title="Plein écran">⛶</button>
        </div>
        <div ref={mapEl} className="map-div"/>
        <div className="map-status-bar">
          <span>Lat: {liveCoords.lat} | Lon: {liveCoords.lon}</span>
          <span>Zoom: {zoom}</span>
          <span>Centre: {center.lat}°N, {center.lon}°E</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYSIS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AnalysisPage({showToast,explorerMapRef,flyToExplorer}){
  const [bufAddr,setBufAddr]=useState('')
  const [bufRadius,setBufRadius]=useState(2)
  const [bufColor,setBufColor]=useState('#3b82f6')
  const [isoAddr,setIsoAddr]=useState('')
  const [isoTime,setIsoTime]=useState(15)
  const [isoMode,setIsoMode]=useState('walk')
  const [proxAddr,setProxAddr]=useState('')
  const [proxType,setProxType]=useState('restaurant')
  const [proxRadius,setProxRadius]=useState(2)
  const [pois,setPois]=useState([])
  const [statCode,setStatCode]=useState('tn')
  const [stats,setStats]=useState(null)

  async function createBuffer(){
    if(!bufAddr.trim()){showToast('Entrez une adresse','error');return}
    try{
      const r=await fetch(`${API}/analysis/buffer?q=${encodeURIComponent(bufAddr)}&radius_km=${bufRadius}`)
      if(!r.ok){showToast('Adresse introuvable','error');return}
      const data=await r.json()
      flyToExplorer(data.center.lat,data.center.lon)
      setTimeout(()=>{
        if(explorerMapRef.current){
          L.geoJSON(data.geometry,{style:{color:bufColor,fillColor:bufColor,fillOpacity:0.2,weight:2,dashArray:'6 3'}})
            .addTo(explorerMapRef.current)
            .bindPopup(`Zone tampon ${bufRadius} km — ${data.name.slice(0,60)}`)
          explorerMapRef.current.flyTo([data.center.lat,data.center.lon],12,{duration:1.5})
        }
      },200)
      showToast(`Zone tampon de ${bufRadius} km créée`,'success')
    }catch(e){showToast('Erreur','error')}
  }

  async function createIsochrone(){
    if(!isoAddr.trim()){showToast('Entrez une adresse','error');return}
    try{
      const r=await fetch(`${API}/analysis/isochrone?q=${encodeURIComponent(isoAddr)}&minutes=${isoTime}&mode=${isoMode}`)
      if(!r.ok){showToast('Adresse introuvable','error');return}
      const data=await r.json()
      flyToExplorer(data.center.lat,data.center.lon)
      setTimeout(()=>{
        if(explorerMapRef.current){
          L.geoJSON(data.geometry,{style:{color:'#f59e0b',fillColor:'#f59e0b',fillOpacity:0.15,weight:2}})
            .addTo(explorerMapRef.current)
            .bindPopup(`Isochrone ${isoTime}min (${isoMode}) ~${data.radius_km} km`)
          explorerMapRef.current.flyTo([data.center.lat,data.center.lon],13,{duration:1.5})
        }
      },200)
      showToast('Isochrone générée','success')
    }catch(e){showToast('Erreur','error')}
  }

  async function findPoi(){
    if(!proxAddr.trim()){showToast('Entrez une adresse','error');return}
    try{
      const r=await fetch(`${API}/analysis/poi?q=${encodeURIComponent(proxAddr)}&ptype=${proxType}&radius_km=${proxRadius}`)
      if(!r.ok){showToast('Adresse introuvable','error');return}
      const data=await r.json(); setPois(data.pois)
      if(!data.pois.length) showToast('Aucun POI trouvé','info')
    }catch(e){showToast('Erreur','error')}
  }

  async function loadStats(){
    const r=await fetch(`${API}/stats/${statCode}`)
    if(!r.ok){showToast('Erreur stats','error');return}
    setStats(await r.json())
  }

  return(
    <div className="page-content">
      <div className="page-grid">
        <div className="card">
          <div className="card-title">🔵 Zone tampon</div>
          <input className="inp" placeholder="Adresse" value={bufAddr} onChange={e=>setBufAddr(e.target.value)}/>
          <label className="range-label">Rayon: {bufRadius} km</label>
          <input type="range" min="0.5" max="50" step="0.5" value={bufRadius} onChange={e=>setBufRadius(+e.target.value)} className="range-input"/>
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}>
            <label>Couleur:</label>
            <input type="color" value={bufColor} onChange={e=>setBufColor(e.target.value)} style={{height:32,width:48,border:'none',cursor:'pointer'}}/>
            <button className="btn-primary" onClick={createBuffer}>Créer</button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">🕐 Isochrone approx.</div>
          <input className="inp" placeholder="Adresse" value={isoAddr} onChange={e=>setIsoAddr(e.target.value)}/>
          <label className="range-label">Durée: {isoTime} min</label>
          <input type="range" min="5" max="120" step="5" value={isoTime} onChange={e=>setIsoTime(+e.target.value)} className="range-input"/>
          <select className="inp" value={isoMode} onChange={e=>setIsoMode(e.target.value)}>
            <option value="walk">🚶 Marche</option>
            <option value="bike">🚴 Vélo</option>
            <option value="car">🚗 Voiture</option>
          </select>
          <button className="btn-primary" style={{marginTop:8}} onClick={createIsochrone}>Générer</button>
        </div>

        <div className="card">
          <div className="card-title">📍 Proximité POI</div>
          <input className="inp" placeholder="Adresse de base" value={proxAddr} onChange={e=>setProxAddr(e.target.value)}/>
          <select className="inp" value={proxType} onChange={e=>setProxType(e.target.value)}>
            {['restaurant','café','hôpital','pharmacie','école','hôtel','station service','supermarché'].map(t=>(
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="range-label">Rayon: {proxRadius} km</label>
          <input type="range" min="0.5" max="20" step="0.5" value={proxRadius} onChange={e=>setProxRadius(+e.target.value)} className="range-input"/>
          <button className="btn-primary" style={{marginTop:8}} onClick={findPoi}>Chercher</button>
          {pois.length>0&&<div className="poi-list">
            {pois.map((p,i)=>(
              <div key={i} className="poi-item">
                <span className="poi-name">{p.name.slice(0,55)}</span>
                <span className="poi-dist">{p.dist} km</span>
              </div>
            ))}
          </div>}
        </div>

        <div className="card">
          <div className="card-title">📊 Statistiques pays</div>
          <select className="inp" value={statCode} onChange={e=>setStatCode(e.target.value)}>
            {[['fr','France'],['ma','Maroc'],['tn','Tunisie'],['dz','Algérie'],['de','Allemagne'],['es','Espagne'],['us','États-Unis']].map(([c,l])=>(
              <option key={c} value={c}>{l}</option>
            ))}
          </select>
          <button className="btn-primary" style={{marginTop:8}} onClick={loadStats}>Charger</button>
          {stats&&<div className="stats-grid">
            {Object.entries({Pays:stats.name,Capitale:stats.capitale,Population:stats.population,Superficie:stats.superficie,'PIB/hab':stats.pib,Densité:stats.densite}).map(([k,v])=>(
              <div key={k} className="stat-item"><span className="stat-label">{k}</span><span className="stat-value">{v}</span></div>
            ))}
          </div>}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYERS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function LayersPage({showToast,explorerMapRef,flyToExplorer}){
  const [wmsUrl,setWmsUrl]=useState('')
  const [wmsLayers,setWmsLayers]=useState('')
  const [importedLayers,setImportedLayers]=useState([])

  function addWms(){
    if(!wmsUrl.trim()||!wmsLayers.trim()){showToast('Remplissez URL et couches','error');return}
    setTimeout(()=>{
      if(explorerMapRef.current){
        L.tileLayer.wms(wmsUrl,{layers:wmsLayers,format:'image/png',transparent:true}).addTo(explorerMapRef.current)
        showToast('WMS ajouté','success')
      } else showToast('Allez d\'abord sur Explorer','info')
    },0)
  }

  function importGeoJSON(){
    const input=document.createElement('input')
    input.type='file'; input.accept='.geojson,.json'
    input.onchange=e=>{
      const file=e.target.files[0]
      const reader=new FileReader()
      reader.onload=ev=>{
        try{
          const data=JSON.parse(ev.target.result)
          flyToExplorer(0,0)
          setTimeout(()=>{
            if(explorerMapRef.current){
              const layer=L.geoJSON(data,{
                style:{color:'#3b82f6',weight:2,fillOpacity:0.2},
                onEachFeature:(feature,lyr)=>{
                  if(feature.properties) lyr.bindPopup(Object.entries(feature.properties).map(([k,v])=>`<b>${k}</b>: ${v}`).join('<br>'))
                }
              }).addTo(explorerMapRef.current)
              explorerMapRef.current.fitBounds(layer.getBounds(),{padding:[20,20]})
              setImportedLayers(l=>[...l,{name:file.name,time:fmt()}])
              showToast('GeoJSON importé','success')
            }
          },200)
        }catch(e){showToast('Fichier GeoJSON invalide','error')}
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return(
    <div className="page-content">
      <div className="page-grid">
        <div className="card">
          <div className="card-title">🗺️ Couches actives</div>
          <div className="layer-list">
            <div className="layer-item"><span>🌍 Fond de carte principal</span><span className="badge-active">Actif</span></div>
            {importedLayers.map((l,i)=>(
              <div key={i} className="layer-item"><span>📄 {l.name}</span><span className="badge-active">Importé</span></div>
            ))}
          </div>
          <button className="btn-primary" onClick={importGeoJSON}>📂 Importer GeoJSON</button>
        </div>

        <div className="card">
          <div className="card-title">🔗 Ajouter WMS</div>
          <input className="inp" placeholder="URL du service WMS" value={wmsUrl} onChange={e=>setWmsUrl(e.target.value)}/>
          <input className="inp" placeholder="Couches (ex: ne:countries)" value={wmsLayers} onChange={e=>setWmsLayers(e.target.value)} style={{marginTop:8}}/>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <select className="inp" defaultValue="image/png" style={{flex:1}}>
              <option>image/png</option><option>image/jpeg</option>
            </select>
            <button className="btn-primary" onClick={addWms}>Ajouter</button>
          </div>
          <div className="hint-text" style={{marginTop:12}}>
            <strong>Exemples WMS :</strong><br/>
            GeoServer demo: <code>https://demo.geo-solutions.it/geoserver/wms</code><br/>
            Couche: <code>topp:states</code>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEASURES PAGE
// ══════════════════════════════════════════════════════════════════════════════
function MeasuresPage({showToast}){
  const mapEl   = useRef(null)
  const mapObj  = useRef(null)
  const layerRef= useRef(null)
  const ptsRef  = useRef([])
  const modeRef = useRef(null)
  const polyRef = useRef(null)
  const timerRef= useRef(null)
  const [distVal,setDistVal]=useState('—')
  const [areaVal,setAreaVal]=useState('—')
  const [bearVal,setBearVal]=useState('—')
  const [history,setHistory]=useState([])
  const [activeMode,setActiveMode]=useState(null)

  useEffect(()=>{
    const m=L.map(mapEl.current,{zoomControl:false,attributionControl:false}).setView([36.8065,10.1815],12)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(m)
    L.control.zoom({position:'bottomright'}).addTo(m)
    layerRef.current=L.featureGroup().addTo(m)

    m.on('click',e=>{
      clearTimeout(timerRef.current)
      timerRef.current=setTimeout(()=>handleClick(e.latlng),220)
    })
    m.on('dblclick',e=>{
      clearTimeout(timerRef.current)
      handleDblClick()
    })
    mapObj.current=m
    return()=>m.remove()
  },[])

  function handleClick(latlng){
    if(!modeRef.current) return
    ptsRef.current.push(latlng)
    L.circleMarker(latlng,{radius:5,color:'#0ea5e9',fillColor:'#0ea5e9',fillOpacity:1}).addTo(layerRef.current)
    const pts=ptsRef.current
    if(modeRef.current==='distance'&&pts.length>=2){
      if(polyRef.current) layerRef.current.removeLayer(polyRef.current)
      polyRef.current=L.polyline(pts,{color:'#0ea5e9',weight:2,dashArray:'6 4'}).addTo(layerRef.current)
      let total=0; for(let i=1;i<pts.length;i++) total+=haversine(pts[i-1].lat,pts[i-1].lng,pts[i].lat,pts[i].lng)
      setDistVal(total.toFixed(3))
    }
    if(modeRef.current==='bearing'&&pts.length===2){
      const b=bearing(pts[0].lat,pts[0].lng,pts[1].lat,pts[1].lng)
      L.polyline(pts,{color:'#f59e0b',weight:2}).addTo(layerRef.current)
      setBearVal(b.toFixed(1))
      addHist(`Azimut : ${b.toFixed(1)}°`)
      ptsRef.current=[]; modeRef.current=null; setActiveMode(null)
    }
  }

  function handleDblClick(){
    const pts=ptsRef.current
    if(modeRef.current==='distance'&&pts.length>=2){
      let total=0; for(let i=1;i<pts.length;i++) total+=haversine(pts[i-1].lat,pts[i-1].lng,pts[i].lat,pts[i].lng)
      addHist(`Distance : ${total.toFixed(3)} km`)
      modeRef.current=null; ptsRef.current=[]; setActiveMode(null)
    }
    if(modeRef.current==='area'&&pts.length>=3){
      L.polygon(pts,{color:'#10b981',fillOpacity:0.2}).addTo(layerRef.current)
      const a=computeArea(pts.map(p=>[p.lat,p.lng]))
      setAreaVal(a.toFixed(3))
      addHist(`Surface : ${a.toFixed(3)} km²`)
      modeRef.current=null; ptsRef.current=[]; setActiveMode(null)
    }
  }

  function startMode(mode){
    modeRef.current=mode; ptsRef.current=[]; polyRef.current=null
    layerRef.current?.clearLayers(); setActiveMode(mode)
    showToast(`Mode ${mode} activé`,'info')
  }

  function addHist(text){ setHistory(h=>[{text,time:fmt()},...h]) }

  const instr={distance:'Cliquez pour ajouter des points · Double-clic pour terminer',
    area:'Dessinez un polygone · Double-clic pour fermer',
    bearing:'1er point puis 2e point',null:'Sélectionnez un outil'}[activeMode]

  return(
    <div className="page-explorer">
      <div className="explorer-sidebar">
        <div className="measure-tools">
          {[['distance','📏 Distance'],['area','⬡ Surface'],['bearing','🧭 Azimut']].map(([m,l])=>(
            <button key={m} className={`btn-measure${activeMode===m?' active':''}`} onClick={()=>startMode(m)}>{l}</button>
          ))}
        </div>
        <div className="measure-cards">
          <div className={`measure-card${activeMode==='distance'?' active':''}`}>
            <div className="card-title">Distance</div>
            <div className="measure-value">{distVal}</div>
            <div className="measure-unit">km</div>
          </div>
          <div className={`measure-card${activeMode==='area'?' active':''}`}>
            <div className="card-title">Surface</div>
            <div className="measure-value">{areaVal}</div>
            <div className="measure-unit">km²</div>
          </div>
          <div className={`measure-card${activeMode==='bearing'?' active':''}`}>
            <div className="card-title">Azimut</div>
            <div className="measure-value">{bearVal}</div>
            <div className="measure-unit">°</div>
          </div>
        </div>
        <div className="hint-text">{instr}</div>
        <div className="sidebar-section">
          <div className="section-title">Historique</div>
          {history.length===0?<p className="empty-state">Aucune mesure</p>:
            history.map((h,i)=><div key={i} className="history-item"><span>{h.text}</span><span className="history-time">{h.time}</span></div>)
          }
        </div>
      </div>
      <div className="map-container">
        <div ref={mapEl} className="map-div"/>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTRIBUTES PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AttributesPage({features,deleteFeature,showToast,flyToExplorer}){
  const [filter,setFilter]=useState('')
  const [selected,setSelected]=useState(new Set())
  const [selectAll,setSelectAll]=useState(false)

  const filtered=features.filter(f=>!filter||f.name.toLowerCase().includes(filter.toLowerCase()))

  function toggleRow(id){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})}
  function toggleAll(v){setSelectAll(v);setSelected(v?new Set(filtered.map(f=>f.id)):new Set())}

  function exportCSV(){
    if(!features.length){showToast('Aucune donnée','error');return}
    const csv=['ID,Nom,Type,Latitude,Longitude,Date',...features.map(f=>`${f.id},"${f.name.replace(/"/g,'""')}",${f.type||''},${f.lat},${f.lon},"${f.time||''}"`)]
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv.join('\n')],{type:'text/csv'}))
    a.download='geopoints.csv'; a.click()
    showToast('CSV exporté','success')
  }

  function exportGeoJSON(){
    if(!features.length){showToast('Aucune donnée','error');return}
    const gj={type:'FeatureCollection',features:features.map(f=>({type:'Feature',geometry:{type:'Point',coordinates:[f.lon,f.lat]},properties:{id:f.id,name:f.name,type:f.type,date:f.time}}))}
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(gj,null,2)],{type:'application/json'}))
    a.download='geopoints.geojson'; a.click()
    showToast('GeoJSON exporté','success')
  }

  return(
    <div className="page-content">
      <div className="attrib-toolbar">
        <input className="inp" style={{maxWidth:280}} placeholder="Filtrer…" value={filter} onChange={e=>setFilter(e.target.value)}/>
        <span className="attrib-count">{selected.size} sélectionnée(s)</span>
        <div style={{flex:1}}/>
        <button className="btn-sm" onClick={exportCSV}>📥 CSV</button>
        <button className="btn-sm" onClick={exportGeoJSON}>📥 GeoJSON</button>
        <button className="btn-sm btn-danger" onClick={async()=>{
          for(const id of selected) await deleteFeature(id); setSelected(new Set()); setSelectAll(false)
        }}>🗑 Supprimer</button>
      </div>
      <div className="table-wrap">
        <table className="attrib-table">
          <thead><tr>
            <th><input type="checkbox" checked={selectAll} onChange={e=>toggleAll(e.target.checked)}/></th>
            <th>ID</th><th>Nom</th><th>Type</th><th>Latitude</th><th>Longitude</th><th>Date</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length===0?<tr><td colSpan={8} style={{textAlign:'center',padding:'2rem',color:'var(--muted)'}}>Aucune entité</td></tr>:
              filtered.map(f=>(
                <tr key={f.id} className={selected.has(f.id)?'selected':''}>
                  <td><input type="checkbox" checked={selected.has(f.id)} onChange={()=>toggleRow(f.id)}/></td>
                  <td><code>{f.id}</code></td>
                  <td style={{maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name.slice(0,60)}</td>
                  <td><span className="type-badge">{f.type||'Point'}</span></td>
                  <td><code>{typeof f.lat==='number'?f.lat.toFixed(6):f.lat}</code></td>
                  <td><code>{typeof f.lon==='number'?f.lon.toFixed(6):f.lon}</code></td>
                  <td>{f.time||'—'}</td>
                  <td>
                    <button className="btn-icon-sm" onClick={()=>flyToExplorer(f.lat,f.lon)} title="Voir sur carte">🔍</button>
                    <button className="btn-icon-sm btn-danger" onClick={()=>deleteFeature(f.id)} title="Supprimer">✕</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
