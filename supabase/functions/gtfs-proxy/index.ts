import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GTFS_RT_BASE_URL = "http://20.19.98.194:8328/Api/api/gtfs-realtime";

// GTFS-Realtime Protocol Buffer Parser
// Based on the GTFS-RT specification: https://gtfs.org/realtime/reference/

function readVarint(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;
  
  while (offset + bytesRead < data.length) {
    const byte = data[offset + bytesRead];
    result |= (byte & 0x7F) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  
  return { value: result, bytesRead };
}

function readFixed64(data: Uint8Array, offset: number): number {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getFloat64(0, true);
}

function readFixed32(data: Uint8Array, offset: number): number {
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getFloat32(0, true);
}

function readString(data: Uint8Array, offset: number, length: number): string {
  const decoder = new TextDecoder();
  return decoder.decode(data.slice(offset, offset + length));
}

interface ParsedField {
  fieldNumber: number;
  wireType: number;
  value: unknown;
  rawBytes?: Uint8Array;
}

function parseProtobuf(data: Uint8Array): ParsedField[] {
  const fields: ParsedField[] = [];
  let offset = 0;
  
  while (offset < data.length) {
    const { value: tag, bytesRead: tagBytes } = readVarint(data, offset);
    offset += tagBytes;
    
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;
    
    let value: unknown;
    let rawBytes: Uint8Array | undefined;
    
    switch (wireType) {
      case 0: { // Varint
        const { value: v, bytesRead } = readVarint(data, offset);
        value = v;
        offset += bytesRead;
        break;
      }
      case 1: { // 64-bit
        value = readFixed64(data, offset);
        offset += 8;
        break;
      }
      case 2: { // Length-delimited
        const { value: length, bytesRead } = readVarint(data, offset);
        offset += bytesRead;
        rawBytes = data.slice(offset, offset + length);
        value = rawBytes;
        offset += length;
        break;
      }
      case 5: { // 32-bit
        value = readFixed32(data, offset);
        offset += 4;
        break;
      }
      default:
        console.log(`Unknown wire type: ${wireType} at offset ${offset}`);
        return fields;
    }
    
    fields.push({ fieldNumber, wireType, value, rawBytes });
  }
  
  return fields;
}

interface TranslatedString {
  text?: string;
  language?: string;
}

function parseTranslatedString(data: Uint8Array): TranslatedString[] {
  const fields = parseProtobuf(data);
  const translations: TranslatedString[] = [];
  
  for (const field of fields) {
    if (field.fieldNumber === 1 && field.rawBytes) {
      const transFields = parseProtobuf(field.rawBytes);
      const translation: TranslatedString = {};
      for (const tf of transFields) {
        if (tf.fieldNumber === 1 && tf.rawBytes) {
          translation.text = readString(tf.rawBytes, 0, tf.rawBytes.length);
        }
        if (tf.fieldNumber === 2 && tf.rawBytes) {
          translation.language = readString(tf.rawBytes, 0, tf.rawBytes.length);
        }
      }
      translations.push(translation);
    }
  }
  
  return translations;
}

function parseTripDescriptor(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const trip: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) trip.tripId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 2:
        if (field.rawBytes) trip.routeId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 3:
        trip.directionId = field.value;
        break;
      case 4:
        if (field.rawBytes) trip.startTime = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 5:
        if (field.rawBytes) trip.startDate = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 6:
        trip.scheduleRelationship = field.value;
        break;
    }
  }
  
  return trip;
}

function parseVehicleDescriptor(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const vehicle: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) vehicle.id = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 2:
        if (field.rawBytes) vehicle.label = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 3:
        if (field.rawBytes) vehicle.licensePlate = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
    }
  }
  
  return vehicle;
}

function parsePosition(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const position: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        position.latitude = field.value;
        break;
      case 2:
        position.longitude = field.value;
        break;
      case 3:
        position.bearing = field.value;
        break;
      case 4:
        position.odometer = field.value;
        break;
      case 5:
        position.speed = field.value;
        break;
    }
  }
  
  return position;
}

