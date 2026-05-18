"""
DetectionAgent — clusters CanonicalSignals into CandidateIncidents.

Greedy spatial+temporal clustering:
    * Two signals are co-cluster candidates if their geo distance ≤ radius_km
      AND their timestamps are within time_window_min.
    * Clusters with at least min_signals members are emitted as CandidateIncidents.

No LLM is involved — this is deterministic so the same inputs always produce
the same incident set (important for demos and tests).
"""

from __future__ import annotations

import math
from datetime import timedelta
from typing import List, Tuple

from ..schemas.models import CandidateIncident, CanonicalSignal, GeoLocation


EARTH_RADIUS_KM = 6371.0


def _haversine_km(a: GeoLocation, b: GeoLocation) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlng = math.radians(b.lng - a.lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


class _Cluster:
    __slots__ = ("signals", "centroid_lat", "centroid_lng", "min_ts", "max_ts")

    def __init__(self, first: CanonicalSignal) -> None:
        self.signals: List[CanonicalSignal] = [first]
        self.centroid_lat = first.geo.lat
        self.centroid_lng = first.geo.lng
        self.min_ts = first.timestamp
        self.max_ts = first.timestamp

    @property
    def centroid(self) -> GeoLocation:
        return GeoLocation(lat=self.centroid_lat, lng=self.centroid_lng)

    def add(self, signal: CanonicalSignal) -> None:
        n = len(self.signals)
        self.centroid_lat = (self.centroid_lat * n + signal.geo.lat) / (n + 1)
        self.centroid_lng = (self.centroid_lng * n + signal.geo.lng) / (n + 1)
        self.signals.append(signal)
        if signal.timestamp < self.min_ts:
            self.min_ts = signal.timestamp
        if signal.timestamp > self.max_ts:
            self.max_ts = signal.timestamp


class DetectionAgent:
    def __init__(
        self,
        radius_km: float = 1.5,
        time_window_min: int = 30,
        min_signals: int = 2,
    ) -> None:
        self.radius_km = radius_km
        self.time_window = timedelta(minutes=time_window_min)
        self.min_signals = min_signals

    def detect(self, signals: List[CanonicalSignal]) -> List[CandidateIncident]:
        if not signals:
            return []

        ordered = sorted(signals, key=lambda s: s.timestamp)
        clusters: List[_Cluster] = []

        for signal in ordered:
            best: Tuple[int, float] | None = None  # (index, distance)
            for idx, cluster in enumerate(clusters):
                if signal.timestamp - cluster.max_ts > self.time_window:
                    continue
                dist = _haversine_km(signal.geo, cluster.centroid)
                if dist > self.radius_km:
                    continue
                if best is None or dist < best[1]:
                    best = (idx, dist)
            if best is None:
                clusters.append(_Cluster(signal))
            else:
                clusters[best[0]].add(signal)

        incidents: List[CandidateIncident] = []
        for idx, cluster in enumerate(clusters):
            if len(cluster.signals) < self.min_signals:
                continue
            cluster_id = self._make_cluster_id(cluster, idx)
            incidents.append(
                CandidateIncident(
                    cluster_id=cluster_id,
                    signals=cluster.signals,
                    geo_centroid=cluster.centroid,
                    signal_count=len(cluster.signals),
                )
            )
        return incidents

    @staticmethod
    def _make_cluster_id(cluster: _Cluster, idx: int) -> str:
        stamp = cluster.min_ts.strftime("%Y%m%dT%H%M%SZ")
        return f"inc-{stamp}-{idx:02d}"
