import { useState, useEffect, useMemo } from "react";
import { Map as MapIcon, Route, MapPin, Bell, Bus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { ErrorBanner } from "@/components/ErrorBanner";
import { VehicleMap } from "@/components/VehicleMap";
import { TripsTable } from "@/components/TripsTable";
import { StopsView } from "@/components/StopsView";
import { AlertsList } from "@/components/AlertsList";
import { useVehicles, useTrips, useAlerts, useStaticRoutes, useStaticStops } from "@/hooks/useGtfsData";
import type { RouteInfo } from "@/types/gtfs";

const Index = () => {
  const [isDark, setIsDark] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [activeTab, setActiveTab] = useState("map");
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [selectedRoute, setSelectedRoute] = useState("all");
  const [showLiveOnly, setShowLiveOnly] = useState(false);

  const vehiclesQuery = useVehicles(refreshInterval, selectedOperator);
  const tripsQuery = useTrips(refreshInterval, selectedOperator);
  const alertsQuery = useAlerts(refreshInterval, selectedOperator);
  const staticRoutesQuery = useStaticRoutes(selectedOperator);
  const staticStopsQuery = useStaticStops(selectedOperator);

  // Create a map of route_id -> RouteInfo for quick lookup
  const routeNamesMap = useMemo(() => {
    const routeMap = new Map<string, RouteInfo>();
    staticRoutesQuery.data?.data?.forEach(route => {
      routeMap.set(route.route_id, route);
    });
    return routeMap;
  }, [staticRoutesQuery.data]);

  // Get routes with active vehicles/trips
  const liveRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    vehiclesQuery.data?.data?.forEach(v => {
      if (v.routeId) routeSet.add(v.routeId);
    });
    tripsQuery.data?.data?.forEach(t => {
      if (t.routeId) routeSet.add(t.routeId);
    });
    return routeSet;
  }, [vehiclesQuery.data, tripsQuery.data]);

  // Get all available routes from static data, or live routes only
  const availableRoutes = useMemo(() => {
    if (showLiveOnly) {
      return Array.from(liveRoutes);
    }
    
    // Get routes from static GTFS data
    const staticRoutes = staticRoutesQuery.data?.data?.map(r => r.route_id) || [];
    if (staticRoutes.length > 0) {
      return staticRoutes;
    }
    
    // Fallback: use live routes
    return Array.from(liveRoutes);
  }, [staticRoutesQuery.data, liveRoutes, showLiveOnly]);

  // Reset route when operator changes
  useEffect(() => {
    setSelectedRoute("all");
  }, [selectedOperator]);

  // Filter data by selected route
  const filteredVehicles = useMemo(() => {
    const vehicles = vehiclesQuery.data?.data || [];
    if (selectedRoute === "all") return vehicles;
    return vehicles.filter(v => v.routeId === selectedRoute);
  }, [vehiclesQuery.data, selectedRoute]);

  const filteredTrips = useMemo(() => {
    const trips = tripsQuery.data?.data || [];
    if (selectedRoute === "all") return trips;
    return trips.filter(t => t.routeId === selectedRoute);
  }, [tripsQuery.data, selectedRoute]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const isLoading = vehiclesQuery.isLoading || tripsQuery.isLoading || alertsQuery.isLoading;
  const hasError = vehiclesQuery.isError || tripsQuery.isError || alertsQuery.isError;
  const errorMessage = vehiclesQuery.error?.message || tripsQuery.error?.message || alertsQuery.error?.message;

  const lastUpdate = Math.max(
    vehiclesQuery.data?.timestamp || 0,
    tripsQuery.data?.timestamp || 0,
    alertsQuery.data?.timestamp || 0
  );

  const handleRetry = () => {
    vehiclesQuery.refetch();
    tripsQuery.refetch();
    alertsQuery.refetch();
  };

  const alertCount = alertsQuery.data?.data?.length || 0;
  const vehicleCount = filteredVehicles.length;
  const tripCount = filteredTrips.length;
  const stopCount = staticStopsQuery.data?.data?.length || 0;
  const routeCount = selectedRoute === "all" ? availableRoutes.length : 1;
  const formattedLastUpdate = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/30">
      <Header
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={setRefreshInterval}
        lastUpdate={lastUpdate || null}
        isLoading={isLoading}
        selectedOperator={selectedOperator}
        onOperatorChange={setSelectedOperator}
        selectedRoute={selectedRoute}
        onRouteChange={setSelectedRoute}
        availableRoutes={availableRoutes}
        routeNamesMap={routeNamesMap}
        isRoutesLoading={staticRoutesQuery.isLoading}
        showLiveOnly={showLiveOnly}
        onShowLiveOnlyChange={setShowLiveOnly}
        liveRoutesCount={liveRoutes.size}
      />

      {hasError && (
        <ErrorBanner message={errorMessage || "Αποτυχία σύνδεσης"} onRetry={handleRetry} />
      )}

      <main className="flex-1 container mx-auto px-4 py-6">
        <section className="mb-8">
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                  Motionbus Live
                </span>
                <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                  Νέο UI
                </span>
              </div>
              <h2 className="text-3xl font-semibold">Κέντρο Ελέγχου Δικτύου</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Κεντρικοποίησε την εικόνα του στόλου, των δρομολογίων και των ειδοποιήσεων. Διάλεξε operator, φίλτραρε
                γραμμές και δες αμέσως τι συμβαίνει στο δίκτυο.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" className="rounded-full">Άνοιγμα Χάρτη</Button>
                <Button size="sm" variant="outline" className="rounded-full">Δες ειδοποιήσεις</Button>
                <div className="flex items-center gap-3 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-full ${isLoading ? "bg-warning animate-pulse" : "bg-success"}`} />
                  <span>Τελευταία ενημέρωση</span>
                  <span className="font-semibold text-foreground">{formattedLastUpdate}</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
              <h3 className="text-sm font-semibold">Σύνοψη δικτύου</h3>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Ενεργές γραμμές</span>
                  <span className="font-semibold text-foreground">{routeCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ζωντανά οχήματα</span>
                  <span className="font-semibold text-foreground">{vehicleCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ενεργά δρομολόγια</span>
                  <span className="font-semibold text-foreground">{tripCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Σύνολο στάσεων</span>
                  <span className="font-semibold text-foreground">{stopCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ειδοποιήσεις</span>
                  <span className="font-semibold text-foreground">{alertCount}</span>
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-muted/60 p-4 text-xs text-muted-foreground">
                Ενημέρωση live δεδομένων κάθε {refreshInterval} sec.
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Οχήματα σε κίνηση</p>
                <span className="rounded-full bg-primary/10 p-2 text-primary">
                  <Bus className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold">{vehicleCount}</p>
              <p className="text-xs text-muted-foreground">Live vehicles</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Ενεργά δρομολόγια</p>
                <span className="rounded-full bg-accent/10 p-2 text-accent">
                  <Route className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold">{tripCount}</p>
              <p className="text-xs text-muted-foreground">Trips now</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Διαθέσιμες στάσεις</p>
                <span className="rounded-full bg-warning/10 p-2 text-warning">
                  <MapPin className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold">{stopCount}</p>
              <p className="text-xs text-muted-foreground">Static stops</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Δίκτυο & ειδοποιήσεις</p>
                <span className="rounded-full bg-destructive/10 p-2 text-destructive">
                  <Bell className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold">
                {routeCount} / {alertCount}
              </p>
              <p className="text-xs text-muted-foreground">Routes & alerts</p>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
          <TabsList className="grid w-full grid-cols-4 rounded-full bg-muted/60 p-1 shadow-sm">
            <TabsTrigger value="map" className="flex items-center gap-2 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">
              <MapIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Χάρτης</span>
            </TabsTrigger>
            <TabsTrigger value="trips" className="flex items-center gap-2 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">
              <Route className="h-4 w-4" />
              <span className="hidden sm:inline">Δρομολόγια</span>
            </TabsTrigger>
            <TabsTrigger value="stops" className="flex items-center gap-2 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Στάσεις</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2 relative rounded-full data-[state=active]:bg-background data-[state=active]:shadow">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Ειδοποιήσεις</span>
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-[520px] glass-card rounded-2xl overflow-hidden">
            <TabsContent value="map" className="h-full m-0">
              <VehicleMap
                vehicles={filteredVehicles}
                trips={filteredTrips}
                stops={staticStopsQuery.data?.data || []}
                shapes={[]}
                tripMappings={[]}
                routeNamesMap={routeNamesMap}
                isLoading={vehiclesQuery.isLoading}
                selectedRoute={selectedRoute}
                selectedOperator={selectedOperator}
                onRouteChange={setSelectedRoute}
              />
            </TabsContent>

            <TabsContent value="trips" className="h-full m-0">
              <TripsTable
                trips={filteredTrips}
                isLoading={tripsQuery.isLoading}
                routeNames={routeNamesMap}
              />
            </TabsContent>

            <TabsContent value="stops" className="h-full m-0">
              <StopsView
                trips={filteredTrips}
                isLoading={tripsQuery.isLoading}
              />
            </TabsContent>

            <TabsContent value="alerts" className="h-full m-0 overflow-auto">
              <AlertsList
                alerts={alertsQuery.data?.data || []}
                isLoading={alertsQuery.isLoading}
              />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
