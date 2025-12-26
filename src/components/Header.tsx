import { Moon, Sun, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { OperatorSelector } from "@/components/OperatorSelector";
import { RouteSelector } from "@/components/RouteSelector";
import type { RouteInfo } from "@/types/gtfs";
import motionLogo from "@/assets/motion-logo.svg";

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
  showLiveOnly?: boolean;
  onShowLiveOnlyChange?: (value: boolean) => void;
  liveRoutesCount?: number;
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
  showLiveOnly,
  onShowLiveOnlyChange,
  liveRoutesCount,
}: HeaderProps) {
  const formatLastUpdate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <header className="glass-card border-b sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <img src={motionLogo} alt="Motion Logo" className="h-8" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">GTFS Realtime</h1>
              <p className="text-xs text-muted-foreground">Live Tracking</p>
            </div>
          </div>

          {/* Center: Operators and Routes */}
          <div className="flex items-center gap-3 flex-wrap justify-center flex-1">
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
            {onShowLiveOnlyChange && (
              <div className="flex items-center gap-2">
                <Switch
                  id="live-only"
                  checked={showLiveOnly}
                  onCheckedChange={onShowLiveOnlyChange}
                />
                <Label htmlFor="live-only" className="text-xs text-muted-foreground cursor-pointer">
                  Live only ({liveRoutesCount || 0})
                </Label>
              </div>
            )}
          </div>

          {/* Right: Refresh, Time, Theme */}
          <div className="flex flex-col items-end gap-1 ml-auto">
            <div className="flex items-center gap-2" title="Διάστημα ανανέωσης δεδομένων - πόσο συχνά ανακτώνται νέες θέσεις λεωφορείων">
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
              <span className="text-xs text-muted-foreground hidden sm:inline">Ανανέωση:</span>
              <Select
                value={refreshInterval.toString()}
                onValueChange={(value) => onRefreshIntervalChange(parseInt(value))}
              >
                <SelectTrigger className="w-[80px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 sec</SelectItem>
                  <SelectItem value="10">10 sec</SelectItem>
                  <SelectItem value="20">20 sec</SelectItem>
                  <SelectItem value="30">30 sec</SelectItem>
                </SelectContent>
              </Select>
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
            {lastUpdate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-warning animate-pulse' : 'bg-success'}`} />
                <span>Updated: {formatLastUpdate(lastUpdate)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