function parseStopTimeEvent(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const event: Record<string, number | undefined> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1: {
        let delay = field.value as number;
        // Handle signed varint for delay
        if (delay > 0x7FFFFFFF) {
          delay = delay - 0x100000000;
        }
        event.delay = delay;
        break;
      }
      case 2:
        event.time = field.value as number;
        break;
      case 3:
        event.uncertainty = field.value as number;
        break;
    }
  }
  
  return event;
}

function parseStopTimeUpdate(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const stu: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        stu.stopSequence = field.value;
        break;
      case 2:
        if (field.rawBytes) stu.arrival = parseStopTimeEvent(field.rawBytes);
        break;
      case 3:
        if (field.rawBytes) stu.departure = parseStopTimeEvent(field.rawBytes);
        break;
      case 4:
        if (field.rawBytes) stu.stopId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 5:
        stu.scheduleRelationship = field.value;
        break;
    }
  }
  
  return stu;
}

function parseTripUpdate(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const tripUpdate: Record<string, unknown> = {};
  const stopTimeUpdates: Record<string, unknown>[] = [];
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) tripUpdate.trip = parseTripDescriptor(field.rawBytes);
        break;
      case 2:
        if (field.rawBytes) stopTimeUpdates.push(parseStopTimeUpdate(field.rawBytes));
        break;
      case 3:
        if (field.rawBytes) tripUpdate.vehicle = parseVehicleDescriptor(field.rawBytes);
        break;
      case 4:
        tripUpdate.timestamp = field.value;
        break;
      case 5:
        tripUpdate.delay = field.value;
        break;
    }
  }
  
  if (stopTimeUpdates.length > 0) {
    tripUpdate.stopTimeUpdate = stopTimeUpdates;
  }
  
  return tripUpdate;
}

function parseVehiclePosition(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const vp: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) vp.trip = parseTripDescriptor(field.rawBytes);
        break;
      case 2:
        if (field.rawBytes) vp.position = parsePosition(field.rawBytes);
        break;
      case 3:
        vp.currentStopSequence = field.value;
        break;
      case 4:
        vp.currentStatus = field.value;
        break;
      case 5:
        vp.timestamp = field.value;
        break;
      case 6:
        vp.congestionLevel = field.value;
        break;
      case 7:
        if (field.rawBytes) vp.stopId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 8:
        if (field.rawBytes) vp.vehicle = parseVehicleDescriptor(field.rawBytes);
        break;
    }
  }
  
  return vp;
}

function parseActivePeriod(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const period: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        period.start = field.value;
        break;
      case 2:
        period.end = field.value;
        break;
    }
  }
  
  return period;
}

function parseEntitySelector(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const selector: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) selector.agencyId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 2:
        if (field.rawBytes) selector.routeId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 3:
        selector.routeType = field.value;
        break;
      case 4:
        if (field.rawBytes) selector.trip = parseTripDescriptor(field.rawBytes);
        break;
      case 5:
        if (field.rawBytes) selector.stopId = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
    }
  }
  
  return selector;
}

function parseAlert(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const alert: Record<string, unknown> = {};
  const activePeriods: Record<string, unknown>[] = [];
  const informedEntities: Record<string, unknown>[] = [];
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) activePeriods.push(parseActivePeriod(field.rawBytes));
        break;
      case 5:
        if (field.rawBytes) informedEntities.push(parseEntitySelector(field.rawBytes));
        break;
      case 6:
        alert.cause = field.value;
        break;
      case 7:
        alert.effect = field.value;
        break;
      case 8:
        if (field.rawBytes) alert.url = parseTranslatedString(field.rawBytes);
        break;
      case 10:
        if (field.rawBytes) alert.headerText = parseTranslatedString(field.rawBytes);
        break;
      case 11:
        if (field.rawBytes) alert.descriptionText = parseTranslatedString(field.rawBytes);
        break;
      case 14:
        alert.severityLevel = field.value;
        break;
    }
  }
  
  if (activePeriods.length > 0) alert.activePeriod = activePeriods;
  if (informedEntities.length > 0) alert.informedEntity = informedEntities;
  
  return alert;
}

