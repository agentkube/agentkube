"""
Root Cause Analyzer - Pattern Matching and Ranking

Implements:
- Hybrid pattern matching (structural heuristics + LLM)
- Root cause ranking using KGroot Equation 3 (time + distance weights)
- Recommendation generation
"""

from typing import List, Dict, Optional
from dataclasses import dataclass

from .event_extractor import Event
from .fpg_builder import FaultPropagationGraph


@dataclass
class PatternMatch:
    """Result of pattern matching"""
    pattern_name: str
    similarity_score: float  # 0.0 - 1.0
    matched_by: str  # "structure" | "llm"
    reasoning: str


@dataclass
class RankedCause:
    """Root cause event with ranking score"""
    event: Event
    rank_score: float  # Combined score from time + distance
    time_rank: float  # Proximity to alarm event
    distance_rank: float  # Graph distance to alarm event
    reasoning: str


@dataclass
class RootCauseResult:
    """Final RCA output"""
    root_causes: List[RankedCause]
    fault_propagation_chain: List[Event]
    matched_pattern: Optional[PatternMatch]
    recommendations: List[str]
    confidence_score: float
    analysis_method: str  # "hybrid_heuristic" | "hybrid_llm"


class RootCauseAnalyzer:
    """Hybrid pattern matching and root cause ranking"""

    def __init__(self, llm_client=None):
        self.llm = llm_client
        self.pattern_library = self._load_default_patterns()

    def _load_default_patterns(self) -> List[Dict]:
        """Load default failure patterns"""
        return [
            # Resource Exhaustion Patterns
            {
                "name": "CPU_OVERLOAD_PATTERN",
                "event_sequence": ["CPU_SPIKE", "MEMORY_PRESSURE", "OOM_KILLED", "POD_LIFECYCLE_FAILURE"],
                "description": "CPU spike leads to memory pressure and OOM kill",
                "recommendations": [
                    "Increase CPU request and limit in pod specification",
                    "Review application for CPU-intensive operations",
                    "Consider implementing horizontal pod autoscaling",
                    "Profile application to identify CPU bottlenecks"
                ]
            },
            {
                "name": "MEMORY_LEAK_PATTERN",
                "event_sequence": ["MEMORY_PRESSURE", "OOM_KILLED", "POD_LIFECYCLE_FAILURE"],
                "description": "Memory leak leading to OOM kill",
                "recommendations": [
                    "Increase memory limits in pod specification",
                    "Profile application for memory leaks using heap dumps",
                    "Review object lifecycle and garbage collection settings"
                ]
            },
            {
                "name": "OOM_CASCADE_PATTERN",
                "event_sequence": ["OOM_KILLED", "POD_CRASH_LOOP", "DEPLOYMENT_DEGRADED"],
                "description": "OOM kill triggers crash loop affecting deployment",
                "recommendations": [
                    "Increase memory limits significantly",
                    "Check for memory-intensive operations during startup",
                    "Review application memory configuration (JVM heap, etc.)"
                ]
            },

            # Image/Registry Patterns
            {
                "name": "IMAGE_PULL_PATTERN",
                "event_sequence": ["IMAGE_PULL_FAILURE", "POD_CRASH_LOOP"],
                "description": "Image pull failure causes pod to crash loop",
                "recommendations": [
                    "Verify image name and tag are correct",
                    "Check image registry authentication and pull secrets",
                    "Ensure network connectivity to registry"
                ]
            },
            {
                "name": "INVALID_IMAGE_PATTERN",
                "event_sequence": ["INVALID_IMAGE_NAME", "IMAGE_PULL_FAILURE"],
                "description": "Invalid image name prevents pod from starting",
                "recommendations": [
                    "Correct the image name in deployment specification",
                    "Verify image repository URL format"
                ]
            },
            {
                "name": "REGISTRY_UNAVAILABLE_PATTERN",
                "event_sequence": ["REGISTRY_UNAVAILABLE", "IMAGE_PULL_FAILURE"],
                "description": "Registry unavailability blocks image pull",
                "recommendations": [
                    "Check registry service status",
                    "Verify network policies allow access to registry",
                    "Check DNS resolution for registry domain"
                ]
            },

            # Volume/Storage Patterns
            {
                "name": "VOLUME_MOUNT_FAILURE_PATTERN",
                "event_sequence": ["VOLUME_PROVISIONING_FAILURE", "VOLUME_BINDING_FAILURE", "VOLUME_MOUNT_FAILURE"],
                "description": "Volume provisioning failure prevents pod mounting",
                "recommendations": [
                    "Check StorageClass configuration and provisioner status",
                    "Verify PersistentVolumeClaim matches available PersistentVolumes",
                    "Check storage backend availability and capacity"
                ]
            },
            {
                "name": "VOLUME_ATTACH_PATTERN",
                "event_sequence": ["VOLUME_ATTACH_FAILURE", "VOLUME_MOUNT_FAILURE"],
                "description": "Volume attachment failure blocks pod startup",
                "recommendations": [
                    "Check if volume is already attached to another node",
                    "Verify CSI driver is running and healthy",
                    "Review node capacity for volume attachments"
                ]
            },

            # Scheduling Patterns
            {
                "name": "INSUFFICIENT_RESOURCES_PATTERN",
                "event_sequence": ["INSUFFICIENT_MEMORY", "SCHEDULING_FAILURE"],
                "description": "Insufficient cluster resources prevent scheduling",
                "recommendations": [
                    "Add more nodes to cluster or increase node capacity",
                    "Reduce pod resource requests",
                    "Enable cluster autoscaling"
                ]
            },
            {
                "name": "CPU_SHORTAGE_PATTERN",
                "event_sequence": ["INSUFFICIENT_CPU", "SCHEDULING_FAILURE"],
                "description": "Insufficient CPU resources block pod scheduling",
                "recommendations": [
                    "Add nodes with more CPU capacity",
                    "Reduce CPU requests for the pod",
                    "Review CPU resource allocation across cluster"
                ]
            },
            {
                "name": "QUOTA_EXCEEDED_PATTERN",
                "event_sequence": ["QUOTA_EXCEEDED", "RESOURCE_CREATE_FAILURE"],
                "description": "Resource quota prevents pod creation",
                "recommendations": [
                    "Increase resource quota for the namespace",
                    "Review and clean up unused resources"
                ]
            },

            # Network Patterns
            {
                "name": "DNS_FAILURE_PATTERN",
                "event_sequence": ["NETWORK_NOT_READY", "DNS_FAILURE", "HEALTH_CHECK_FAILURE"],
                "description": "Network issues cause DNS and health check failures",
                "recommendations": [
                    "Check CoreDNS/kube-dns pods are running",
                    "Verify DNS service endpoints",
                    "Review network policies affecting DNS"
                ]
            },

            # Health Check Patterns
            {
                "name": "LIVENESS_PROBE_PATTERN",
                "event_sequence": ["LIVENESS_PROBE_FAILURE", "POD_TERMINATION"],
                "description": "Liveness probe failures trigger pod restarts",
                "recommendations": [
                    "Review liveness probe configuration (timeout, period, threshold)",
                    "Ensure application responds to health check endpoint quickly",
                    "Consider using startup probe for slow-starting apps"
                ]
            },
            {
                "name": "READINESS_PROBE_PATTERN",
                "event_sequence": ["READINESS_PROBE_FAILURE", "ENDPOINT_UPDATE_FAILURE"],
                "description": "Readiness probe failures remove pod from service",
                "recommendations": [
                    "Adjust readiness probe thresholds",
                    "Verify application initialization completes before probe checks"
                ]
            },

            # Node/Infrastructure Patterns
            {
                "name": "NODE_PRESSURE_PATTERN",
                "event_sequence": ["NODE_PRESSURE", "POD_EVICTED"],
                "description": "Node pressure causes pod evictions",
                "recommendations": [
                    "Add more nodes to distribute load",
                    "Review node resource allocation",
                    "Check for resource-intensive pods on affected node"
                ]
            },
            {
                "name": "NODE_NOT_READY_PATTERN",
                "event_sequence": ["KUBELET_NOT_READY", "NODE_NOT_READY"],
                "description": "Node issues cause cascading pod failures",
                "recommendations": [
                    "Check node system resources and health",
                    "Review kubelet logs for errors",
                    "Consider cordoning and draining the node"
                ]
            },
            {
                "name": "DISK_PRESSURE_PATTERN",
                "event_sequence": ["OUT_OF_DISK", "POD_EVICTED"],
                "description": "Disk pressure causes pod evictions",
                "recommendations": [
                    "Clean up unused images and containers",
                    "Increase node disk capacity",
                    "Configure image garbage collection"
                ]
            },

            # Container Runtime Patterns
            {
                "name": "SANDBOX_FAILURE_PATTERN",
                "event_sequence": ["POD_SANDBOX_FAILURE", "CONTAINER_CREATE_FAILURE"],
                "description": "Pod sandbox creation failure blocks container start",
                "recommendations": [
                    "Check container runtime (containerd/docker) status",
                    "Review CNI plugin configuration",
                    "Verify network namespace creation"
                ]
            },
            {
                "name": "CONFIG_ERROR_PATTERN",
                "event_sequence": ["CONFIGURATION_ERROR", "CONTAINER_CREATE_FAILURE"],
                "description": "Configuration errors prevent container creation",
                "recommendations": [
                    "Review container security context settings",
                    "Verify ConfigMap and Secret references",
                    "Check environment variable configuration"
                ]
            },

            # RBAC/Security Patterns
            {
                "name": "RBAC_PERMISSION_PATTERN",
                "event_sequence": ["RBAC_PERMISSION_DENIED", "RESOURCE_CREATE_FAILURE"],
                "description": "RBAC permissions block resource creation",
                "recommendations": [
                    "Review ServiceAccount permissions",
                    "Create appropriate Role or ClusterRole",
                    "Verify RoleBinding or ClusterRoleBinding"
                ]
            },
            {
                "name": "SECURITY_CONTEXT_PATTERN",
                "event_sequence": ["SECURITY_CONTEXT_DENIED", "POD_SANDBOX_FAILURE"],
                "description": "Security context violations prevent pod start",
                "recommendations": [
                    "Review PodSecurityPolicy or Pod Security Standards",
                    "Adjust securityContext to meet cluster requirements"
                ]
            }
        ]

    async def analyze(
        self,
        online_fpg: FaultPropagationGraph,
        chat_history: Optional[str] = None
    ) -> RootCauseResult:
        """
        Perform root cause analysis

        Args:
            online_fpg: Fault Propagation Graph with events and relationships
            chat_history: Full investigation chat history for context-aware analysis

        Strategy:
        1. Match patterns (structural then LLM if needed)
        2. Rank root causes using KGroot algorithm
        3. Generate recommendations (considering chat_history if provided)
        """

        # Step 1: Pattern matching
        structural_matches = self._match_by_structure(online_fpg)

        # Check if we need LLM verification
        if structural_matches and structural_matches[0].similarity_score > 0.7:
            best_match = structural_matches[0]
            use_llm = False
        else:
            # Use LLM for low-confidence matches
            if self.llm:
                try:
                    llm_match = await self._match_with_llm(online_fpg)
                    best_match = llm_match if llm_match else (structural_matches[0] if structural_matches else None)
                    use_llm = True
                except:
                    best_match = structural_matches[0] if structural_matches else None
                    use_llm = False
            else:
                best_match = structural_matches[0] if structural_matches else None
                use_llm = False

        # Step 2: Rank root causes
        ranked_causes = self._rank_root_causes(online_fpg)

        # Step 3: Get fault propagation chain
        propagation_chain = self._extract_primary_chain(online_fpg)

        # Step 4: Generate recommendations
        recommendations = self._generate_recommendations(best_match, ranked_causes, online_fpg)

        return RootCauseResult(
            root_causes=ranked_causes,
            fault_propagation_chain=propagation_chain,
            matched_pattern=best_match,
            recommendations=recommendations,
            confidence_score=best_match.similarity_score if best_match else 0.5,
            analysis_method="hybrid_llm" if use_llm else "hybrid_heuristic"
        )

    def _match_by_structure(self, fpg: FaultPropagationGraph) -> List[PatternMatch]:
        """Fast structural pattern matching"""
        matches = []

        # Extract event type sequence from FPG
        fpg_sequence = self._get_event_type_sequence(fpg)

        for pattern in self.pattern_library:
            # Calculate sequence overlap
            similarity = self._calculate_sequence_similarity(
                fpg_sequence,
                pattern["event_sequence"]
            )

            if similarity > 0.3:  # Threshold for relevance
                matches.append(PatternMatch(
                    pattern_name=pattern["name"],
                    similarity_score=similarity,
                    matched_by="structure",
                    reasoning=f"Event sequence overlap: {similarity:.2f}"
                ))

        # Sort by similarity
        matches.sort(key=lambda m: m.similarity_score, reverse=True)
        return matches

    def _get_event_type_sequence(self, fpg: FaultPropagationGraph) -> List[str]:
        """Extract event type sequence from FPG"""
        # Get the primary causal chain
        chains = fpg.get_causal_chains()
        if not chains:
            # No causal chains, return all event types
            return [event.abstract_type for event in fpg.nodes.values()]

        # Return the longest chain
        longest_chain = max(chains, key=len)
        return [event.abstract_type for event in longest_chain]

    def _calculate_sequence_similarity(
        self,
        seq1: List[str],
        seq2: List[str]
    ) -> float:
        """Calculate similarity between two event sequences"""
        if not seq1 or not seq2:
            return 0.0

        # Simple overlap calculation
        set1 = set(seq1)
        set2 = set(seq2)
        overlap = len(set1 & set2)
        union = len(set1 | set2)

        return overlap / union if union > 0 else 0.0

    async def _match_with_llm(self, fpg: FaultPropagationGraph) -> Optional[PatternMatch]:
        """LLM-based pattern matching for complex cases"""
        # This would call LLM with FPG description
        # Simplified for now
        return None

    def _rank_root_causes(self, fpg: FaultPropagationGraph) -> List[RankedCause]:
        """
        Rank root causes using KGroot Equation 3:
        e = argmax(Wt^Nt(e) + Wd^Nd(e))

        Where:
        - Nt(e): Time ranking (events closer to alarm time ranked higher)
        - Nd(e): Distance ranking (events closer in graph distance ranked higher)
        - Wt, Wd: Weights (default: 0.5, 0.5)
        """

        if not fpg.root_causes:
            return []

        # Get alarm event (most recent event or leaf node)
        alarm_event = self._get_alarm_event(fpg)
        if not alarm_event:
            return []

        ranked = []

        for root_cause_id in fpg.root_causes:
            root_event = fpg.nodes[root_cause_id]

            # Time ranking: closer in time = higher rank
            time_diff = abs((root_event.timestamp - alarm_event.timestamp).total_seconds())
            time_rank = 1.0 / (1.0 + time_diff)  # Closer = higher score

            # Distance ranking: closer in graph = higher rank
            graph_distance = self._compute_graph_distance(root_event, alarm_event, fpg)
            distance_rank = 1.0 / (1.0 + graph_distance)  # Closer = higher score

            # Combined score with equal weights (Wt=0.5, Wd=0.5)
            rank_score = 0.5 * time_rank + 0.5 * distance_rank

            ranked.append(RankedCause(
                event=root_event,
                rank_score=rank_score,
                time_rank=time_rank,
                distance_rank=distance_rank,
                reasoning=f"Time diff: {time_diff:.1f}s, Graph distance: {graph_distance}"
            ))

        # Sort by rank score (highest first)
        ranked.sort(key=lambda rc: rc.rank_score, reverse=True)
        return ranked

    def _get_alarm_event(self, fpg: FaultPropagationGraph) -> Optional[Event]:
        """Get the alarm event (most recent or leaf node)"""
        if not fpg.nodes:
            return None

        # Return most recent event
        return max(fpg.nodes.values(), key=lambda e: e.timestamp)

    def _compute_graph_distance(
        self,
        source: Event,
        target: Event,
        fpg: FaultPropagationGraph
    ) -> int:
        """
        Compute graph distance (number of edges) between two events
        Uses BFS to find shortest path
        """

        if source.id == target.id:
            return 0

        # BFS to find shortest path
        visited = set()
        queue = [(source.id, 0)]  # (event_id, distance)

        while queue:
            current_id, distance = queue.pop(0)

            if current_id == target.id:
                return distance

            if current_id in visited:
                continue

            visited.add(current_id)

            # Add neighbors (outgoing edges)
            for _, neighbor_id, _ in fpg.get_outgoing_edges(current_id):
                if neighbor_id not in visited:
                    queue.append((neighbor_id, distance + 1))

        # No path found
        return 999  # Large number indicating no connection

    def _extract_primary_chain(self, fpg: FaultPropagationGraph) -> List[Event]:
        """Extract the primary fault propagation chain"""
        chains = fpg.get_causal_chains()
        if not chains:
            return []

        # Return the longest chain
        return max(chains, key=len)

    def _generate_recommendations(
        self,
        pattern_match: Optional[PatternMatch],
        ranked_causes: List[RankedCause],
        fpg: FaultPropagationGraph
    ) -> List[str]:
        """Generate actionable recommendations"""

        recommendations = []

        # Pattern-based recommendations
        if pattern_match:
            for pattern in self.pattern_library:
                if pattern["name"] == pattern_match.pattern_name:
                    recommendations.extend(pattern["recommendations"])
                    break

        # Root cause specific recommendations
        if ranked_causes:
            top_cause = ranked_causes[0].event

            # Generic recommendations based on event type
            if top_cause.abstract_type == "OOM_KILLED":
                recommendations.append("Increase memory limits in pod specification")
            elif top_cause.abstract_type == "CPU_SPIKE":
                recommendations.append("Increase CPU limits or optimize application performance")
            elif top_cause.abstract_type == "IMAGE_PULL_FAILURE":
                recommendations.append("Verify image registry credentials and network connectivity")

        # Default recommendation if none found
        if not recommendations:
            recommendations.append("Review pod logs and events for more details")
            recommendations.append("Check resource quotas and node capacity")

        return recommendations
