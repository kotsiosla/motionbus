import { useState, useEffect, useMemo } from "react";
import { Map as MapIcon, Route, MapPin, Bell } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/Header";
import { ErrorBanner } from "@/components/ErrorBanner";
import { VehicleMap } from "@/components/VehicleMap";
import { TripsTable } from "@/components/TripsTable";
import { StopsView } from "@/components/StopsView";
import { AlertsList } from "@/components/AlertsList";
import { useVehicles, useTrips, useAlerts, useStaticRoutes, useStaticStops, useStaticShapes, useTripMappings } from "@/hooks/useGtfsData";
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
  const staticShapesQuery = useStaticShapes(selectedOperator);
  const tripMappingsQuery = useTripMappings(selectedOperator);

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
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

      <main className="flex-1 container mx-auto px-4 py-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-4 mb-2">
            <TabsTrigger value="map" className="flex items-center gap-2">
              <MapIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Χάρτης</span>
            </TabsTrigger>
            <TabsTrigger value="trips" className="flex items-center gap-2">
              <Route className="h-4 w-4" />
              <span className="hidden sm:inline">Δρομολόγια</span>
            </TabsTrigger>
            <TabsTrigger value="stops" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Στάσεις</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2 relative">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Ειδοποιήσεις</span>
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 glass-card rounded-lg overflow-hidden">
            <TabsContent value="map" className="h-[calc(100vh-220px)] m-0">
              <VehicleMap
                vehicles={filteredVehicles}
                trips={filteredTrips}
                stops={staticStopsQuery.data?.data || []}
                shapes={staticShapesQuery.data?.data || []}
                tripMappings={tripMappingsQuery.data?.data || []}
                routeNamesMap={routeNamesMap}
                isLoading={vehiclesQuery.isLoading}
                selectedRoute={selectedRoute}
                selectedOperator={selectedOperator}
              />
            </TabsContent>

            <TabsContent value="trips" className="h-[calc(100vh-220px)] m-0">
              <TripsTable
                trips={filteredTrips}
                isLoading={tripsQuery.isLoading}
                routeNames={routeNamesMap}
              />
            </TabsContent>

            <TabsContent value="stops" className="h-[calc(100vh-220px)] m-0">
              <StopsView
                trips={filteredTrips}
                isLoading={tripsQuery.isLoading}
              />
            </TabsContent>

            <TabsContent value="alerts" className="h-[calc(100vh-220px)] m-0 overflow-auto">
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
