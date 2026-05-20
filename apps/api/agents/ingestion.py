"""
IngestionAgent — normalizes heterogeneous input signals into CanonicalSignal.

Two entry points:
    ingest_dict(d)   — already structured (e.g. seed JSON, weather/traffic APIs).
    ingest_raw(...)  — free-form citizen text. Uses Gemini to extract structured_data.

Designed so the seed-driven demo flow works fully deterministically (no LLM calls
required for ingestion) while the live citizen-submit endpoint can opportunistically
enrich text via Gemini.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from .._retry import call_with_retry
from ..schemas.models import CanonicalSignal, GeoLocation, SignalSource


class _IngestionEnrichment(BaseModel):
    """LLM-facing shape used to enrich free-form citizen/social text."""

    urgency: str = Field(description="One of: low, medium, high, critical")
    keywords: List[str] = Field(default_factory=list)
    people_in_danger: int = Field(default=0, ge=0)
    vehicles_stranded: int = Field(default=0, ge=0)
    language: str = Field(default="en", description="ISO 639-1 code or 'ur-en' for mixed")


class IngestionAgent:
    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
        self._client: Optional[genai.Client] = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client()
        return self._client

    def ingest_dict(self, raw: Dict[str, Any]) -> CanonicalSignal:
        """Validate and coerce a dict (seed or API payload) into a CanonicalSignal."""
        return CanonicalSignal.model_validate(raw)

    def ingest_batch(self, raws: List[Dict[str, Any]]) -> List[CanonicalSignal]:
        return [self.ingest_dict(r) for r in raws]

    def ingest_raw(
        self,
        text: str,
        geo: GeoLocation,
        source: SignalSource = SignalSource.citizen_report,
        timestamp: Optional[datetime] = None,
        enrich: bool = True,
    ) -> CanonicalSignal:
        """Build a CanonicalSignal from free-form text. Optionally enrich via Gemini."""
        ts = timestamp or datetime.now(tz=timezone.utc)
        structured: Dict[str, Any] = {}

        if enrich and os.getenv("GEMINI_API_KEY"):
            try:
                structured = self._enrich(text)
            except Exception as exc:  # noqa: BLE001 — non-fatal, fall back to empty
                structured = {"enrichment_error": str(exc)}

        return CanonicalSignal(
            timestamp=ts,
            geo=geo,
            source=source,
            raw_text=text,
            structured_data=structured,
        )

    def _enrich(self, text: str) -> Dict[str, Any]:
        prompt = (
            "Extract structured fields from this informal crisis-related message. "
            "Messages may mix English and Urdu (roman script). "
            "Return JSON matching the schema.\n\nMessage:\n" + text
        )
        response = call_with_retry(
            self.client.models.generate_content,
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_IngestionEnrichment,
                temperature=0.1,
            ),
            label="IngestionAgent",
        )
        return json.loads(response.text)
