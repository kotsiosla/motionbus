export interface Vehicle {
  id: string;
  vehicleId: string;
  label?: string;
  licensePlate?: string;
  tripId?: string;
  routeId?: string;
  directionId?: number;
  latitude?: number;
  longitude?: number;
  bearing?: number;
  speed?: number;
  currentStopSequence?: number;
  stopId?: string;
  currentStatus?: string;
  timestamp?: number;
}

export interface StopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrivalDelay?: number;
  arrivalTime?: number;
  departureDelay?: number;
  departureTime?: number;
  scheduleRelationship?: string;
}

export interface Trip {
  id: string;
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
  scheduleRelationship?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  stopTimeUpdates: StopTimeUpdate[];
  timestamp?: number;
}

export interface ActivePeriod {
  start?: number;
  end?: number;
}

export interface InformedEntity {
  agencyId?: string;
  routeId?: string;
  routeType?: number;
  tripId?: string;
  stopId?: string;
}

export interface Alert {
  id: string;
  activePeriods: ActivePeriod[];
  informedEntities: InformedEntity[];
  cause?: string;
  effect?: string;
  headerText?: string;
  descriptionText?: string;
  url?: string;
  severityLevel?: string;
}

export interface GtfsResponse<T> {
  data: T;
  timestamp: number;
  feedTimestamp?: number;
}

export interface StopInfo {
  stopId: string;
  stopName?: string;
  latitude?: number;
  longitude?: number;
  delays: {
    tripId?: string;
    routeId?: string;
    arrivalDelay?: number;
    departureDelay?: number;
  }[];
}

export interface RouteInfo {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type?: number;
  route_color?: string;
  route_text_color?: string;
}

export interface StaticStop {
  stop_id: string;
  stop_name: string;
  stop_lat?: number;
  stop_lon?: number;
  stop_code?: string;
  location_type?: number;
  parent_station?: string;
}

export interface ShapePoint {
  shape_id: string;
  shape_pt_lat: number;
  shape_pt_lon: number;
  shape_pt_sequence: number;
}

export interface TripShapeMapping {
  route_id: string;
  trip_id: string;
  shape_id: string;
}

export interface OperatorInfo {
  id: string;
  name: string;
  city?: string;
}

export const OPERATORS: OperatorInfo[] = [
  { id: 'all', name: 'Όλοι οι φορείς' },
  { id: '2', name: 'OSYPA', city: 'Πάφος' },
  { id: '4', name: 'OSEA', city: 'Αμμόχωστος' },
  { id: '5', name: 'Υπεραστικά' },
  { id: '6', name: 'EMEL', city: 'Λεμεσός' },
  { id: '9', name: 'NPT', city: 'Λευκωσία' },
  { id: '10', name: 'LPT', city: 'Λάρνακα' },
  { id: '11', name: 'PAME EXPRESS' },
];