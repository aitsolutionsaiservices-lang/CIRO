import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from ..agents.analysis import AnalysisAgent
from ..schemas.models import (
    CandidateIncident,
    CanonicalSignal,
    GeoLocation,
    IncidentType,
    SignalSource,
    SituationAnalysis,
)


@pytest.fixture
def sample_incident() -> CandidateIncident:
    return CandidateIncident(
        cluster_id="cluster-123",
        signals=[
            CanonicalSignal(
                signal_id="sig-1",
                source=SignalSource.citizen_report,
                timestamp=datetime.utcnow(),
                geo=GeoLocation(lat=24.8607, lng=67.0011),
                raw_text="The road is completely blocked due to heavy flooding. We need help immediately!",
                structured_data={"urgency": "high"},
            )
        ],
        geo_centroid=GeoLocation(lat=24.8607, lng=67.0011),
        signal_count=1,
    )


@patch("apps.api.agents.analysis.genai.Client")
def test_analyze_incident(mock_client_class, sample_incident):
    # Setup mock Gemini client and response
    mock_client = mock_client_class.return_value
    mock_response = MagicMock()
    
    # Define the mock JSON response matching SituationAnalysis schema
    mock_json = {
        "incident_type": "flood",
        "severity": 4,
        "confidence_pct": 85.5,
        "affected_population": 50,
        "reasoning": "Citizen report indicates heavy flooding with a call for immediate help."
    }
    mock_response.text = json.dumps(mock_json)
    mock_client.models.generate_content.return_value = mock_response

    # Initialize agent and run analysis
    agent = AnalysisAgent()
    result = agent.analyze(sample_incident)

    # Assertions
    assert isinstance(result, SituationAnalysis)
    assert result.incident_type == IncidentType.flood
    assert result.severity == 4
    assert result.confidence_pct == 85.5
    assert result.affected_population == 50
    assert "flooding" in result.reasoning.lower()

    # Verify that the Gemini API was called with structured output enabled
    mock_client.models.generate_content.assert_called_once()
    call_kwargs = mock_client.models.generate_content.call_args.kwargs
    assert call_kwargs["model"] == "gemini-2.5-pro"
    assert call_kwargs["config"].response_schema == SituationAnalysis
    assert call_kwargs["config"].response_mime_type == "application/json"
