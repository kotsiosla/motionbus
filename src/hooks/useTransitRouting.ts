import { useState, useCallback, useMemo } from 'react';
import type { StaticStop, Trip, RouteInfo } from '@/types/gtfs';

// Types for routing
export interface GeocodingResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
}

export interface RouteSegment {
  type: 'walk' | 'transit';
  from: {
    name: string;
    lat: number;
    lon: number;
  };
  to: {
    name: string;
    lat: number;
    lon: number;
  };
  distance?: number; // meters
  duration?: number; // minutes
  routeId?: string;
  routeName?: string;
  routeColor?: string;
  stopSequence?: string[];
  departureTime?: number;
  arrivalTime?: number;
}

export interface TransitRoute {
  id: string;
  segments: RouteSegment[];
  totalDuration: number; // minutes
  totalWalkingDistance: number; // meters
  departureTime: number;
  arrivalTime: number;
  transfers: number;
}

export interface RoutingState {
  origin: { lat: number; lon: number; name: string } | null;
  destination: { lat: number; lon: number; name: string } | null;
  routes: TransitRoute[];
  isSearching: boolean;
  error: string | null;
}

// Haversine distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Walking speed: ~5 km/h = ~83 m/min
const WALKING_SPEED_M_PER_MIN = 83;
const MAX_WALKING_DISTANCE = 1000; // 1km max walking
const MAX_TRANSFER_WALKING = 500; // 500m max for transfers

