import { useEffect, useMemo, useRef } from "react";
import { ColorScheme, Map, useMap } from "@vis.gl/react-google-maps";

import type { CanonicalSignal, IncidentBundle } from "../types";

interface Props {
  signals: CanonicalSignal[];
  incidents: IncidentBundle[];
  selectedClusterId: string | null;
  onSelectIncident: (clusterId: string) => void;
}

const DEFAULT_CENTER = { lat: 24.8007, lng: 67.0731 };

const SOURCE_COLORS: Record<string, string> = {
  weather: "#60a5fa",
  traffic: "#fbbf24",
  social: "#a78bfa",
  citizen_report: "#34d399",
};

const SEVERITY_COLORS = ["#34d399", "#a3e635", "#fbbf24", "#fb923c", "#ef4444"];

export function MapView({
  signals,
  incidents,
  selectedClusterId,
  onSelectIncident,
}: Props) {
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
    >
      <Overlays
        signals={signals}
        incidents={incidents}
        selectedClusterId={selectedClusterId}
        onSelectIncident={onSelectIncident}
      />
    </Map>
  );
}

/**
 * All map overlays are managed imperatively against the underlying
 * google.maps.Map instance. This is robust across @vis.gl/react-google-maps
 * versions where the legacy <Marker> component may or may not be exported.
 */
function Overlays({
  signals,
  incidents,
  selectedClusterId,
  onSelectIncident,
}: Props) {
  const map = useMap();
  const signalMarkersRef = useRef<google.maps.Marker[]>([]);
  const incidentMarkersRef = useRef<google.maps.Marker[]>([]);
  const polysRef = useRef<google.maps.Polygon[]>([]);
  const linesRef = useRef<google.maps.Polyline[]>([]);

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
  }, [map, incidentBoundsKey]);

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
