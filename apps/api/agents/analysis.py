import json
import os
from typing import Optional

from google import genai
from google.genai import types

from ..schemas.models import CandidateIncident, SituationAnalysis


class AnalysisAgent:
    """
    Agent responsible for analyzing a candidate incident (cluster of signals)
    and generating a structured situation analysis.
    """

    def __init__(self, model_name: Optional[str] = None):
        # Falls back to GEMINI_MODEL env, then to gemini-2.5-flash (free-tier friendly).
        self.model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        # Assumes GEMINI_API_KEY is available in the environment
        self.client = genai.Client()

    def analyze(self, incident: CandidateIncident) -> SituationAnalysis:
        """
        Analyzes the candidate incident and returns a structured SituationAnalysis.
        """
        prompt = (
            "You are an expert crisis response analyst. "
            "Analyze the following collection of signals (a candidate incident) "
            "and provide a structured situation analysis including severity, confidence, "
            "estimated affected population, and your reasoning.\n\n"
            f"Incident Data:\n{incident.model_dump_json(indent=2)}"
        )

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SituationAnalysis,
                temperature=0.2,
            ),
        )

        # Parse the JSON response back into a SituationAnalysis model
        return SituationAnalysis.model_validate_json(response.text)