export function useTransitRouting(
  stops: StaticStop[],
  trips: Trip[],
  routes: RouteInfo[]
) {
  const [state, setState] = useState<RoutingState>({
    origin: null,
    destination: null,
    routes: [],
    isSearching: false,
    error: null,
  });

  // Build route lookup
  const routeMap = useMemo(() => {
    const map = new Map<string, RouteInfo>();
    routes.forEach(r => map.set(r.route_id, r));
    return map;
  }, [routes]);

  // Find nearby stops to a location
  const findNearbyStops = useCallback((lat: number, lon: number, maxDistance: number = MAX_WALKING_DISTANCE): (StaticStop & { distance: number })[] => {
    return stops
      .filter(s => s.stop_lat !== undefined && s.stop_lon !== undefined)
      .map(s => ({
        ...s,
        distance: calculateDistance(lat, lon, s.stop_lat!, s.stop_lon!)
      }))
      .filter(s => s.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }, [stops]);

  // Get routes serving a stop
  const getRoutesForStop = useCallback((stopId: string): Set<string> => {
    const routeIds = new Set<string>();
    trips.forEach(trip => {
      if (trip.stopTimeUpdates?.some(stu => stu.stopId === stopId)) {
        if (trip.routeId) routeIds.add(trip.routeId);
      }
    });
    return routeIds;
  }, [trips]);

  // Check if two stops are connected by same route
  const findConnectingRoutes = useCallback((fromStopId: string, toStopId: string): { routeId: string; tripId: string; fromSeq: number; toSeq: number }[] => {
    const connections: { routeId: string; tripId: string; fromSeq: number; toSeq: number }[] = [];
    
    trips.forEach(trip => {
      const updates = trip.stopTimeUpdates || [];
      const fromIdx = updates.findIndex(u => u.stopId === fromStopId);
      const toIdx = updates.findIndex(u => u.stopId === toStopId);
      
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx && trip.routeId && trip.tripId) {
        connections.push({
          routeId: trip.routeId,
          tripId: trip.tripId,
          fromSeq: updates[fromIdx].stopSequence || fromIdx,
          toSeq: updates[toIdx].stopSequence || toIdx,
        });
      }
    });
    
    return connections;
  }, [trips]);

  // Geocoding with Nominatim
  const searchAddress = useCallback(async (query: string): Promise<GeocodingResult[]> => {
    try {
      // Add Cyprus bounding box for better results
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&` +
        `format=json&` +
        `addressdetails=1&` +
        `limit=5&` +
        `viewbox=32.0,34.0,35.0,35.7&` +
        `bounded=0&` +
        `countrycodes=cy`
      );
      
      if (!response.ok) throw new Error('Geocoding failed');
      
      const results = await response.json();
      return results;
    } catch (error) {
      console.error('Geocoding error:', error);
      return [];
    }
  }, []);

  // Reverse geocoding
  const reverseGeocode = useCallback(async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?` +
        `lat=${lat}&lon=${lon}&format=json`
      );
      
      if (!response.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      
      const result = await response.json();
      return result.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }, []);

  // Set origin - snap to nearest stop within 400m
  const setOrigin = useCallback(async (lat: number, lon: number, name?: string) => {
    const nearbyStops = findNearbyStops(lat, lon, 400);
    
    if (nearbyStops.length > 0) {
      const nearestStop = nearbyStops[0];
      setState(prev => ({
        ...prev,
        origin: { 
          lat: nearestStop.stop_lat!, 
          lon: nearestStop.stop_lon!, 
          name: `📍 ${nearestStop.stop_name || nearestStop.stop_id} (${Math.round(nearestStop.distance)}μ)` 
        },
        routes: [],
        error: null,
      }));
    } else {
      const displayName = name || await reverseGeocode(lat, lon);
      setState(prev => ({
        ...prev,
        origin: { lat, lon, name: displayName },
        routes: [],
        error: 'Δεν βρέθηκε στάση εντός 400μ',
      }));
    }
  }, [reverseGeocode, findNearbyStops]);

  // Set destination - snap to nearest stop within 400m
  const setDestination = useCallback(async (lat: number, lon: number, name?: string) => {
    const nearbyStops = findNearbyStops(lat, lon, 400);
    
    if (nearbyStops.length > 0) {
      const nearestStop = nearbyStops[0];
      setState(prev => ({
        ...prev,
        destination: { 
          lat: nearestStop.stop_lat!, 
          lon: nearestStop.stop_lon!, 
          name: `🎯 ${nearestStop.stop_name || nearestStop.stop_id} (${Math.round(nearestStop.distance)}μ)` 
        },
        routes: [],
        error: null,
      }));
    } else {
      const displayName = name || await reverseGeocode(lat, lon);
      setState(prev => ({
        ...prev,
        destination: { lat, lon, name: displayName },
        routes: [],
        error: 'Δεν βρέθηκε στάση εντός 400μ',
      }));
    }
  }, [reverseGeocode, findNearbyStops]);

  // Clear routing
  const clearRouting = useCallback(() => {
    setState({
      origin: null,
      destination: null,
      routes: [],
      isSearching: false,
      error: null,
    });
  }, []);

  // Main routing algorithm
  const calculateRoutes = useCallback(async () => {
    if (!state.origin || !state.destination) {
      setState(prev => ({ ...prev, error: 'Ορίστε αφετηρία και προορισμό' }));
      return;
    }

    setState(prev => ({ ...prev, isSearching: true, error: null, routes: [] }));

    try {
      const originStops = findNearbyStops(state.origin.lat, state.origin.lon);
      const destStops = findNearbyStops(state.destination.lat, state.destination.lon);

      if (originStops.length === 0) {
        throw new Error('Δεν βρέθηκαν στάσεις κοντά στην αφετηρία');
      }
      if (destStops.length === 0) {
        throw new Error('Δεν βρέθηκαν στάσεις κοντά στον προορισμό');
      }

      const foundRoutes: TransitRoute[] = [];
      const now = Date.now() / 1000;

      // Try direct routes (no transfer)
      for (const originStop of originStops.slice(0, 5)) {
        for (const destStop of destStops.slice(0, 5)) {
          const connections = findConnectingRoutes(originStop.stop_id, destStop.stop_id);
          
          for (const conn of connections.slice(0, 3)) {
            const route = routeMap.get(conn.routeId);
            const trip = trips.find(t => t.tripId === conn.tripId);
            
            if (!trip) continue;

            const fromUpdate = trip.stopTimeUpdates?.find(u => u.stopId === originStop.stop_id);
            const toUpdate = trip.stopTimeUpdates?.find(u => u.stopId === destStop.stop_id);
            
            if (!fromUpdate?.departureTime || !toUpdate?.arrivalTime) continue;
            if (fromUpdate.departureTime < now) continue; // Skip past departures

            const walkToStop = Math.round(originStop.distance / WALKING_SPEED_M_PER_MIN);
            const walkFromStop = Math.round(destStop.distance / WALKING_SPEED_M_PER_MIN);
            const transitDuration = Math.round((toUpdate.arrivalTime - fromUpdate.departureTime) / 60);

            const transitRoute: TransitRoute = {
              id: `direct-${originStop.stop_id}-${destStop.stop_id}-${conn.tripId}`,
              segments: [
                {
                  type: 'walk',
                  from: { name: state.origin.name, lat: state.origin.lat, lon: state.origin.lon },
                  to: { name: originStop.stop_name, lat: originStop.stop_lat!, lon: originStop.stop_lon! },
                  distance: Math.round(originStop.distance),
                  duration: walkToStop,
                },
                {
                  type: 'transit',
                  from: { name: originStop.stop_name, lat: originStop.stop_lat!, lon: originStop.stop_lon! },
                  to: { name: destStop.stop_name, lat: destStop.stop_lat!, lon: destStop.stop_lon! },
                  routeId: conn.routeId,
                  routeName: route?.route_short_name || route?.route_long_name || conn.routeId,
                  routeColor: route?.route_color,
                  departureTime: fromUpdate.departureTime,
                  arrivalTime: toUpdate.arrivalTime,
                  duration: transitDuration,
                },
                {
                  type: 'walk',
                  from: { name: destStop.stop_name, lat: destStop.stop_lat!, lon: destStop.stop_lon! },
                  to: { name: state.destination.name, lat: state.destination.lat, lon: state.destination.lon },
                  distance: Math.round(destStop.distance),
                  duration: walkFromStop,
                },
              ],
              totalDuration: walkToStop + transitDuration + walkFromStop,
              totalWalkingDistance: Math.round(originStop.distance + destStop.distance),
              departureTime: fromUpdate.departureTime - (walkToStop * 60),
              arrivalTime: toUpdate.arrivalTime + (walkFromStop * 60),
              transfers: 0,
            };

            foundRoutes.push(transitRoute);
          }
        }
      }

      // Try routes with one transfer
      if (foundRoutes.length < 3) {
        for (const originStop of originStops.slice(0, 3)) {
          const originRoutes = getRoutesForStop(originStop.stop_id);
          
          for (const destStop of destStops.slice(0, 3)) {
            const destRoutes = getRoutesForStop(destStop.stop_id);
            
            // Find potential transfer stops
            const potentialTransfers = stops.filter(s => {
              if (!s.stop_lat || !s.stop_lon) return false;
              const sRoutes = getRoutesForStop(s.stop_id);
              const hasOriginRoute = Array.from(originRoutes).some(r => sRoutes.has(r));
              const hasDestRoute = Array.from(destRoutes).some(r => sRoutes.has(r));
              return hasOriginRoute && hasDestRoute && s.stop_id !== originStop.stop_id && s.stop_id !== destStop.stop_id;
            });

            for (const transferStop of potentialTransfers.slice(0, 2)) {
              const firstLeg = findConnectingRoutes(originStop.stop_id, transferStop.stop_id);
              const secondLeg = findConnectingRoutes(transferStop.stop_id, destStop.stop_id);
              
              if (firstLeg.length > 0 && secondLeg.length > 0) {
                const fl = firstLeg[0];
                const sl = secondLeg[0];
                
                const route1 = routeMap.get(fl.routeId);
                const route2 = routeMap.get(sl.routeId);
                
                const trip1 = trips.find(t => t.tripId === fl.tripId);
                const trip2 = trips.find(t => t.tripId === sl.tripId);
                
                if (!trip1 || !trip2) continue;
                
                const fromUpdate1 = trip1.stopTimeUpdates?.find(u => u.stopId === originStop.stop_id);
                const toUpdate1 = trip1.stopTimeUpdates?.find(u => u.stopId === transferStop.stop_id);
                const fromUpdate2 = trip2.stopTimeUpdates?.find(u => u.stopId === transferStop.stop_id);
                const toUpdate2 = trip2.stopTimeUpdates?.find(u => u.stopId === destStop.stop_id);
                
                if (!fromUpdate1?.departureTime || !toUpdate1?.arrivalTime || 
                    !fromUpdate2?.departureTime || !toUpdate2?.arrivalTime) continue;
                if (fromUpdate1.departureTime < now) continue;
                if (fromUpdate2.departureTime < toUpdate1.arrivalTime) continue; // Invalid transfer

                const walkToStop = Math.round(originStop.distance / WALKING_SPEED_M_PER_MIN);
                const walkFromStop = Math.round(destStop.distance / WALKING_SPEED_M_PER_MIN);
                const transit1Duration = Math.round((toUpdate1.arrivalTime - fromUpdate1.departureTime) / 60);
                const waitTime = Math.round((fromUpdate2.departureTime - toUpdate1.arrivalTime) / 60);
                const transit2Duration = Math.round((toUpdate2.arrivalTime - fromUpdate2.departureTime) / 60);

                const transitRoute: TransitRoute = {
                  id: `transfer-${originStop.stop_id}-${transferStop.stop_id}-${destStop.stop_id}`,
                  segments: [
                    {
                      type: 'walk',
                      from: { name: state.origin.name, lat: state.origin.lat, lon: state.origin.lon },
                      to: { name: originStop.stop_name, lat: originStop.stop_lat!, lon: originStop.stop_lon! },
                      distance: Math.round(originStop.distance),
                      duration: walkToStop,
                    },
                    {
                      type: 'transit',
                      from: { name: originStop.stop_name, lat: originStop.stop_lat!, lon: originStop.stop_lon! },
                      to: { name: transferStop.stop_name, lat: transferStop.stop_lat!, lon: transferStop.stop_lon! },
                      routeId: fl.routeId,
                      routeName: route1?.route_short_name || route1?.route_long_name || fl.routeId,
                      routeColor: route1?.route_color,
                      departureTime: fromUpdate1.departureTime,
                      arrivalTime: toUpdate1.arrivalTime,
                      duration: transit1Duration,
                    },
                    {
                      type: 'transit',
                      from: { name: transferStop.stop_name, lat: transferStop.stop_lat!, lon: transferStop.stop_lon! },
                      to: { name: destStop.stop_name, lat: destStop.stop_lat!, lon: destStop.stop_lon! },
                      routeId: sl.routeId,
                      routeName: route2?.route_short_name || route2?.route_long_name || sl.routeId,
                      routeColor: route2?.route_color,
                      departureTime: fromUpdate2.departureTime,
                      arrivalTime: toUpdate2.arrivalTime,
                      duration: transit2Duration,
                    },
                    {
                      type: 'walk',
                      from: { name: destStop.stop_name, lat: destStop.stop_lat!, lon: destStop.stop_lon! },
                      to: { name: state.destination.name, lat: state.destination.lat, lon: state.destination.lon },
                      distance: Math.round(destStop.distance),
                      duration: walkFromStop,
                    },
                  ],
                  totalDuration: walkToStop + transit1Duration + waitTime + transit2Duration + walkFromStop,
                  totalWalkingDistance: Math.round(originStop.distance + destStop.distance),
                  departureTime: fromUpdate1.departureTime - (walkToStop * 60),
                  arrivalTime: toUpdate2.arrivalTime + (walkFromStop * 60),
                  transfers: 1,
                };

                foundRoutes.push(transitRoute);
              }
            }
          }
        }
      }

      // Sort by total duration
      foundRoutes.sort((a, b) => a.totalDuration - b.totalDuration);

      // Remove duplicates and limit results
      const uniqueRoutes = foundRoutes.filter((route, index, self) =>
        index === self.findIndex(r => r.id === route.id)
      ).slice(0, 5);

      if (uniqueRoutes.length === 0) {
        throw new Error('Δεν βρέθηκαν διαδρομές. Δοκιμάστε διαφορετικό προορισμό.');
      }

      setState(prev => ({
        ...prev,
        routes: uniqueRoutes,
        isSearching: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Σφάλμα αναζήτησης',
        isSearching: false,
      }));
    }
  }, [state.origin, state.destination, findNearbyStops, findConnectingRoutes, getRoutesForStop, routeMap, trips, stops]);

  return {
    state,
    searchAddress,
    setOrigin,
    setDestination,
    calculateRoutes,
    clearRouting,
    findNearbyStops,
  };
}
