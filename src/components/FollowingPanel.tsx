import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Navigation, Clock, X, GripHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Vehicle, RouteInfo } from "@/types/gtfs";

interface FollowingPanelProps {
  vehicle: Vehicle;
  routeInfo?: RouteInfo;
  nextStop?: {
    stopName: string;
    arrivalTime?: number;
    arrivalDelay?: number;
  } | null;
  onClose: () => void;
}

const STORAGE_KEY = 'following-panel-state';
const MIN_WIDTH = 260;
const MAX_WIDTH = 450;

const formatSpeed = (speed?: number) => {
  if (speed === undefined || speed === null) return 'Άγνωστο';
  return `${(speed * 3.6).toFixed(1)} km/h`;
};

const formatETA = (arrivalTime?: number) => {
  if (!arrivalTime) return null;
  const date = new Date(arrivalTime * 1000);
  return date.toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatDelay = (delay?: number) => {
  if (delay === undefined || delay === null) return '';
  const minutes = Math.round(delay / 60);
  if (minutes === 0) return '(στην ώρα)';
  if (minutes > 0) return `(+${minutes} λεπτά)`;
  return `(${minutes} λεπτά)`;
};

const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading following panel state:', e);
  }
  return null;
};

const saveState = (position: { x: number; y: number }, width: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ position, width }));
  } catch (e) {
    console.error('Error saving following panel state:', e);
  }
};

export function FollowingPanel({
  vehicle,
  routeInfo,
  nextStop,
  onClose,
}: FollowingPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Load initial state from localStorage
  const savedState = useMemo(() => loadSavedState(), []);
  
  // Draggable state
  const [position, setPosition] = useState(savedState?.position || { x: window.innerWidth / 2 - 160, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Resizable state
  const [width, setWidth] = useState(savedState?.width || 320);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, width: 0, posX: 0 });
  
  const panelRef = useRef<HTMLDivElement>(null);

  // Save state when position or width changes
  useEffect(() => {
    if (!isDragging && !isResizing) {
      saveState(position, width);
    }
  }, [position, width, isDragging, isResizing]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    setDragOffset({
      x: clientX - position.x,
      y: clientY - position.y
    });
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newX = Math.max(0, Math.min(window.innerWidth - width, clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, clientY - dragOffset.y));
      
      setPosition({ x: newX, y: newY });
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragOffset, width]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    
    setIsResizing(direction);
    resizeStartRef.current = {
      x: clientX,
      width: width,
      posX: position.x
    };
  }, [width, position]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - resizeStartRef.current.x;
      
      if (isResizing === 'e') {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width + deltaX));
        setWidth(newWidth);
      }
      if (isResizing === 'w') {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width - deltaX));
        const newPosX = resizeStartRef.current.posX + (resizeStartRef.current.width - newWidth);
        setWidth(newWidth);
        setPosition(prev => ({ ...prev, x: Math.max(0, newPosX) }));
      }
    };

    const handleEnd = () => {
      setIsResizing(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isResizing]);

  const routeColor = routeInfo?.route_color ? `#${routeInfo.route_color}` : 'hsl(var(--primary))';

  return (
    <div 
      ref={panelRef}
      className="fixed z-[1000] glass-card rounded-lg overflow-hidden shadow-xl select-none"
      style={{
        left: position.x,
        top: position.y,
        width: width,
      }}
    >
      {/* Header - Draggable */}
      <div 
        className="px-3 py-2 flex items-center justify-between cursor-move bg-gradient-to-r from-primary/20 to-primary/10 border-b border-border"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 opacity-50 text-muted-foreground" />
          <Navigation 
            className="h-4 w-4 animate-pulse" 
            style={{ color: routeColor }}
          />
          <span className="text-xs font-medium text-muted-foreground">Παρακολούθηση</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-background/50"
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
          >
            {isMinimized ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-background/50"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3">
          {/* Vehicle Info */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-muted-foreground">Όχημα:</span>
            <span className="font-semibold">
              {vehicle.vehicleId || vehicle.id || vehicle.label}
            </span>
            {vehicle.licensePlate &&
              vehicle.licensePlate !== (vehicle.vehicleId || vehicle.id || vehicle.label) && (
                <span className="text-xs text-muted-foreground">
                  ({vehicle.licensePlate})
                </span>
              )}
            {vehicle.speed !== undefined && (
              <span className="text-primary font-medium">{formatSpeed(vehicle.speed)}</span>
            )}
          </div>
          
          {/* Route Info */}
          {routeInfo && (
            <div 
              className="font-medium mt-1 text-sm"
              style={{ color: routeColor }}
            >
              {routeInfo.route_short_name} - {routeInfo.route_long_name}
            </div>
          )}

          {/* Next Stop */}
          {nextStop && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border text-xs flex-wrap">
              <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Επόμενη:</span>
              <span className="font-medium">{nextStop.stopName}</span>
              {nextStop.arrivalTime && (
                <span className="font-mono text-primary">{formatETA(nextStop.arrivalTime)}</span>
              )}
              {nextStop.arrivalDelay !== undefined && nextStop.arrivalDelay !== 0 && (
                <span className={nextStop.arrivalDelay > 0 ? 'text-destructive' : 'text-green-500'}>
                  {formatDelay(nextStop.arrivalDelay)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Resize handles */}
      {!isMinimized && (
        <>
          <div
            className="absolute top-1/2 right-0 w-2 h-8 -translate-y-1/2 cursor-e-resize"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            onTouchStart={(e) => handleResizeStart(e, 'e')}
          />
          <div
            className="absolute top-1/2 left-0 w-2 h-8 -translate-y-1/2 cursor-w-resize"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            onTouchStart={(e) => handleResizeStart(e, 'w')}
          />
        </>
      )}
    </div>
  );
}
