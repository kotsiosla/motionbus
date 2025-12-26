import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Whitelist of valid operator IDs
const VALID_OPERATOR_IDS = ['2', '4', '5', '6', '9', '10', '11'];

// Static GTFS data URLs by operator
const GTFS_STATIC_URLS: Record<string, string> = {
  '2': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C2_google_transit.zip&rel=True',
  '4': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C4_google_transit.zip&rel=True',
  '5': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C5_google_transit.zip&rel=True',
  '6': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C6_google_transit.zip&rel=True',
  '9': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C9_google_transit.zip&rel=True',
  '10': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C10_google_transit.zip&rel=True',
  '11': 'https://www.motionbuscard.org.cy/opendata/downloadfile?file=GTFS%5C11_google_transit.zip&rel=True',
};

// Cache for schedule data
const scheduleCache: Map<string, { data: ScheduleData; timestamp: number }> = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface StopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

interface TripInfo {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign?: string;
  direction_id?: number;
}

interface CalendarEntry {
  service_id: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  start_date: string;
  end_date: string;
}

interface CalendarDate {
  service_id: string;
  date: string;
  exception_type: number; // 1 = added, 2 = removed
}

interface ScheduleData {
  stop_times: StopTime[];
  trips: TripInfo[];
  calendar: CalendarEntry[];
  calendar_dates: CalendarDate[];
}

interface ScheduledDeparture {
  trip_id: string;
  route_id: string;
  departure_time: string;
  arrival_time: string;
  stop_sequence: number;
  trip_headsign?: string;
  direction_id?: number;
}

