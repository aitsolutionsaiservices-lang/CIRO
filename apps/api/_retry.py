"""
Retry helper for transient Gemini API failures.

Gemini-flash sometimes returns:
  * 503 UNAVAILABLE ("model is currently experiencing high demand")
  * 429 RESOURCE_EXHAUSTED (rate limit)
  * 502 / 504 / 500 transient backend errors

Without retry these abort the whole pipeline mid-run, which is a particularly
bad failure mode during a live demo. This helper does exponential backoff
on those errors only — non-transient errors (4xx auth, bad input, etc.) are
raised immediately.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, TypeVar

logger = logging.getLogger("ciro.retry")

T = TypeVar("T")

# Markers we look for in the exception message to decide if a retry is worth it.
_TRANSIENT_MARKERS = (
    " 503", " 504", " 502", " 500", " 429",
    "UNAVAILABLE",
    "RESOURCE_EXHAUSTED",
    "overloaded",
    "high demand",
    "rate limit",
    "DEADLINE_EXCEEDED",
)


def is_transient_error(exc: BaseException) -> bool:
    msg = str(exc)
    return any(marker in msg for marker in _TRANSIENT_MARKERS)


def call_with_retry(
    fn: Callable[..., T],
    *args: Any,
    max_retries: int = 4,
    base_delay: float = 1.5,
    label: str = "gemini",
    **kwargs: Any,
) -> T:
    """
    Call fn(*args, **kwargs); on transient failures, retry with exponential backoff.

    Total wait across 4 retries with base 1.5s: 1.5 + 3 + 6 + 12 = ~22s max.
    Returns the result of fn, or re-raises the last exception if retries are exhausted.
    """
    last_exc: BaseException | None = None
    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 — intentional broad catch
            last_exc = exc
            if not is_transient_error(exc) or attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt)
            logger.warning(
                "%s transient error (attempt %d/%d), retrying in %.1fs: %s",
                label, attempt + 1, max_retries, delay, exc,
            )
            time.sleep(delay)
    # Defensive — should be unreachable because either we returned or re-raised
    assert last_exc is not None
    raise last_exc
