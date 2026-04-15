"""Shared contracts for CI pipeline v3.

Every stage reads/writes through these paths and dataclasses.
This is the single source of truth for inter-stage communication.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

# ── Temp file paths (shared between stages) ─────────────────────
GENERATE_OUTPUT     = Path("/tmp/generate-output.json")
RISK_SCORES         = Path("/tmp/risk-scores.json")
DECISIONS           = Path("/tmp/decisions.json")
CLAUDE_STATS        = Path("/tmp/claude-stats.json")
CLAUDE_SUMMARY      = Path("/tmp/claude-summary.txt")
VERIFY_RESULTS      = Path("/tmp/verify-results.json")
TEST_OUTPUT         = Path("/tmp/test-output.txt")
TEST_RESULTS        = Path("/tmp/test-results.json")
CLARIFICATIONS      = Path("/tmp/clarifications.json")
CLASSIFICATION      = Path("/tmp/classification.json")
REPAIR_RESULTS      = Path("/tmp/repair-results.json")
CONFIDENCE          = Path("/tmp/confidence.json")
REVIEW_GUIDE        = Path("/tmp/review-guide.json")
REVIEW_GUIDE_MD     = Path("/tmp/review-guide.md")
SLICE_METRICS       = Path("/tmp/slice-metrics.jsonl")
DIFF_SUMMARY        = Path("/tmp/diff-summary.json")
DISCUSSION_LINKS    = Path("/tmp/discussion-links.json")
CLARIFICATION_ANSWERS = Path("/tmp/clarification-answers.json")
USAGE_REPORT        = Path("/tmp/usage-report.json")
USAGE_REPORT_MD     = Path("/tmp/usage-report.md")
AUDIT_LOG           = Path("/tmp/audit.jsonl")
AUDIT_BUNDLE        = Path("/tmp/audit-bundle.json")


def slice_stats_path(name: str) -> Path:
    return Path(f"/tmp/slice-stats-{name}.json")


def slice_claude_output(name: str) -> Path:
    return Path(f"/tmp/claude-{name}.json")


# ── Config paths ─────────────────────────────────────────────────
CI_DIR              = Path(__file__).parent.parent
CONFIG_DIR          = CI_DIR / "config"
POLICY_CONFIG       = CONFIG_DIR / "policy.json"
PIPELINE_CONFIG     = CONFIG_DIR / "pipeline.json"
RISK_FACTORS_CONFIG = CONFIG_DIR / "risk_factors.json"

# Skills paths (unchanged — these are evdb tools, not CI scripts)
SKILLS_DIR          = CI_DIR.parent / ".claude" / "skills"
DIFF_SCRIPT         = SKILLS_DIR / "evdb-diff" / "scripts" / "evdb_diff.py"
SCAFFOLD_SCRIPT     = SKILLS_DIR / "evdb-scaffold" / "scripts" / "evdb_scaffold.py"
NORMALIZE_SCRIPT    = SKILLS_DIR / "evdb-normalize" / "scripts" / "normalize_slice.py"
VERIFY_SCRIPT       = SKILLS_DIR / "evdb-verify" / "scripts" / "verify_slice.py"


# ── Enums ────────────────────────────────────────────────────────

class PolicyAction(str, Enum):
    APPROVE  = "approve"
    GATE     = "gate"       # approve but force draft PR + human review
    BLOCK    = "block"      # skip this slice entirely
    ESCALATE = "escalate"   # requires manual workflow_dispatch

class RepairLevel(int, Enum):
    L1_DETERMINISTIC = 1
    L2_BOUNDED_AI    = 2
    L3_EXPANDED_AI   = 3
    L4_HUMAN         = 4

class ConfidenceBand(str, Enum):
    HIGH    = "HIGH"
    MEDIUM  = "MEDIUM"
    LOW     = "LOW"
    BLOCKED = "BLOCKED"

class RiskBand(str, Enum):
    LOW      = "low"
    MODERATE = "moderate"
    HIGH     = "high"
    CRITICAL = "critical"


# ── Dataclasses ──────────────────────────────────────────────────

@dataclass
class RiskFactor:
    name: str
    raw: Any
    normalized: float       # 0.0–1.0
    weight: float
    contributed: float      # normalized × weight

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RiskScore:
    slice: str
    context: str
    score: float            # 0.0–1.0 weighted sum
    band: str               # low | moderate | high | critical
    factors: list[RiskFactor] = field(default_factory=list)
    blast_radius: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PolicyDecision:
    slice: str
    context: str
    action: str             # approve | gate | block | escalate
    rule_matched: str
    reason: str
    model: str              # "sonnet" | "opus" | "auto"
    model_id: str           # exact API model string
    max_budget_usd: float
    max_turns: int
    repair_depth: int       # max repair ladder level (1–4)
    pr_mode: str            # "ready" | "draft"
    risk_score: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RepairAttempt:
    level: int
    level_name: str
    strategy: str
    resolved: bool
    ai_used: bool = False
    model: str = ""
    files_touched: list[str] = field(default_factory=list)
    diff_lines: int = 0
    turns: int = 0
    duration_s: float = 0.0
    cost_usd: float = 0.0
    detail: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RepairResult:
    slice: str
    failure_class: str
    resolved: bool
    resolved_at_level: int       # 0 if unresolved
    attempts: list[RepairAttempt] = field(default_factory=list)
    total_cost_usd: float = 0.0
    total_duration_s: float = 0.0
    human_escalation: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ConfidenceEvidence:
    signal: str
    weight: int
    contributed: int
    awarded: bool
    source: str
    detail: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ConfidenceScore:
    slice: str
    score: int
    band: str
    recommended_action: str
    evidence: list[ConfidenceEvidence] = field(default_factory=list)
    counterfactuals: list[dict] = field(default_factory=list)
    historical: dict = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    signals: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AuditEvent:
    ts: str                  # ISO 8601
    run_id: str
    seq: int
    event: str               # event type name
    actor: str               # which component
    slice: str | None = None
    context: str | None = None
    data: dict = field(default_factory=dict)
    inputs_hash: str = ""
    duration_ms: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


# ── Helpers ──────────────────────────────────────────────────────

def load_json(path: Path | str) -> dict | list:
    """Load JSON file, return empty dict on failure."""
    p = Path(path)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, ValueError):
        return {}


def load_config(path: Path) -> dict:
    """Load a config JSON file. Fail hard if missing (configs are required)."""
    if not path.exists():
        raise FileNotFoundError(f"Required config not found: {path}")
    return json.loads(path.read_text())


def write_json(path: Path, data: Any) -> None:
    """Write JSON to file with consistent formatting."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")


def set_output(key: str, value: str) -> None:
    """Write a key=value pair to GITHUB_OUTPUT."""
    import os
    gh_output = os.environ.get("GITHUB_OUTPUT", "")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"{key}={value}\n")
