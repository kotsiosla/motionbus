import { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, Bus, X, ChevronLeft, ChevronRight, Radio, CalendarDays } from "lucide-react";
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
}

export function SchedulePanel({
  selectedRoute,
  routeInfo,
  operatorId,
  trips,
  vehicles,
  onClose,
}: SchedulePanelProps) {
  const [activeTab, setActiveTab] = useState<"live" | "schedule">("live");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

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
    }, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Format time for display
  const formatTime = (timeStr: string) => {
    // Handle times like "25:30:00" (next day)
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    const isNextDay = hours >= 24;
    if (isNextDay) hours -= 24;
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
    
    // Handle next day times
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
    <div className="fixed top-20 right-4 z-[1000] w-80 max-h-[70vh] glass-card rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: routeColor }}
      >
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" style={{ color: routeTextColor }} />
          <div 
            className="font-bold text-sm px-2 py-0.5 rounded-md"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: routeTextColor }}
          >
            {routeInfo?.route_short_name || selectedRoute}
          </div>
          <span className="text-sm font-medium" style={{ color: routeTextColor }}>
            Δρομολόγια
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-white/20"
          onClick={onClose}
        >
          <X className="h-4 w-4" style={{ color: routeTextColor }} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "live" | "schedule")} className="w-full">
        <TabsList className="w-full rounded-none bg-background/50">
          <TabsTrigger value="live" className="flex-1 gap-2">
            <Radio className="h-3 w-3" />
            Live
            {liveTrips.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-500 text-white">
                {liveTrips.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex-1 gap-2">
            <Calendar className="h-3 w-3" />
            Πρόγραμμα
          </TabsTrigger>
        </TabsList>

        {/* Live Tab */}
        <TabsContent value="live" className="m-0">
          <ScrollArea className="h-[40vh]">
            <div className="p-3 space-y-2">
              {liveTrips.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bus className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Δεν υπάρχουν ενεργά δρομολόγια αυτή τη στιγμή</p>
                </div>
              ) : (
                liveTrips.map((trip) => {
                  const vehicle = liveVehicles.find(v => v.tripId === trip.tripId);
                  const firstStop = trip.stopTimeUpdates?.[0];
                  
                  return (
                    <div
                      key={trip.id}
                      className="p-3 rounded-lg bg-green-500/10 border border-green-500/30"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-green-500 text-white animate-pulse">
                            LIVE
                          </span>
                          <span className="text-sm font-medium">
                            {trip.startTime || 'Ενεργό'}
                          </span>
                        </div>
                        {vehicle?.label && (
                          <span className="text-xs text-muted-foreground">
                            {vehicle.label}
                          </span>
                        )}
                      </div>
                      {firstStop && (
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
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
          <div className="p-2 border-b bg-muted/30 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={goToPreviousDay}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className={cn(
                    "flex-1 justify-center gap-2 text-sm",
                    isToday && "bg-primary/10 border-primary"
                  )}
                >
                  <Calendar className="h-4 w-4" />
                  {isToday ? "Σήμερα" : format(selectedDate, "EEEE d MMM", { locale: el })}
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
              className="h-8 w-8"
              onClick={goToNextDay}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Quick date buttons */}
          <div className="p-2 border-b flex gap-1">
            <Button
              variant={isToday ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={goToToday}
            >
              Σήμερα
            </Button>
            <Button
              variant={format(selectedDate, "yyyyMMdd") === format(addDays(new Date(), 1), "yyyyMMdd") ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={() => setSelectedDate(addDays(new Date(), 1))}
            >
              Αύριο
            </Button>
          </div>

          {/* Schedule List */}
          <ScrollArea className="h-[35vh]">
            <div className="p-2">
              {scheduleLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm">Φόρτωση προγράμματος...</p>
                </div>
              ) : !scheduleData?.data || scheduleData.data.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Δεν βρέθηκαν δρομολόγια για αυτή την ημέρα</p>
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
                          "p-2 rounded-lg flex items-center justify-between transition-colors",
                          live && "bg-green-500/10 border border-green-500/30",
                          soon && !live && "bg-yellow-500/10 border border-yellow-500/30",
                          past && !live && "opacity-40",
                          !live && !soon && !past && "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span 
                            className={cn(
                              "font-mono font-bold text-base",
                              live && "text-green-500",
                              soon && !live && "text-yellow-500"
                            )}
                          >
                            {formatTime(departure.departure_time)}
                          </span>
                          <div className="flex flex-col">
                            {departure.trip_headsign && (
                              <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                                {departure.trip_headsign}
                              </span>
                            )}
                            {departure.direction_id !== undefined && (
                              <span className="text-[10px] text-muted-foreground/60">
                                Κατεύθυνση {departure.direction_id + 1}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {live && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-500 text-white animate-pulse">
                              LIVE
                            </span>
                          )}
                          {soon && !live && minutesUntil !== null && minutesUntil > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-500/20 text-yellow-600">
                              σε {minutesUntil}'
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
    </div>
  );
}
