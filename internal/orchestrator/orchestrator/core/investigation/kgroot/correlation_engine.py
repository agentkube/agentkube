"""
Correlation Engine for KGroot - Hybrid Approach (Heuristics + LLM)

This module discovers causal and sequential relationships between events using:
Tier 1: Fast heuristic rules (temporal, location-based)
Tier 2: Known Kubernetes patterns
Tier 3: LLM reasoning for complex/ambiguous cases
"""

from enum import Enum
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel

from .event_extractor import Event


class RelationType(Enum):
    CAUSAL = "causal"  # A causes B
    SEQUENTIAL = "sequential"  # A before B, not causal
    NONE = "none"  # No relationship
    
class RelationshipSchema(BaseModel):
    relationship: RelationType
    confidence: float
    reasoning: str


@dataclass
class CorrelationResult:
    """Result of relationship classification"""
    relation: RelationType
    confidence: float  # 0.0 - 1.0
    reasoning: str
    method: str  # "heuristic" | "pattern" | "llm"
    time_diff_seconds: float
    same_location: bool


class CorrelationEngine:
    """Hybrid relationship discovery: Heuristics LLM escalation"""

    def __init__(self, openai_client=None, model_name: str = "openai/gpt-4o-mini", config: Optional[Dict] = None):
        self.openai_client = openai_client
        self.model_name = model_name
        self.config = config or self._default_config()
        self.k8s_patterns = self._load_k8s_patterns()

    def _default_config(self) -> Dict:
        """Default configuration"""
        return {
            "llm_escalation_threshold": 0.6,
            "immediate_causation_threshold": 5,  # seconds
            "short_term_causation_threshold": 30,  # seconds
            "long_term_threshold": 300,  # 5 minutes
        }

    def _load_k8s_patterns(self) -> List[Dict]:
        """Load known Kubernetes causal patterns"""
        return [
            # ============================================
            # Resource Exhaustion Patterns
            # ============================================
            {
                "name": "CPU_TO_MEMORY_PRESSURE",
                "from_event": "CPU_SPIKE",
                "to_event": "MEMORY_PRESSURE",
                "max_time_diff": 30,
                "same_location": True,
                "confidence": 0.85
            },
            {
                "name": "MEMORY_TO_OOM",
                "from_event": "MEMORY_PRESSURE",
                "to_event": "OOM_KILLED",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.95
            },
            {
                "name": "OOM_TO_POD_CRASH",
                "from_event": "OOM_KILLED",
                "to_event": "POD_LIFECYCLE_FAILURE",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.98
            },
            {
                "name": "OOM_TO_CRASH_LOOP",
                "from_event": "OOM_KILLED",
                "to_event": "POD_CRASH_LOOP",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.98
            },

            # ============================================
            # Image/Registry Patterns
            # ============================================
            {
                "name": "IMAGE_PULL_TO_CRASH_LOOP",
                "from_event": "IMAGE_PULL_FAILURE",
                "to_event": "POD_CRASH_LOOP",
                "max_time_diff": 2,
                "same_location": True,
                "confidence": 0.99
            },
            {
                "name": "INVALID_IMAGE_TO_PULL_FAILURE",
                "from_event": "INVALID_IMAGE_NAME",
                "to_event": "IMAGE_PULL_FAILURE",
                "max_time_diff": 2,
                "same_location": True,
                "confidence": 0.95
            },
            {
                "name": "REGISTRY_UNAVAILABLE_TO_PULL_FAILURE",
                "from_event": "REGISTRY_UNAVAILABLE",
                "to_event": "IMAGE_PULL_FAILURE",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.92
            },

            # ============================================
            # Node Pressure Patterns
            # ============================================
            {
                "name": "NODE_PRESSURE_TO_POD_EVICTED",
                "from_event": "NODE_PRESSURE",
                "to_event": "POD_EVICTED",
                "max_time_diff": 60,
                "same_location": False,  # Different resources (node → pod)
                "confidence": 0.90
            },
            {
                "name": "NODE_NOT_READY_TO_POD_FAILURE",
                "from_event": "NODE_NOT_READY",
                "to_event": "POD_LIFECYCLE_FAILURE",
                "max_time_diff": 30,
                "same_location": False,
                "confidence": 0.88
            },
            {
                "name": "KUBELET_NOT_READY_TO_NODE_NOT_READY",
                "from_event": "KUBELET_NOT_READY",
                "to_event": "NODE_NOT_READY",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.95
            },
            {
                "name": "OUT_OF_DISK_TO_POD_EVICTED",
                "from_event": "OUT_OF_DISK",
                "to_event": "POD_EVICTED",
                "max_time_diff": 30,
                "same_location": False,
                "confidence": 0.93
            },

            # ============================================
            # Volume/Storage Patterns
            # ============================================
            {
                "name": "VOLUME_PROVISIONING_TO_BINDING_FAILURE",
                "from_event": "VOLUME_PROVISIONING_FAILURE",
                "to_event": "VOLUME_BINDING_FAILURE",
                "max_time_diff": 10,
                "same_location": False,
                "confidence": 0.90
            },
            {
                "name": "VOLUME_BINDING_TO_MOUNT_FAILURE",
                "from_event": "VOLUME_BINDING_FAILURE",
                "to_event": "VOLUME_MOUNT_FAILURE",
                "max_time_diff": 15,
                "same_location": True,
                "confidence": 0.92
            },
            {
                "name": "VOLUME_MOUNT_TO_POD_PENDING",
                "from_event": "VOLUME_MOUNT_FAILURE",
                "to_event": "SCHEDULING_FAILURE",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.88
            },
            {
                "name": "VOLUME_ATTACH_TO_MOUNT_FAILURE",
                "from_event": "VOLUME_ATTACH_FAILURE",
                "to_event": "VOLUME_MOUNT_FAILURE",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.90
            },

            # ============================================
            # Network Patterns
            # ============================================
            {
                "name": "DNS_TO_CONNECTION_TIMEOUT",
                "from_event": "DNS_FAILURE",
                "to_event": "HEALTH_CHECK_FAILURE",
                "max_time_diff": 15,
                "same_location": False,
                "confidence": 0.80
            },
            {
                "name": "DNS_RESOLUTION_TO_ENDPOINT_FAILURE",
                "from_event": "DNS_RESOLUTION_FAILURE",
                "to_event": "ENDPOINT_CREATE_FAILURE",
                "max_time_diff": 10,
                "same_location": False,
                "confidence": 0.82
            },
            {
                "name": "NETWORK_NOT_READY_TO_DNS_FAILURE",
                "from_event": "NETWORK_NOT_READY",
                "to_event": "DNS_FAILURE",
                "max_time_diff": 20,
                "same_location": False,
                "confidence": 0.85
            },
            {
                "name": "ENDPOINT_CREATE_TO_SERVICE_UNAVAILABLE",
                "from_event": "ENDPOINT_CREATE_FAILURE",
                "to_event": "HEALTH_CHECK_FAILURE",
                "max_time_diff": 10,
                "same_location": False,
                "confidence": 0.87
            },

            # ============================================
            # Scheduling Patterns
            # ============================================
            {
                "name": "INSUFFICIENT_MEMORY_TO_SCHEDULING_FAILURE",
                "from_event": "INSUFFICIENT_MEMORY",
                "to_event": "SCHEDULING_FAILURE",
                "max_time_diff": 5,
                "same_location": False,
                "confidence": 0.95
            },
            {
                "name": "INSUFFICIENT_CPU_TO_SCHEDULING_FAILURE",
                "from_event": "INSUFFICIENT_CPU",
                "to_event": "SCHEDULING_FAILURE",
                "max_time_diff": 5,
                "same_location": False,
                "confidence": 0.95
            },
            {
                "name": "QUOTA_EXCEEDED_TO_RESOURCE_CREATE_FAILURE",
                "from_event": "QUOTA_EXCEEDED",
                "to_event": "RESOURCE_CREATE_FAILURE",
                "max_time_diff": 2,
                "same_location": False,
                "confidence": 0.93
            },

            # ============================================
            # Health Check Patterns
            # ============================================
            {
                "name": "LIVENESS_PROBE_TO_POD_RESTART",
                "from_event": "LIVENESS_PROBE_FAILURE",
                "to_event": "POD_TERMINATION",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.98
            },
            {
                "name": "READINESS_PROBE_TO_ENDPOINT_REMOVE",
                "from_event": "READINESS_PROBE_FAILURE",
                "to_event": "ENDPOINT_UPDATE_FAILURE",
                "max_time_diff": 5,
                "same_location": False,
                "confidence": 0.90
            },
            {
                "name": "STARTUP_PROBE_TO_POD_FAILURE",
                "from_event": "STARTUP_PROBE_FAILURE",
                "to_event": "POD_LIFECYCLE_FAILURE",
                "max_time_diff": 30,
                "same_location": True,
                "confidence": 0.85
            },

            # ============================================
            # Container Lifecycle Patterns
            # ============================================
            {
                "name": "SANDBOX_CREATE_TO_CONTAINER_CREATE_FAILURE",
                "from_event": "POD_SANDBOX_FAILURE",
                "to_event": "CONTAINER_CREATE_FAILURE",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.92
            },
            {
                "name": "CONFIG_ERROR_TO_CONTAINER_CREATE_FAILURE",
                "from_event": "CONFIGURATION_ERROR",
                "to_event": "CONTAINER_CREATE_FAILURE",
                "max_time_diff": 2,
                "same_location": True,
                "confidence": 0.95
            },
            {
                "name": "CONTAINER_CREATE_TO_CRASH_LOOP",
                "from_event": "CONTAINER_CREATE_FAILURE",
                "to_event": "POD_CRASH_LOOP",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.90
            },
            {
                "name": "RUNTIME_ERROR_TO_POD_CRASH",
                "from_event": "CONTAINER_RUNTIME_ERROR",
                "to_event": "POD_CRASH_LOOP",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.93
            },

            # ============================================
            # Hooks Patterns
            # ============================================
            {
                "name": "PRESTOP_HOOK_TO_FAILED_KILL",
                "from_event": "PRESTOP_HOOK_FAILURE",
                "to_event": "FAILED_KILL_POD",
                "max_time_diff": 30,
                "same_location": True,
                "confidence": 0.85
            },
            {
                "name": "POSTSTART_HOOK_TO_CONTAINER_FAILURE",
                "from_event": "POSTSTART_HOOK_FAILURE",
                "to_event": "CONTAINER_CREATE_FAILURE",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.88
            },

            # ============================================
            # Security/RBAC Patterns
            # ============================================
            {
                "name": "RBAC_TO_RESOURCE_CREATE_FAILURE",
                "from_event": "RBAC_PERMISSION_DENIED",
                "to_event": "RESOURCE_CREATE_FAILURE",
                "max_time_diff": 2,
                "same_location": False,
                "confidence": 0.95
            },
            {
                "name": "SECURITY_CONTEXT_TO_SANDBOX_FAILURE",
                "from_event": "SECURITY_CONTEXT_DENIED",
                "to_event": "POD_SANDBOX_FAILURE",
                "max_time_diff": 5,
                "same_location": True,
                "confidence": 0.90
            },

            # ============================================
            # Eviction Patterns
            # ============================================
            {
                "name": "POD_EVICTED_TO_SCHEDULING_FAILURE",
                "from_event": "POD_EVICTED",
                "to_event": "SCHEDULING_FAILURE",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.80
            },
            {
                "name": "POD_PREEMPTED_TO_SCHEDULING_FAILURE",
                "from_event": "POD_PREEMPTED",
                "to_event": "SCHEDULING_FAILURE",
                "max_time_diff": 10,
                "same_location": True,
                "confidence": 0.82
            },
        ]

    async def classify_relationship(
        self,
        event_a: Event,
        event_b: Event,
        context: Optional[List[Event]] = None
    ) -> CorrelationResult:
        """
        Classify relationship between two events
        Tier 1: Try fast heuristics
        Tier 2: Try pattern matching
        Tier 3: Escalate to LLM if needed
        """

        # Calculate basic properties
        time_diff = (event_b.timestamp - event_a.timestamp).total_seconds()
        same_location = event_a.location == event_b.location

        # TIER 1 & 2: Try heuristic rules
        heuristic_result = self._apply_heuristic_rules(event_a, event_b, time_diff, same_location)

        # Check if LLM escalation needed
        if heuristic_result.confidence >= self.config["llm_escalation_threshold"]:
            return heuristic_result

        # TIER 3: LLM reasoning for low-confidence cases
        if self.openai_client:
            try:
                llm_result = await self.classify_with_llm(event_a, event_b, context)
                return llm_result
            except Exception as e:
                print(f"LLM classification failed: {e}, falling back to heuristic")
                # Fall back to heuristic result if LLM fails
                return heuristic_result

        return heuristic_result

    def _apply_heuristic_rules(
        self,
        event_a: Event,
        event_b: Event,
        time_diff: float,
        same_location: bool
    ) -> CorrelationResult:
        """Apply heuristic rules for relationship classification"""

        # TIER 2: Check known K8s patterns first
        for pattern in self.k8s_patterns:
            if (pattern["from_event"] == event_a.abstract_type and
                pattern["to_event"] == event_b.abstract_type and
                time_diff <= pattern["max_time_diff"] and
                (not pattern["same_location"] or same_location)):

                return CorrelationResult(
                    relation=RelationType.CAUSAL,
                    confidence=pattern["confidence"],
                    reasoning=f"Matched known pattern: {pattern['name']}",
                    method="pattern",
                    time_diff_seconds=time_diff,
                    same_location=same_location
                )

        # TIER 1: Temporal correlation for same location
        if same_location:
            if time_diff <= self.config["immediate_causation_threshold"]:
                return CorrelationResult(
                    relation=RelationType.CAUSAL,
                    confidence=0.75,
                    reasoning=f"Same location, immediate succession (<{self.config['immediate_causation_threshold']}s)",
                    method="heuristic",
                    time_diff_seconds=time_diff,
                    same_location=same_location
                )
            elif time_diff <= self.config["short_term_causation_threshold"]:
                return CorrelationResult(
                    relation=RelationType.SEQUENTIAL,
                    confidence=0.6,
                    reasoning=f"Same location, short time gap (<{self.config['short_term_causation_threshold']}s)",
                    method="heuristic",
                    time_diff_seconds=time_diff,
                    same_location=same_location
                )

        # Default - no relationship
        return CorrelationResult(
            relation=RelationType.NONE,
            confidence=0.4,
            reasoning="No heuristic match found",
            method="heuristic",
            time_diff_seconds=time_diff,
            same_location=same_location
        )

    async def classify_with_llm(
        self,
        event_a: Event,
        event_b: Event,
        context: Optional[List[Event]]
    ) -> CorrelationResult:
        """LLM-based classification for complex cases"""
        from agents import Agent, Runner, OpenAIChatCompletionsModel, ModelSettings
        from orchestrator.core.prompt.correlation_prompt import CORRELATION_SYSTEM_INSTRUCTION

        print(f"[CorrelationEngine] 🤖 LLM escalation: {event_a.abstract_type} -> {event_b.abstract_type}")

        # Build the user prompt with specific event details
        user_prompt = self._build_relationship_prompt(event_a, event_b, context)

        print(f"[CorrelationEngine] Calling LLM with model: {self.model_name}")

        # Create agent for classification with system instruction
        correlation_agent = Agent(
            name="KGroot: Correlation Classifier",
            instructions=CORRELATION_SYSTEM_INSTRUCTION,
            model=OpenAIChatCompletionsModel(
                model=self.model_name,
                openai_client=self.openai_client
            ),
            output_type=RelationshipSchema,
            model_settings=ModelSettings(
                parallel_tool_calls=False,
                temperature=0.1,
                extra_headers={
                    "HTTP-Referer": "https://agentkube.com",
                    "X-Title": "Agentkube"
                }
            ),
            tools=[]  # No tools needed
        )

        result = await Runner.run(correlation_agent, input=user_prompt, max_turns=1)

        print(f"[CorrelationEngine] LLM response: {result.final_output}")
        response_text = result.final_output if hasattr(result, 'final_output') else str(result)

        print(f"[CorrelationEngine] LLM response confidence: {response_text.model_dump()['confidence']}, reasoning: {response_text.model_dump()['reasoning']}")
        relationship = response_text.model_dump()['relationship']
        print("[CorrelationEngine] Relationship: ", relationship)
        # Parse LLM response
        parsed_result = self._parse_llm_response(response_text.model_dump()['relationship'], response_text.model_dump()['confidence'], response_text.model_dump()['reasoning'], event_a, event_b)
        parsed_result.method = "llm"

        return parsed_result

    def _build_relationship_prompt(
        self,
        event_a: Event,
        event_b: Event,
        context: Optional[List[Event]]
    ) -> str:
        """Build prompt for LLM relationship classification"""
        
        # TODO context is should be the complete investigation done or chat history of the investigation

        time_diff = (event_b.timestamp - event_a.timestamp).total_seconds()

        prompt = f"""
You are a Kubernetes fault analysis expert. Determine the relationship between two events.

Event A (earlier):
- Type: {event_a.abstract_type}
- Time: {event_a.timestamp}
- Location: {event_a.location}
- Details: {event_a.details}

Event B (later):
- Type: {event_b.abstract_type}
- Time: {event_b.timestamp}
- Location: {event_b.location}
- Details: {event_b.details}

Time difference: {time_diff:.1f} seconds
Same location: {event_a.location == event_b.location}

Classify the relationship:
1. **CAUSAL**: Event A directly caused Event B to occur
2. **SEQUENTIAL**: Event A happened before B, but didn't cause it
3. **NONE**: No meaningful relationship

Consider:
- Temporal proximity (closer in time = more likely causal)
- Same location/resource (same pod/node = more likely causal)
- Known Kubernetes failure patterns
- Causality logic (can A realistically cause B?)

Response format (JSON):
{{
  "relationship": "CAUSAL|SEQUENTIAL|NONE",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}}
"""
        return prompt

    def _parse_llm_response(
        self,
        relationship: RelationType,
        confidence: float,
        reasoning: str,
        event_a: Event,
        event_b: Event
    ) -> CorrelationResult:
        """Parse LLM response into CorrelationResult"""

        # Simple parsing (in production, use JSON parsing with error handling)
        time_diff = (event_b.timestamp - event_a.timestamp).total_seconds()
        same_location = event_a.location == event_b.location

        # Convert to enum if it's a string
        if isinstance(relationship, str):
            relation_value = relationship
        else:
            relation_value = relationship.value if hasattr(relationship, 'value') else relationship

        # Default fallback
        return CorrelationResult(
            relation=relation_value,
            confidence=confidence,
            reasoning=reasoning,
            method="llm",
            time_diff_seconds=time_diff,
            same_location=same_location
        )

    async def find_causal_chain(
        self,
        events: List[Event]
    ) -> List[Tuple[Event, Event, CorrelationResult]]:
        """Find all causal relationships in event sequence"""

        relationships = []

        # Sort events chronologically
        sorted_events = sorted(events, key=lambda e: e.timestamp)

        print(f"[CorrelationEngine] Analyzing {len(sorted_events)} events for causal relationships...")

        for i, event_a in enumerate(sorted_events):
            for event_b in sorted_events[i+1:]:
                print(f"[CorrelationEngine] Classifying: {event_a.abstract_type} -> {event_b.abstract_type}")

                result = await self.classify_relationship(
                    event_a, event_b, context=sorted_events
                )

                # Handle both enum and string values for result.relation
                relation_value = result.relation.value if hasattr(result.relation, 'value') else result.relation
                print(f"[CorrelationEngine] Result: {relation_value} (confidence: {result.confidence:.2f}, method: {result.method})")

                if result.relation == RelationType.CAUSAL or result.relation == RelationType.CAUSAL.value:
                    relationships.append((event_a, event_b, result))
                    print(f"[CorrelationEngine] ✓ CAUSAL relationship found!")

        print(f"[CorrelationEngine] Analysis complete. Found {len(relationships)} causal relationships.")
        return relationships
