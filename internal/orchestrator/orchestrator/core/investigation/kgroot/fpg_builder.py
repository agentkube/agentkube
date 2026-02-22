"""
Fault Propagation Graph (FPG) Builder - KGroot Algorithm 1

Implements the FPG construction algorithm from the KGroot paper:
- Iteratively builds graph by adding events in chronological order
- Uses correlation engine to determine relationships
- Identifies root causes (events with no incoming causal edges)
"""

from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field
from datetime import datetime

from .event_extractor import Event
from .correlation_engine import CorrelationEngine, RelationType, CorrelationResult


@dataclass
class FaultPropagationGraph:
    """Directed graph of fault propagation"""

    nodes: Dict[str, Event] = field(default_factory=dict)  # event_id -> Event
    edges: List[Tuple[str, str, str]] = field(default_factory=list)  # (source_id, target_id, relation_type)
    root_causes: List[str] = field(default_factory=list)  # List of root cause event IDs

    def add_event(self, event: Event):
        """Add event as a node"""
        self.nodes[event.id] = event

    def add_relationship(self, source: Event, target: Event, relation: RelationType):
        """Add relationship edge between events"""
        self.edges.append((source.id, target.id, relation.value))

    def get_incoming_edges(self, event_id: str) -> List[Tuple[str, str, str]]:
        """Get all incoming edges to an event"""
        return [(src, tgt, rel) for src, tgt, rel in self.edges if tgt == event_id]

    def get_outgoing_edges(self, event_id: str) -> List[Tuple[str, str, str]]:
        """Get all outgoing edges from an event"""
        return [(src, tgt, rel) for src, tgt, rel in self.edges if src == event_id]

    def get_causal_chains(self) -> List[List[Event]]:
        """Get all causal chains from root causes to leaf events"""
        chains = []

        for root_id in self.root_causes:
            chain = self._build_chain_from_root(root_id)
            if chain:
                chains.append(chain)

        return chains

    def _build_chain_from_root(self, event_id: str, visited: Optional[Set[str]] = None) -> List[Event]:
        """Build causal chain starting from a root cause"""
        if visited is None:
            visited = set()

        if event_id in visited:
            return []  # Avoid cycles

        visited.add(event_id)
        chain = [self.nodes[event_id]]

        # Get causal outgoing edges
        causal_edges = [
            (src, tgt, rel) for src, tgt, rel in self.get_outgoing_edges(event_id)
            if rel == "causal"
        ]

        # Follow the first causal edge (could be extended to handle multiple paths)
        if causal_edges:
            next_event_id = causal_edges[0][1]
            chain.extend(self._build_chain_from_root(next_event_id, visited))

        return chain

    def to_dict(self) -> Dict:
        """Convert FPG to dictionary format for storage"""
        return {
            "nodes": [
                {
                    "id": event.id,
                    "event_type": event.abstract_type,
                    "location": event.location,
                    "timestamp": event.timestamp.isoformat(),
                    "severity": event.severity,
                    "details": event.details
                }
                for event in self.nodes.values()
            ],
            "edges": [
                {
                    "from": src,
                    "to": tgt,
                    "relation_type": rel
                }
                for src, tgt, rel in self.edges
            ],
            "root_causes": self.root_causes
        }


