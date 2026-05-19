"""
Scenario synthesizer — generates a realistic batch of signals around a
user-clicked point so the orchestrator can run the full pipeline on an
ad-hoc crisis (instead of only the canned seed scenarios).

Deterministic by default (uses a seeded RNG), with optional Gemini-powered
narrative enrichment for the citizen-text fields if a description is given.
"""

from __future__ import annotations

import hashlib
import math
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from .schemas.models import GeoLocation


IncidentType = Literal["flood", "heatwave", "accident", "infrastructure", "blockage"]


# ---------------------------------------------------------------------------
# Templates per incident type
# ---------------------------------------------------------------------------
# Each template is (source, text, structured_data_factory). Templates can
# reference {area} which we fill with the user's description if provided.


def _flood_templates() -> List[Dict[str, Any]]:
    return [
        {
            "source": "weather",
            "text": "PMD: Heavy rainfall recorded at {area} station. {rate}mm/hr in last hour. Advisory upgraded.",
            "structured": lambda rng: {
                "rainfall_mm_per_hr": rng.randint(35, 65),
                "wind_kmh": rng.randint(20, 40),
                "advisory_level": rng.choice(["yellow", "orange", "red"]),
            },
        },
        {
            "source": "traffic",
            "text": "Average speed on {area} dropped from {base} km/h to {now} km/h over last 10 minutes.",
            "structured": lambda rng: {
                "avg_speed_kmh": rng.randint(2, 12),
                "baseline_speed_kmh": rng.randint(30, 45),
                "vehicle_count": rng.randint(60, 220),
                "incident_type": "congestion",
            },
        },
        {
            "source": "citizen_report",
            "text": "{area} ke saamne paani bhar gaya hai. Ankle deep. Cars are stalling.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "water_level_estimate": rng.choice(["ankle", "knee"]),
                "photo_attached": True,
            },
        },
        {
            "source": "social",
            "text": "Trapped in my car near {area} 😭 engine band ho gaya. Help! #UrbanFlooding",
            "structured": lambda rng: {
                "platform": "twitter",
                "user_followers": rng.randint(200, 9000),
                "hashtags": ["UrbanFlooding"],
            },
        },
        {
            "source": "citizen_report",
            "text": "Ground floor of our building flooding at {area}. We have elderly residents. Please send help.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "water_level_estimate": "knee",
                "vulnerable_persons": rng.randint(1, 4),
                "people_in_danger": rng.randint(1, 3),
            },
        },
        {
            "source": "traffic",
            "text": "Multiple stranded vehicles detected near {area}. Camera shows {n} stationary cars in flooded section.",
            "structured": lambda rng: {
                "stranded_vehicles": rng.randint(2, 8),
                "incident_type": "stranded_vehicles",
            },
        },
    ]


def _heatwave_templates() -> List[Dict[str, Any]]:
    return [
        {
            "source": "weather",
            "text": "PMD: Temperature {temp}C at {area} station. Heat index {hi}C. Severe heatwave advisory.",
            "structured": lambda rng: {
                "temperature_c": rng.randint(45, 50),
                "heat_index_c": rng.randint(49, 55),
                "humidity_pct": rng.randint(15, 35),
                "advisory_level": "red",
            },
        },
        {
            "source": "citizen_report",
            "text": "Elderly aunty bench pe behosh hogai hai at {area}. Heatstroke lag raha hai. Ambulance please.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "vulnerable_persons": 1,
                "people_in_danger": 1,
                "medical_emergency": True,
            },
        },
        {
            "source": "social",
            "text": "{area} is COOKING. {temp}C and no electricity. K-Electric is a joke. #Heatwave",
            "structured": lambda rng: {
                "platform": "twitter",
                "user_followers": rng.randint(500, 12000),
                "hashtags": ["Heatwave"],
            },
        },
        {
            "source": "traffic",
            "text": "Power feeder at {area} exceeded rated capacity. Automatic load shedding initiated.",
            "structured": lambda rng: {
                "load_pct": rng.randint(105, 125),
                "estimated_restoration_min": rng.randint(45, 120),
                "affected_consumers": rng.randint(8000, 25000),
            },
        },
        {
            "source": "citizen_report",
            "text": "Rickshaw driver collapsed at {area} junction. Pulse weak. Need medics.",
            "structured": lambda rng: {
                "channel": "voice_call_transcribed",
                "medical_emergency": True,
                "people_in_danger": 1,
            },
        },
        {
            "source": "traffic",
            "text": "Vehicle breakdowns increasing on {area}. {n} cars stationary with hoods up.",
            "structured": lambda rng: {
                "stranded_vehicles": rng.randint(2, 6),
                "incident_type": "vehicle_breakdown",
            },
        },
    ]


