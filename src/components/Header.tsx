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
    return date.toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  return (
          <div className="flex items-center gap-3">
            <img src={motionLogo} alt="Motion Logo" className="h-8" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">GTFS Realtime</h1>
 main
              <RouteSelector
                value={selectedRoute}
                onChange={onRouteChange}
                routes={availableRoutes}
                routeNames={routeNamesMap}
                disabled={selectedOperator === "all"}
                isLoading={isRoutesLoading}
              />
              {onShowLiveOnlyChange && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="live-only"
                    checked={showLiveOnly}
                    onCheckedChange={onShowLiveOnlyChange}
                  />
 main
                    Live only ({liveRoutesCount || 0})
                  </Label>
                </div>
              )}
            </div>
 main
        </div>
      </div>
    </header>
  );
}