class FPGBuilder:
    """Build FPGs using Algorithm 1 from KGroot paper"""

    def __init__(self, correlation_engine: CorrelationEngine):
        self.correlation_engine = correlation_engine

    async def build_fpg(
        self,
        events: List[Event],
        max_associated_events: int = 5
    ) -> FaultPropagationGraph:
        """
        Build Fault Propagation Graph from events

        Algorithm 1 from KGroot paper:
        1. Sort events chronologically
        2. Initialize empty FPG
        3. For each event in sequence:
           a. If FPG empty, add as first node
           b. Else:
              - Find candidate relationships with existing events
              - Use correlation engine to score and classify each candidate
              - Add best relationship if confidence > threshold
              - Otherwise, add as isolated node
        4. Identify root causes (nodes with no incoming causal edges)

        Args:
            events: List of events to process
            max_associated_events: Maximum number of events to consider for relationships

        Returns:
            FaultPropagationGraph
        """

        # Step 1: Sort events chronologically
        sorted_events = sorted(events, key=lambda e: e.timestamp)

        # Step 2: Initialize empty FPG
        fpg = FaultPropagationGraph()

        # Step 3: Iteratively add events
        for event in sorted_events:
            if not fpg.nodes:
                # First event - add directly
                fpg.add_event(event)
            else:
                # Find best relationship with existing events
                best_relationship = await self._find_best_relationship(
                    event,
                    fpg,
                    max_associated_events
                )

                # Add event to graph
                fpg.add_event(event)

                # Add relationship if found
                if best_relationship:
                    source_event, relation_result = best_relationship
                    if relation_result.relation == RelationType.CAUSAL:
                        fpg.add_relationship(source_event, event, relation_result.relation)
                    elif relation_result.relation == RelationType.SEQUENTIAL:
                        fpg.add_relationship(source_event, event, relation_result.relation)

        # Step 4: Identify root causes
        fpg.root_causes = self._identify_root_causes(fpg)

        return fpg

    async def _find_best_relationship(
        self,
        new_event: Event,
        fpg: FaultPropagationGraph,
        max_candidates: int
    ) -> Optional[Tuple[Event, CorrelationResult]]:
        """
        Find the best relationship for a new event

        Args:
            new_event: Event to find relationship for
            fpg: Current FPG
            max_candidates: Maximum number of candidate events to consider

        Returns:
            Tuple of (source_event, correlation_result) or None
        """

        # Get candidate events (recent events, limited by max_candidates)
        candidate_events = self._get_candidate_events(fpg, new_event, max_candidates)

        if not candidate_events:
            return None

        # Evaluate each candidate
        best_score = 0.0
        best_relationship = None

        for candidate in candidate_events:
            # Classify relationship using correlation engine
            result = await self.correlation_engine.classify_relationship(
                candidate,
                new_event,
                context=list(fpg.nodes.values())
            )

            # Keep track of best relationship
            if result.confidence > best_score:
                best_score = result.confidence
                best_relationship = (candidate, result)

        # Return best relationship if confidence is sufficient
        if best_relationship and best_score > 0.5:  # Threshold
            return best_relationship

        return None

    def _get_candidate_events(
        self,
        fpg: FaultPropagationGraph,
        new_event: Event,
        max_candidates: int
    ) -> List[Event]:
        """
        Get candidate events that could be related to new event

        Strategy:
        - Prioritize recent events (closer in time)
        - Prioritize events at same location
        - Limit to max_candidates to avoid O(n^2) complexity
        """

        # Get all events sorted by recency
        all_events = sorted(
            fpg.nodes.values(),
            key=lambda e: abs((e.timestamp - new_event.timestamp).total_seconds())
        )

        # Filter events that occurred before new_event
        candidates = [
            e for e in all_events
            if e.timestamp < new_event.timestamp
        ]

        # Prioritize same location
        same_location = [e for e in candidates if e.location == new_event.location]
        diff_location = [e for e in candidates if e.location != new_event.location]

        # Return top candidates (same location first)
        return (same_location + diff_location)[:max_candidates]

    def _identify_root_causes(self, fpg: FaultPropagationGraph) -> List[str]:
        """
        Identify root causes in the FPG

        Root causes are events with NO incoming causal edges
        (they are the starting point of fault propagation)
        """

        root_causes = []

        for event_id in fpg.nodes.keys():
            incoming_causal = [
                edge for edge in fpg.get_incoming_edges(event_id)
                if edge[2] == "causal"  # relation_type == "causal"
            ]

            if not incoming_causal:
                # No incoming causal edges = this is a root cause
                root_causes.append(event_id)

        return root_causes

    def get_fpg_depth(self, fpg: FaultPropagationGraph) -> int:
        """Calculate maximum depth (longest causal path) in FPG"""
        max_depth = 0

        for root_id in fpg.root_causes:
            depth = self._get_path_length_from_root(fpg, root_id)
            max_depth = max(max_depth, depth)

        return max_depth

    def _get_path_length_from_root(
        self,
        fpg: FaultPropagationGraph,
        event_id: str,
        visited: Optional[Set[str]] = None
    ) -> int:
        """Calculate longest path from a root cause"""
        if visited is None:
            visited = set()

        if event_id in visited:
            return 0  # Cycle detected

        visited.add(event_id)

        # Get causal outgoing edges
        causal_edges = [
            edge for edge in fpg.get_outgoing_edges(event_id)
            if edge[2] == "causal"
        ]

        if not causal_edges:
            return 1  # Leaf node

        # Recursively find longest path
        max_child_depth = 0
        for _, target_id, _ in causal_edges:
            child_depth = self._get_path_length_from_root(fpg, target_id, visited.copy())
            max_child_depth = max(max_child_depth, child_depth)

        return 1 + max_child_depth