function validateOperatorId(operatorId: string | null | undefined): string | undefined {
  if (!operatorId || operatorId === 'all') {
    return undefined;
  }
  const sanitized = operatorId.replace(/[^a-zA-Z0-9]/g, '');
  if (sanitized !== operatorId || !VALID_OPERATOR_IDS.includes(sanitized)) {
    return undefined;
  }
  return sanitized;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

async function decompressFile(zipData: Uint8Array, targetFileName: string): Promise<string | null> {
  let offset = 0;
  
  while (offset < zipData.length - 4) {
    if (zipData[offset] === 0x50 && zipData[offset + 1] === 0x4b && 
        zipData[offset + 2] === 0x03 && zipData[offset + 3] === 0x04) {
      
      const view = new DataView(zipData.buffer, zipData.byteOffset + offset);
      const compressionMethod = view.getUint16(8, true);
      const compressedSize = view.getUint32(18, true);
      const uncompressedSize = view.getUint32(22, true);
      const fileNameLength = view.getUint16(26, true);
      const extraFieldLength = view.getUint16(28, true);
      
      const fileNameStart = offset + 30;
      const fileName = new TextDecoder().decode(zipData.slice(fileNameStart, fileNameStart + fileNameLength));
      const dataStart = fileNameStart + fileNameLength + extraFieldLength;
      
      if (fileName === targetFileName) {
        if (compressionMethod === 0) {
          return new TextDecoder().decode(zipData.slice(dataStart, dataStart + uncompressedSize));
        } else if (compressionMethod === 8) {
          try {
            const compressedData = zipData.slice(dataStart, dataStart + compressedSize);
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();
            
            writer.write(compressedData);
            writer.close();
            
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const decompressed = new Uint8Array(totalLength);
            let position = 0;
            for (const chunk of chunks) {
              decompressed.set(chunk, position);
              position += chunk.length;
            }
            
            return new TextDecoder().decode(decompressed);
          } catch (e) {
            console.error(`Failed to decompress ${targetFileName}:`, e);
            return null;
          }
        }
      }
      
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }
  
  return null;
}

async function parseScheduleData(zipData: Uint8Array): Promise<ScheduleData> {
  const result: ScheduleData = {
    stop_times: [],
    trips: [],
    calendar: [],
    calendar_dates: [],
  };
  
  // Parse stop_times.txt
  const stopTimesContent = await decompressFile(zipData, 'stop_times.txt');
  if (stopTimesContent) {
    const lines = stopTimesContent.split('\n');
    if (lines.length > 0) {
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const tripIdIdx = header.indexOf('trip_id');
      const arrivalIdx = header.indexOf('arrival_time');
      const departureIdx = header.indexOf('departure_time');
      const stopIdIdx = header.indexOf('stop_id');
      const seqIdx = header.indexOf('stop_sequence');
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        
        if (values.length > Math.max(tripIdIdx, arrivalIdx, departureIdx, stopIdIdx, seqIdx)) {
          result.stop_times.push({
            trip_id: values[tripIdIdx] || '',
            arrival_time: values[arrivalIdx] || '',
            departure_time: values[departureIdx] || '',
            stop_id: values[stopIdIdx] || '',
            stop_sequence: parseInt(values[seqIdx]) || 0,
          });
        }
      }
    }
  }
  
  // Parse trips.txt
  const tripsContent = await decompressFile(zipData, 'trips.txt');
  if (tripsContent) {
    const lines = tripsContent.split('\n');
    if (lines.length > 0) {
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const tripIdIdx = header.indexOf('trip_id');
      const routeIdIdx = header.indexOf('route_id');
      const serviceIdIdx = header.indexOf('service_id');
      const headsignIdx = header.indexOf('trip_headsign');
      const directionIdx = header.indexOf('direction_id');
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        
        if (values.length > Math.max(tripIdIdx, routeIdIdx, serviceIdIdx)) {
          result.trips.push({
            trip_id: values[tripIdIdx] || '',
            route_id: values[routeIdIdx] || '',
            service_id: values[serviceIdIdx] || '',
            trip_headsign: headsignIdx >= 0 ? values[headsignIdx] : undefined,
            direction_id: directionIdx >= 0 && values[directionIdx] ? parseInt(values[directionIdx]) : undefined,
          });
        }
      }
    }
  }
  
  // Parse calendar.txt
  const calendarContent = await decompressFile(zipData, 'calendar.txt');
  if (calendarContent) {
    const lines = calendarContent.split('\n');
    if (lines.length > 0) {
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const serviceIdIdx = header.indexOf('service_id');
      const monIdx = header.indexOf('monday');
      const tueIdx = header.indexOf('tuesday');
      const wedIdx = header.indexOf('wednesday');
      const thuIdx = header.indexOf('thursday');
      const friIdx = header.indexOf('friday');
      const satIdx = header.indexOf('saturday');
      const sunIdx = header.indexOf('sunday');
      const startIdx = header.indexOf('start_date');
      const endIdx = header.indexOf('end_date');
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        
        if (values.length > serviceIdIdx) {
          result.calendar.push({
            service_id: values[serviceIdIdx] || '',
            monday: values[monIdx] === '1',
            tuesday: values[tueIdx] === '1',
            wednesday: values[wedIdx] === '1',
            thursday: values[thuIdx] === '1',
            friday: values[friIdx] === '1',
            saturday: values[satIdx] === '1',
            sunday: values[sunIdx] === '1',
            start_date: values[startIdx] || '',
            end_date: values[endIdx] || '',
          });
        }
      }
    }
  }
  
  // Parse calendar_dates.txt
  const calendarDatesContent = await decompressFile(zipData, 'calendar_dates.txt');
  if (calendarDatesContent) {
    const lines = calendarDatesContent.split('\n');
    if (lines.length > 0) {
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const serviceIdIdx = header.indexOf('service_id');
      const dateIdx = header.indexOf('date');
      const exceptionIdx = header.indexOf('exception_type');
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        
        if (values.length > Math.max(serviceIdIdx, dateIdx, exceptionIdx)) {
          result.calendar_dates.push({
            service_id: values[serviceIdIdx] || '',
            date: values[dateIdx] || '',
            exception_type: parseInt(values[exceptionIdx]) || 0,
          });
        }
      }
    }
  }
  
  return result;
}

async function fetchScheduleData(operatorId: string): Promise<ScheduleData | null> {
  const cacheKey = `schedule_${operatorId}`;
  const cached = scheduleCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Using cached schedule for operator ${operatorId}`);
    return cached.data;
  }
  
  const url = GTFS_STATIC_URLS[operatorId];
  if (!url) return null;
  
  try {
    console.log(`Fetching schedule data for operator ${operatorId}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch GTFS for operator ${operatorId}: ${response.status}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const zipData = new Uint8Array(arrayBuffer);
    
    const data = await parseScheduleData(zipData);
    console.log(`Parsed schedule: ${data.stop_times.length} stop_times, ${data.trips.length} trips, ${data.calendar.length} calendar entries`);
    
    scheduleCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`Error fetching schedule for operator ${operatorId}:`, error);
    return null;
  }
}

