import { useEffect, useMemo, useRef } from "react";
import { ColorScheme, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

import type { CanonicalSignal, GeoLocation, IncidentBundle } from "../types";

interface Props {
  signals: CanonicalSignal[];
  incidents: IncidentBundle[];
  selectedClusterId: string | null;
  onSelectIncident: (clusterId: string) => void;
  placeMode: boolean;
  drawMode: boolean;
  onMapPointPicked: (latLng: GeoLocation) => void;
  onPolygonComplete: (
    centroid: GeoLocation,
    radius_km: number,
    area_sqkm: number
  ) => void;
}

const DEFAULT_CENTER = { lat: 24.8007, lng: 67.0731 };

const SOURCE_COLORS: Record<string, string> = {
  weather: "#60a5fa",
  traffic: "#fbbf24",
  social: "#a78bfa",
  citizen_report: "#34d399",
};

const SEVERITY_COLORS = ["#34d399", "#a3e635", "#fbbf24", "#fb923c", "#ef4444"];

export function MapView(props: Props) {
  return (
    <Map
      defaultCenter={DEFAULT_CENTER}
      defaultZoom={13}
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      colorScheme={ColorScheme.DARK}
      styles={DARK_MAP_STYLE}
      gestureHandling="greedy"
      draggableCursor={props.placeMode ? "crosshair" : undefined}
    >
      <Overlays {...props} />
    </Map>
  );
}

function Overlays({
  signals,
  incidents,
  selectedClusterId,
  onSelectIncident,
  placeMode,
  drawMode,
  onMapPointPicked,
  onPolygonComplete,
}: Props) {
  const map = useMap();
  const drawingLib = useMapsLibrary("drawing");
  const geometryLib = useMapsLibrary("geometry");

  const signalMarkersRef = useRef<google.maps.Marker[]>([]);
  const incidentMarkersRef = useRef<google.maps.Marker[]>([]);
  const polysRef = useRef<google.maps.Polygon[]>([]);
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const adhocPolygonRef = useRef<google.maps.Polygon | null>(null);
  const adhocMarkerRef = useRef<google.maps.Marker | null>(null);

  const incidentBoundsKey = useMemo(
    () => incidents.map((i) => i.cluster_id).join("|") + ":" + signals.length,
    [incidents, signals]
  );

  // Fit to incidents whenever they appear or change cluster set
  useEffect(() => {
    if (!map || incidents.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const inc of incidents) {
      bounds.extend(inc.candidate.geo_centroid);
      for (const s of inc.candidate.signals) bounds.extend(s.geo);
    }
    map.fitBounds(bounds, 80);
  }, [map, incidentBoundsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin-crisis mode: listen for map clicks
  useEffect(() => {
    if (!map || !placeMode) return;
    // remove previous ad-hoc marker if any
    adhocMarkerRef.current?.setMap(null);
    adhocMarkerRef.current = null;
    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      // drop a temporary pin to give feedback while the modal opens
      adhocMarkerRef.current?.setMap(null);
      adhocMarkerRef.current = new google.maps.Marker({
        map,
        position: { lat, lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#ef4444",
          fillOpacity: 0.9,
          strokeColor: "#0b1220",
          strokeWeight: 2,
          scale: 12,
        },
        zIndex: 20,
      });
      onMapPointPicked({ lat, lng });
    });
    return () => {
      google.maps.event.removeListener(listener);
      adhocMarkerRef.current?.setMap(null);
      adhocMarkerRef.current = null;
    };
  }, [map, placeMode, onMapPointPicked]);

  // Draw-area mode: spin up a DrawingManager constrained to polygon mode
  useEffect(() => {
    if (!map || !drawMode || !drawingLib) return;
    const dm = new drawingLib.DrawingManager({
      drawingMode: drawingLib.OverlayType.POLYGON,
      drawingControl: false,
      polygonOptions: {
        strokeColor: "#ef4444",
        strokeWeight: 2,
        fillColor: "#ef4444",
        fillOpacity: 0.18,
        clickable: false,
        editable: false,
        zIndex: 25,
      },
    });
    dm.setMap(map);
    drawingManagerRef.current = dm;

    const listener = google.maps.event.addListener(
      dm,
      "polygoncomplete",
      (poly: google.maps.Polygon) => {
        // disable further drawing immediately
        dm.setDrawingMode(null);
        adhocPolygonRef.current?.setMap(null);
        adhocPolygonRef.current = poly;

        const path = poly.getPath().getArray();
        if (path.length < 3) {
          poly.setMap(null);
          return;
        }
        // centroid = simple average
        let sumLat = 0;
        let sumLng = 0;
        for (const ll of path) {
          sumLat += ll.lat();
          sumLng += ll.lng();
        }
        const centroid: GeoLocation = {
          lat: sumLat / path.length,
          lng: sumLng / path.length,
        };
        // radius = max haversine distance from centroid to any vertex
        let maxMeters = 0;
        if (geometryLib) {
          const c = new google.maps.LatLng(centroid.lat, centroid.lng);
          for (const ll of path) {
            const d = geometryLib.spherical.computeDistanceBetween(c, ll);
            if (d > maxMeters) maxMeters = d;
          }
        }
        const radius_km = Math.max(0.1, maxMeters / 1000);
        // area
        const area_m2 = geometryLib
          ? geometryLib.spherical.computeArea(poly.getPath())
          : 0;
        const area_sqkm = area_m2 / 1_000_000;

        onPolygonComplete(centroid, radius_km, area_sqkm);
      }
    );

    return () => {
      google.maps.event.removeListener(listener);
      dm.setMap(null);
      drawingManagerRef.current = null;
      adhocPolygonRef.current?.setMap(null);
      adhocPolygonRef.current = null;
    };
  }, [map, drawMode, drawingLib, geometryLib, onPolygonComplete]);

  // Render signal markers
  useEffect(() => {
    if (!map) return;
    signalMarkersRef.current.forEach((m) => m.setMap(null));
    signalMarkersRef.current = signals.map((s) => {
      const color = SOURCE_COLORS[s.source] ?? "#94a3b8";
      return new google.maps.Marker({
        map,
        position: s.geo,
        zIndex: 1,
        title: `${s.source} · ${s.raw_text.slice(0, 80)}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: "#0b1220",
          strokeWeight: 1.5,
          scale: 5,
        },
      });
    });
    return () => {
      signalMarkersRef.current.forEach((m) => m.setMap(null));
      signalMarkersRef.current = [];
    };
  }, [map, signals]);

  // Render incident markers
  useEffect(() => {
    if (!map) return;
    incidentMarkersRef.current.forEach((m) => m.setMap(null));
    incidentMarkersRef.current = incidents.map((inc) => {
      const sev = inc.analysis?.severity ?? 3;
      const color = SEVERITY_COLORS[Math.max(0, Math.min(sev - 1, 4))];
      const isSelected = inc.cluster_id === selectedClusterId;
      const marker = new google.maps.Marker({
        map,
        position: inc.candidate.geo_centroid,
        zIndex: 10,
        title: `${inc.cluster_id} · severity ${sev}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#0b1220",
          strokeWeight: 2,
          scale: isSelected ? 13 : 10,
        },
      });
      marker.addListener("click", () => onSelectIncident(inc.cluster_id));
      return marker;
    });
    return () => {
      incidentMarkersRef.current.forEach((m) => m.setMap(null));
      incidentMarkersRef.current = [];
    };
  }, [map, incidents, selectedClusterId, onSelectIncident]);

  // Render polygons + alternate routes
  useEffect(() => {
    if (!map) return;
    polysRef.current.forEach((p) => p.setMap(null));
    linesRef.current.forEach((l) => l.setMap(null));
    polysRef.current = [];
    linesRef.current = [];

    for (const inc of incidents) {
      const sev = inc.analysis?.severity ?? 3;
      const color = SEVERITY_COLORS[Math.max(0, Math.min(sev - 1, 4))];
      if (inc.blocked_polygon?.length) {
        polysRef.current.push(
          new google.maps.Polygon({
            map,
            paths: inc.blocked_polygon,
            strokeColor: color,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.25,
          })
        );
      }
      if (inc.exec_log?.events) {
        for (const ev of inc.exec_log.events) {
          if (ev.tool === "reroute_traffic" && ev.result?.alternate_polyline) {
            linesRef.current.push(
              new google.maps.Polyline({
                map,
                path: ev.result.alternate_polyline,
                strokeColor: "#22d3ee",
                strokeWeight: 4,
                strokeOpacity: 0.9,
                icons: [
                  {
                    icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 },
                    offset: "100%",
                  },
                ],
              })
            );
          }
        }
      }
    }

    return () => {
      polysRef.current.forEach((p) => p.setMap(null));
      linesRef.current.forEach((l) => l.setMap(null));
      polysRef.current = [];
      linesRef.current = [];
    };
  }, [map, incidents]);

  return null;
}

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f3024" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#334155" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c1a2e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
];
