import { useQuery } from "@tanstack/react-query";

export interface ScheduledDeparture {
  trip_id: string;
  route_id: string;
  departure_time: string;
  arrival_time: string;
  stop_sequence: number;
  trip_headsign?: string;
  direction_id?: number;
}

export interface ScheduleResponse {
  data: ScheduledDeparture[];
  route_id: string;
  date: string;
  timestamp: number;
}

async function fetchSchedule(
  operatorId: string,
  routeId: string,
  dateStr: string
): Promise<ScheduleResponse> {
  const url = new URL(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gtfs-schedule`
  );
  url.searchParams.set("operator", operatorId);
  url.searchParams.set("route", routeId);
  url.searchParams.set("date", dateStr);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schedule: ${response.status}`);
  }

  return response.json();
}

export function useSchedule(
  operatorId: string,
  routeId: string,
  dateStr: string
) {
  return useQuery({
    queryKey: ["schedule", operatorId, routeId, dateStr],
    queryFn: () => fetchSchedule(operatorId, routeId, dateStr),
    enabled: !!operatorId && !!routeId && !!dateStr,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}
