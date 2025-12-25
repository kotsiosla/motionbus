import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { X, Navigation, MapPin, Clock, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Vehicle, StaticStop, Trip, RouteInfo } from "@/types/gtfs";

interface VehicleMapProps {
  vehicles: Vehicle[];
  trips?: Trip[];
  stops?: StaticStop[];
  routeNamesMap?: Map<string, RouteInfo>;
  isLoading: boolean;
}

const createVehicleIcon = (bearing?: number, isFollowed?: boolean, routeColor?: string) => {
  const rotation = bearing || 0;
  const ringClass = isFollowed ? 'animate-ping' : 'animate-pulse-ring';
  const bgColor = routeColor ? `#${routeColor}` : 'hsl(var(--primary))';
  const glowStyle = isFollowed ? 'box-shadow: 0 0 0 2px #facc15;' : '';
  
  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div class="relative" style="transform: rotate(${rotation}deg)">
        <div class="absolute inset-0 rounded ${ringClass} opacity-50" style="background: ${bgColor}"></div>
        <div class="relative flex flex-col items-center">
          <div style="width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 5px solid ${bgColor}; margin-bottom: -1px;"></div>
          <div class="w-5 h-4 rounded-sm flex items-center justify-center shadow-md" style="background: ${bgColor}; ${glowStyle}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="14" rx="2"/>
              <circle cx="7" cy="18" r="1.5" fill="white"/>
              <circle cx="17" cy="18" r="1.5" fill="white"/>
              <path d="M3 10h18"/>
            </svg>
          </div>
        </div>
      </div>
    `,
    iconSize: [20, 26],
    iconAnchor: [10, 13],
  });
};

const createStopIcon = (hasVehicleStopped?: boolean) => {
  const bgColor = hasVehicleStopped ? '#22c55e' : '#f97316'; // green-500 or orange-500
  return L.divIcon({
    className: 'stop-marker',
    html: `
      <div class="w-5 h-5 rounded-full flex items-center justify-center shadow-md border-2 border-white ${hasVehicleStopped ? 'animate-pulse' : ''}" style="background: ${bgColor}">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${hasVehicleStopped 
            ? '<rect x="3" y="4" width="18" height="14" rx="2"/><circle cx="7" cy="18" r="1.5" fill="white"/><circle cx="17" cy="18" r="1.5" fill="white"/>' 
            : '<circle cx="12" cy="12" r="3"/>'}
        </svg>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

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

export function VehicleMap({ vehicles, trips = [], stops = [], routeNamesMap, isLoading }: VehicleMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const vehicleMarkersRef = useRef<L.MarkerClusterGroup | null>(null);
  const stopMarkersRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [followedVehicleId, setFollowedVehicleId] = useState<string | null>(null);
  const [showStops, setShowStops] = useState(true);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const walkingRouteRef = useRef<L.Polyline | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

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
  const getNextStopInfo = (vehicle: Vehicle) => {
    if (!vehicle.tripId) return null;
    
    const trip = tripMap.get(vehicle.tripId);
    if (!trip?.stopTimeUpdates?.length) return null;

    // Find the next stop based on current stop sequence
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
  };

  // Get arrivals for a specific stop
  const getArrivalsForStop = (stopId: string) => {
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
        
        // Find associated vehicle
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

    // Sort by arrival time
    arrivals.sort((a, b) => (a.arrivalTime || 0) - (b.arrivalTime || 0));
    
    // Return only next 5 arrivals
    return arrivals.slice(0, 5);
  };

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [35.0, 33.0], // Center of Cyprus
      zoom: 9,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapRef.current);

    vehicleMarkersRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="marker-cluster"><div>${count}</div></div>`,
          className: 'marker-cluster-container',
          iconSize: L.point(40, 40),
        });
      },
    });

    stopMarkersRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 15,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="stop-cluster"><div>${count}</div></div>`,
          className: 'stop-cluster-container',
          iconSize: L.point(30, 30),
        });
      },
    });

    mapRef.current.addLayer(vehicleMarkersRef.current);
    mapRef.current.addLayer(stopMarkersRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update vehicle markers when vehicles change
  useEffect(() => {
    if (!vehicleMarkersRef.current) return;

    vehicleMarkersRef.current.clearLayers();
    markerMapRef.current.clear();

    const validVehicles = vehicles.filter(
      (v) => v.latitude !== undefined && v.longitude !== undefined
    );

    validVehicles.forEach((vehicle) => {
      const vehicleId = vehicle.vehicleId || vehicle.id;
      const isFollowed = followedVehicleId === vehicleId;
      
      // Get route color
      const routeInfo = vehicle.routeId && routeNamesMap ? routeNamesMap.get(vehicle.routeId) : null;
      const routeColor = routeInfo?.route_color;
      const routeName = routeInfo ? `${routeInfo.route_short_name} - ${routeInfo.route_long_name}` : vehicle.routeId;
      
      // Get next stop info
      const nextStop = getNextStopInfo(vehicle);
      
      const marker = L.marker([vehicle.latitude!, vehicle.longitude!], {
        icon: createVehicleIcon(vehicle.bearing, isFollowed, routeColor),
      });

      marker.on('click', () => {
        setFollowedVehicleId(vehicleId);
      });

      const etaHtml = nextStop ? `
        <div class="mt-2 pt-2 border-t border-border">
          <div class="flex items-center gap-1 text-primary font-medium mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Επόμενη στάση
          </div>
          <div class="text-sm">
            <div class="font-medium">${nextStop.stopName}</div>
            ${nextStop.arrivalTime ? `<div class="text-muted-foreground">Άφιξη: <span class="text-foreground font-mono">${formatETA(nextStop.arrivalTime)}</span> ${formatDelay(nextStop.arrivalDelay)}</div>` : ''}
          </div>
        </div>
      ` : '';

      marker.bindPopup(`
        <div class="p-3 min-w-[220px]">
          <div class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="inline-block w-3 h-3 rounded-full" style="background: ${routeColor ? `#${routeColor}` : 'hsl(var(--primary))'}"></span>
            Όχημα ${vehicleId}
          </div>
          <div class="space-y-1.5 text-sm">
            ${vehicle.label ? `<div class="flex justify-between"><span class="text-muted-foreground">Ετικέτα:</span><span class="font-mono">${vehicle.label}</span></div>` : ''}
            ${routeName ? `<div class="flex justify-between gap-2"><span class="text-muted-foreground">Γραμμή:</span><span class="text-right font-medium" style="color: ${routeColor ? `#${routeColor}` : 'inherit'}">${routeName}</span></div>` : ''}
            <div class="flex justify-between"><span class="text-muted-foreground">Ταχύτητα:</span><span>${formatSpeed(vehicle.speed)}</span></div>
            ${vehicle.bearing !== undefined ? `<div class="flex justify-between"><span class="text-muted-foreground">Κατεύθυνση:</span><span>${vehicle.bearing.toFixed(0)}°</span></div>` : ''}
            ${vehicle.currentStatus ? `<div class="flex justify-between"><span class="text-muted-foreground">Κατάσταση:</span><span>${vehicle.currentStatus}</span></div>` : ''}
            <div class="flex justify-between pt-1 border-t border-border mt-2"><span class="text-muted-foreground">Ενημ:</span><span class="text-xs">${formatTimestamp(vehicle.timestamp)}</span></div>
          </div>
          ${etaHtml}
        </div>
      `, {
        className: 'vehicle-popup',
      });

      markerMapRef.current.set(vehicleId, marker);
      vehicleMarkersRef.current!.addLayer(marker);
    });

    // If not following a vehicle, fit bounds to show all
    if (!followedVehicleId && validVehicles.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(
        validVehicles.map((v) => [v.latitude!, v.longitude!])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [vehicles, followedVehicleId, routeNamesMap, tripMap, stopMap]);

  // Get stops with vehicles currently stopped
  const stopsWithVehicles = useMemo(() => {
    const stoppedAtStops = new Set<string>();
    vehicles.forEach(v => {
      // STOPPED_AT status is typically "1" or "STOPPED_AT" in GTFS-RT
      const status = String(v.currentStatus);
      if (v.stopId && (status === 'STOPPED_AT' || status === '1')) {
        stoppedAtStops.add(v.stopId);
      }
    });
    return stoppedAtStops;
  }, [vehicles]);

  // Handle user location
  const locateUser = () => {
    if (!mapRef.current) return;
    
    setIsLocating(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        
        // Create or update user location marker
        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `
              <div class="relative">
                <div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-50"></div>
                <div class="relative w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
              </div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          
          userLocationMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon })
            .bindPopup('<div class="p-2 text-sm font-medium">📍 Η τοποθεσία σας</div>')
            .addTo(mapRef.current!);
        }
        
        // Pan to user location
        mapRef.current?.setView([latitude, longitude], 15, { animate: true });
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
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
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

  // Get the actual stop object (stable reference when stopId doesn't change)
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
    
    // Sort by distance
    return stopsWithDistance.sort((a, b) => a.distance - b.distance);
  }, [userLocation, stops]);

  // Calculate walking time (average walking speed ~5 km/h = 83.3 m/min)
  const walkingTimeMinutes = useMemo(() => {
    if (!nearestStop) return null;
    return Math.ceil(nearestStop.distance / 83.3);
  }, [nearestStop?.distance]);

  // Draw walking route to nearest stop - only when stopId or userLocation changes
  const nearestStopId = nearestStopData?.stopId;
  const nearestStopLat = nearestStop?.stop.stop_lat;
  const nearestStopLon = nearestStop?.stop.stop_lon;
  
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing route
    if (walkingRouteRef.current) {
      mapRef.current.removeLayer(walkingRouteRef.current);
      walkingRouteRef.current = null;
    }

    // Draw new route if we have user location and nearest stop
    if (userLocation && nearestStopLat && nearestStopLon) {
      const routeCoords: L.LatLngExpression[] = [
        [userLocation.lat, userLocation.lng],
        [nearestStopLat, nearestStopLon]
      ];

      walkingRouteRef.current = L.polyline(routeCoords, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        className: 'walking-route'
      }).addTo(mapRef.current);
    }
  }, [userLocation?.lat, userLocation?.lng, nearestStopId, nearestStopLat, nearestStopLon]);

  // Update user location marker position
  useEffect(() => {
    if (!userLocation || !userLocationMarkerRef.current) return;
    userLocationMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
  }, [userLocation]);

  useEffect(() => {
    if (!stopMarkersRef.current || !mapRef.current) return;

    stopMarkersRef.current.clearLayers();

    if (!showStops) return;

    const validStops = stops.filter(
      (s) => s.stop_lat !== undefined && s.stop_lon !== undefined
    );

    validStops.forEach((stop) => {
      const hasVehicleStopped = stopsWithVehicles.has(stop.stop_id);
      const arrivals = getArrivalsForStop(stop.stop_id);
      
      const marker = L.marker([stop.stop_lat!, stop.stop_lon!], {
        icon: createStopIcon(hasVehicleStopped),
      });

      const statusColor = hasVehicleStopped ? '#22c55e' : '#f97316';
      const statusText = hasVehicleStopped ? '<div class="text-green-500 font-medium mt-2 pt-2 border-t border-border">🚌 Λεωφορείο στη στάση</div>' : '';

      // Build arrivals HTML
      let arrivalsHtml = '';
      if (arrivals.length > 0) {
        arrivalsHtml = `
          <div class="mt-3 pt-2 border-t border-border">
            <div class="font-medium text-sm mb-2 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Επόμενες αφίξεις
            </div>
            <div class="space-y-2">
              ${arrivals.map(arr => {
                const routeColor = arr.routeColor ? `#${arr.routeColor}` : '#0ea5e9';
                const delayText = arr.arrivalDelay !== undefined && arr.arrivalDelay !== 0 
                  ? `<span class="${arr.arrivalDelay > 0 ? 'text-red-500' : 'text-green-500'}">${formatDelay(arr.arrivalDelay)}</span>` 
                  : '';
                return `
                  <div class="flex items-center gap-2 text-sm">
                    <span class="font-bold px-1.5 py-0.5 rounded text-white text-xs" style="background: ${routeColor}">${arr.routeShortName || arr.routeId || '?'}</span>
                    <span class="font-mono text-primary">${formatETA(arr.arrivalTime)}</span>
                    ${delayText}
                    ${arr.vehicleLabel ? `<span class="text-muted-foreground text-xs">(${arr.vehicleLabel})</span>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      } else {
        arrivalsHtml = '<div class="mt-2 pt-2 border-t border-border text-sm text-muted-foreground">Δεν υπάρχουν προγραμματισμένες αφίξεις</div>';
      }

      marker.bindPopup(`
        <div class="p-3 min-w-[220px] max-w-[300px]">
          <div class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full" style="background: ${statusColor}"></span>
            ${stop.stop_name || 'Στάση'}
          </div>
          <div class="space-y-1.5 text-sm">
            <div class="flex justify-between"><span class="text-muted-foreground">ID:</span><span class="font-mono">${stop.stop_id}</span></div>
            ${stop.stop_code ? `<div class="flex justify-between"><span class="text-muted-foreground">Κωδικός:</span><span class="font-mono">${stop.stop_code}</span></div>` : ''}
          </div>
          ${statusText}
          ${arrivalsHtml}
        </div>
      `, {
        className: 'stop-popup',
        maxWidth: 320,
      });

      stopMarkersRef.current!.addLayer(marker);
    });
  }, [stops, showStops, stopsWithVehicles, trips, vehicles, routeNamesMap]);

  // Follow the selected vehicle in realtime
  useEffect(() => {
    if (!followedVehicleId || !mapRef.current) return;

    const followedVehicle = vehicles.find(
      (v) => (v.vehicleId || v.id) === followedVehicleId
    );

    if (followedVehicle?.latitude && followedVehicle?.longitude) {
      mapRef.current.setView(
        [followedVehicle.latitude, followedVehicle.longitude],
        16,
        { animate: true, duration: 0.5 }
      );
    }
  }, [vehicles, followedVehicleId]);

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

      {/* Map controls */}
      <div className="absolute top-4 right-4 glass-card rounded-lg px-3 py-2 flex items-center gap-2 z-[1000]">
        <Switch
          id="show-stops"
          checked={showStops}
          onCheckedChange={setShowStops}
        />
        <Label htmlFor="show-stops" className="text-xs cursor-pointer flex items-center gap-1">
          <MapPin className="h-3 w-3 text-orange-500" />
          Στάσεις ({stops.length})
        </Label>
      </div>

      {/* Location button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-16 right-4 z-[1000] glass-card h-9 w-9"
        onClick={locateUser}
        disabled={isLocating}
        title="Εντοπισμός τοποθεσίας"
      >
        <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''} ${userLocation ? 'text-blue-500' : ''}`} />
      </Button>

      {/* Nearby stops panel */}
      {userLocation && nearbyStops.length > 0 && (
        <div className="absolute bottom-4 right-4 glass-card rounded-lg p-3 z-[1000] max-w-[300px] max-h-[60vh] overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">
              Στάσεις σε ακτίνα 500μ ({nearbyStops.length})
            </span>
          </div>
          
          <div className="overflow-auto flex-1 space-y-2 scrollbar-thin">
            {nearbyStops.map((item, index) => {
              const arrivals = getArrivalsForStop(item.stop.stop_id);
              const walkTime = Math.ceil(item.distance / 83.3);
              const isNearest = index === 0;
              
              return (
                <div 
                  key={item.stop.stop_id}
                  className={`p-2 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                    isNearest ? 'border-blue-500 bg-blue-500/10' : 'border-border'
                  }`}
                  onClick={() => {
                    if (item.stop.stop_lat && item.stop.stop_lon) {
                      mapRef.current?.setView([item.stop.stop_lat, item.stop.stop_lon], 17, { animate: true });
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-sm flex-1 min-w-0">
                      {isNearest && <span className="text-blue-500 mr-1">★</span>}
                      {item.stop.stop_name || item.stop.stop_id}
                    </div>
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
            })}
          </div>
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 glass-card rounded-lg px-3 py-2 text-sm">
        <span className="font-medium">{vehicles.filter(v => v.latitude && v.longitude).length}</span>
        <span className="text-muted-foreground ml-1">οχήματα</span>
      </div>
    </div>
  );
}