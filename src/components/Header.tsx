import { Moon, Sun, RefreshCw, Bus, Menu, X } from "lucide-react";
import { useState } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RouteInfo } from "@/types/gtfs";
import motionLogo from "@/assets/motion-logo.svg";
import creatorPhoto from "@/assets/creator-photo.jpeg";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4">
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-3">
            <img src={motionLogo} alt="Motion Logo" className="h-8" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">GTFS Realtime</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-success">
                  Live
                </span>
                <span>Network</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                <span>by</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <img
                        src={creatorPhoto}
                        alt="KA"
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-primary/40 cursor-pointer"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>KA</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-border/60 bg-card/70 px-4 py-2 shadow-sm">
              <OperatorSelector value={selectedOperator} onChange={onOperatorChange} />
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
                  <Label htmlFor="live-only" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                    <Bus className="h-3 w-3" />
                    Live only ({liveRoutesCount || 0})
                  </Label>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${isLoading ? "bg-warning animate-pulse" : "bg-success"}`} />
              <span>Τελευταία ενημέρωση</span>
              {lastUpdate && <span className="font-semibold text-foreground">{formatLastUpdate(lastUpdate)}</span>}
            </div>
            <div
              className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 shadow-sm"
              title="Διάστημα ανανέωσης δεδομένων - πόσο συχνά ανακτώνται νέες θέσεις λεωφορείων"
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
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
              <Button variant="ghost" size="icon" onClick={onToggleTheme} className="h-8 w-8">
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="md:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={motionLogo} alt="Motion Logo" className="h-6" />
              <div>
                <h1 className="text-sm font-bold tracking-tight">GTFS Realtime</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {lastUpdate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${isLoading ? "bg-warning animate-pulse" : "bg-success"}`} />
                  <span>{formatLastUpdate(lastUpdate)}</span>
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={onToggleTheme} className="h-8 w-8">
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="h-8 w-8"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="mt-4 space-y-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex flex-col gap-2">
                <OperatorSelector value={selectedOperator} onChange={onOperatorChange} />
                <RouteSelector
                  value={selectedRoute}
                  onChange={onRouteChange}
                  routes={availableRoutes}
                  routeNames={routeNamesMap}
                  disabled={selectedOperator === "all"}
                  isLoading={isRoutesLoading}
                />
              </div>

              <div className="flex items-center justify-between">
                {onShowLiveOnlyChange && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="live-only-mobile"
                      checked={showLiveOnly}
                      onCheckedChange={onShowLiveOnlyChange}
                    />
                    <Label
                      htmlFor="live-only-mobile"
                      className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
                    >
                      <Bus className="h-3 w-3" />
                      Live only ({liveRoutesCount || 0})
                    </Label>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <RefreshCw className={`h-3 w-3 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
                  <Select
                    value={refreshInterval.toString()}
                    onValueChange={(value) => onRefreshIntervalChange(parseInt(value))}
                  >
                    <SelectTrigger className="w-[70px] h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 sec</SelectItem>
                      <SelectItem value="10">10 sec</SelectItem>
                      <SelectItem value="20">20 sec</SelectItem>
                      <SelectItem value="30">30 sec</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
