import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, X, Clock, Bus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Trip, Vehicle, StaticStop, RouteInfo, StopTimeUpdate } from "@/types/gtfs";

interface RouteStopsPanelProps {
  selectedRoute: string;
  trips: Trip[];
  vehicles: Vehicle[];
  stops: StaticStop[];
  routeInfo?: RouteInfo;
  onClose: () => void;
  onStopClick?: (stopId: string) => void;
}

const STOPS_PER_PAGE = 8;

const formatTime = (timestamp?: number) => {
  if (!timestamp) return null;
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatDelay = (delay?: number) => {
  if (delay === undefined || delay === null) return null;
  const minutes = Math.round(delay / 60);
  if (minutes === 0) return "0'";
  if (minutes > 0) return `+${minutes}'`;
  return `${minutes}'`;
};

const getTimeUntilArrival = (arrivalTime?: number) => {
  if (!arrivalTime) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = arrivalTime - now;
  const minutes = Math.floor(diff / 60);
  
  if (minutes <= 0) return "Τώρα";
  if (minutes < 60) return `${minutes}:${String(diff % 60).padStart(2, '0')}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

export function RouteStopsPanel({
  selectedRoute,
  trips,
  vehicles,
  stops,
  routeInfo,
  onClose,
  onStopClick,
}: RouteStopsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Find the first trip for this route that has stop time updates
  const activeTrip = useMemo(() => {
    return trips.find(t => 
      t.routeId === selectedRoute && 
      t.stopTimeUpdates && 
      t.stopTimeUpdates.length > 0
    );
  }, [trips, selectedRoute]);

  // Get vehicle info for this trip
  const tripVehicle = useMemo(() => {
    if (!activeTrip) return null;
    return vehicles.find(v => v.tripId === activeTrip.tripId);
  }, [activeTrip, vehicles]);

  // Create stop map for quick lookup
  const stopMap = useMemo(() => {
    const map = new Map<string, StaticStop>();
    stops.forEach(stop => map.set(stop.stop_id, stop));
    return map;
  }, [stops]);

  // Get all stops with their arrival info
  const routeStops = useMemo(() => {
    if (!activeTrip?.stopTimeUpdates) return [];
    
    return activeTrip.stopTimeUpdates
      .filter(stu => stu.stopId)
      .sort((a, b) => (a.stopSequence || 0) - (b.stopSequence || 0))
      .map((stu, index) => {
        const stopInfo = stu.stopId ? stopMap.get(stu.stopId) : null;
        return {
          stopId: stu.stopId!,
          stopName: stopInfo?.stop_name || stu.stopId || 'Άγνωστη στάση',
          stopSequence: stu.stopSequence || index,
          arrivalTime: stu.arrivalTime,
          arrivalDelay: stu.arrivalDelay,
          departureTime: stu.departureTime,
          isFirst: index === 0,
          isLast: index === activeTrip.stopTimeUpdates.length - 1,
        };
      });
  }, [activeTrip, stopMap]);

  // Pagination
  const totalPages = Math.ceil(routeStops.length / STOPS_PER_PAGE);
  const paginatedStops = routeStops.slice(
    currentPage * STOPS_PER_PAGE,
    (currentPage + 1) * STOPS_PER_PAGE
  );

  // Calculate estimated trip duration
  const tripDuration = useMemo(() => {
    if (routeStops.length < 2) return null;
    const firstStop = routeStops[0];
    const lastStop = routeStops[routeStops.length - 1];
    if (!firstStop.arrivalTime || !lastStop.arrivalTime) return null;
    const diffMinutes = Math.round((lastStop.arrivalTime - firstStop.arrivalTime) / 60);
    return diffMinutes;
  }, [routeStops]);

  // Count active vehicles on this route
  const vehicleCount = vehicles.filter(v => v.routeId === selectedRoute).length;

  const routeColor = routeInfo?.route_color ? `#${routeInfo.route_color}` : 'hsl(var(--primary))';

  if (selectedRoute === 'all' || !activeTrip) return null;

  return (
    <div className="absolute top-4 left-4 z-[1000] w-[380px] max-w-[calc(100vw-2rem)] bg-card/95 backdrop-blur-sm rounded-lg shadow-xl border border-border overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center gap-2 p-3 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div 
          className="flex items-center justify-center w-10 h-10 rounded-lg text-white font-bold text-lg"
          style={{ backgroundColor: routeColor }}
        >
          {routeInfo?.route_short_name || selectedRoute}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {routeInfo?.route_long_name || 'Γραμμή ' + selectedRoute}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {tripDuration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {tripDuration}'
              </span>
            )}
            <span className="flex items-center gap-1">
              <Bus className="h-3 w-3" />
              {vehicleCount}
            </span>
          </div>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}>
          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
        
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <>
          {/* Stops count and pagination */}
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-b border-border">
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/20">
                <span className="text-[10px]">⊙</span>
              </span>
              {routeStops.length} στάσεις
            </span>
            {totalPages > 1 && (
              <span>Σελ. {currentPage + 1}/{totalPages}</span>
            )}
          </div>

          {/* Stops list */}
          <ScrollArea className="h-[320px]">
            <div className="p-2">
              {paginatedStops.map((stop, index) => {
                const timeUntil = getTimeUntilArrival(stop.arrivalTime);
                const formattedTime = formatTime(stop.arrivalTime);
                const delay = formatDelay(stop.arrivalDelay);
                const isNow = timeUntil === "Τώρα";
                const globalIndex = currentPage * STOPS_PER_PAGE + index;
                
                return (
                  <div 
                    key={stop.stopId}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                    onClick={() => onStopClick?.(stop.stopId)}
                  >
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center">
                      <div 
                        className={`w-3 h-3 rounded-full border-2 ${
                          isNow 
                            ? 'bg-green-500 border-green-500' 
                            : stop.isFirst 
                              ? 'bg-primary border-primary'
                              : 'bg-background border-muted-foreground'
                        }`}
                      />
                      {index < paginatedStops.length - 1 && (
                        <div className="w-0.5 h-12 bg-muted-foreground/30 mt-1" />
                      )}
                    </div>

                    {/* Stop info */}
                    <div className="flex-1 min-w-0 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate flex-1">
                          {stop.stopName}
                        </span>
                        {stop.isFirst && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5 bg-red-500 hover:bg-red-600">
                            ΑΦΕΤ.
                          </Badge>
                        )}
                        {stop.isLast && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5 bg-blue-500 hover:bg-blue-600">
                            ΤΕΡΜ.
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {timeUntil && (
                            <Badge 
                              variant={isNow ? "default" : "secondary"}
                              className={`text-xs px-1.5 py-0 h-5 font-mono ${isNow ? 'bg-green-500 hover:bg-green-600' : ''}`}
                            >
                              {timeUntil}
                            </Badge>
                          )}
                          {formattedTime && (
                            <span className="text-xs text-muted-foreground">
                              ({formattedTime})
                            </span>
                          )}
                        </div>
                        {delay && (
                          <span className={`text-xs font-medium ${
                            delay.startsWith('+') ? 'text-orange-500' : 
                            delay.startsWith('-') ? 'text-green-500' : 
                            'text-muted-foreground'
                          }`}>
                            {delay}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-2 border-t border-border">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Προηγ.
              </Button>
              
              {/* Page dots */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentPage ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                    onClick={() => setCurrentPage(i)}
                  />
                ))}
              </div>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="flex items-center gap-1"
              >
                Επόμ.
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
