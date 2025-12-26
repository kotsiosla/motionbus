import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Calendar, Clock, Bus, X, ChevronLeft, ChevronRight, Radio, CalendarDays, ChevronUp, ChevronDown, GripHorizontal } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { el } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/hooks/useSchedule";
import type { Trip, RouteInfo, Vehicle } from "@/types/gtfs";

interface SchedulePanelProps {
  selectedRoute: string;
  routeInfo?: RouteInfo;
  operatorId?: string;
  trips: Trip[];
  vehicles: Vehicle[];
  onClose: () => void;
  onFollowVehicle?: (vehicleId: string) => void;
}

const STORAGE_KEY = 'schedule-panel-state';
const MIN_WIDTH = 280;
const MAX_WIDTH = 400;
const MIN_HEIGHT = 200;

const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading schedule panel state:', e);
  }
  return null;
};

const saveState = (position: { x: number; y: number }, size: { width: number; height: number }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ position, size }));
  } catch (e) {
    console.error('Error saving schedule panel state:', e);
  }
};

export function SchedulePanel({
  selectedRoute,
  routeInfo,
  operatorId,
  trips,
  vehicles,
  onClose,
  onFollowVehicle,
}: SchedulePanelProps) {
  const [activeTab, setActiveTab] = useState<"live" | "schedule">("live");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Load initial state from localStorage
  const savedState = useMemo(() => loadSavedState(), []);
  
  // Draggable state
  const [position, setPosition] = useState(savedState?.position || { x: window.innerWidth - 340, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Resizable state
  const [size, setSize] = useState(savedState?.size || { width: 320, height: 450 });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0 });
  
  const panelRef = useRef<HTMLDivElement>(null);

  // Save state when position or size changes
  useEffect(() => {
    if (!isDragging && !isResizing) {
      saveState(position, size);
    }
  }, [position, size, isDragging, isResizing]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    setDragOffset({
      x: clientX - position.x,
      y: clientY - position.y
    });
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newX = Math.max(0, Math.min(window.innerWidth - size.width, clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, clientY - dragOffset.y));
      
      setPosition({ x: newX, y: newY });
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragOffset, size.width]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsResizing(direction);
    resizeStartRef.current = {
      x: clientX,
      y: clientY,
      width: size.width,
      height: size.height,
      posX: position.x
    };
  }, [size, position]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const deltaX = clientX - resizeStartRef.current.x;
      const deltaY = clientY - resizeStartRef.current.y;
      
      if (isResizing.includes('e')) {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width + deltaX));
        setSize(prev => ({ ...prev, width: newWidth }));
      }
      if (isResizing.includes('w')) {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width - deltaX));
        const newPosX = resizeStartRef.current.posX + (resizeStartRef.current.width - newWidth);
        setSize(prev => ({ ...prev, width: newWidth }));
        setPosition(prev => ({ ...prev, x: Math.max(0, newPosX) }));
      }
      if (isResizing.includes('s')) {
        const newHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - position.y - 20, resizeStartRef.current.height + deltaY));
        setSize(prev => ({ ...prev, height: newHeight }));
      }
    };

    const handleEnd = () => {
      setIsResizing(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isResizing, position.y]);

  // Format date for API (YYYYMMDD)
  const dateStr = useMemo(() => {
    return format(selectedDate, "yyyyMMdd");
  }, [selectedDate]);

  // Fetch schedule data
  const { data: scheduleData, isLoading: scheduleLoading } = useSchedule(
    operatorId || "",
    selectedRoute,
    dateStr
  );

  // Get live trips for this route
  const liveTrips = useMemo(() => {
    return trips.filter(t => t.routeId === selectedRoute);
  }, [trips, selectedRoute]);

  // Get live vehicles for this route
  const liveVehicles = useMemo(() => {
    return vehicles.filter(v => v.routeId === selectedRoute);
  }, [vehicles, selectedRoute]);

  // Current time for highlighting
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Format time for display
  const formatTime = (timeStr: string) => {
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    if (hours >= 24) hours -= 24;
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  };

  // Check if a scheduled trip is currently live
  const isLive = (tripId: string) => {
    return liveTrips.some(t => t.tripId === tripId);
  };

  // Check if departure is in the past
  const isPast = (timeStr: string) => {
    const now = currentTime;
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (hours >= 24) hours -= 24;
    const departureMinutes = hours * 60 + minutes;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return departureMinutes < currentMinutes;
  };

  // Check if departure is soon (within 15 minutes)
  const isSoon = (timeStr: string) => {
    const now = currentTime;
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (hours >= 24) hours -= 24;
    const departureMinutes = hours * 60 + minutes;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = departureMinutes - currentMinutes;
    return diff > 0 && diff <= 15;
  };

  // Get minutes until departure
  const getMinutesUntil = (timeStr: string) => {
    const now = currentTime;
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (hours >= 24) hours -= 24;
    const departureMinutes = hours * 60 + minutes;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return departureMinutes - currentMinutes;
  };

  const routeColor = routeInfo?.route_color ? `#${routeInfo.route_color}` : '#0ea5e9';
  const routeTextColor = routeInfo?.route_text_color ? `#${routeInfo.route_text_color}` : '#ffffff';

  // Navigate dates
  const goToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
  const goToNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const goToToday = () => setSelectedDate(new Date());

  const isToday = format(selectedDate, "yyyyMMdd") === format(new Date(), "yyyyMMdd");

  return (
    <div 
      ref={panelRef}
      className="fixed z-[1000] glass-card rounded-xl overflow-hidden shadow-2xl select-none"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 44 : size.height,
      }}
    >
      {/* Header - Draggable */}
      <div 
        className="px-3 py-2 flex items-center justify-between cursor-move"
        style={{ backgroundColor: routeColor }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 opacity-50" style={{ color: routeTextColor }} />
          <CalendarDays className="h-4 w-4" style={{ color: routeTextColor }} />
          <span className="text-xs font-medium" style={{ color: routeTextColor }}>
            Πρόγραμμα
          </span>
          <div 
            className="font-bold text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
          >
            {routeInfo?.route_short_name || selectedRoute}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
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
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            <X className="h-4 w-4" style={{ color: routeTextColor }} />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "live" | "schedule")} className="w-full">
            <TabsList className="w-full rounded-none bg-background/50">
              <TabsTrigger value="live" className="flex-1 gap-2 text-xs">
                <Radio className="h-3 w-3" />
                Live
                {liveTrips.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-500 text-white">
                    {liveTrips.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex-1 gap-2 text-xs">
                <Calendar className="h-3 w-3" />
                Πρόγραμμα
              </TabsTrigger>
            </TabsList>

            {/* Live Tab */}
            <TabsContent value="live" className="m-0">
              <ScrollArea style={{ height: size.height - 90 }}>
                <div className="p-3 space-y-2">
                  {liveTrips.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bus className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-xs">Δεν υπάρχουν ενεργά δρομολόγια</p>
                    </div>
                  ) : (
                    liveTrips.map((trip) => {
                      const vehicle = liveVehicles.find(v => v.tripId === trip.tripId);
                      const firstStop = trip.stopTimeUpdates?.[0];
                      const vehicleId = vehicle?.vehicleId || vehicle?.id;
                      const canFollow = vehicle && vehicleId && vehicle.latitude && vehicle.longitude;
                      
                      return (
                        <div
                          key={trip.id}
                          className={cn(
                            "p-2 rounded-lg bg-green-500/10 border border-green-500/30 transition-all",
                            canFollow && "cursor-pointer hover:bg-green-500/20 hover:border-green-500/50"
                          )}
                          onClick={() => {
                            if (canFollow && onFollowVehicle) {
                              onFollowVehicle(vehicleId);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-500 text-white animate-pulse">
                                LIVE
                              </span>
                              <span className="text-xs font-medium">
                                {trip.startTime || 'Ενεργό'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {vehicle?.label && (
                                <span className="text-[10px] text-muted-foreground">
                                  {vehicle.label}
                                </span>
                              )}
                              {canFollow && (
                                <span className="text-[9px] text-green-600 font-medium">
                                  → Παρακολούθηση
                                </span>
                              )}
                            </div>
                          </div>
                          {firstStop && (
                            <div className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Επόμενη στάση σε{" "}
                              {firstStop.arrivalDelay !== undefined
                                ? `${Math.round((firstStop.arrivalTime! - Date.now() / 1000) / 60)} λεπτά`
                                : "..."}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="m-0">
              {/* Date Selector */}
              <div className="p-2 border-b bg-muted/30 flex items-center justify-between gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={goToPreviousDay}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={cn(
                        "flex-1 justify-center gap-1.5 text-xs h-7",
                        isToday && "bg-primary/10 border-primary"
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      {isToday ? "Σήμερα" : format(selectedDate, "EEE d MMM", { locale: el })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[1100]" align="center">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setCalendarOpen(false);
                        }
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={goToNextDay}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Quick date buttons */}
              <div className="p-1.5 border-b flex gap-1">
                <Button
                  variant={isToday ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-[10px] h-6"
                  onClick={goToToday}
                >
                  Σήμερα
                </Button>
                <Button
                  variant={format(selectedDate, "yyyyMMdd") === format(addDays(new Date(), 1), "yyyyMMdd") ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-[10px] h-6"
                  onClick={() => setSelectedDate(addDays(new Date(), 1))}
                >
                  Αύριο
                </Button>
              </div>

              {/* Schedule List */}
              <ScrollArea style={{ height: size.height - 175 }}>
                <div className="p-2">
                  {scheduleLoading ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                      <p className="text-xs">Φόρτωση...</p>
                    </div>
                  ) : !scheduleData?.data || scheduleData.data.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Δεν βρέθηκαν δρομολόγια</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {scheduleData.data.map((departure, idx) => {
                        const live = isLive(departure.trip_id);
                        const past = isToday && isPast(departure.departure_time);
                        const soon = isToday && isSoon(departure.departure_time);
                        const minutesUntil = isToday ? getMinutesUntil(departure.departure_time) : null;
                        
                        return (
                          <div
                            key={`${departure.trip_id}-${idx}`}
                            className={cn(
                              "p-1.5 rounded-lg flex items-center justify-between transition-colors text-xs",
                              live && "bg-green-500/10 border border-green-500/30",
                              soon && !live && "bg-yellow-500/10 border border-yellow-500/30",
                              past && !live && "opacity-40",
                              !live && !soon && !past && "hover:bg-muted/50"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span 
                                className={cn(
                                  "font-mono font-bold text-sm",
                                  live && "text-green-500",
                                  soon && !live && "text-yellow-500"
                                )}
                              >
                                {formatTime(departure.departure_time)}
                              </span>
                              <div className="flex flex-col">
                                {departure.trip_headsign && (
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                    {departure.trip_headsign}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {live && (
                                <span className="px-1 py-0.5 text-[9px] font-bold rounded bg-green-500 text-white animate-pulse">
                                  LIVE
                                </span>
                              )}
                              {soon && !live && minutesUntil !== null && minutesUntil > 0 && (
                                <span className="px-1 py-0.5 text-[9px] font-medium rounded bg-yellow-500/20 text-yellow-600">
                                  {minutesUntil}'
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Resize handles */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            onTouchStart={(e) => handleResizeStart(e, 'se')}
          />
          <div
            className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            onTouchStart={(e) => handleResizeStart(e, 'sw')}
          />
          <div
            className="absolute top-1/2 right-0 w-2 h-8 -translate-y-1/2 cursor-e-resize"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            onTouchStart={(e) => handleResizeStart(e, 'e')}
          />
          <div
            className="absolute top-1/2 left-0 w-2 h-8 -translate-y-1/2 cursor-w-resize"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            onTouchStart={(e) => handleResizeStart(e, 'w')}
          />
          <div
            className="absolute bottom-0 left-1/2 w-8 h-2 -translate-x-1/2 cursor-s-resize"
            onMouseDown={(e) => handleResizeStart(e, 's')}
            onTouchStart={(e) => handleResizeStart(e, 's')}
          />
        </>
      )}
    </div>
  );
}