def _accident_templates() -> List[Dict[str, Any]]:
    return [
        {
            "source": "citizen_report",
            "text": "MAJOR accident at {area}. Multiple vehicles collided. People trapped. Need ambulances ASAP.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "vehicles_involved": rng.randint(2, 5),
                "people_in_danger": rng.randint(1, 4),
                "medical_emergency": True,
            },
        },
        {
            "source": "traffic",
            "text": "Sudden halt detected via camera at {area}. All lanes blocked. Backup forming rapidly.",
            "structured": lambda rng: {
                "lanes_blocked": rng.randint(2, 4),
                "avg_speed_kmh": 0,
                "baseline_speed_kmh": rng.randint(40, 80),
                "incident_type": "blockage",
            },
        },
        {
            "source": "citizen_report",
            "text": "Smoke coming from one of the vehicles at {area}. Driver unconscious. Fire risk.",
            "structured": lambda rng: {
                "channel": "voice_call_transcribed",
                "fire_risk": True,
                "people_in_danger": rng.randint(2, 4),
                "medical_emergency": True,
            },
        },
        {
            "source": "social",
            "text": "Stuck near {area}. Massive accident, smoke visible. Avoid this route. Pray for injured. 🙏",
            "structured": lambda rng: {
                "platform": "twitter",
                "user_followers": rng.randint(800, 6000),
            },
        },
        {
            "source": "traffic",
            "text": "Congestion at {area} backing up {km}km. Alt route overflow at {pct}% above baseline.",
            "structured": lambda rng: {
                "backup_length_km": round(rng.uniform(1.0, 4.0), 1),
                "avg_speed_kmh": rng.randint(2, 8),
                "alt_route_overflow_pct": rng.randint(25, 55),
            },
        },
        {
            "source": "citizen_report",
            "text": "Civilians pulled people from the wreck at {area}. One bleeding heavily. Need oxygen NOW.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "people_in_danger": rng.randint(1, 3),
                "medical_emergency": True,
            },
        },
    ]


def _infrastructure_templates() -> List[Dict[str, Any]]:
    return [
        {
            "source": "citizen_report",
            "text": "Loud bang and water gushing out at {area}. Looks like water main burst. Road filling up fast.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "infrastructure_type": "water_main",
            },
        },
        {
            "source": "traffic",
            "text": "Pressure drop alert at {area} trunk line. Estimated discharge {rate}L/min. Field crew dispatched.",
            "structured": lambda rng: {
                "pressure_drop_pct": rng.randint(40, 85),
                "discharge_l_per_min": rng.randint(2000, 6000),
            },
        },
        {
            "source": "traffic",
            "text": "Underpass at {area} flooding. Water level {cm}cm. Closed to traffic.",
            "structured": lambda rng: {
                "water_level_cm": rng.randint(20, 60),
                "status": "impassable",
                "incident_type": "flooding",
            },
        },
        {
            "source": "citizen_report",
            "text": "Pure {area} mein paani nahi hai. Buzurg log dehydrate ho rahe. Tanker bhejo please.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "neighborhood_affected": True,
                "vulnerable_persons": rng.randint(3, 10),
            },
        },
        {
            "source": "social",
            "text": "Road is literally sinking at {area}. Crater forming. KWSB infrastructure is crumbling. #BadInfra",
            "structured": lambda rng: {
                "platform": "twitter",
                "user_followers": rng.randint(1000, 20000),
                "hashtags": ["BadInfra"],
            },
        },
        {
            "source": "citizen_report",
            "text": "Hospital access route at {area} blocked. Critical patients incoming — they need an alternate route NOW.",
            "structured": lambda rng: {
                "channel": "voice_call_transcribed",
                "facility_at_risk": "hospital_access",
                "medical_emergency": True,
            },
        },
    ]


