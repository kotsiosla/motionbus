import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X, Navigation, MapPin, Clock, LocateFixed, Moon, Sun, Bell, BellOff, Volume2, VolumeX, Star, Heart, Route, Box, Layers, Home, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Vehicle, StaticStop, Trip, RouteInfo, ShapePoint, TripShapeMapping } from "@/types/gtfs";
import { useTransitRouting } from "@/hooks/useTransitRouting";
import { RoutePlanner } from "@/components/RoutePlanner";

interface VehicleMapProps {
  vehicles: Vehicle[];
  trips?: Trip[];
  stops?: StaticStop[];
  shapes?: ShapePoint[];
  tripMappings?: TripShapeMapping[];
  routeNamesMap?: Map<string, RouteInfo>;
  isLoading: boolean;
  selectedRoute?: string;
}

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return 'Άγνωστο';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatSpeed = (speed?: number) => {
  if (speed === undefined || speed === null) return 'Άγνωστο';
  return `${(speed * 3.6).toFixed(1)} km/h`;
};

const formatETA = (arrivalTime?: number) => {
  if (!arrivalTime) return null;
  const date = new Date(arrivalTime * 1000);
  return date.toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatDelay = (delay?: number) => {
  if (delay === undefined || delay === null) return '';
  const minutes = Math.round(delay / 60);
  if (minutes === 0) return '(στην ώρα)';
  if (minutes > 0) return `(+${minutes} λεπτά)`;
  return `(${minutes} λεπτά)`;
};

// Create vehicle marker element
const createVehicleElement = (bearing?: number, isFollowed?: boolean, routeColor?: string) => {
  const el = document.createElement('div');
  el.className = 'vehicle-marker-maplibre';
  const rotation = bearing || 0;
  const bgColor = routeColor ? `#${routeColor}` : 'hsl(210, 100%, 50%)';
  const glowStyle = isFollowed ? 'box-shadow: 0 0 0 3px #facc15;' : '';
  
  el.innerHTML = `
    <div style="transform: rotate(${rotation}deg); position: relative;">
      <div style="position: absolute; inset: 0; border-radius: 4px; background: ${bgColor}; opacity: 0.5; animation: pulse 2s infinite;"></div>
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 6px solid ${bgColor}; margin-bottom: -1px;"></div>
        <div style="width: 22px; height: 18px; border-radius: 3px; display: flex; align-items: center; justify-content: center; background: ${bgColor}; ${glowStyle}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2"/>
            <circle cx="7" cy="18" r="1.5" fill="white"/>
            <circle cx="17" cy="18" r="1.5" fill="white"/>
            <path d="M3 10h18"/>
          </svg>
        </div>
      </div>
    </div>
  `;
  
  return el;
};

// Create stop marker element
const createStopElement = (hasVehicleStopped?: boolean, isFavorite?: boolean) => {
  const el = document.createElement('div');
  el.className = 'stop-marker-maplibre';
  // Priority: vehicle stopped (green) > favorite (pink/red) > normal (orange)
  const bgColor = hasVehicleStopped ? '#22c55e' : isFavorite ? '#ec4899' : '#f97316';
  
  el.innerHTML = `
    <div style="width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${bgColor}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3)${isFavorite ? ', 0 0 8px ' + bgColor : ''};">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${hasVehicleStopped 
          ? '<rect x="3" y="4" width="18" height="14" rx="2"/><circle cx="7" cy="18" r="1.5" fill="white"/><circle cx="17" cy="18" r="1.5" fill="white"/>' 
          : isFavorite 
            ? '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
            : '<circle cx="12" cy="12" r="3"/>'}
      </svg>
    </div>
  `;
  
  return el;
};

export function VehicleMap({ vehicles, trips = [], stops = [], shapes = [], tripMappings = [], routeNamesMap, isLoading, selectedRoute }: VehicleMapProps) {
  const { toast } = useToast();
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vehicleMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const stopMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const shapesSourceRef = useRef<boolean>(false);
  const notifiedArrivalsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const [followedVehicleId, setFollowedVehicleId] = useState<string | null>(null);
  const [showStops, setShowStops] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isNightMode, setIsNightMode] = useState(() => {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 6;
  });
  const [isAutoNightMode, setIsAutoNightMode] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [favoriteStops, setFavoriteStops] = useState<Set<string>>(() => {
    // Load favorites from localStorage
    try {
      const saved = localStorage.getItem('favoriteStops');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [showFavorites, setShowFavorites] = useState(false);
  const [showNearbyPanel, setShowNearbyPanel] = useState(true);
  const [showRoutePlanner, setShowRoutePlanner] = useState(false);
  const [showRotationHint, setShowRotationHint] = useState(true);
  const [showStopsControl, setShowStopsControl] = useState(true);
  const [is3DMode, setIs3DMode] = useState(false);
  const [selectingMode, setSelectingMode] = useState<'origin' | 'destination' | null>(null);

  // Initialize transit routing hook
  const routesArray = useMemo(() => 
    routeNamesMap ? Array.from(routeNamesMap.values()) : [], 
    [routeNamesMap]
  );
  
  const {
    state: routingState,
    searchAddress,
    setOrigin,
    setDestination,
    calculateRoutes,
    clearRouting,
  } = useTransitRouting(stops, trips, routesArray);
  // Save favorites to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('favoriteStops', JSON.stringify([...favoriteStops]));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }, [favoriteStops]);

  // Toggle favorite stop
  const toggleFavorite = useCallback((stopId: string) => {
    setFavoriteStops(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stopId)) {
        newSet.delete(stopId);
      } else {
        newSet.add(stopId);
      }
      return newSet;
    });
  }, []);

  // Play notification sound using Web Audio API
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      
      // Resume if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const now = ctx.currentTime;
      
      // Create oscillator for a pleasant chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      // Two-tone chime (C5 and E5)
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc2.frequency.setValueAtTime(659.25, now); // E5
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      // Envelope: quick attack, gradual decay
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, [soundEnabled]);

  // Auto night mode based on time of day
  useEffect(() => {
    if (!isAutoNightMode) return;

    const checkTime = () => {
      const hour = new Date().getHours();
      const shouldBeNight = hour >= 19 || hour < 6;
      setIsNightMode(shouldBeNight);
    };

    // Check immediately
    checkTime();

    // Check every minute
    const interval = setInterval(checkTime, 60000);

    return () => clearInterval(interval);
  }, [isAutoNightMode]);

  // When user manually toggles, disable auto mode
  const handleNightModeToggle = () => {
    setIsAutoNightMode(false);
    setIsNightMode(!isNightMode);
  };

  // Create a map of tripId -> Trip for quick lookup
  const tripMap = useMemo(() => {
    const map = new Map<string, Trip>();
    trips.forEach(trip => {
      if (trip.tripId) {
        map.set(trip.tripId, trip);
      }
    });
    return map;
  }, [trips]);

  // Create a map of stopId -> StaticStop for quick lookup
  const stopMap = useMemo(() => {
    const map = new Map<string, StaticStop>();
    stops.forEach(stop => {
      map.set(stop.stop_id, stop);
    });
    return map;
  }, [stops]);

  // Get next stop info for a vehicle
  const getNextStopInfo = useCallback((vehicle: Vehicle) => {
    if (!vehicle.tripId) return null;
    
    const trip = tripMap.get(vehicle.tripId);
    if (!trip?.stopTimeUpdates?.length) return null;

    const currentSeq = vehicle.currentStopSequence || 0;
    const nextStopUpdate = trip.stopTimeUpdates.find(
      stu => (stu.stopSequence || 0) >= currentSeq
    );

    if (!nextStopUpdate) return null;

    const stopInfo = nextStopUpdate.stopId ? stopMap.get(nextStopUpdate.stopId) : null;
    
    return {
      stopName: stopInfo?.stop_name || nextStopUpdate.stopId || 'Επόμενη στάση',
      arrivalTime: nextStopUpdate.arrivalTime,
      arrivalDelay: nextStopUpdate.arrivalDelay,
    };
  }, [tripMap, stopMap]);

  // Get arrivals for a specific stop
  const getArrivalsForStop = useCallback((stopId: string) => {
    const arrivals: Array<{
      tripId: string;
      routeId?: string;
      routeShortName?: string;
      routeLongName?: string;
      routeColor?: string;
      vehicleLabel?: string;
      vehicleId?: string;
      arrivalTime?: number;
      arrivalDelay?: number;
    }> = [];

    trips.forEach(trip => {
      const stopUpdate = trip.stopTimeUpdates?.find(stu => stu.stopId === stopId);
      if (stopUpdate && stopUpdate.arrivalTime) {
        const routeInfo = trip.routeId && routeNamesMap ? routeNamesMap.get(trip.routeId) : null;
        
        const vehicle = vehicles.find(v => v.tripId === trip.tripId);
        
        arrivals.push({
          tripId: trip.tripId || trip.id,
          routeId: trip.routeId,
          routeShortName: routeInfo?.route_short_name,
          routeLongName: routeInfo?.route_long_name,
          routeColor: routeInfo?.route_color,
          vehicleLabel: vehicle?.label || trip.vehicleLabel,
          vehicleId: vehicle?.vehicleId || trip.vehicleId,
          arrivalTime: stopUpdate.arrivalTime,
          arrivalDelay: stopUpdate.arrivalDelay,
        });
      }
    });

    arrivals.sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0));
    
    return arrivals.slice(0, 5);
  }, [trips, vehicles, routeNamesMap]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: 'Tiles © Esri'
          }
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: [33.0, 35.1], // Center of Cyprus
      zoom: 6, // Zoomed out view
      pitch: 0, // Flat/vertical view
      bearing: 0,
      maxPitch: 70,
      maxBounds: [[28.0, 33.0], [38.0, 37.0]], // Wider boundaries
      minZoom: 5,
    });

    // Add navigation controls
    mapRef.current.addControl(new maplibregl.NavigationControl({
      visualizePitch: true,
      showCompass: true,
      showZoom: true,
    }), 'top-left');

    // Enable rotation with scroll (using right-click drag or ctrl+scroll)
    mapRef.current.dragRotate.enable();
    mapRef.current.touchZoomRotate.enableRotation();

    // Add bus route shapes and route planning layers when map loads
    mapRef.current.on('load', () => {
      if (mapRef.current && !mapRef.current.getSource('bus-shapes')) {
        // Add bus route shapes source (initially empty)
        mapRef.current.addSource('bus-shapes', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        // Bus route shape layer - currently disabled to debug line issue
        // Will be re-enabled when we fix the shapes rendering

        shapesSourceRef.current = true;

        // Add route planning source (no layer for now - disabled)
        mapRef.current!.addSource('route-line', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        // Add origin/destination markers source
        mapRef.current!.addSource('route-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        // Set map loaded AFTER all sources are added
        setMapLoaded(true);
      }
    });

    return () => {
      // Clean up markers
      vehicleMarkersRef.current.forEach(marker => marker.remove());
      vehicleMarkersRef.current.clear();
      stopMarkersRef.current.forEach(marker => marker.remove());
      stopMarkersRef.current.clear();
      userMarkerRef.current?.remove();
      
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle night mode toggle
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;
    
    // Ensure style is fully loaded before modifying
    if (!map.isStyleLoaded()) {
      map.once('style.load', () => {
        // Re-trigger effect after style loads
        setMapLoaded(prev => prev);
      });
      return;
    }

    // Update satellite layer visibility
    if (map.getLayer('satellite-layer')) {
      map.setLayoutProperty('satellite-layer', 'visibility', isNightMode ? 'none' : 'visible');
    }
    if (map.getLayer('labels-layer')) {
      map.setLayoutProperty('labels-layer', 'visibility', isNightMode ? 'none' : 'visible');
    }

    // Add or update dark base layers for night mode
    if (isNightMode) {
      // Add dark tiles source if not exists
      if (!map.getSource('carto-dark')) {
        map.addSource('carto-dark', {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
          ],
          tileSize: 256,
          attribution: '© CartoDB © OpenStreetMap'
        });
      }

      // Add dark layer if not exists
      if (!map.getLayer('carto-dark-layer')) {
        map.addLayer({
          id: 'carto-dark-layer',
          type: 'raster',
          source: 'carto-dark',
          minzoom: 0,
          maxzoom: 22
        });
      }
      map.setLayoutProperty('carto-dark-layer', 'visibility', 'visible');
    } else {
      // Hide dark layer if exists
      if (map.getLayer('carto-dark-layer')) {
        map.setLayoutProperty('carto-dark-layer', 'visibility', 'none');
      }
    }
  }, [isNightMode, mapLoaded]);

  // Get stops with vehicles currently stopped
  const stopsWithVehicles = useMemo(() => {
    const stoppedAtStops = new Set<string>();
    vehicles.forEach(v => {
      const status = String(v.currentStatus);
      if (v.stopId && (status === 'STOPPED_AT' || status === '1')) {
        stoppedAtStops.add(v.stopId);
      }
    });
    return stoppedAtStops;
  }, [vehicles]);

  // Update vehicle markers when vehicles change
  useEffect(() => {
    if (!mapRef.current) return;

    const currentVehicleIds = new Set<string>();

    const validVehicles = vehicles.filter(
      (v) => v.latitude !== undefined && v.longitude !== undefined
    );

    validVehicles.forEach((vehicle) => {
      const vehicleId = vehicle.vehicleId || vehicle.id;
      currentVehicleIds.add(vehicleId);
      
      const isFollowed = followedVehicleId === vehicleId;
      const routeInfo = vehicle.routeId && routeNamesMap ? routeNamesMap.get(vehicle.routeId) : null;
      const routeColor = routeInfo?.route_color;
      const routeName = routeInfo ? `${routeInfo.route_short_name} - ${routeInfo.route_long_name}` : vehicle.routeId;
      const nextStop = getNextStopInfo(vehicle);

      const existingMarker = vehicleMarkersRef.current.get(vehicleId);

      if (existingMarker) {
        // Update position
        existingMarker.setLngLat([vehicle.longitude!, vehicle.latitude!]);
        // Update element
        const newEl = createVehicleElement(vehicle.bearing, isFollowed, routeColor);
        newEl.style.cursor = 'pointer';
        newEl.onclick = () => setFollowedVehicleId(vehicleId);
        existingMarker.getElement().replaceWith(newEl);
        // Need to update the marker's internal element reference
        (existingMarker as any)._element = newEl;
      } else {
        // Create new marker
        const el = createVehicleElement(vehicle.bearing, isFollowed, routeColor);
        el.style.cursor = 'pointer';
        el.onclick = () => setFollowedVehicleId(vehicleId);

        const popup = new maplibregl.Popup({ offset: 25, className: 'vehicle-popup-maplibre', maxWidth: 'none' })
          .setHTML(`
            <div style="
              padding: 16px; 
              min-width: 260px; 
              font-family: system-ui, -apple-system, sans-serif;
              background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
              border-radius: 16px;
              border: 1px solid rgba(56, 189, 248, 0.2);
              box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 30px rgba(56, 189, 248, 0.1);
            ">
              <div style="
                font-weight: 700; 
                font-size: 15px; 
                margin-bottom: 12px; 
                display: flex; 
                align-items: center; 
                gap: 10px;
                color: #f8fafc;
              ">
                <span style="
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  width: 32px; 
                  height: 32px; 
                  border-radius: 10px; 
                  background: ${routeColor ? `#${routeColor}` : '#3b82f6'};
                  box-shadow: 0 0 15px ${routeColor ? `#${routeColor}80` : 'rgba(59, 130, 246, 0.5)'};
                ">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M8 6v6m0 0v6m0-6h8M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/>
                  </svg>
                </span>
                <span>Όχημα ${vehicleId}</span>
              </div>
              <div style="font-size: 13px; color: #94a3b8;">
                ${vehicle.licensePlate ? `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 10px; background: rgba(34, 211, 238, 0.1); border-radius: 8px; border: 1px solid rgba(34, 211, 238, 0.2);">
                    <span style="color: #64748b;">Αρ. Εγγραφής</span>
                    <span style="font-family: 'JetBrains Mono', monospace; color: #22d3ee; font-weight: 600; font-size: 13px;">${vehicle.licensePlate}</span>
                  </div>
                ` : ''}
                ${vehicle.label ? `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <span style="color: #64748b;">Ετικέτα</span>
                    <span style="font-family: 'JetBrains Mono', monospace; color: #e2e8f0; font-size: 12px;">${vehicle.label}</span>
                  </div>
                ` : ''}
                ${routeName ? `
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 8px 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <span style="color: #64748b;">Γραμμή</span>
                    <span style="
                      font-weight: 600; 
                      color: #f8fafc;
                      background: ${routeColor ? `#${routeColor}` : '#3b82f6'};
                      padding: 3px 10px;
                      border-radius: 6px;
                      font-size: 12px;
                    ">${routeName}</span>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                  <span style="color: #64748b;">Ταχύτητα</span>
                  <span style="color: #22d3ee; font-weight: 500;">${formatSpeed(vehicle.speed)}</span>
                </div>
                ${vehicle.bearing !== undefined ? `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <span style="color: #64748b;">Κατεύθυνση</span>
                    <span style="color: #e2e8f0;">${vehicle.bearing.toFixed(0)}°</span>
                  </div>
                ` : ''}
                ${vehicle.currentStatus ? `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <span style="color: #64748b;">Κατάσταση</span>
                    <span style="color: #a78bfa;">${vehicle.currentStatus}</span>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; padding: 8px 10px; margin-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                  <span style="color: #64748b;">Ενημέρωση</span>
                  <span style="font-size: 11px; color: #94a3b8; font-family: 'JetBrains Mono', monospace;">${formatTimestamp(vehicle.timestamp)}</span>
                </div>
              </div>
              ${nextStop ? `
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(56, 189, 248, 0.2);">
                  <div style="
                    display: flex; 
                    align-items: center; 
                    gap: 6px; 
                    color: #22d3ee; 
                    font-weight: 600; 
                    margin-bottom: 8px; 
                    font-size: 13px;
                  ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Επόμενη στάση
                  </div>
                  <div style="font-size: 13px; background: rgba(34, 211, 238, 0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(34, 211, 238, 0.2);">
                    <div style="font-weight: 600; color: #f8fafc; margin-bottom: 4px;">${nextStop.stopName}</div>
                    ${nextStop.arrivalTime ? `
                      <div style="color: #94a3b8; display: flex; align-items: center; gap: 6px;">
                        <span>Άφιξη:</span>
                        <span style="font-family: 'JetBrains Mono', monospace; color: #22d3ee;">${formatETA(nextStop.arrivalTime)}</span>
                        ${formatDelay(nextStop.arrivalDelay)}
                      </div>
                    ` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
          `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([vehicle.longitude!, vehicle.latitude!])
          .setPopup(popup)
          .addTo(mapRef.current!);

        vehicleMarkersRef.current.set(vehicleId, marker);
      }
    });

    // Remove old markers
    vehicleMarkersRef.current.forEach((marker, id) => {
      if (!currentVehicleIds.has(id)) {
        marker.remove();
        vehicleMarkersRef.current.delete(id);
      }
    });

    // Fit bounds if not following
    if (!followedVehicleId && validVehicles.length > 0 && mapRef.current) {
      const bounds = new maplibregl.LngLatBounds();
      validVehicles.forEach(v => bounds.extend([v.longitude!, v.latitude!]));
      mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 13 });
    }
  }, [vehicles, followedVehicleId, routeNamesMap, getNextStopInfo]);

  // Update stop markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing stop markers
    stopMarkersRef.current.forEach(marker => marker.remove());
    stopMarkersRef.current.clear();

    if (!showStops) return;

    const validStops = stops.filter(
      (s) => s.stop_lat !== undefined && s.stop_lon !== undefined
    );

    validStops.forEach((stop) => {
      const hasVehicleStopped = stopsWithVehicles.has(stop.stop_id);
      const arrivals = getArrivalsForStop(stop.stop_id);
      
      const isFavorite = favoriteStops.has(stop.stop_id);
      const el = createStopElement(hasVehicleStopped, isFavorite);

      const statusColor = hasVehicleStopped ? '#22c55e' : '#f97316';
      const statusText = hasVehicleStopped ? '<div style="color: #22c55e; font-weight: 500; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e5e5;">🚌 Λεωφορείο στη στάση</div>' : '';

      let arrivalsHtml = '';
      if (arrivals.length > 0) {
        arrivalsHtml = `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="font-weight: 500; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; color: #a5b4fc;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Επόμενες αφίξεις
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${arrivals.map(arr => {
                const routeColor = arr.routeColor ? `#${arr.routeColor}` : '#06b6d4';
                const delayText = arr.arrivalDelay !== undefined && arr.arrivalDelay !== 0 
                  ? `<span style="color: ${arr.arrivalDelay > 0 ? '#f87171' : '#4ade80'}; font-size: 11px;">${formatDelay(arr.arrivalDelay)}</span>` 
                  : '';
                return `
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 8px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                    <span style="font-weight: 700; padding: 3px 8px; border-radius: 6px; color: white; font-size: 11px; background: ${routeColor}; box-shadow: 0 2px 8px ${routeColor}40;">${arr.routeShortName || arr.routeId || '?'}</span>
                    <span style="font-family: monospace; color: #22d3ee; font-weight: 600;">${formatETA(arr.arrivalTime)}</span>
                    ${delayText}
                    ${arr.vehicleLabel ? `<span style="color: #64748b; font-size: 10px;">(${arr.vehicleLabel})</span>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      } else {
        arrivalsHtml = '<div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 12px; color: #64748b; text-align: center;">Δεν υπάρχουν προγραμματισμένες αφίξεις</div>';
      }

        const popup = new maplibregl.Popup({ 
          offset: 15, 
          className: 'stop-popup-maplibre',
          maxWidth: 'none',
          closeOnClick: true
        })
        .setHTML(`
          <div style="padding: 14px; min-width: 240px; max-width: 320px; font-family: system-ui, -apple-system, sans-serif; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #f8fafc; border-radius: 12px;">
            <div style="font-weight: 600; font-size: 15px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 8px ${statusColor};"></span>
              <span style="color: #f1f5f9;">${stop.stop_name || 'Στάση'}</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 8px 10px; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>ID:</span><span style="font-family: monospace; color: #67e8f9;">${stop.stop_id}</span></div>
              ${stop.stop_code ? `<div style="display: flex; justify-content: space-between;"><span>Κωδικός:</span><span style="font-family: monospace; color: #67e8f9;">${stop.stop_code}</span></div>` : ''}
            </div>
            ${hasVehicleStopped ? '<div style="color: #4ade80; font-weight: 500; padding: 8px 10px; background: rgba(74, 222, 128, 0.15); border-radius: 8px; font-size: 13px;">🚌 Λεωφορείο στη στάση</div>' : ''}
            ${arrivalsHtml}
          </div>
        `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.stop_lon!, stop.stop_lat!])
        .setPopup(popup)
        .addTo(mapRef.current!);

      stopMarkersRef.current.set(stop.stop_id, marker);
    });
  }, [stops, showStops, stopsWithVehicles, getArrivalsForStop, favoriteStops]);

  // Handle user location
  const locateUser = () => {
    if (!mapRef.current) return;
    
    setIsLocating(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setShowNearbyPanel(true); // Reopen panel when locating
        
        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat([longitude, latitude]);
        } else {
          const el = document.createElement('div');
          el.innerHTML = `
            <div style="position: relative;">
              <div style="position: absolute; inset: 0; background: #3b82f6; border-radius: 50%; animation: ping 1.5s infinite; opacity: 0.5;"></div>
              <div style="position: relative; width: 16px; height: 16px; background: #3b82f6; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
            </div>
          `;
          
          const popup = new maplibregl.Popup({ offset: 10 })
            .setHTML('<div style="padding: 8px; font-size: 13px; font-weight: 500;">📍 Η τοποθεσία σας</div>');
          
          userMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .setPopup(popup)
            .addTo(mapRef.current!);
        }
        
        mapRef.current?.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 1000
        });
        setIsLocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setIsLocating(false);
        alert('Δεν ήταν δυνατή η εύρεση της τοποθεσίας σας. Βεβαιωθείτε ότι έχετε επιτρέψει την πρόσβαση στην τοποθεσία.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // Find nearest stop to user location
  const nearestStopData = useMemo(() => {
    if (!userLocation) return null;
    
    let nearestId: string | null = null;
    let minDistance = Infinity;
    
    stops.forEach(stop => {
      if (stop.stop_lat === undefined || stop.stop_lon === undefined) return;
      
      const distance = calculateDistance(
        userLocation.lat, userLocation.lng,
        stop.stop_lat, stop.stop_lon
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestId = stop.stop_id;
      }
    });
    
    return nearestId ? { stopId: nearestId, distance: minDistance } : null;
  }, [userLocation, stops]);

  // Get the actual stop object
  const nearestStop = useMemo(() => {
    if (!nearestStopData) return null;
    const stop = stops.find(s => s.stop_id === nearestStopData.stopId);
    return stop ? { stop, distance: nearestStopData.distance } : null;
  }, [nearestStopData?.stopId, nearestStopData?.distance, stops]);

  // Find all stops within 500m radius
  const nearbyStops = useMemo(() => {
    if (!userLocation) return [];
    
    const stopsWithDistance: Array<{ stop: StaticStop; distance: number }> = [];
    
    stops.forEach(stop => {
      if (stop.stop_lat === undefined || stop.stop_lon === undefined) return;
      
      const distance = calculateDistance(
        userLocation.lat, userLocation.lng,
        stop.stop_lat, stop.stop_lon
      );
      
      if (distance <= 500) {
        stopsWithDistance.push({ stop, distance });
      }
    });
    
    return stopsWithDistance.sort((a, b) => a.distance - b.distance);
  }, [userLocation, stops]);

  // Check for imminent arrivals and send notifications
  useEffect(() => {
    if (!notificationsEnabled || nearbyStops.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const twoMinutesFromNow = now + 120; // 2 minutes in seconds

    nearbyStops.forEach(({ stop }) => {
      const arrivals = getArrivalsForStop(stop.stop_id);
      
      arrivals.forEach(arrival => {
        if (!arrival.arrivalTime) return;
        
        // Check if arrival is within 2 minutes
        if (arrival.arrivalTime > now && arrival.arrivalTime <= twoMinutesFromNow) {
          const notificationKey = `${stop.stop_id}-${arrival.tripId}-${arrival.arrivalTime}`;
          
          // Don't notify if we already did
          if (notifiedArrivalsRef.current.has(notificationKey)) return;
          
          // Mark as notified
          notifiedArrivalsRef.current.add(notificationKey);
          
          // Calculate time until arrival
          const secondsUntil = arrival.arrivalTime - now;
          const minutesUntil = Math.ceil(secondsUntil / 60);
          
          // Play sound
          playNotificationSound();
          
          // Send notification
          toast({
            title: `🚌 ${arrival.routeShortName || 'Λεωφορείο'} σε ${minutesUntil} λεπ.`,
            description: `Στάση: ${stop.stop_name || stop.stop_id}`,
            duration: 8000,
          });
        }
      });
    });

    // Clean up old notifications (older than 5 minutes)
    const fiveMinutesAgo = now - 300;
    notifiedArrivalsRef.current.forEach(key => {
      const timestamp = parseInt(key.split('-').pop() || '0');
      if (timestamp < fiveMinutesAgo) {
        notifiedArrivalsRef.current.delete(key);
      }
    });
  }, [nearbyStops, trips, notificationsEnabled, getArrivalsForStop, toast, playNotificationSound]);

  // Bus route shapes - disabled for now

  // Handle map click for route planning
  useEffect(() => {
    if (!mapRef.current || !selectingMode) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      
      if (selectingMode === 'origin') {
        setOrigin(lat, lng);
      } else if (selectingMode === 'destination') {
        setDestination(lat, lng);
      }
      setSelectingMode(null);
    };

    mapRef.current.on('click', handleClick);
    mapRef.current.getCanvas().style.cursor = 'crosshair';

    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', handleClick);
        mapRef.current.getCanvas().style.cursor = '';
      }
    };
  }, [selectingMode, setOrigin, setDestination]);

  // Draw route on map when routes are available
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const source = mapRef.current.getSource('route-line') as maplibregl.GeoJSONSource;
    if (!source) return;

    // Always clear first
    source.setData({ type: 'FeatureCollection', features: [] });

    // Only draw if we have routes from the route planner
    if (routingState.routes.length > 0 && routingState.origin && routingState.destination) {
      const selectedRoute = routingState.routes[0];
      const features: GeoJSON.Feature[] = [];

      selectedRoute.segments.forEach((segment) => {
        const color = segment.type === 'walk' 
          ? '#6b7280' 
          : (segment.routeColor ? `#${segment.routeColor}` : '#3b82f6');
        
        features.push({
          type: 'Feature',
          properties: { color },
          geometry: {
            type: 'LineString',
            coordinates: [
              [segment.from.lon, segment.from.lat],
              [segment.to.lon, segment.to.lat]
            ]
          }
        });
      });

      source.setData({
        type: 'FeatureCollection',
        features
      });
    }
  }, [routingState.routes, routingState.origin, routingState.destination, mapLoaded]);

  // Follow the selected vehicle in realtime
  useEffect(() => {
    if (!followedVehicleId || !mapRef.current) return;

    const followedVehicle = vehicles.find(
      (v) => (v.vehicleId || v.id) === followedVehicleId
    );

    if (followedVehicle?.latitude && followedVehicle?.longitude) {
      mapRef.current.flyTo({
        center: [followedVehicle.longitude, followedVehicle.latitude],
        zoom: 16,
        duration: 500
      });
    }
  }, [vehicles, followedVehicleId]);

  // Handler for using current location as origin
  const useCurrentLocationAsOrigin = useCallback(() => {
    if (userLocation) {
      setOrigin(userLocation.lat, userLocation.lng, 'Η τοποθεσία μου');
    } else {
      locateUser();
      toast({
        title: 'Εντοπισμός τοποθεσίας',
        description: 'Παρακαλώ περιμένετε...',
      });
    }
  }, [userLocation, setOrigin, locateUser, toast]);

  // Get followed vehicle info
  const followedVehicle = followedVehicleId
    ? vehicles.find((v) => (v.vehicleId || v.id) === followedVehicleId)
    : null;

  const followedRouteInfo = followedVehicle?.routeId && routeNamesMap 
    ? routeNamesMap.get(followedVehicle.routeId) 
    : null;

  const followedNextStop = followedVehicle ? getNextStopInfo(followedVehicle) : null;

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      
      {/* Route Planner */}
      <RoutePlanner
        isOpen={showRoutePlanner}
        onClose={() => setShowRoutePlanner(false)}
        origin={routingState.origin}
        destination={routingState.destination}
        routes={routingState.routes}
        isSearching={routingState.isSearching}
        error={routingState.error}
        onSearchAddress={searchAddress}
        onSetOrigin={setOrigin}
        onSetDestination={setDestination}
        onCalculateRoutes={calculateRoutes}
        onClearRouting={clearRouting}
        onUseCurrentLocation={useCurrentLocationAsOrigin}
        selectingMode={selectingMode}
        onSetSelectingMode={setSelectingMode}
      />

      {/* Route Planner Button */}
      {!showRoutePlanner && (
        <Button
          variant="default"
          size="sm"
          className="absolute bottom-16 left-4 z-[1000] gap-2 shadow-lg"
          onClick={() => setShowRoutePlanner(true)}
        >
          <Route className="h-4 w-4" />
          Σχεδιασμός Διαδρομής
        </Button>
      )}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Φόρτωση...</span>
          </div>
        </div>
      )}
      
      {/* Following indicator */}
      {followedVehicle && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-card rounded-lg px-4 py-2 z-[1000] min-w-[280px] max-w-[95%]">
          <div className="flex items-center gap-3">
            <Navigation 
              className="h-4 w-4 animate-pulse flex-shrink-0" 
              style={{ color: followedRouteInfo?.route_color ? `#${followedRouteInfo.route_color}` : 'hsl(var(--primary))' }}
            />
            <div className="text-sm flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">Όχημα:</span>
                <span className="font-semibold">{followedVehicle.label || followedVehicle.vehicleId || followedVehicle.id}</span>
                {followedVehicle.speed !== undefined && (
                  <span className="text-primary font-medium">{formatSpeed(followedVehicle.speed)}</span>
                )}
              </div>
              {followedRouteInfo && (
                <div 
                  className="font-medium mt-0.5"
                  style={{ color: followedRouteInfo.route_color ? `#${followedRouteInfo.route_color}` : 'inherit' }}
                >
                  {followedRouteInfo.route_short_name} - {followedRouteInfo.route_long_name}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setFollowedVehicleId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {followedNextStop && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-sm flex-wrap">
              <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Επόμενη στάση:</span>
              <span className="font-medium">{followedNextStop.stopName}</span>
              {followedNextStop.arrivalTime && (
                <span className="font-mono text-primary">{formatETA(followedNextStop.arrivalTime)}</span>
              )}
              {followedNextStop.arrivalDelay !== undefined && followedNextStop.arrivalDelay !== 0 && (
                <span className={followedNextStop.arrivalDelay > 0 ? 'text-destructive' : 'text-green-500'}>
                  {formatDelay(followedNextStop.arrivalDelay)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rotation hint */}
      {showRotationHint && (
        <div className="absolute top-4 left-14 glass-card rounded-lg px-2 py-1 z-[1000] text-xs text-muted-foreground flex items-center gap-2">
          <span>Ctrl+Scroll ή δεξί κλικ για περιστροφή</span>
          <button
            onClick={() => setShowRotationHint(false)}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            title="Κλείσιμο"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Map controls */}
      <div className="absolute top-2 right-2 glass-card rounded-lg px-3 py-2 flex items-center gap-2 z-[1000]">
        <Switch
          id="show-stops"
          checked={showStops}
          onCheckedChange={setShowStops}
          className="data-[state=checked]:bg-orange-500"
        />
        <Label htmlFor="show-stops" className="text-xs cursor-pointer flex items-center gap-1">
          <MapPin className="h-3 w-3 text-orange-500" />
          Στάσεις ({stops.length})
        </Label>
      </div>

      {/* Night mode button */}
      <Button
        variant="secondary"
        size="icon"
        className={`absolute top-14 right-4 z-[1000] glass-card h-9 w-9 ${isAutoNightMode ? 'ring-2 ring-primary/50' : ''}`}
        onClick={handleNightModeToggle}
        title={`${isNightMode ? 'Λειτουργία ημέρας' : 'Λειτουργία νύχτας'}${isAutoNightMode ? ' (αυτόματο)' : ''}`}
      >
        {isNightMode ? (
          <Sun className="h-4 w-4 text-yellow-500" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>

      {/* Auto night mode toggle */}
      <Button
        variant="secondary"
        size="sm"
        className={`absolute top-24 right-4 z-[1000] glass-card h-7 px-2 text-[10px] ${isAutoNightMode ? 'bg-primary/20' : ''}`}
        onClick={() => setIsAutoNightMode(!isAutoNightMode)}
        title="Αυτόματη εναλλαγή βάσει ώρας"
      >
        {isAutoNightMode ? 'Αυτόματο ✓' : 'Αυτόματο'}
      </Button>

      {/* Location button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-32 right-4 z-[1000] glass-card h-9 w-9"
        onClick={locateUser}
        disabled={isLocating}
        title="Εντοπισμός τοποθεσίας"
      >
        <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''} ${userLocation ? 'text-blue-500' : ''}`} />
      </Button>

      {/* Notifications toggle */}
      <Button
        variant="secondary"
        size="icon"
        className={`absolute top-44 right-4 z-[1000] glass-card h-9 w-9 ${notificationsEnabled ? 'ring-2 ring-green-500/50' : ''}`}
        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
        title={notificationsEnabled ? 'Απενεργοποίηση ειδοποιήσεων' : 'Ενεργοποίηση ειδοποιήσεων'}
      >
        {notificationsEnabled ? (
          <Bell className="h-4 w-4 text-green-500" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Sound toggle */}
      <Button
        variant="secondary"
        size="icon"
        className={`absolute top-56 right-4 z-[1000] glass-card h-9 w-9 ${soundEnabled ? 'ring-2 ring-blue-500/50' : ''}`}
        onClick={() => setSoundEnabled(!soundEnabled)}
        title={soundEnabled ? 'Απενεργοποίηση ήχου' : 'Ενεργοποίηση ήχου'}
      >
        {soundEnabled ? (
          <Volume2 className="h-4 w-4 text-blue-500" />
        ) : (
          <VolumeX className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* 2D/3D toggle */}
      <Button
        variant="secondary"
        size="icon"
        className={`absolute top-[17rem] right-4 z-[1000] glass-card h-9 w-9 ${is3DMode ? 'ring-2 ring-purple-500/50' : ''}`}
        onClick={() => {
          setIs3DMode(!is3DMode);
          mapRef.current?.easeTo({
            pitch: is3DMode ? 0 : 45,
            duration: 500
          });
        }}
        title={is3DMode ? 'Προβολή 2D' : 'Προβολή 3D'}
      >
        {is3DMode ? (
          <Layers className="h-4 w-4 text-purple-500" />
        ) : (
          <Box className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Reset view button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-[20rem] right-4 z-[1000] glass-card h-9 w-9"
        onClick={() => {
          mapRef.current?.flyTo({
            center: [33.0, 35.1],
            zoom: 6,
            pitch: 0,
            bearing: 0,
            duration: 1000
          });
          setIs3DMode(false);
        }}
        title="Επαναφορά χάρτη"
      >
        <Home className="h-4 w-4" />
      </Button>

      {/* Zoom In button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-[23rem] right-4 z-[1000] glass-card h-9 w-9"
        onClick={() => {
          mapRef.current?.zoomIn({ duration: 300 });
        }}
        title="Μεγέθυνση"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>

      {/* Zoom Out button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-[26rem] right-4 z-[1000] glass-card h-9 w-9"
        onClick={() => {
          mapRef.current?.zoomOut({ duration: 300 });
        }}
        title="Σμίκρυνση"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>

      {userLocation && nearbyStops.length > 0 && showNearbyPanel && (
        <div className="absolute bottom-4 right-4 glass-card rounded-lg p-3 z-[1000] max-w-[300px] max-h-[60vh] overflow-hidden flex flex-col">
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Στάσεις</span>
            <button
              onClick={() => setShowNearbyPanel(false)}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="Κλείσιμο"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          
          {/* Tabs for nearby and favorites */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setShowFavorites(false)}
              className={`flex-1 text-xs py-1 px-2 rounded-md transition-colors ${
                !showFavorites ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <MapPin className="h-3 w-3 inline mr-1" />
              Κοντινές ({nearbyStops.length})
            </button>
            <button
              onClick={() => setShowFavorites(true)}
              className={`flex-1 text-xs py-1 px-2 rounded-md transition-colors ${
                showFavorites ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Heart className="h-3 w-3 inline mr-1" />
              Αγαπημένες ({favoriteStops.size})
            </button>
          </div>
          
          <div className="overflow-auto flex-1 space-y-2 scrollbar-thin">
            {!showFavorites ? (
              // Nearby stops
              nearbyStops.map((item, index) => {
                const arrivals = getArrivalsForStop(item.stop.stop_id);
                const walkTime = Math.ceil(item.distance / 83.3);
                const isNearest = index === 0;
                const isFavorite = favoriteStops.has(item.stop.stop_id);
                
                return (
                  <div 
                    key={item.stop.stop_id}
                    className={`p-2 rounded-lg border transition-colors ${
                      isNearest ? 'border-blue-500 bg-blue-500/10' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div 
                        className="font-medium text-sm flex-1 min-w-0 cursor-pointer hover:text-primary"
                        onClick={() => {
                          if (item.stop.stop_lat && item.stop.stop_lon) {
                            mapRef.current?.flyTo({
                              center: [item.stop.stop_lon, item.stop.stop_lat],
                              zoom: 17,
                              duration: 500
                            });
                          }
                        }}
                      >
                        {isNearest && <span className="text-blue-500 mr-1">★</span>}
                        {item.stop.stop_name || item.stop.stop_id}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(item.stop.stop_id);
                        }}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title={isFavorite ? 'Αφαίρεση από αγαπημένα' : 'Προσθήκη στα αγαπημένα'}
                      >
                        <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span>{Math.round(item.distance)} μ.</span>
                      <span className="text-blue-500">~{walkTime} λεπ.</span>
                    </div>
                    
                    {arrivals.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {arrivals.slice(0, 3).map((arr, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-xs">
                            <span 
                              className="font-bold px-1 py-0.5 rounded text-white text-[10px]"
                              style={{ backgroundColor: arr.routeColor ? `#${arr.routeColor}` : '#0ea5e9' }}
                            >
                              {arr.routeShortName || '?'}
                            </span>
                            <span className="font-mono text-primary text-[10px]">{formatETA(arr.arrivalTime)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">Δεν υπάρχουν αφίξεις</div>
                    )}
                  </div>
                );
              })
            ) : (
              // Favorite stops
              favoriteStops.size === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  <Heart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Δεν έχετε αγαπημένες στάσεις</p>
                  <p className="mt-1">Πατήστε την καρδιά σε μια στάση</p>
                </div>
              ) : (
                [...favoriteStops].map(stopId => {
                  const stop = stops.find(s => s.stop_id === stopId);
                  if (!stop) return null;
                  
                  const arrivals = getArrivalsForStop(stopId);
                  
                  return (
                    <div 
                      key={stopId}
                      className="p-2 rounded-lg border border-red-500/30 bg-red-500/5"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div 
                          className="font-medium text-sm flex-1 min-w-0 cursor-pointer hover:text-primary"
                          onClick={() => {
                            if (stop.stop_lat && stop.stop_lon) {
                              mapRef.current?.flyTo({
                                center: [stop.stop_lon, stop.stop_lat],
                                zoom: 17,
                                duration: 500
                              });
                            }
                          }}
                        >
                          <Heart className="h-3 w-3 inline mr-1 fill-red-500 text-red-500" />
                          {stop.stop_name || stop.stop_id}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(stopId);
                          }}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title="Αφαίρεση από αγαπημένα"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                      
                      {arrivals.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {arrivals.slice(0, 3).map((arr, idx) => (
                            <div key={idx} className="flex items-center gap-1 text-xs">
                              <span 
                                className="font-bold px-1 py-0.5 rounded text-white text-[10px]"
                                style={{ backgroundColor: arr.routeColor ? `#${arr.routeColor}` : '#0ea5e9' }}
                              >
                                {arr.routeShortName || '?'}
                              </span>
                              <span className="font-mono text-primary text-[10px]">{formatETA(arr.arrivalTime)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">Δεν υπάρχουν αφίξεις</div>
                      )}
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 glass-card rounded-lg px-3 py-2 text-sm">
        <span className="font-medium">{vehicles.filter(v => v.latitude && v.longitude).length}</span>
        <span className="text-muted-foreground ml-1">οχήματα</span>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.2;
          }
        }
        .maplibregl-popup-content {
          padding: 0 !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
        .maplibregl-popup-close-button {
          font-size: 18px !important;
          padding: 4px 8px !important;
        }
      `}</style>
    </div>
  );
}
