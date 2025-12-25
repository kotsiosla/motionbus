import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { X, Navigation, MapPin, Clock } from "lucide-react";
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
  const glowStyle = isFollowed ? 'box-shadow: 0 0 0 3px #facc15;' : '';
  
  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div class="relative">
        <div class="absolute inset-0 rounded-full ${ringClass} opacity-50" style="background: ${bgColor}"></div>
        <div class="relative w-9 h-9 rounded-full flex items-center justify-center shadow-lg" style="background: ${bgColor}; ${glowStyle}; transform: rotate(${rotation}deg)">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 6v6"/>
            <path d="M15 6v6"/>
            <path d="M2 12h19.6"/>
            <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H6C4.9 6 3.9 6.8 3.6 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/>
            <circle cx="7" cy="18" r="2"/>
            <circle cx="17" cy="18" r="2"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

const createStopIcon = () => {
  return L.divIcon({
    className: 'stop-marker',
    html: `
      <div class="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center shadow-md border-2 border-white">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
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

  // Update stop markers when stops change or visibility toggles
  useEffect(() => {
    if (!stopMarkersRef.current || !mapRef.current) return;

    stopMarkersRef.current.clearLayers();

    if (!showStops) return;

    const validStops = stops.filter(
      (s) => s.stop_lat !== undefined && s.stop_lon !== undefined
    );

    validStops.forEach((stop) => {
      const marker = L.marker([stop.stop_lat!, stop.stop_lon!], {
        icon: createStopIcon(),
      });

      marker.bindPopup(`
        <div class="p-3 min-w-[180px]">
          <div class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="inline-block w-2 h-2 bg-orange-500 rounded-full"></span>
            ${stop.stop_name || 'Στάση'}
          </div>
          <div class="space-y-1.5 text-sm">
            <div class="flex justify-between"><span class="text-muted-foreground">ID:</span><span class="font-mono">${stop.stop_id}</span></div>
            ${stop.stop_code ? `<div class="flex justify-between"><span class="text-muted-foreground">Κωδικός:</span><span class="font-mono">${stop.stop_code}</span></div>` : ''}
          </div>
        </div>
      `, {
        className: 'stop-popup',
      });

      stopMarkersRef.current!.addLayer(marker);
    });
  }, [stops, showStops]);

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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-card rounded-lg px-4 py-2 z-[1000] max-w-[90%]">
          <div className="flex items-center gap-3">
            <Navigation 
              className="h-4 w-4 animate-pulse" 
              style={{ color: followedRouteInfo?.route_color ? `#${followedRouteInfo.route_color}` : 'hsl(var(--primary))' }}
            />
            <div className="text-sm">
              <span className="text-muted-foreground">Παρακολούθηση: </span>
              <span className="font-semibold">{followedVehicle.vehicleId || followedVehicle.id}</span>
              {followedRouteInfo && (
                <span 
                  className="ml-2 font-medium"
                  style={{ color: followedRouteInfo.route_color ? `#${followedRouteInfo.route_color}` : 'inherit' }}
                >
                  ({followedRouteInfo.route_short_name})
                </span>
              )}
              {followedVehicle.speed !== undefined && (
                <span className="ml-2 text-primary">{formatSpeed(followedVehicle.speed)}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setFollowedVehicleId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {followedNextStop && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-sm">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Επόμενη:</span>
              <span className="font-medium truncate max-w-[150px]">{followedNextStop.stopName}</span>
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
      
      <div className="absolute bottom-4 left-4 glass-card rounded-lg px-3 py-2 text-sm">
        <span className="font-medium">{vehicles.filter(v => v.latitude && v.longitude).length}</span>
        <span className="text-muted-foreground ml-1">οχήματα</span>
      </div>
    </div>
  );
}