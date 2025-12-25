import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Trip, RouteInfo } from "@/types/gtfs";

interface TripsTableProps {
  trips: Trip[];
  isLoading: boolean;
  routeNames?: Map<string, RouteInfo>;
}

const formatDelay = (seconds?: number) => {
  if (seconds === undefined || seconds === null) return null;
  const mins = Math.round(seconds / 60);
  if (mins === 0) return { text: 'Στην ώρα', className: 'status-ontime' };
  if (mins > 0) return { text: `+${mins} λεπ.`, className: 'status-delay' };
  return { text: `${mins} λεπ.`, className: 'status-early' };
};

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export function TripsTable({ trips, isLoading, routeNames }: TripsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());

  const getRouteDisplay = (routeId?: string) => {
    if (!routeId) return { shortName: 'N/A', longName: '', color: undefined, textColor: undefined };
    const info = routeNames?.get(routeId);
    if (info) {
      return {
        shortName: info.route_short_name || routeId,
        longName: info.route_long_name || '',
        color: info.route_color ? `#${info.route_color}` : undefined,
        textColor: info.route_text_color ? `#${info.route_text_color}` : '#FFFFFF',
      };
    }
    return { shortName: routeId, longName: '', color: undefined, textColor: undefined };
  };

  const filteredTrips = useMemo(() => {
    if (!searchTerm) return trips;
    const term = searchTerm.toLowerCase();
    return trips.filter(
      (trip) =>
        trip.tripId?.toLowerCase().includes(term) ||
        trip.routeId?.toLowerCase().includes(term) ||
        trip.vehicleId?.toLowerCase().includes(term)
    );
  }, [trips, searchTerm]);

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedTrips);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedTrips(newSet);
  };

  const getMaxDelay = (trip: Trip) => {
    if (!trip.stopTimeUpdates.length) return undefined;
    const delays = trip.stopTimeUpdates
      .map((stu) => stu.arrivalDelay || stu.departureDelay || 0)
      .filter((d) => d !== undefined);
    return delays.length ? Math.max(...delays) : undefined;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Αναζήτηση route, trip ή vehicle ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{filteredTrips.length} δρομολόγια</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        {isLoading && trips.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Clock className="h-12 w-12 mb-2 opacity-50" />
            <p>Δεν βρέθηκαν δρομολόγια</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTrips.map((trip) => {
              const maxDelay = getMaxDelay(trip);
              const delayInfo = formatDelay(maxDelay);
              const isExpanded = expandedTrips.has(trip.id);

              return (
                <Collapsible
                  key={trip.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(trip.id)}
                >
                  <CollapsibleTrigger className="w-full p-4 hover:bg-muted/50 transition-colors text-left">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const route = getRouteDisplay(trip.routeId);
                          return (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                {route.color ? (
                                  <div 
                                    className="px-2 py-0.5 rounded text-xs font-bold flex-shrink-0"
                                    style={{ backgroundColor: route.color, color: route.textColor }}
                                  >
                                    {route.shortName}
                                  </div>
                                ) : (
                                  <span className="font-mono text-sm font-medium">
                                    {route.shortName}
                                  </span>
                                )}
                                {delayInfo && (
                                  <span className={`status-badge ${delayInfo.className}`}>
                                    {delayInfo.text}
                                  </span>
                                )}
                              </div>
                              {route.longName && (
                                <div className="text-xs text-muted-foreground mb-1 truncate max-w-[280px]">
                                  {route.longName}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Trip: {trip.tripId || '-'}</span>
                          {trip.vehicleId && <span>Όχημα: {trip.vehicleId}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(trip.timestamp)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <div className="bg-muted/30 rounded-lg p-3">
                        <h4 className="text-xs font-medium mb-2 text-muted-foreground">
                          Ενημερώσεις Στάσεων ({trip.stopTimeUpdates.length})
                        </h4>
                        {trip.stopTimeUpdates.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Δεν υπάρχουν ενημερώσεις στάσεων
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-auto scrollbar-thin">
                            {trip.stopTimeUpdates.map((stu, idx) => {
                              const arrDelay = formatDelay(stu.arrivalDelay);
                              const depDelay = formatDelay(stu.departureDelay);

                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-medium">
                                      {stu.stopSequence || idx + 1}
                                    </span>
                                    <span className="font-mono text-xs">
                                      {stu.stopId || '-'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {arrDelay && (
                                      <span className={`text-xs ${arrDelay.className.replace('status-', 'text-transit-')}`}>
                                        Άφ: {arrDelay.text}
                                      </span>
                                    )}
                                    {depDelay && (
                                      <span className={`text-xs ${depDelay.className.replace('status-', 'text-transit-')}`}>
                                        Αν: {depDelay.text}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}