function isServiceActiveOnDate(calendar: CalendarEntry[], calendarDates: CalendarDate[], serviceId: string, dateStr: string): boolean {
  const date = new Date(dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6) + '-' + dateStr.slice(6, 8));
  const dayOfWeek = date.getDay(); // 0 = Sunday
  
  // Check calendar_dates first (exceptions)
  const exception = calendarDates.find(cd => cd.service_id === serviceId && cd.date === dateStr);
  if (exception) {
    return exception.exception_type === 1; // 1 = added, 2 = removed
  }
  
  // Check regular calendar
  const calEntry = calendar.find(c => c.service_id === serviceId);
  if (!calEntry) return false;
  
  // Check date range
  if (dateStr < calEntry.start_date || dateStr > calEntry.end_date) {
    return false;
  }
  
  // Check day of week
  switch (dayOfWeek) {
    case 0: return calEntry.sunday;
    case 1: return calEntry.monday;
    case 2: return calEntry.tuesday;
    case 3: return calEntry.wednesday;
    case 4: return calEntry.thursday;
    case 5: return calEntry.friday;
    case 6: return calEntry.saturday;
    default: return false;
  }
}

function getScheduledDepartures(
  scheduleData: ScheduleData,
  routeId: string,
  dateStr: string
): ScheduledDeparture[] {
  // Get trips for this route
  const routeTrips = scheduleData.trips.filter(t => t.route_id === routeId);
  
  // Filter trips active on this date
  const activeTrips = routeTrips.filter(t => 
    isServiceActiveOnDate(scheduleData.calendar, scheduleData.calendar_dates, t.service_id, dateStr)
  );
  
  const tripIds = new Set(activeTrips.map(t => t.trip_id));
  const tripMap = new Map(activeTrips.map(t => [t.trip_id, t]));
  
  // Get first stop_time for each trip (departures from first stop)
  const tripFirstStops = new Map<string, StopTime>();
  
  for (const st of scheduleData.stop_times) {
    if (!tripIds.has(st.trip_id)) continue;
    
    const existing = tripFirstStops.get(st.trip_id);
    if (!existing || st.stop_sequence < existing.stop_sequence) {
      tripFirstStops.set(st.trip_id, st);
    }
  }
  
  // Build departures list
  const departures: ScheduledDeparture[] = [];
  
  for (const [tripId, stopTime] of tripFirstStops) {
    const trip = tripMap.get(tripId);
    if (!trip) continue;
    
    departures.push({
      trip_id: tripId,
      route_id: routeId,
      departure_time: stopTime.departure_time,
      arrival_time: stopTime.arrival_time,
      stop_sequence: stopTime.stop_sequence,
      trip_headsign: trip.trip_headsign,
      direction_id: trip.direction_id,
    });
  }
  
  // Sort by departure time
  departures.sort((a, b) => {
    const timeA = a.departure_time.replace(/:/g, '');
    const timeB = b.departure_time.replace(/:/g, '');
    return timeA.localeCompare(timeB);
  });
  
  return departures;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const rawOperatorId = url.searchParams.get('operator');
  const operatorId = validateOperatorId(rawOperatorId);
  const routeId = url.searchParams.get('route');
  const dateParam = url.searchParams.get('date'); // Format: YYYYMMDD
  
  console.log(`Schedule request: operator=${operatorId}, route=${routeId}, date=${dateParam}`);

  if (!operatorId) {
    return new Response(
      JSON.stringify({ error: 'Valid operator ID required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!routeId) {
    return new Response(
      JSON.stringify({ error: 'Route ID required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Default to today if no date provided
  const today = new Date();
  const dateStr = dateParam || 
    `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  try {
    const scheduleData = await fetchScheduleData(operatorId);
    
    if (!scheduleData) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch schedule data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const departures = getScheduledDepartures(scheduleData, routeId, dateStr);

    return new Response(
      JSON.stringify({
        data: departures,
        route_id: routeId,
        date: dateStr,
        timestamp: Date.now(),
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        } 
      }
    );
  } catch (error) {
    console.error('Error in gtfs-schedule:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get schedule',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
