import { useQuery } from "@tanstack/react-query";
import type { Vehicle, Trip, Alert, GtfsResponse, RouteInfo } from "@/types/gtfs";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function fetchFromProxy<T>(endpoint: string, operatorId?: string): Promise<GtfsResponse<T>> {
  const params = operatorId && operatorId !== 'all' 
    ? `?operator=${operatorId}` 
    : '';
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gtfs-proxy${endpoint}${params}`, {
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${response.statusText}`);
  }

  return response.json();
}

export function useVehicles(refreshInterval: number, operatorId?: string) {
  return useQuery({
    queryKey: ['vehicles', operatorId],
    queryFn: () => fetchFromProxy<Vehicle[]>('/vehicles', operatorId),
    refetchInterval: refreshInterval * 1000,
    staleTime: (refreshInterval * 1000) / 2,
  });
}

export function useTrips(refreshInterval: number, operatorId?: string) {
  return useQuery({
    queryKey: ['trips', operatorId],
    queryFn: () => fetchFromProxy<Trip[]>('/trips', operatorId),
    refetchInterval: refreshInterval * 1000,
    staleTime: (refreshInterval * 1000) / 2,
  });
}

export function useAlerts(refreshInterval: number, operatorId?: string) {
  return useQuery({
    queryKey: ['alerts', operatorId],
    queryFn: () => fetchFromProxy<Alert[]>('/alerts', operatorId),
    refetchInterval: refreshInterval * 1000,
    staleTime: (refreshInterval * 1000) / 2,
  });
}

export function useStaticRoutes(operatorId?: string) {
  return useQuery({
    queryKey: ['static-routes', operatorId],
    queryFn: () => fetchFromProxy<RouteInfo[]>('/routes', operatorId),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
