"""Append-only audit event emitter for SOC 2 traceability.

Every pipeline decision and action is recorded as a JSON line in AUDIT_LOG.
The log is sealed at the end of a run with a SHA-256 hash chain.

Usage:
    from lib.audit import emit, seal

    emit("policy_decision", "policy_engine", slice="foo", context="Portfolio",
         data={"action": "approve", "rule": "auto_low_risk"})
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from .contracts import AUDIT_LOG, AuditEvent

_lock = threading.Lock()
_seq = 0


def _next_seq() -> int:
    global _seq
    with _lock:
        _seq += 1
        return _seq


def emit(
    event: str,
    actor: str,
    *,
    slice: str | None = None,
    context: str | None = None,
    data: dict | None = None,
    inputs_hash: str = "",
    duration_ms: int = 0,
) -> AuditEvent:
    """Append one audit record to AUDIT_LOG. Thread-safe."""
    run_id = os.environ.get("GITHUB_RUN_ID", "local")

    record = AuditEvent(
        ts=datetime.now(timezone.utc).isoformat(),
        run_id=run_id,
        seq=_next_seq(),
        event=event,
        actor=actor,
        slice=slice,
        context=context,
        data=data or {},
        inputs_hash=inputs_hash,
        duration_ms=duration_ms,
    )

    line = json.dumps(record.to_dict(), default=str)

    with _lock:
        with open(AUDIT_LOG, "a") as f:
            f.write(line + "\n")

    return record


def seal(run_id: str, previous_hash: str | None = None) -> dict:
    """Read AUDIT_LOG, compute SHA-256, return sealed bundle.

    The hash chain links this run to the previous run's audit,
    providing tamper-evident integrity across runs.
    """
    events = []
    if AUDIT_LOG.exists():
        for line in AUDIT_LOG.read_text().strip().split("\n"):
            if line.strip():
                events.append(json.loads(line))

    # Hash all events deterministically
    content = json.dumps(events, sort_keys=True, default=str)
    current_hash = hashlib.sha256(content.encode()).hexdigest()

    # Chain: include previous run's hash in the seal
    chain_input = f"{previous_hash or 'genesis'}:{current_hash}"
    chain_hash = hashlib.sha256(chain_input.encode()).hexdigest()

    return {
        "run_id": run_id,
        "sealed_at": datetime.now(timezone.utc).isoformat(),
        "event_count": len(events),
        "sha256": current_hash,
        "chain_hash": chain_hash,
        "previous_run_hash": previous_hash,
        "events": events,
    }


def hash_inputs(*paths: Path) -> str:
    """Compute SHA-256 over a set of input files for traceability."""
    h = hashlib.sha256()
    for p in sorted(paths):
        if p.exists():
            h.update(p.read_bytes())
    return f"sha256:{h.hexdigest()[:16]}"