function parseFeedEntity(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const entity: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) entity.id = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 2:
        entity.isDeleted = field.value === 1;
        break;
      case 3:
        if (field.rawBytes) entity.tripUpdate = parseTripUpdate(field.rawBytes);
        break;
      case 4:
        if (field.rawBytes) entity.vehicle = parseVehiclePosition(field.rawBytes);
        break;
      case 5:
        if (field.rawBytes) entity.alert = parseAlert(field.rawBytes);
        break;
    }
  }
  
  return entity;
}

function parseFeedHeader(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const header: Record<string, unknown> = {};
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) header.gtfsRealtimeVersion = readString(field.rawBytes, 0, field.rawBytes.length);
        break;
      case 2:
        header.incrementality = field.value;
        break;
      case 3:
        header.timestamp = field.value;
        break;
    }
  }
  
  return header;
}

function parseFeedMessage(data: Uint8Array): Record<string, unknown> {
  const fields = parseProtobuf(data);
  const feed: Record<string, unknown> = {};
  const entities: Record<string, unknown>[] = [];
  
  for (const field of fields) {
    switch (field.fieldNumber) {
      case 1:
        if (field.rawBytes) feed.header = parseFeedHeader(field.rawBytes);
        break;
      case 2:
        if (field.rawBytes) entities.push(parseFeedEntity(field.rawBytes));
        break;
    }
  }
  
  feed.entity = entities;
  return feed;
}

// Types for the parsed data
interface GtfsRealtimeFeed {
  header?: {
    gtfsRealtimeVersion?: string;
    incrementality?: number;
    timestamp?: number;
  };
  entity?: FeedEntity[];
}

interface FeedEntity {
  id?: string;
  isDeleted?: boolean;
  vehicle?: VehiclePosition;
  tripUpdate?: TripUpdate;
  alert?: AlertData;
}

interface VehiclePosition {
  trip?: TripDescriptor;
  position?: Position;
  currentStopSequence?: number;
  currentStatus?: number;
  timestamp?: number;
  stopId?: string;
  vehicle?: VehicleDescriptor;
}

interface TripUpdate {
  trip?: TripDescriptor;
  vehicle?: VehicleDescriptor;
  stopTimeUpdate?: StopTimeUpdate[];
  timestamp?: number;
  delay?: number;
}

interface StopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: StopTimeEvent;
  departure?: StopTimeEvent;
  scheduleRelationship?: number;
}

interface StopTimeEvent {
  delay?: number;
  time?: number;
  uncertainty?: number;
}

interface AlertData {
  activePeriod?: { start?: number; end?: number }[];
  informedEntity?: EntitySelector[];
  cause?: number;
  effect?: number;
  url?: TranslatedString[];
  headerText?: TranslatedString[];
  descriptionText?: TranslatedString[];
  severityLevel?: number;
}

interface TripDescriptor {
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
  scheduleRelationship?: number;
}

interface VehicleDescriptor {
  id?: string;
  label?: string;
  licensePlate?: string;
}

interface Position {
  latitude?: number;
  longitude?: number;
  bearing?: number;
  odometer?: number;
  speed?: number;
}

interface EntitySelector {
  agencyId?: string;
  routeId?: string;
  routeType?: number;
  trip?: TripDescriptor;
  stopId?: string;
}

