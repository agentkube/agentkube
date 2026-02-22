"""
KGroot - Knowledge Graph-based Root Cause Analysis

This package implements the KGroot algorithm adapted for AgentKube with a hybrid approach:
- Event extraction from Kubernetes resources, logs, and metrics
- Hybrid correlation discovery (heuristics + LLM)
- Fault Propagation Graph (FPG) construction
- Pattern matching and root cause ranking
"""

from .event_extractor import Event, EventExtractor
from .correlation_engine import (
    RelationType,
    CorrelationResult,
    CorrelationEngine
)
from .fpg_builder import FaultPropagationGraph, FPGBuilder
from .root_cause_analyzer import (
    PatternMatch,
    RankedCause,
    RootCauseResult,
    RootCauseAnalyzer
)

__all__ = [
    # Event extraction
    "Event",
    "EventExtractor",

    # Correlation
    "RelationType",
    "CorrelationResult",
    "CorrelationEngine",

    # FPG
    "FaultPropagationGraph",
    "FPGBuilder",

    # Root cause analysis
    "PatternMatch",
    "RankedCause",
    "RootCauseResult",
    "RootCauseAnalyzer",
]
