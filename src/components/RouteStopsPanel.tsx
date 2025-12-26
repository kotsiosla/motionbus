import { X, MapPin, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { Trip, StaticStop, RouteInfo, ShapePoint, TripShapeMapping } from "@/types/gtfs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface RouteStopsPanelProps {
  selectedRoute: string;
  routeInfo?: RouteInfo;
  trips: Trip[];
  stops: StaticStop[];
  shapes: ShapePoint[];
  tripMappings: TripShapeMapping[];
  onClose: () => void;
  onStopClick?: (stopId: string, lat: number, lon: number) => void;
}

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
  if (minutes === 1) return '1 λεπτό';
  return `${minutes} λεπτά`;
};

export function RouteStopsPanel({
  selectedRoute,
  routeInfo,
  trips,
  stops,
  shapes,
  tripMappings,
  onClose,
  onStopClick,
}: RouteStopsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);

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
        // Find stops near shape points and order them
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
          
          if (minDistance < 100) { // 100 meters
            stopsNearShape.push({
              stopId: stop.stop_id,
              stopName: stop.stop_name,
              lat: stop.stop_lat,
              lon: stop.stop_lon,
              shapeSequence: closestSequence,
            });
          }
        });
        
        // Sort by shape sequence
        stopsNearShape.sort((a, b) => a.shapeSequence - b.shapeSequence);
        
        return stopsNearShape.map((s, idx) => ({
          ...s,
          stopSequence: idx + 1,
        }));
      }
    }
    
    return [];
  }, [selectedRoute, trips, stops, shapes, tripMappings]);

  const routeColor = routeInfo?.route_color ? `#${routeInfo.route_color}` : '#0ea5e9';
  const routeTextColor = routeInfo?.route_text_color ? `#${routeInfo.route_text_color}` : '#ffffff';

  if (orderedStops.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-20 right-4 z-[1000] w-72 max-h-[calc(100vh-140px)] glass-card rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer"
        style={{ backgroundColor: routeColor }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-3">
          <div 
            className="font-bold text-lg px-3 py-1 rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
          >
            {routeInfo?.route_short_name || selectedRoute}
          </div>
          <div className="text-sm font-medium truncate max-w-[120px]" style={{ color: routeTextColor }}>
            {routeInfo?.route_long_name || 'Διαδρομή'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-white/20"
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
            className="h-7 w-7 hover:bg-white/20"
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
        <ScrollArea className="max-h-[calc(100vh-220px)]">
          <div className="p-4 pt-2">
            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {orderedStops.length} στάσεις
            </div>
            
            <div className="relative">
              {/* Metro line */}
              <div 
                className="absolute left-[11px] top-3 bottom-3 w-1 rounded-full"
                style={{ backgroundColor: routeColor }}
              />
              
              {/* Stops */}
              <div className="space-y-0">
                {orderedStops.map((stop, index) => {
                  const isFirst = index === 0;
                  const isLast = index === orderedStops.length - 1;
                  const eta = formatETA(stop.arrivalTime);
                  const minutesAway = formatMinutesFromNow(stop.arrivalTime);
                  
                  return (
                    <div 
                      key={stop.stopId}
                      className="relative flex items-start gap-3 py-2 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors group pl-1"
                      onClick={() => {
                        if (stop.lat && stop.lon && onStopClick) {
                          onStopClick(stop.stopId, stop.lat, stop.lon);
                        }
                      }}
                    >
                      {/* Station dot */}
                      <div className="relative z-10 flex-shrink-0">
                        <div 
                          className={`w-6 h-6 rounded-full border-4 flex items-center justify-center transition-transform group-hover:scale-110 ${
                            isFirst || isLast ? 'bg-background' : 'bg-background'
                          }`}
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
                      </div>
                      
                      {/* Stop info */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="font-medium text-sm leading-tight truncate">
                          {stop.stopName}
                        </div>
                        
                        {/* ETA info */}
                        {(eta || minutesAway) && (
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {eta && (
                              <span className="text-xs font-mono text-primary font-semibold">
                                {eta}
                              </span>
                            )}
                            {minutesAway && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                minutesAway === 'Τώρα' 
                                  ? 'bg-green-500/20 text-green-500 font-medium' 
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {minutesAway}
                              </span>
                            )}
                            {stop.arrivalDelay !== undefined && stop.arrivalDelay !== 0 && (
                              <span className={`text-xs ${stop.arrivalDelay > 0 ? 'text-destructive' : 'text-green-500'}`}>
                                {stop.arrivalDelay > 0 ? '+' : ''}{Math.round(stop.arrivalDelay / 60)}'
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Terminal indicators */}
                      {isFirst && (
                        <div className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                          ΑΦΕΤΗΡΙΑ
                        </div>
                      )}
                      {isLast && (
                        <div className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
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
      )}
    </div>
  );
}
