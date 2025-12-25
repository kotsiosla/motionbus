import { Moon, Sun, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OperatorSelector } from "@/components/OperatorSelector";
import { RouteSelector } from "@/components/RouteSelector";
import type { RouteInfo } from "@/types/gtfs";

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  refreshInterval: number;
  onRefreshIntervalChange: (interval: number) => void;
  lastUpdate: number | null;
  isLoading: boolean;
  selectedOperator: string;
  onOperatorChange: (operator: string) => void;
  selectedRoute: string;
  onRouteChange: (route: string) => void;
  availableRoutes: string[];
  routeNamesMap?: Map<string, RouteInfo>;
  isRoutesLoading?: boolean;
}

export function Header({
  isDark,
  onToggleTheme,
  refreshInterval,
  onRefreshIntervalChange,
  lastUpdate,
  isLoading,
  selectedOperator,
  onOperatorChange,
  selectedRoute,
  onRouteChange,
  availableRoutes,
  routeNamesMap,
  isRoutesLoading,
}: HeaderProps) {
  const formatLastUpdate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('el-GR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <header className="glass-card border-b sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 rounded-lg blur-lg" />
              <div className="relative bg-primary rounded-lg p-2">
                <svg className="h-6 w-6 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 6v12M16 6v12M3 12h18M4 18h16a2 2 0 002-2V8a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">GTFS Realtime</h1>
              <p className="text-xs text-muted-foreground">Ζωντανή παρακολούθηση</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex flex-col gap-1">
              <OperatorSelector
                value={selectedOperator}
                onChange={onOperatorChange}
              />
              <RouteSelector
                value={selectedRoute}
                onChange={onRouteChange}
                routes={availableRoutes}
                routeNames={routeNamesMap}
                disabled={selectedOperator === 'all'}
                isLoading={isRoutesLoading}
              />
            </div>

            {lastUpdate && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-warning animate-pulse' : 'bg-success'}`} />
                <span>Ενημ: {formatLastUpdate(lastUpdate)}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
              <Select
                value={refreshInterval.toString()}
                onValueChange={(value) => onRefreshIntervalChange(parseInt(value))}
              >
                <SelectTrigger className="w-[80px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 δευτ.</SelectItem>
                  <SelectItem value="10">10 δευτ.</SelectItem>
                  <SelectItem value="20">20 δευτ.</SelectItem>
                  <SelectItem value="30">30 δευτ.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheme}
              className="h-8 w-8"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