def _blockage_templates() -> List[Dict[str, Any]]:
    return [
        {
            "source": "traffic",
            "text": "Road {area} fully blocked. Zero vehicle movement detected for {min} minutes.",
            "structured": lambda rng: {
                "avg_speed_kmh": 0,
                "baseline_speed_kmh": rng.randint(30, 50),
                "incident_type": "blockage",
                "duration_min": rng.randint(5, 30),
            },
        },
        {
            "source": "citizen_report",
            "text": "Protest blocking {area}. Hundreds of people on the road. Police arriving but situation tense.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "incident_type": "protest",
                "crowd_size_estimate": rng.randint(100, 800),
            },
        },
        {
            "source": "social",
            "text": "{area} mein traffic block hai 2 ghante se. Ambulance bhi pass nahi ho rahi. #TrafficBlock",
            "structured": lambda rng: {
                "platform": "twitter",
                "user_followers": rng.randint(500, 8000),
                "hashtags": ["TrafficBlock"],
            },
        },
        {
            "source": "traffic",
            "text": "Construction debris reported on {area}. Two lanes obstructed. Cleanup crew dispatched.",
            "structured": lambda rng: {
                "lanes_blocked": rng.randint(1, 3),
                "incident_type": "debris",
            },
        },
        {
            "source": "citizen_report",
            "text": "Stalled truck at {area} with no driver visible. Causing major back-up. Tow needed.",
            "structured": lambda rng: {
                "channel": "mobile_app",
                "stranded_vehicles": 1,
                "incident_type": "stalled_vehicle",
            },
        },
        {
            "source": "social",
            "text": "Sticking in traffic at {area} for an hour. Why isn't anyone clearing this? 😠",
            "structured": lambda rng: {
                "platform": "facebook",
                "user_followers": rng.randint(200, 3000),
            },
        },
    ]


TEMPLATES: Dict[str, List[Dict[str, Any]]] = {
    "flood": _flood_templates(),
    "heatwave": _heatwave_templates(),
    "accident": _accident_templates(),
    "infrastructure": _infrastructure_templates(),
    "blockage": _blockage_templates(),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def synthesize_signals(
    center: GeoLocation,
    incident_type: IncidentType,
    radius_km: float = 0.5,
    count: int = 8,
    description: Optional[str] = None,
    base_time: Optional[datetime] = None,
    seed: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Generate `count` synthetic signals around `center` for the given incident type.

    The signals are deterministic for a given seed so judges can replay the demo.
    If `description` is provided, it's woven into the citizen-text fields as
    the {area} placeholder so it shows up in the visible incident output.
    """
    if incident_type not in TEMPLATES:
        raise ValueError(
            f"Unknown incident_type '{incident_type}'. "
            f"Expected one of {sorted(TEMPLATES)}"
        )

    templates = TEMPLATES[incident_type]
    base = base_time or datetime.now(tz=timezone.utc)

    # Stable seed so re-runs at the same point produce the same scenario
    if seed is None:
        key = f"{center.lat:.4f},{center.lng:.4f},{incident_type},{radius_km}"
        seed = int(hashlib.sha1(key.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    area_label = (description or "").strip() or "this location"
    signals: List[Dict[str, Any]] = []

    # ensure we cover all sources roughly equally
    seq = list(templates)
    rng.shuffle(seq)
    while len(seq) < count:
        seq.append(rng.choice(templates))

    for i in range(count):
        tmpl = seq[i]
        offset_lat = rng.uniform(-1.0, 1.0) * (radius_km / 111.0)
        offset_lng = rng.uniform(-1.0, 1.0) * (
            radius_km / (111.0 * max(math.cos(math.radians(center.lat)), 0.01))
        )
        structured = tmpl["structured"](rng)
        text = tmpl["text"].format(
            area=area_label,
            rate=structured.get("rainfall_mm_per_hr", rng.randint(30, 60)),
            base=structured.get("baseline_speed_kmh", rng.randint(30, 50)),
            now=structured.get("avg_speed_kmh", rng.randint(2, 10)),
            n=structured.get("stranded_vehicles", rng.randint(2, 6)),
            temp=structured.get("temperature_c", rng.randint(45, 50)),
            hi=structured.get("heat_index_c", rng.randint(49, 55)),
            km=structured.get("backup_length_km", round(rng.uniform(1.0, 3.0), 1)),
            pct=structured.get("alt_route_overflow_pct", rng.randint(25, 50)),
            cm=structured.get("water_level_cm", rng.randint(20, 60)),
            min=structured.get("duration_min", rng.randint(10, 25)),
        )
        signals.append(
            {
                "timestamp": (base + timedelta(minutes=i * 2)).isoformat().replace("+00:00", "Z"),
                "geo": {
                    "lat": round(center.lat + offset_lat, 6),
                    "lng": round(center.lng + offset_lng, 6),
                },
                "source": tmpl["source"],
                "raw_text": text,
                "structured_data": structured,
            }
        )

    return signals