async function fetchGtfsData(operatorId?: string): Promise<GtfsRealtimeFeed> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  // Build URL with optional operator filter
  const url = operatorId && operatorId !== 'all' 
    ? `${GTFS_RT_BASE_URL}/${operatorId}` 
    : GTFS_RT_BASE_URL;

  console.log(`Fetching GTFS data from: ${url}`);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': '*/*',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    console.log(`Received ${data.length} bytes of protobuf data`);
    
    const feed = parseFeedMessage(data) as GtfsRealtimeFeed;
    
    console.log(`Parsed ${feed.entity?.length || 0} entities`);
    
    return feed;
  } catch (error) {
    clearTimeout(timeout);
    console.error("Error fetching GTFS data:", error);
    throw error;
  }
}

function extractVehicles(feed: GtfsRealtimeFeed) {
  if (!feed.entity) return [];
  
  return feed.entity
    .filter((entity) => entity.vehicle)
    .map((entity) => ({
      id: entity.id,
      vehicleId: entity.vehicle?.vehicle?.id || entity.id,
      label: entity.vehicle?.vehicle?.label,
      licensePlate: entity.vehicle?.vehicle?.licensePlate,
      tripId: entity.vehicle?.trip?.tripId,
      routeId: entity.vehicle?.trip?.routeId,
      directionId: entity.vehicle?.trip?.directionId,
      latitude: entity.vehicle?.position?.latitude,
      longitude: entity.vehicle?.position?.longitude,
      bearing: entity.vehicle?.position?.bearing,
      speed: entity.vehicle?.position?.speed,
      currentStopSequence: entity.vehicle?.currentStopSequence,
      stopId: entity.vehicle?.stopId,
      currentStatus: entity.vehicle?.currentStatus,
      timestamp: entity.vehicle?.timestamp,
    }));
}

function extractTrips(feed: GtfsRealtimeFeed) {
  if (!feed.entity) return [];
  
  return feed.entity
    .filter((entity) => entity.tripUpdate)
    .map((entity) => ({
      id: entity.id,
      tripId: entity.tripUpdate?.trip?.tripId,
      routeId: entity.tripUpdate?.trip?.routeId,
      directionId: entity.tripUpdate?.trip?.directionId,
      startTime: entity.tripUpdate?.trip?.startTime,
      startDate: entity.tripUpdate?.trip?.startDate,
      scheduleRelationship: entity.tripUpdate?.trip?.scheduleRelationship,
      vehicleId: entity.tripUpdate?.vehicle?.id,
      vehicleLabel: entity.tripUpdate?.vehicle?.label,
      stopTimeUpdates: entity.tripUpdate?.stopTimeUpdate?.map((stu) => ({
        stopSequence: stu.stopSequence,
        stopId: stu.stopId,
        arrivalDelay: stu.arrival?.delay,
        arrivalTime: stu.arrival?.time,
        departureDelay: stu.departure?.delay,
        departureTime: stu.departure?.time,
        scheduleRelationship: stu.scheduleRelationship,
      })) || [],
      timestamp: entity.tripUpdate?.timestamp,
    }));
}

function extractAlerts(feed: GtfsRealtimeFeed) {
  if (!feed.entity) return [];
  
  return feed.entity
    .filter((entity) => entity.alert)
    .map((entity) => ({
      id: entity.id,
      activePeriods: entity.alert?.activePeriod?.map((ap) => ({
        start: ap.start,
        end: ap.end,
      })) || [],
      informedEntities: entity.alert?.informedEntity?.map((ie) => ({
        agencyId: ie.agencyId,
        routeId: ie.routeId,
        routeType: ie.routeType,
        tripId: ie.trip?.tripId,
        stopId: ie.stopId,
      })) || [],
      cause: entity.alert?.cause,
      effect: entity.alert?.effect,
      headerText: entity.alert?.headerText?.[0]?.text,
      descriptionText: entity.alert?.descriptionText?.[0]?.text,
      url: entity.alert?.url?.[0]?.text,
      severityLevel: entity.alert?.severityLevel,
    }));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/gtfs-proxy', '');
  const operatorId = url.searchParams.get('operator') || undefined;

  console.log(`Request path: ${path}, operator: ${operatorId || 'all'}`);

  try {
    const feed = await fetchGtfsData(operatorId);
    let data: unknown;

    switch (path) {
      case '/feed':
      case '':
        data = feed;
        break;
      case '/vehicles':
        data = extractVehicles(feed);
        break;
      case '/trips':
        data = extractTrips(feed);
        break;
      case '/alerts':
        data = extractAlerts(feed);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Not found', availableEndpoints: ['/feed', '/vehicles', '/trips', '/alerts'] }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
    }

    return new Response(
      JSON.stringify({
        data,
        timestamp: Date.now(),
        feedTimestamp: (feed.header?.timestamp as number) || undefined,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        } 
      }
    );
  } catch (error) {
    console.error("Error in gtfs-proxy:", error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch GTFS data',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});