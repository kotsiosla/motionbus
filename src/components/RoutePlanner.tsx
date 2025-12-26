import { useState, useCallback, useEffect } from 'react';
import { 
  Navigation, 
  MapPin, 
  Search, 
  X, 
  Clock, 
  Footprints, 
  Bus,
  ArrowRight,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GeocodingResult, TransitRoute, RouteSegment } from '@/hooks/useTransitRouting';

interface RoutePlannerProps {
  isOpen: boolean;
  onClose: () => void;
  origin: { lat: number; lon: number; name: string } | null;
  destination: { lat: number; lon: number; name: string } | null;
  routes: TransitRoute[];
  isSearching: boolean;
  error: string | null;
  onSearchAddress: (query: string) => Promise<GeocodingResult[]>;
  onSetOrigin: (lat: number, lon: number, name?: string) => void;
  onSetDestination: (lat: number, lon: number, name?: string) => void;
  onCalculateRoutes: () => void;
  onClearRouting: () => void;
  onUseCurrentLocation: () => void;
  selectingMode: 'origin' | 'destination' | null;
  onSetSelectingMode: (mode: 'origin' | 'destination' | null) => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} λεπ.`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}ω ${mins}λ` : `${hours}ω`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}μ`;
  return `${(meters / 1000).toFixed(1)}χλμ`;
}

function SegmentDisplay({ segment, isLast }: { segment: RouteSegment; isLast: boolean }) {
  if (segment.type === 'walk') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <Footprints className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Περπάτημα</div>
          <div className="text-xs text-muted-foreground">
            {formatDistance(segment.distance || 0)} • {segment.duration} λεπ.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2">
      <div 
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-md"
        style={{ 
          backgroundColor: segment.routeColor ? `#${segment.routeColor}` : 'hsl(var(--primary))',
        }}
      >
        <Bus className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span 
            className="px-2 py-0.5 rounded text-xs font-bold text-white"
            style={{ 
              backgroundColor: segment.routeColor ? `#${segment.routeColor}` : 'hsl(var(--primary))',
            }}
          >
            {segment.routeName}
          </span>
          <span className="text-xs text-muted-foreground">{segment.duration} λεπ.</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">{formatTime(segment.departureTime!)}</span>
            <span>{segment.from.name}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="font-medium text-foreground">{formatTime(segment.arrivalTime!)}</span>
            <span>{segment.to.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteCard({ route }: { route: TransitRoute }) {
  const transitSegments = route.segments.filter(s => s.type === 'transit');

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold">{formatDuration(route.totalDuration)}</div>
          <div className="flex items-center gap-1">
            {transitSegments.map((seg, i) => (
              <div key={i} className="flex items-center gap-1">
                <span 
                  className="px-2 py-0.5 rounded text-xs font-bold text-white"
                  style={{ 
                    backgroundColor: seg.routeColor ? `#${seg.routeColor}` : 'hsl(var(--primary))',
                  }}
                >
                  {seg.routeName}
                </span>
                {i < transitSegments.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatTime(route.departureTime)} - {formatTime(route.arrivalTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Footprints className="w-3 h-3" />
            <span>{formatDistance(route.totalWalkingDistance)}</span>
          </div>
          {route.transfers > 0 && (
            <div className="flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              <span>{route.transfers} μετεπιβ.</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="px-4 pb-4 border-t border-border/50">
        <div className="mt-3 space-y-1">
          {route.segments.map((segment, i) => (
            <SegmentDisplay 
              key={i} 
              segment={segment} 
              isLast={i === route.segments.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RoutePlanner({
  isOpen,
  onClose,
  origin,
  destination,
  routes,
  isSearching,
  error,
  onSearchAddress,
  onSetOrigin,
  onSetDestination,
  onCalculateRoutes,
  onClearRouting,
  onUseCurrentLocation,
  selectingMode,
  onSetSelectingMode,
}: RoutePlannerProps) {
  const [originSearch, setOriginSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');
  const [originResults, setOriginResults] = useState<GeocodingResult[]>([]);
  const [destResults, setDestResults] = useState<GeocodingResult[]>([]);
  const [searchingOrigin, setSearchingOrigin] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);

  useEffect(() => {
    if (origin) setOriginSearch(origin.name.split(',')[0]);
  }, [origin]);

  useEffect(() => {
    if (destination) setDestSearch(destination.name.split(',')[0]);
  }, [destination]);

  const handleOriginSearch = useCallback(async () => {
    if (originSearch.length < 2) return;
    setSearchingOrigin(true);
    const results = await onSearchAddress(originSearch);
    setOriginResults(results);
    setSearchingOrigin(false);
  }, [originSearch, onSearchAddress]);

  const handleDestSearch = useCallback(async () => {
    if (destSearch.length < 2) return;
    setSearchingDest(true);
    const results = await onSearchAddress(destSearch);
    setDestResults(results);
    setSearchingDest(false);
  }, [destSearch, onSearchAddress]);

  const selectOriginResult = (result: GeocodingResult) => {
    onSetOrigin(parseFloat(result.lat), parseFloat(result.lon), result.display_name);
    setOriginResults([]);
  };

  const selectDestResult = (result: GeocodingResult) => {
    onSetDestination(parseFloat(result.lat), parseFloat(result.lon), result.display_name);
    setDestResults([]);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 bottom-4 w-96 z-50 flex flex-col bg-background/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Σχεδιασμός Διαδρομής</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Origin Input */}
        <div className="space-y-2">
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                <Input
                  placeholder="Αφετηρία..."
                  value={originSearch}
                  onChange={(e) => setOriginSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOriginSearch()}
                  className="pl-9 pr-10"
                />
                {searchingOrigin && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <Button 
                size="icon" 
                variant="outline"
                onClick={handleOriginSearch}
                disabled={searchingOrigin}
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button 
                size="icon" 
                variant={selectingMode === 'origin' ? 'default' : 'outline'}
                onClick={() => onSetSelectingMode(selectingMode === 'origin' ? null : 'origin')}
                title="Επιλέξτε στον χάρτη"
              >
                <MapPin className="w-4 h-4" />
              </Button>
            </div>
            
            {originResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                {originResults.map((result) => (
                  <button
                    key={result.place_id}
                    onClick={() => selectOriginResult(result)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-xs text-muted-foreground"
            onClick={onUseCurrentLocation}
          >
            <Navigation className="w-3 h-3 mr-2" />
            Χρήση τρέχουσας τοποθεσίας
          </Button>

          {/* Destination Input */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                <Input
                  placeholder="Προορισμός..."
                  value={destSearch}
                  onChange={(e) => setDestSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDestSearch()}
                  className="pl-9 pr-10"
                />
                {searchingDest && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <Button 
                size="icon" 
                variant="outline"
                onClick={handleDestSearch}
                disabled={searchingDest}
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button 
                size="icon" 
                variant={selectingMode === 'destination' ? 'default' : 'outline'}
                onClick={() => onSetSelectingMode(selectingMode === 'destination' ? null : 'destination')}
                title="Επιλέξτε στον χάρτη"
              >
                <MapPin className="w-4 h-4" />
              </Button>
            </div>
            
            {destResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                {destResults.map((result) => (
                  <button
                    key={result.place_id}
                    onClick={() => selectDestResult(result)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1"
              onClick={onCalculateRoutes}
              disabled={!origin || !destination || isSearching}
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Αναζήτηση...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Εύρεση Διαδρομών
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClearRouting}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {selectingMode && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-center">
              <MapPin className="w-4 h-4 inline mr-2" />
              Κάντε κλικ στον χάρτη για {selectingMode === 'origin' ? 'αφετηρία' : 'προορισμό'}
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {routes.length > 0 && (
            <>
              <div className="text-sm font-medium text-muted-foreground">
                {routes.length} διαδρομ{routes.length === 1 ? 'ή' : 'ές'}
              </div>
              {routes.map((route, index) => (
                <RouteCard key={route.id} route={route} />
              ))}
            </>
          )}

          {!isSearching && routes.length === 0 && origin && destination && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <Bus className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Πατήστε "Εύρεση Διαδρομών" για να βρείτε διαθέσιμες διαδρομές</p>
            </div>
          )}

          {!origin && !destination && (
            <div className="text-center py-8 text-muted-foreground">
              <Navigation className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Εισάγετε αφετηρία και προορισμό</p>
              <p className="text-xs mt-1">ή επιλέξτε σημεία στον χάρτη</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
