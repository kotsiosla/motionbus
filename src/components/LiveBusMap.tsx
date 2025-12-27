import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { transit_realtime } from "gtfs-realtime-bindings";
import type { Vehicle } from "@/types/gtfs";

type VehiclePosition = {
  id: string;
  label?: string;
  latitude: number;
  longitude: number;
  bearing?: number | null;
};

const GTFS_RT_PROXY_URL =
  import.meta.env.VITE_GTFS_RT_PROXY_URL ||
  "http://localhost:5174/gtfsrt/vehicle-positions";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const createMarkerElement = (label?: string) => {
  const el = document.createElement("div");
  el.className = "bus-marker";
  el.innerHTML = `
    <div class="bus-marker__dot">🚌</div>
    ${label ? `<span class="bus-marker__label">${label}</span>` : ""}
  `;
  return el;
};

export const LiveBusMap = () => {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
      },
      center: [33.0, 35.0],
      zoom: 9,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchFromSupabase = async () => {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Supabase env not configured");
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/gtfs-proxy/vehicles`, {
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`GTFS proxy error: ${response.status}`);
      }

      const payload = (await response.json()) as { data: Vehicle[] };
      return payload.data
        .filter((vehicle) => vehicle.latitude != null && vehicle.longitude != null)
        .map((vehicle) => ({
          id: vehicle.vehicleId || vehicle.id,
          label: vehicle.label || vehicle.routeId || undefined,
          latitude: vehicle.latitude as number,
          longitude: vehicle.longitude as number,
          bearing: vehicle.bearing ?? null,
        }));
    };

    const fetchFromProxy = async () => {
      const response = await fetch(GTFS_RT_PROXY_URL);
      if (!response.ok) {
        throw new Error(`Proxy error: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
      const nextVehicles: VehiclePosition[] = [];

      for (const entity of feed.entity) {
        const vehicle = entity.vehicle;
        const position = vehicle?.position;
        if (!position) continue;
        if (position.latitude == null || position.longitude == null) continue;

        nextVehicles.push({
          id: vehicle.vehicle?.id || entity.id || `${position.latitude}-${position.longitude}`,
          label: vehicle.vehicle?.label || vehicle.trip?.routeId || undefined,
          latitude: position.latitude,
          longitude: position.longitude,
          bearing: position.bearing ?? null,
        });
      }

      return nextVehicles;
    };

    const fetchVehicles = async () => {
      try {
        let nextVehicles: VehiclePosition[] = [];
        try {
          nextVehicles = await fetchFromSupabase();
        } catch (supabaseError) {
          console.warn("Supabase GTFS fetch failed, falling back to proxy.", supabaseError);
          nextVehicles = await fetchFromProxy();
        }

        if (isMounted) {
          setVehicles(nextVehicles);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load GTFS-RT feed");
        }
      }
    };

    fetchVehicles();
    const interval = window.setInterval(fetchVehicles, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;
    const activeIds = new Set(vehicles.map((vehicle) => vehicle.id));

    markers.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    });

    vehicles.forEach((vehicle) => {
      const existingMarker = markers.get(vehicle.id);
      if (existingMarker) {
        existingMarker.setLngLat([vehicle.longitude, vehicle.latitude]);
        if (vehicle.bearing != null) {
          existingMarker.setRotation(vehicle.bearing);
        }
        return;
      }

      const markerEl = createMarkerElement(vehicle.label);
      const marker = new maplibregl.Marker({ element: markerEl, rotationAlignment: "map" })
        .setLngLat([vehicle.longitude, vehicle.latitude])
        .addTo(map);

      if (vehicle.bearing != null) {
        marker.setRotation(vehicle.bearing);
      }

      markers.set(vehicle.id, marker);
    });
  }, [vehicles]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">GTFS Cyprus Buses</h1>
          <p className="text-sm text-muted-foreground">
            Live GTFS-RT vehicle positions refreshed every 5 seconds.
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>{vehicles.length} vehicles</div>
          <div>
            {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString("en-GB")}` : "Loading…"}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="relative h-[70vh] w-full overflow-hidden rounded-2xl border border-border bg-muted">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};
