import { X, MapPin, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Bus, GripHorizontal } from "lucide-react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
  totalKm?: number;
  estimatedMinutes?: number;
  onClose: () => void;
  onStopClick?: (stopId: string, lat: number, lon: number) => void;
  highlightedStopId?: string | null;
  onHighlightStop?: (stopId: string | null) => void;
}

const STOPS_PER_PAGE = 10;
const MIN_WIDTH = 240;
const MAX_WIDTH = 450;
const MIN_HEIGHT = 200;
const STORAGE_KEY = 'route-stops-panel-state';

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

// Format countdown as MM:SS
const formatCountdown = (arrivalTime?: number) => {
  if (!arrivalTime) return null;
  const now = Date.now() / 1000;
  const diff = arrivalTime - now;
  if (diff <= 0) return 'Τώρα';
  const minutes = Math.floor(diff / 60);
  const seconds = Math.floor(diff % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Load saved state from localStorage
const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading panel state:', e);
  }
  return null;
};

// Save state to localStorage
const saveState = (position: { x: number; y: number }, size: { width: number; height: number }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ position, size }));
  } catch (e) {
    console.error('Error saving panel state:', e);
  }
};

export function RouteStopsPanel({
  selectedRoute,
  routeInfo,
  trips,
  stops,
  shapes,
  tripMappings,
  vehicles,
  totalKm,
  estimatedMinutes,
  onClose,
  onStopClick,
  highlightedStopId,
  onHighlightStop,
}: RouteStopsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [, setCountdownTick] = useState(0); // Force re-render for countdown
  
  // Load initial state from localStorage
  const savedState = useMemo(() => loadSavedState(), []);
  
  // Draggable state
  const [position, setPosition] = useState(savedState?.position || { x: 16, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Resizable state
  const [size, setSize] = useState(savedState?.size || { width: 288, height: 400 });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0 });
  
  const panelRef = useRef<HTMLDivElement>(null);

  // Update countdown every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdownTick(prev => prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Save state when position or size changes
  useEffect(() => {
    if (!isDragging && !isResizing) {
      saveState(position, size);
    }
  }, [position, size, isDragging, isResizing]);

  // Get vehicles on this route
  const routeVehicles = useMemo(() => {
    return vehicles.filter(v => v.routeId === selectedRoute && v.latitude && v.longitude);
  }, [vehicles, selectedRoute]);

  // Get ordered stops for the selected route
  const orderedStops = useMemo(() => {
    const routeTrips = trips.filter(t => t.routeId === selectedRoute && t.stopTimeUpdates?.length > 0);
    
    if (routeTrips.length > 0) {
      const bestTrip = routeTrips.reduce((a, b) => 
        (a.stopTimeUpdates?.length || 0) > (b.stopTimeUpdates?.length || 0) ? a : b
      );
      
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
    const positions = new Map<string, { vehicleId: string; label?: string; status: 'at' | 'approaching'; stopSequence: number }>();
    
    routeVehicles.forEach(vehicle => {
      if (vehicle.stopId) {
        const existing = positions.get(vehicle.stopId);
        const stopData = orderedStops.find(s => s.stopId === vehicle.stopId);
        if (!existing) {
          positions.set(vehicle.stopId, {
            vehicleId: vehicle.vehicleId,
            label: vehicle.label,
            status: vehicle.currentStatus === 'STOPPED_AT' ? 'at' : 'approaching',
            stopSequence: stopData?.stopSequence || 0
          });
        }
      }
    });
    
    return positions;
  }, [routeVehicles, orderedStops]);

  // Track previous vehicle positions for animation
  const prevVehiclePositionsRef = useRef<Map<string, string>>(new Map());
  const [animatingVehicles, setAnimatingVehicles] = useState<Map<string, { fromStopId: string; toStopId: string; progress: number }>>(new Map());

  // Detect vehicle movement and trigger animation
  useEffect(() => {
    const newAnimations = new Map<string, { fromStopId: string; toStopId: string; progress: number }>();
    
    vehiclePositions.forEach((pos, stopId) => {
      const prevStopId = prevVehiclePositionsRef.current.get(pos.vehicleId);
      
      if (prevStopId && prevStopId !== stopId) {
        // Vehicle moved to a new stop - start animation
        newAnimations.set(pos.vehicleId, {
          fromStopId: prevStopId,
          toStopId: stopId,
          progress: 0
        });
      }
      
      prevVehiclePositionsRef.current.set(pos.vehicleId, stopId);
    });
    
    if (newAnimations.size > 0) {
      setAnimatingVehicles(newAnimations);
      
      // Animate progress
      let startTime: number | null = null;
      const duration = 1500; // 1.5 seconds animation
      
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        setAnimatingVehicles(prev => {
          const updated = new Map(prev);
          updated.forEach((anim, vehicleId) => {
            updated.set(vehicleId, { ...anim, progress: easeProgress });
          });
          return updated;
        });
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          setAnimatingVehicles(new Map());
        }
      };
      
      requestAnimationFrame(animate);
    }
  }, [vehiclePositions]);

  const totalPages = Math.ceil(orderedStops.length / STOPS_PER_PAGE);
  
  const currentStops = useMemo(() => {
    const start = currentPage * STOPS_PER_PAGE;
    return orderedStops.slice(start, start + STOPS_PER_PAGE);
  }, [orderedStops, currentPage]);

  useEffect(() => {
    setCurrentPage(0);
  }, [selectedRoute]);

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

  // Get client coordinates from mouse or touch event
  const getEventCoords = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, .resize-handle, .stop-item')) return;
    e.preventDefault();
    const coords = getEventCoords(e);
    setIsDragging(true);
    setDragOffset({
      x: coords.clientX - position.x,
      y: coords.clientY - position.y
    });
  }, [position]);

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const coords = getEventCoords(e);
    const newX = Math.max(0, Math.min(window.innerWidth - size.width, coords.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, coords.clientY - dragOffset.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset, size.width]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    const coords = getEventCoords(e);
    setIsResizing(direction);
    resizeStartRef.current = {
      x: coords.clientX,
      y: coords.clientY,
      width: size.width,
      height: size.height,
      posX: position.x
    };
  }, [size, position]);

  const handleResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isResizing) return;
    const coords = getEventCoords(e);
    
    const deltaX = coords.clientX - resizeStartRef.current.x;
    const deltaY = coords.clientY - resizeStartRef.current.y;
    
    let newWidth = resizeStartRef.current.width;
    let newHeight = resizeStartRef.current.height;
    let newX = position.x;
    
    if (isResizing.includes('e')) {
      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width + deltaX));
    }
    if (isResizing.includes('w')) {
      const potentialWidth = resizeStartRef.current.width - deltaX;
      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, potentialWidth));
      newX = resizeStartRef.current.posX + (resizeStartRef.current.width - newWidth);
    }
    if (isResizing.includes('s')) {
      newHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - position.y - 50, resizeStartRef.current.height + deltaY));
    }
    
    setSize({ width: newWidth, height: newHeight });
    if (isResizing.includes('w')) {
      setPosition(prev => ({ ...prev, x: newX }));
    }
  }, [isResizing, position]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
  }, []);

  // Global event listeners for mouse
  useEffect(() => {
    if (isDragging) {
      const handleMove = (e: MouseEvent | TouchEvent) => handleDragMove(e);
      const handleEnd = () => handleDragEnd();
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      const handleMove = (e: MouseEvent | TouchEvent) => handleResizeMove(e);
      const handleEnd = () => handleResizeEnd();
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Handle stop click
  const handleStopClick = useCallback((stop: { stopId: string; lat?: number; lon?: number }) => {
    if (stop.lat && stop.lon) {
      // Highlight this stop
      onHighlightStop?.(stop.stopId);
      // Navigate to the stop on the map
      onStopClick?.(stop.stopId, stop.lat, stop.lon);
    }
  }, [onStopClick, onHighlightStop]);

  const routeColor = routeInfo?.route_color ? `#${routeInfo.route_color}` : '#0ea5e9';
  const routeTextColor = routeInfo?.route_text_color ? `#${routeInfo.route_text_color}` : '#ffffff';

  if (orderedStops.length === 0) {
    return null;
  }

  const globalStartIndex = currentPage * STOPS_PER_PAGE;

  return (
    <div 
      ref={panelRef}
      className={`fixed z-[1000] glass-card rounded-xl overflow-hidden shadow-2xl transition-shadow ${isDragging || isResizing ? 'shadow-xl ring-2 ring-primary/50' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 'auto' : size.height,
        cursor: isDragging ? 'grabbing' : 'default',
        userSelect: isDragging || isResizing ? 'none' : 'auto',
        touchAction: 'none'
      }}
    >
      {/* Header - Draggable */}
      <div 
        className="px-3 py-2 flex items-center justify-between select-none touch-none"
        style={{ backgroundColor: routeColor, cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripHorizontal className="h-4 w-4 opacity-50 flex-shrink-0" style={{ color: routeTextColor }} />
          <div 
            className="font-bold text-sm px-2 py-0.5 rounded-md flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
          >
            {routeInfo?.route_short_name || selectedRoute}
          </div>
          <div className="text-xs font-medium truncate" style={{ color: routeTextColor }}>
            {routeInfo?.route_long_name || 'Διαδρομή'}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {totalKm !== undefined && totalKm > 0 && (
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
            >
              <MapPin className="h-3 w-3" />
              {totalKm} km
            </div>
          )}
          {estimatedMinutes !== undefined && estimatedMinutes > 0 && (
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
            >
              <Clock className="h-3 w-3" />
              {estimatedMinutes}'
            </div>
          )}
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
            onClick={() => setIsMinimized(!isMinimized)}
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
            onClick={onClose}
          >
            <X className="h-4 w-4" style={{ color: routeTextColor }} />
          </Button>
        </div>
      </div>

      {/* Stops list */}
      {!isMinimized && (
        <div className="flex flex-col" style={{ height: size.height - 44 }}>
          {/* Stats bar */}
          <div className="px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between text-xs flex-shrink-0">
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

          <ScrollArea className="flex-1">
            <div className="p-3">
              <div className="relative">
                {/* Metro line */}
                <div 
                  className="absolute left-[11px] top-3 bottom-3 w-1 rounded-full"
                  style={{ backgroundColor: routeColor }}
                />
                
                {/* Stops */}
                <div className="space-y-0 relative">
                  {/* Animated bus moving between stops */}
                  {Array.from(animatingVehicles.entries()).map(([vehicleId, anim]) => {
                    const fromIndex = currentStops.findIndex(s => s.stopId === anim.fromStopId);
                    const toIndex = currentStops.findIndex(s => s.stopId === anim.toStopId);
                    
                    // Only show animation if both stops are on current page
                    if (fromIndex === -1 || toIndex === -1) return null;
                    
                    // Calculate position (each stop is roughly 40px apart based on py-1.5 + content)
                    const stopHeight = 44; // Approximate height of each stop item
                    const fromY = fromIndex * stopHeight + 12;
                    const toY = toIndex * stopHeight + 12;
                    const currentY = fromY + (toY - fromY) * anim.progress;
                    
                    return (
                      <div
                        key={`animated-bus-${vehicleId}`}
                        className="absolute left-0 z-20 pointer-events-none"
                        style={{
                          top: currentY,
                          transform: 'translateY(-50%)',
                          transition: 'none'
                        }}
                      >
                        <div 
                          className="w-7 h-7 rounded-full flex items-center justify-center shadow-lg"
                          style={{ 
                            backgroundColor: routeColor,
                            boxShadow: `0 0 12px ${routeColor}, 0 4px 8px rgba(0,0,0,0.3)`
                          }}
                        >
                          <Bus className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    );
                  })}
                  
                  {currentStops.map((stop, index) => {
                    const globalIndex = globalStartIndex + index;
                    const isFirst = globalIndex === 0;
                    const isLast = globalIndex === orderedStops.length - 1;
                    const eta = formatETA(stop.arrivalTime);
                    const countdown = formatCountdown(stop.arrivalTime);
                    const vehicleHere = vehiclePositions.get(stop.stopId);
                    const isHighlighted = highlightedStopId === stop.stopId;
                    
                    // Calculate countdown color based on urgency
                    const now = Date.now() / 1000;
                    const secondsUntil = stop.arrivalTime ? stop.arrivalTime - now : 0;
                    const countdownColorClass = secondsUntil <= 0 
                      ? 'bg-green-500/20 text-green-500' 
                      : secondsUntil <= 120 
                      ? 'bg-red-500/20 text-red-500' 
                      : secondsUntil <= 300 
                      ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' 
                      : 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400';
                    
                    // Check if any vehicle is currently animating away from or to this stop
                    const isAnimatingAway = Array.from(animatingVehicles.values()).some(
                      anim => anim.fromStopId === stop.stopId && anim.progress < 1
                    );
                    const isAnimatingTo = Array.from(animatingVehicles.values()).some(
                      anim => anim.toStopId === stop.stopId && anim.progress < 1
                    );
                    
                    // Hide static bus icon if it's animating
                    const showStaticBus = vehicleHere && !isAnimatingAway && !isAnimatingTo;
                    
                    return (
                      <div 
                        key={stop.stopId}
                        className={`stop-item relative flex items-start gap-3 py-1.5 cursor-pointer hover:bg-muted/50 rounded-lg transition-all group pl-1 ${
                          vehicleHere && !isAnimatingAway ? 'bg-primary/10' : ''
                        } ${isHighlighted ? 'bg-cyan-500/20 ring-2 ring-cyan-500 ring-inset' : ''}`}
                        onClick={() => handleStopClick(stop)}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          handleStopClick(stop);
                        }}
                      >
                        {/* Station dot / Bus icon */}
                        <div className="relative z-10 flex-shrink-0">
                          {showStaticBus ? (
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center animate-pulse transition-all duration-300"
                              style={{ backgroundColor: routeColor }}
                            >
                              <Bus className="h-3.5 w-3.5 text-white" />
                            </div>
                          ) : (
                            <div 
                              className={`w-6 h-6 rounded-full border-4 flex items-center justify-center transition-transform group-hover:scale-110 ${
                                isHighlighted ? 'bg-cyan-500 scale-110' : 'bg-background'
                              }`}
                              style={{ 
                                borderColor: isHighlighted ? '#06b6d4' : routeColor,
                                boxShadow: isHighlighted 
                                  ? '0 0 12px rgba(6, 182, 212, 0.6)' 
                                  : `0 0 0 2px ${routeColor}20`
                              }}
                            >
                              {(isFirst || isLast || isHighlighted) && (
                                <div 
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: isHighlighted ? '#ffffff' : routeColor }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Stop info */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className={`font-medium text-sm leading-tight truncate ${isHighlighted ? 'text-cyan-600 dark:text-cyan-400' : ''}`}>
                            {stop.stopName}
                          </div>
                          
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
                          
                          {!vehicleHere && countdown && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${countdownColorClass}`}>
                                {countdown}
                              </span>
                              {eta && (
                                <span className="text-[10px] text-muted-foreground">
                                  ({eta})
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
            <div className="px-3 py-1.5 border-t border-border flex items-center justify-between bg-muted/30 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3 w-3 mr-0.5" />
                Προηγ.
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageIndex = i;
                  if (totalPages > 7) {
                    if (currentPage < 4) {
                      pageIndex = i;
                    } else if (currentPage > totalPages - 4) {
                      pageIndex = totalPages - 7 + i;
                    } else {
                      pageIndex = currentPage - 3 + i;
                    }
                  }
                  return (
                    <button
                      key={pageIndex}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        pageIndex === currentPage ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      }`}
                      onClick={() => setCurrentPage(pageIndex)}
                    />
                  );
                })}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              >
                Επόμ.
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Resize handles - more visible */}
      {!isMinimized && (
        <>
          {/* Right edge */}
          <div 
            className="resize-handle absolute top-0 right-0 w-4 h-full cursor-e-resize hover:bg-primary/30 active:bg-primary/40 transition-colors touch-none flex items-center justify-end pr-0.5"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            onTouchStart={(e) => handleResizeStart(e, 'e')}
          >
            <div className="w-1 h-12 rounded-full bg-muted-foreground/30 opacity-0 hover:opacity-100 transition-opacity" />
          </div>
          {/* Bottom edge */}
          <div 
            className="resize-handle absolute bottom-0 left-0 w-full h-4 cursor-s-resize hover:bg-primary/30 active:bg-primary/40 transition-colors touch-none flex items-end justify-center pb-0.5"
            onMouseDown={(e) => handleResizeStart(e, 's')}
            onTouchStart={(e) => handleResizeStart(e, 's')}
          >
            <div className="w-12 h-1 rounded-full bg-muted-foreground/30 opacity-0 hover:opacity-100 transition-opacity" />
          </div>
          {/* Left edge */}
          <div 
            className="resize-handle absolute top-0 left-0 w-4 h-full cursor-w-resize hover:bg-primary/30 active:bg-primary/40 transition-colors touch-none flex items-center justify-start pl-0.5"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            onTouchStart={(e) => handleResizeStart(e, 'w')}
          >
            <div className="w-1 h-12 rounded-full bg-muted-foreground/30 opacity-0 hover:opacity-100 transition-opacity" />
          </div>
          {/* Bottom-right corner - with visible grip */}
          <div 
            className="resize-handle absolute bottom-0 right-0 w-6 h-6 cursor-se-resize hover:bg-primary/40 active:bg-primary/50 transition-colors rounded-tl touch-none flex items-center justify-center"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            onTouchStart={(e) => handleResizeStart(e, 'se')}
          >
            <svg className="w-3 h-3 text-muted-foreground/50" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="4" cy="8" r="1.5" />
              <circle cx="8" cy="4" r="1.5" />
            </svg>
          </div>
          {/* Bottom-left corner */}
          <div 
            className="resize-handle absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize hover:bg-primary/40 active:bg-primary/50 transition-colors rounded-tr touch-none flex items-center justify-center"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            onTouchStart={(e) => handleResizeStart(e, 'sw')}
          >
            <svg className="w-3 h-3 text-muted-foreground/50 transform scale-x-[-1]" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="4" cy="8" r="1.5" />
              <circle cx="8" cy="4" r="1.5" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
