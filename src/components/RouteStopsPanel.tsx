import { X, MapPin, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Bus } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import type { Trip, StaticStop, RouteInfo, ShapePoint, TripShapeMapping, Vehicle } from "@/types/gtfs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface RouteStopsPanelProps {
  selectedRoute: string;
  routeInfo?: RouteInfo;
  trips: Trip[];
  stops: StaticStop[];
  shapes: ShapePoint[];
  tripMappings: TripShapeMapping[];
  vehicles: Vehicle[];
  onClose: () => void;
  onStopClick?: (stopId: string, lat: number, lon: number) => void;
}

const STOPS_PER_PAGE = 10;

const formatETA = (arrivalTime?: number) => {
  if (!arrivalTime) return null;
  const date = new Date(arrivalTime * 1000);
  return date.toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatMinutesFromNow = (arrivalTime?: number) => {
  if (!arrivalTime) return null;
  const now = Date.now() / 1000;
  const diff = arrivalTime - now;
  const minutes = Math.round(diff / 60);
  if (minutes < 0) return null;
  if (minutes === 0) return 'Τώρα';
  if (minutes === 1) return '1\'';
  return `${minutes}'`;
};

export function RouteStopsPanel({
  selectedRoute,
  routeInfo,
  trips,
  stops,
  shapes,
  tripMappings,
  vehicles,
  onClose,
  onStopClick,
}: RouteStopsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Get vehicles on this route
  const routeVehicles = useMemo(() => {
    return vehicles.filter(v => v.routeId === selectedRoute && v.latitude && v.longitude);
  }, [vehicles, selectedRoute]);

  // Get ordered stops for the selected route
  const orderedStops = useMemo(() => {
    // First, try to get stops from trips with realtime data
    const routeTrips = trips.filter(t => t.routeId === selectedRoute && t.stopTimeUpdates?.length > 0);
    
    if (routeTrips.length > 0) {
      // Use the trip with the most stop updates
      const bestTrip = routeTrips.reduce((a, b) => 
        (a.stopTimeUpdates?.length || 0) > (b.stopTimeUpdates?.length || 0) ? a : b
      );
      
      // Get stops in order from the trip
      const stopSequence = bestTrip.stopTimeUpdates
        .sort((a, b) => (a.stopSequence || 0) - (b.stopSequence || 0))
        .map(stu => {
          const stopInfo = stops.find(s => s.stop_id === stu.stopId);
          return {
            stopId: stu.stopId || '',
            stopName: stopInfo?.stop_name || stu.stopId || 'Άγνωστη στάση',
            arrivalTime: stu.arrivalTime,
            departureTime: stu.departureTime,
            arrivalDelay: stu.arrivalDelay,
            stopSequence: stu.stopSequence || 0,
            lat: stopInfo?.stop_lat,
            lon: stopInfo?.stop_lon,
          };
        })
        .filter(s => s.stopId);
        
      return stopSequence;
    }
    
    // Fallback: try to get stops from shape points
    if (shapes.length > 0 && tripMappings.length > 0) {
      const routeShapeIds = new Set<string>();
      tripMappings.forEach(mapping => {
        if (mapping.route_id === selectedRoute) {
          routeShapeIds.add(mapping.shape_id);
        }
      });
      
      const routeShapePoints = shapes
        .filter(p => routeShapeIds.has(p.shape_id))
        .sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
      
      if (routeShapePoints.length > 0) {
        const stopsNearShape: Array<{
          stopId: string;
          stopName: string;
          lat?: number;
          lon?: number;
          shapeSequence: number;
          arrivalTime?: number;
          arrivalDelay?: number;
        }> = [];
        
        stops.forEach(stop => {
          if (stop.stop_lat === undefined || stop.stop_lon === undefined) return;
          
          let minDistance = Infinity;
          let closestSequence = 0;
          
          for (const point of routeShapePoints) {
            const distance = Math.sqrt(
              Math.pow((stop.stop_lat - point.shape_pt_lat) * 111000, 2) +
              Math.pow((stop.stop_lon - point.shape_pt_lon) * 111000 * Math.cos(stop.stop_lat * Math.PI / 180), 2)
            );
            if (distance < minDistance) {
              minDistance = distance;
              closestSequence = point.shape_pt_sequence;
            }
          }
          
          if (minDistance < 100) {
            stopsNearShape.push({
              stopId: stop.stop_id,
              stopName: stop.stop_name,
              lat: stop.stop_lat,
              lon: stop.stop_lon,
              shapeSequence: closestSequence,
            });
          }
        });
        
        stopsNearShape.sort((a, b) => a.shapeSequence - b.shapeSequence);
        
        return stopsNearShape.map((s, idx) => ({
          ...s,
          stopSequence: idx + 1,
        }));
      }
    }
    
    return [];
  }, [selectedRoute, trips, stops, shapes, tripMappings]);

  // Find which stop each vehicle is at or approaching
  const vehiclePositions = useMemo(() => {
    const positions = new Map<string, { vehicleId: string; label?: string; status: 'at' | 'approaching' }>();
    
    routeVehicles.forEach(vehicle => {
      if (vehicle.stopId) {
        const existing = positions.get(vehicle.stopId);
        if (!existing) {
          positions.set(vehicle.stopId, {
            vehicleId: vehicle.vehicleId,
            label: vehicle.label,
            status: vehicle.currentStatus === 'STOPPED_AT' ? 'at' : 'approaching'
          });
        }
      }
    });
    
    return positions;
  }, [routeVehicles]);

  // Calculate total pages
  const totalPages = Math.ceil(orderedStops.length / STOPS_PER_PAGE);
  
  // Get stops for current page
  const currentStops = useMemo(() => {
    const start = currentPage * STOPS_PER_PAGE;
    return orderedStops.slice(start, start + STOPS_PER_PAGE);
  }, [orderedStops, currentPage]);

  // Reset page when route changes
  useEffect(() => {
    setCurrentPage(0);
  }, [selectedRoute]);

  // Auto-scroll to page with vehicle
  useEffect(() => {
    if (vehiclePositions.size > 0 && orderedStops.length > 0) {
      const firstVehicleStopId = Array.from(vehiclePositions.keys())[0];
      const stopIndex = orderedStops.findIndex(s => s.stopId === firstVehicleStopId);
      if (stopIndex >= 0) {
        const targetPage = Math.floor(stopIndex / STOPS_PER_PAGE);
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }
    }
  }, [vehiclePositions, orderedStops]);

  const routeColor = routeInfo?.route_color ? `#${routeInfo.route_color}` : '#0ea5e9';
  const routeTextColor = routeInfo?.route_text_color ? `#${routeInfo.route_text_color}` : '#ffffff';

  if (orderedStops.length === 0) {
    return null;
  }

  // Calculate global indices for current page
  const globalStartIndex = currentPage * STOPS_PER_PAGE;

  return (
    <div className={`absolute top-20 left-4 z-[1000] w-72 glass-card rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isMinimized ? 'max-h-14' : 'max-h-[calc(100vh-140px)]'}`}>
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer"
        style={{ backgroundColor: routeColor }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div 
            className="font-bold text-base px-2 py-0.5 rounded-md flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
          >
            {routeInfo?.route_short_name || selectedRoute}
          </div>
          <div className="text-xs font-medium truncate" style={{ color: routeTextColor }}>
            {routeInfo?.route_long_name || 'Διαδρομή'}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {routeVehicles.length > 0 && (
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
            >
              <Bus className="h-3 w-3" />
              {routeVehicles.length}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
          >
            {isMinimized ? (
              <ChevronDown className="h-4 w-4" style={{ color: routeTextColor }} />
            ) : (
              <ChevronUp className="h-4 w-4" style={{ color: routeTextColor }} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X className="h-4 w-4" style={{ color: routeTextColor }} />
          </Button>
        </div>
      </div>

      {/* Stops list - Metro style */}
      {!isMinimized && (
        <div className="flex flex-col">
          {/* Stats bar */}
          <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {orderedStops.length} στάσεις
            </div>
            {totalPages > 1 && (
              <div className="text-muted-foreground">
                Σελ. {currentPage + 1}/{totalPages}
              </div>
            )}
          </div>

          <ScrollArea className="max-h-[calc(100vh-280px)]">
            <div className="p-3">
              <div className="relative">
                {/* Metro line */}
                <div 
                  className="absolute left-[11px] top-3 bottom-3 w-1 rounded-full"
                  style={{ backgroundColor: routeColor }}
                />
                
                {/* Stops */}
                <div className="space-y-0">
                  {currentStops.map((stop, index) => {
                    const globalIndex = globalStartIndex + index;
                    const isFirst = globalIndex === 0;
                    const isLast = globalIndex === orderedStops.length - 1;
                    const eta = formatETA(stop.arrivalTime);
                    const minutesAway = formatMinutesFromNow(stop.arrivalTime);
                    const vehicleHere = vehiclePositions.get(stop.stopId);
                    
                    return (
                      <div 
                        key={stop.stopId}
                        className={`relative flex items-start gap-3 py-2 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors group pl-1 ${vehicleHere ? 'bg-primary/10' : ''}`}
                        onClick={() => {
                          if (stop.lat && stop.lon && onStopClick) {
                            onStopClick(stop.stopId, stop.lat, stop.lon);
                          }
                        }}
                      >
                        {/* Station dot / Bus icon */}
                        <div className="relative z-10 flex-shrink-0">
                          {vehicleHere ? (
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center animate-pulse"
                              style={{ backgroundColor: routeColor }}
                            >
                              <Bus className="h-3.5 w-3.5 text-white" />
                            </div>
                          ) : (
                            <div 
                              className={`w-6 h-6 rounded-full border-4 flex items-center justify-center transition-transform group-hover:scale-110 bg-background`}
                              style={{ 
                                borderColor: routeColor,
                                boxShadow: `0 0 0 2px ${routeColor}20`
                              }}
                            >
                              {(isFirst || isLast) && (
                                <div 
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: routeColor }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Stop info */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="font-medium text-sm leading-tight truncate">
                            {stop.stopName}
                          </div>
                          
                          {/* Vehicle info */}
                          {vehicleHere && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                                {vehicleHere.status === 'at' ? '🚌 Στη στάση' : '🚌 Πλησιάζει'}
                              </span>
                              {vehicleHere.label && (
                                <span className="text-[10px] text-muted-foreground">
                                  #{vehicleHere.label}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* ETA info */}
                          {!vehicleHere && (eta || minutesAway) && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {eta && (
                                <span className="text-xs font-mono text-primary font-semibold">
                                  {eta}
                                </span>
                              )}
                              {minutesAway && (
                                <span className={`text-[10px] px-1 py-0.5 rounded ${
                                  minutesAway === 'Τώρα' 
                                    ? 'bg-green-500/20 text-green-500 font-medium' 
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {minutesAway}
                                </span>
                              )}
                              {stop.arrivalDelay !== undefined && stop.arrivalDelay !== 0 && (
                                <span className={`text-[10px] ${stop.arrivalDelay > 0 ? 'text-destructive' : 'text-green-500'}`}>
                                  {stop.arrivalDelay > 0 ? '+' : ''}{Math.round(stop.arrivalDelay / 60)}'
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Terminal indicators */}
                        {isFirst && (
                          <div className="text-[9px] font-bold px-1 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400 flex-shrink-0">
                            ΑΦΕΤ.
                          </div>
                        )}
                        {isLast && (
                          <div className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400 flex-shrink-0">
                            ΤΕΡΜΑ
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Προηγ.
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentPage ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                    onClick={() => setCurrentPage(i)}
                  />
                ))}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              >
                Επόμ.
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
