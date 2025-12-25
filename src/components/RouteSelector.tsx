import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Route } from "lucide-react";
import type { RouteInfo } from "@/types/gtfs";

interface RouteSelectorProps {
  value: string;
  onChange: (route: string) => void;
  routes: string[];
  routeNames?: Map<string, RouteInfo>;
  disabled?: boolean;
  isLoading?: boolean;
}

export function RouteSelector({ value, onChange, routes, routeNames, disabled, isLoading }: RouteSelectorProps) {
  const sortedRoutes = [...routes].sort((a, b) => {
    // Try to get short names for sorting
    const nameA = routeNames?.get(a)?.route_short_name || a;
    const nameB = routeNames?.get(b)?.route_short_name || b;
    
    const numA = parseInt(nameA);
    const numB = parseInt(nameB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return nameA.localeCompare(nameB);
  });

  const getShortLabel = (routeId: string): string => {
    const info = routeNames?.get(routeId);
    return info?.route_short_name || routeId;
  };

  const getRouteColor = (routeId: string): string | undefined => {
    const info = routeNames?.get(routeId);
    if (info?.route_color) {
      return `#${info.route_color}`;
    }
    return undefined;
  };

  const getTextColor = (routeId: string): string => {
    const info = routeNames?.get(routeId);
    if (info?.route_text_color) {
      return `#${info.route_text_color}`;
    }
    // Default to white text for dark backgrounds, black for light
    return info?.route_color ? '#FFFFFF' : 'currentColor';
  };

  const selectedRouteInfo = value !== 'all' ? routeNames?.get(value) : null;
  const selectedColor = selectedRouteInfo?.route_color ? `#${selectedRouteInfo.route_color}` : undefined;

  return (
    <div className="flex items-center gap-2">
      <Route className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange} disabled={disabled || routes.length === 0}>
        <SelectTrigger className="w-full min-w-[320px] h-8 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            {selectedColor && (
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0 border border-border/50"
                style={{ backgroundColor: selectedColor }}
              />
            )}
            <span className="truncate">
              <SelectValue placeholder={isLoading ? "Φόρτωση..." : "Γραμμή"} />
            </span>
          </div>
        </SelectTrigger>
        <SelectContent className="max-h-[300px] z-50 bg-popover">
          <SelectItem value="all">
            <span>Όλες οι γραμμές</span>
          </SelectItem>
          {sortedRoutes.map((routeId) => {
            const color = getRouteColor(routeId);
            const textColor = getTextColor(routeId);
            return (
              <SelectItem key={routeId} value={routeId} className="text-xs">
                <div className="flex items-center gap-2">
                  {color ? (
                    <div 
                      className="w-6 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: color, color: textColor }}
                    >
                      {getShortLabel(routeId)}
                    </div>
                  ) : (
                    <span className="font-medium">{getShortLabel(routeId)}</span>
                  )}
                  {routeNames?.get(routeId)?.route_long_name && (
                    <span className="text-muted-foreground">
                      {routeNames.get(routeId)?.route_long_name}
                    </span>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
