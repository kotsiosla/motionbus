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

  const getRouteLabel = (routeId: string): string => {
    const info = routeNames?.get(routeId);
    if (info) {
      if (info.route_short_name && info.route_long_name) {
        return `${info.route_short_name} - ${info.route_long_name}`;
      }
      return info.route_short_name || info.route_long_name || routeId;
    }
    return routeId;
  };

  const getShortLabel = (routeId: string): string => {
    const info = routeNames?.get(routeId);
    return info?.route_short_name || routeId;
  };

  return (
    <div className="flex items-center gap-2">
      <Route className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange} disabled={disabled || routes.length === 0}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder={isLoading ? "Φόρτωση..." : "Γραμμή"} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px] z-50 bg-popover">
          <SelectItem value="all">Όλες οι γραμμές</SelectItem>
          {sortedRoutes.map((routeId) => (
            <SelectItem key={routeId} value={routeId} className="text-xs">
              <span className="font-medium">{getShortLabel(routeId)}</span>
              {routeNames?.get(routeId)?.route_long_name && (
                <span className="ml-1 text-muted-foreground truncate">
                  - {routeNames.get(routeId)?.route_long_name}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
