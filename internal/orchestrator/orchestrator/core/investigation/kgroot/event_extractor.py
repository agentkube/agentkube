"""
Event Extraction and Abstraction Module for KGroot

This module extracts structured events from:
- Kubernetes events API (via operator-api backend)
- Container logs
- Resource owner references (to get related resources)

Each event is abstracted to remove instance-specific details for pattern matching.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import re
import yaml
import httpx


@dataclass
class Event:
    """Structured event representation"""
    id: str
    timestamp: datetime
    event_type: str  # Abstract type (e.g., "POD_CRASH", "HIGH_CPU")
    location: str  # e.g., "pod:nginx-abc", "node:worker-1"
    severity: str  # "critical", "warning", "info"
    details: Dict[str, Any]  # Raw details
    abstract_type: str  # Generalized event type for pattern matching
    raw_message: Optional[str] = None


class EventExtractor:
    """Extract events from multiple sources"""

    def __init__(self, operator_api_url: str = "http://localhost:4688"):
        self.operator_api_url = operator_api_url

    async def extract_from_resource(
        self,
        resource_type: str,
        resource_name: str,
        namespace: str,
        kubecontext: str
    ) -> List[Event]:
        """
        Extract events from Kubernetes resource by:
        1. Fetching events for the resource from operator-api
        2. If resource is a Pod, fetch events for its owner (Deployment, StatefulSet, etc.)
        """
        events = []
        
        print(f"[EventExtractor] Fetching events for {resource_type}/{resource_name} in namespace {namespace}")

        
        kind = self._normalize_kind(resource_type)

        # Fetch events directly for this resource
        resource_events = await self.fetch_events_cluster(
            kubecontext=kubecontext,
            namespace=namespace,
            resource_name=resource_name,
            kind=kind
        )
        events.extend(resource_events)
        
        print(f"[EventExtractor] Extracted {len(events)} total events")

        # Deduplicate and sort events
        events = self.deduplicate_and_sort_events(events)
        return events

    def _normalize_kind(self, resource_type: str) -> str:
        """Normalize resource type to proper Kind name"""
        kind_map = {
            # Workloads
            "pods": "Pod",
            "deployments": "Deployment",
            "statefulsets": "StatefulSet",
            "daemonsets": "DaemonSet",
            "jobs": "Job",
            "cronjobs": "CronJob",
            "replicasets": "ReplicaSet",
            # Networking
            "services": "Service",
            "ingresses": "Ingress",
            "endpoints": "Endpoints",
            "networkpolicies": "NetworkPolicy",
            # Storage
            "persistentvolumeclaims": "PersistentVolumeClaim",
            "persistentvolumes": "PersistentVolume",
            "storageclasses": "StorageClass",
            # Configuration
            "configmaps": "ConfigMap",
            "secrets": "Secret",
            # Cluster Resources
            "nodes": "Node",
            "namespaces": "Namespace",
            # RBAC
            "serviceaccounts": "ServiceAccount",
            "roles": "Role",
            "rolebindings": "RoleBinding",
            "clusterroles": "ClusterRole",
            "clusterrolebindings": "ClusterRoleBinding",
        }
        return kind_map.get(resource_type.lower(), resource_type.capitalize())

    async def fetch_events_cluster(
        self,
        kubecontext: str,
        namespace: str,
        resource_name: str,
        kind: str
    ) -> List[Event]:
        """
        Fetch events from operator-api backend.
        Follows ownerReference chain: Pod -> ReplicaSet -> Deployment/StatefulSet/etc.
        """
        events = []

        # Fetch events for this specific resource
        query_string = f"?fieldSelector=type=Warning,involvedObject.name={resource_name},involvedObject.kind={kind}"

        url = (
            f"{self.operator_api_url}/api/v1/clusters/{kubecontext}"
            f"/api/v1/namespaces/{namespace}/events{query_string}"
        )

        print(f"[EventExtractor] Fetching events for {kind}/{resource_name}")
        print(f"[EventExtractor] API: {url}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                # Parse events from response
                items = data.get("items", [])
                print(f"[EventExtractor] Received {len(items)} events for {kind}/{resource_name}")

                for item in items:
                    event = self._parse_k8s_event(item)
                    if event:
                        events.append(event)

        except httpx.HTTPError as e:
            print(f"[EventExtractor] Failed to fetch events from API: {e}")
        except Exception as e:
            print(f"[EventExtractor] Error parsing events: {e}")

        # Follow ownerReference chain to get parent resource events
        owner_events = await self._fetch_owner_chain_events(
            kubecontext, namespace, resource_name, kind
        )
        events.extend(owner_events)

        return events

    async def _fetch_owner_chain_events(
        self,
        kubecontext: str,
        namespace: str,
        resource_name: str,
        kind: str
    ) -> List[Event]:
        """
        Recursively fetch events by following ownerReference chain.
        Pod -> ReplicaSet -> Deployment/StatefulSet/DaemonSet -> CRDs
        """
        events = []

        # Get the resource to extract ownerReferences
        resource_url = self._build_resource_url(kubecontext, namespace, resource_name, kind)
        if not resource_url:
            return events

        print(f"[EventExtractor] Fetching resource {kind}/{resource_name} to get owners")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(resource_url)
                response.raise_for_status()
                resource = response.json()

                metadata = resource.get("metadata", {})
                owner_references = metadata.get("ownerReferences", [])

                if not owner_references:
                    print(f"[EventExtractor] No owner references for {kind}/{resource_name}")
                    return events

                print(f"[EventExtractor] Found {len(owner_references)} owner(s) for {kind}/{resource_name}")

                # Process each owner
                for owner in owner_references:
                    owner_kind = owner.get("kind", "")
                    owner_name = owner.get("name", "")

                    if owner_kind and owner_name:
                        print(f"[EventExtractor] Following owner chain: {kind}/{resource_name} -> {owner_kind}/{owner_name}")

                        # Fetch events for the owner
                        owner_events = await self.fetch_events_cluster(
                            kubecontext=kubecontext,
                            namespace=namespace,
                            resource_name=owner_name,
                            kind=owner_kind
                        )
                        events.extend(owner_events)

        except httpx.HTTPError as e:
            print(f"[EventExtractor] Failed to fetch resource from API: {e}")
        except Exception as e:
            print(f"[EventExtractor] Error fetching owner chain: {e}")

        return events

    def _build_resource_url(
        self,
        kubecontext: str,
        namespace: str,
        resource_name: str,
        kind: str
    ) -> Optional[str]:
        """Build API URL for fetching a specific resource"""
        # Map kind to API path
        kind_to_path = {
            "Pod": "pods",
            "ReplicaSet": "replicasets",
            "Deployment": "deployments",
            "StatefulSet": "statefulsets",
            "DaemonSet": "daemonsets",
            "Job": "jobs",
            "CronJob": "cronjobs",
        }

        resource_path = kind_to_path.get(kind)
        if not resource_path:
            print(f"[EventExtractor] Unknown resource kind: {kind}, cannot fetch")
            return None

        # Build URL based on resource type
        if kind == "CronJob":
            # CronJobs are in batch/v1
            url = f"{self.operator_api_url}/api/v1/clusters/{kubecontext}/apis/batch/v1/namespaces/{namespace}/{resource_path}/{resource_name}"
        elif kind in ["Deployment", "ReplicaSet", "StatefulSet", "DaemonSet"]:
            # Apps resources are in apps/v1
            url = f"{self.operator_api_url}/api/v1/clusters/{kubecontext}/apis/apps/v1/namespaces/{namespace}/{resource_path}/{resource_name}"
        else:
            # Core resources like Pods
            url = f"{self.operator_api_url}/api/v1/clusters/{kubecontext}/api/v1/namespaces/{namespace}/{resource_path}/{resource_name}"

        return url

    def _parse_k8s_event(self, event_data: Dict[str, Any]) -> Optional[Event]:
        """Parse Kubernetes event object into Event dataclass"""
        try:
            metadata = event_data.get("metadata", {})
            involved_object = event_data.get("involvedObject", {})

            event_name = metadata.get("name", "unknown")
            timestamp_str = event_data.get("lastTimestamp") or event_data.get("firstTimestamp")
            timestamp = self._parse_timestamp(timestamp_str)

            reason = event_data.get("reason", "Unknown")
            message = event_data.get("message", "")
            event_type = event_data.get("type", "Normal")  # "Normal" or "Warning"

            # Determine severity based on event type and reason
            severity = self._determine_severity(event_type, reason)

            # Create location string
            obj_kind = involved_object.get("kind", "Unknown")
            obj_name = involved_object.get("name", "unknown")
            location = f"{obj_kind.lower()}:{obj_name}"

            # Abstract the event type
            abstract_type = self._abstract_event_type(reason)

            return Event(
                id=f"k8s_event_{event_name}",
                timestamp=timestamp,
                event_type=reason.upper().replace(" ", "_"),
                location=location,
                severity=severity,
                details={
                    "reason": reason,
                    "message": message,
                    "type": event_type,
                    "count": event_data.get("count", 1),
                    "namespace": involved_object.get("namespace", ""),
                    "source_component": event_data.get("source", {}).get("component", ""),
                },
                abstract_type=abstract_type,
                raw_message=message
            )
        except Exception as e:
            print(f"[EventExtractor] Failed to parse event: {e}")
            return None

    def _determine_severity(self, event_type: str, reason: str) -> str:
        """Determine severity based on event type and reason"""
        critical_reasons = [
            "Failed", "BackOff", "FailedScheduling", "FailedMount",
            "FailedAttachVolume", "FailedCreatePodSandBox", "OOMKilling"
        ]

        if event_type == "Warning" or any(r in reason for r in critical_reasons):
            return "critical"
        return "info"

    def _abstract_event_type(self, reason: str) -> str:
        """Abstract Kubernetes event reason to generic type"""
        reason_lower = reason.lower()

        # Image/Registry Issues
        if "pull" in reason_lower and "image" in reason_lower:
            return "IMAGE_PULL_FAILURE"
        elif "imagegc" in reason_lower:
            return "IMAGE_GC_FAILURE"
        elif "invalidimagename" in reason_lower:
            return "INVALID_IMAGE_NAME"
        elif "registryunavailable" in reason_lower:
            return "REGISTRY_UNAVAILABLE"

        # Pod Lifecycle Issues
        elif "crash" in reason_lower or "backoff" in reason_lower:
            return "POD_CRASH_LOOP"
        elif "oom" in reason_lower:
            return "OOM_KILLED"
        elif "evicted" in reason_lower:
            return "POD_EVICTED"
        elif "preempted" in reason_lower:
            return "POD_PREEMPTED"
        elif "killing" in reason_lower:
            return "POD_TERMINATION"
        elif "failedkillpod" in reason_lower:
            return "FAILED_KILL_POD"
        elif "failedprestophook" in reason_lower:
            return "PRESTOP_HOOK_FAILURE"
        elif "failedpoststarthook" in reason_lower:
            return "POSTSTART_HOOK_FAILURE"

        # Scheduling Issues
        elif "failed" in reason_lower and "scheduling" in reason_lower:
            return "SCHEDULING_FAILURE"
        elif "insufficientmemory" in reason_lower or "insufficient memory" in reason_lower:
            return "INSUFFICIENT_MEMORY"
        elif "insufficientcpu" in reason_lower or "insufficient cpu" in reason_lower:
            return "INSUFFICIENT_CPU"
        elif "outofdisk" in reason_lower:
            return "OUT_OF_DISK"

        # Volume/Storage Issues
        elif "failed" in reason_lower and "mount" in reason_lower:
            return "VOLUME_MOUNT_FAILURE"
        elif "failedattachvolume" in reason_lower:
            return "VOLUME_ATTACH_FAILURE"
        elif "faileddetachvolume" in reason_lower:
            return "VOLUME_DETACH_FAILURE"
        elif "volumeresizefailed" in reason_lower:
            return "VOLUME_RESIZE_FAILURE"
        elif "provisioningfailed" in reason_lower:
            return "VOLUME_PROVISIONING_FAILURE"
        elif "failedbinding" in reason_lower:
            return "VOLUME_BINDING_FAILURE"

        # Network Issues
        elif "failedcreateendpoint" in reason_lower:
            return "ENDPOINT_CREATE_FAILURE"
        elif "failedtoupdateendpoint" in reason_lower:
            return "ENDPOINT_UPDATE_FAILURE"
        elif "networknotready" in reason_lower:
            return "NETWORK_NOT_READY"
        elif "dnsconfigforming" in reason_lower or "dns" in reason_lower:
            return "DNS_FAILURE"
        elif "failedtoresolve" in reason_lower:
            return "DNS_RESOLUTION_FAILURE"

        # Health Check Issues
        elif "unhealthy" in reason_lower or "probe" in reason_lower:
            return "HEALTH_CHECK_FAILURE"
        elif "readinessprobe" in reason_lower:
            return "READINESS_PROBE_FAILURE"
        elif "livenessprobe" in reason_lower:
            return "LIVENESS_PROBE_FAILURE"
        elif "startupprobe" in reason_lower:
            return "STARTUP_PROBE_FAILURE"

        # Node Issues
        elif "nodenotready" in reason_lower:
            return "NODE_NOT_READY"
        elif "nodenotschedulable" in reason_lower:
            return "NODE_NOT_SCHEDULABLE"
        elif "nodepressure" in reason_lower:
            return "NODE_PRESSURE"
        elif "kubeletnotready" in reason_lower:
            return "KUBELET_NOT_READY"

        # Resource/Quota Issues
        elif "failedcreate" in reason_lower:
            return "RESOURCE_CREATE_FAILURE"
        elif "exceededquota" in reason_lower or "quota" in reason_lower:
            return "QUOTA_EXCEEDED"

        # Security Issues
        elif "securitycontextdenied" in reason_lower:
            return "SECURITY_CONTEXT_DENIED"
        elif "forbidden" in reason_lower or "unauthorized" in reason_lower:
            return "RBAC_PERMISSION_DENIED"

        # Default fallback
        else:
            return reason.upper().replace(" ", "_")

    async def fetch_owner_events(
        self,
        kubecontext: str,
        namespace: str,
        resource_name: str,
        resource_type: str
    ) -> List[Event]:
        """Fetch events for owner resources by fetching the resource from API and extracting owner references"""
        events = []

        try:
            # Fetch the Pod resource from API to get owner references
            url = (
                f"{self.operator_api_url}/api/v1/clusters/{kubecontext}"
                f"/api/v1/namespaces/{namespace}/{resource_type}/{resource_name}"
            )

            print(f"[EventExtractor] Fetching resource to get owner references: {url}")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                resource = response.json()

                metadata = resource.get("metadata", {})
                owner_references = metadata.get("ownerReferences", [])

                print(f"[EventExtractor] Found {len(owner_references)} owner references")

                for owner in owner_references:
                    owner_kind = owner.get("kind", "")
                    owner_name = owner.get("name", "")

                    if owner_kind and owner_name:
                        print(f"[EventExtractor] Fetching events for owner {owner_kind}/{owner_name}")
                        owner_events = await self.fetch_events_cluster(
                            kubecontext=kubecontext,
                            namespace=namespace,
                            resource_name=owner_name,
                            kind=owner_kind
                        )
                        events.extend(owner_events)

        except httpx.HTTPError as e:
            print(f"[EventExtractor] Failed to fetch resource from API: {e}")
        except Exception as e:
            print(f"[EventExtractor] Error fetching owner events: {e}")

        return events

    def _extract_pod_events(self, pod: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from Pod resource"""
        events = []
        status = pod.get("status", {})

        # Check pod phase
        phase = status.get("phase", "Unknown")
        if phase in ["Failed", "Unknown"]:
            events.append(Event(
                id=f"pod_{name}_{phase.lower()}",
                timestamp=self._parse_timestamp(status.get("startTime")),
                event_type="POD_FAILED" if phase == "Failed" else "POD_UNKNOWN",
                location=f"pod:{name}",
                severity="critical",
                details={"phase": phase, "namespace": namespace},
                abstract_type="POD_LIFECYCLE_FAILURE",
                raw_message=status.get("message")
            ))

        # Check container statuses
        container_statuses = status.get("containerStatuses", [])
        for container_status in container_statuses:
            container_name = container_status.get("name", "unknown")

            # Waiting state
            waiting = container_status.get("state", {}).get("waiting")
            if waiting:
                reason = waiting.get("reason", "Unknown")
                events.append(self._create_container_event(
                    container_name, name, namespace, reason, waiting.get("message")
                ))

            # Terminated state
            terminated = container_status.get("state", {}).get("terminated")
            if terminated:
                reason = terminated.get("reason", "Unknown")
                exit_code = terminated.get("exitCode", 0)
                events.append(self._create_termination_event(
                    container_name, name, namespace, reason, exit_code
                ))

        return events

    def _create_container_event(
        self, container_name: str, pod_name: str, namespace: str, reason: str, message: Optional[str]
    ) -> Event:
        """Create event for container waiting state"""
        event_type_map = {
            # Image Issues
            "ImagePullBackOff": "IMAGE_PULL_FAILED",
            "ErrImagePull": "IMAGE_PULL_FAILED",
            "InvalidImageName": "INVALID_IMAGE_NAME",
            "RegistryUnavailable": "REGISTRY_UNAVAILABLE",
            # Container Creation Issues
            "CreateContainerConfigError": "CONFIG_ERROR",
            "CreateContainerError": "CONTAINER_CREATE_ERROR",
            "RunContainerError": "RUN_CONTAINER_ERROR",
            # Container Runtime Issues
            "CrashLoopBackOff": "CRASHLOOP_BACKOFF",
            "RunContainerError": "RUN_CONTAINER_ERROR",
            # Storage Issues
            "PodInitializing": "POD_INITIALIZING",
            "ContainerCreating": "CONTAINER_CREATING",
            # Security Issues
            "CreatePodSandboxError": "SANDBOX_CREATE_ERROR",
            "NetworkSetupError": "NETWORK_SETUP_ERROR",
        }

        event_type = event_type_map.get(reason, f"CONTAINER_WAITING_{reason.upper()}")
        abstract_type_map = {
            "IMAGE_PULL_FAILED": "IMAGE_PULL_FAILURE",
            "INVALID_IMAGE_NAME": "INVALID_IMAGE_NAME",
            "REGISTRY_UNAVAILABLE": "REGISTRY_UNAVAILABLE",
            "CRASHLOOP_BACKOFF": "POD_CRASH_LOOP",
            "CONFIG_ERROR": "CONFIGURATION_ERROR",
            "CONTAINER_CREATE_ERROR": "CONTAINER_CREATE_FAILURE",
            "RUN_CONTAINER_ERROR": "CONTAINER_RUNTIME_ERROR",
            "SANDBOX_CREATE_ERROR": "POD_SANDBOX_FAILURE",
            "NETWORK_SETUP_ERROR": "NETWORK_NOT_READY",
        }
        abstract_type = abstract_type_map.get(event_type, "CONTAINER_WAITING")

        return Event(
            id=f"container_{container_name}_waiting",
            timestamp=datetime.now(timezone.utc),
            event_type=event_type,
            location=f"pod:{pod_name}/container:{container_name}",
            severity="critical" if "CrashLoop" in reason else "warning",
            details={"reason": reason, "message": message, "namespace": namespace},
            abstract_type=abstract_type,
            raw_message=message
        )

    def _create_termination_event(
        self, container_name: str, pod_name: str, namespace: str, reason: str, exit_code: int
    ) -> Event:
        """Create event for container termination"""
        abstract_type = self._abstract_termination_reason(reason, exit_code)

        return Event(
            id=f"container_{container_name}_terminated",
            timestamp=datetime.now(timezone.utc),
            event_type=f"CONTAINER_TERMINATED_{reason.upper()}",
            location=f"pod:{pod_name}/container:{container_name}",
            severity="critical" if exit_code != 0 else "info",
            details={
                "reason": reason,
                "exit_code": exit_code,
                "namespace": namespace
            },
            abstract_type=abstract_type
        )

    def _abstract_termination_reason(self, reason: str, exit_code: int) -> str:
        """Abstract termination reason to generic type"""
        if reason == "OOMKilled" or exit_code == 137:
            return "OOM_KILLED"
        elif exit_code == 143:
            return "SIGTERM"
        elif exit_code == 1:
            return "ERROR_EXIT"
        elif exit_code == 0:
            return "NORMAL_EXIT"
        else:
            return "ABNORMAL_TERMINATION"

    def _extract_deployment_events(self, deployment: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from Deployment resource"""
        events = []
        status = deployment.get("status", {})

        # Check replicas
        desired = status.get("replicas", 0)
        ready = status.get("readyReplicas", 0)

        if ready < desired:
            events.append(Event(
                id=f"deployment_{name}_replicas_not_ready",
                timestamp=datetime.now(timezone.utc),
                event_type="DEPLOYMENT_REPLICAS_NOT_READY",
                location=f"deployment:{name}",
                severity="warning",
                details={
                    "desired": desired,
                    "ready": ready,
                    "namespace": namespace
                },
                abstract_type="DEPLOYMENT_DEGRADED"
            ))

        return events

    def _extract_statefulset_events(self, sts: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from StatefulSet resource"""
        events = []
        status = sts.get("status", {})

        desired = status.get("replicas", 0)
        ready = status.get("readyReplicas", 0)

        if ready < desired:
            events.append(Event(
                id=f"statefulset_{name}_replicas_not_ready",
                timestamp=datetime.now(timezone.utc),
                event_type="STATEFULSET_REPLICAS_NOT_READY",
                location=f"statefulset:{name}",
                severity="warning",
                details={"desired": desired, "ready": ready, "namespace": namespace},
                abstract_type="STATEFULSET_DEGRADED"
            ))

        current_replicas = status.get("currentReplicas", 0)
        updated_replicas = status.get("updatedReplicas", 0)
        if current_replicas != updated_replicas:
            events.append(Event(
                id=f"statefulset_{name}_update_stuck",
                timestamp=datetime.now(timezone.utc),
                event_type="STATEFULSET_UPDATE_STUCK",
                location=f"statefulset:{name}",
                severity="warning",
                details={"current": current_replicas, "updated": updated_replicas, "namespace": namespace},
                abstract_type="STATEFULSET_UPDATE_FAILURE"
            ))

        return events

    def _extract_daemonset_events(self, ds: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from DaemonSet resource"""
        events = []
        status = ds.get("status", {})

        desired = status.get("desiredNumberScheduled", 0)
        current = status.get("currentNumberScheduled", 0)
        ready = status.get("numberReady", 0)

        if current < desired:
            events.append(Event(
                id=f"daemonset_{name}_not_scheduled",
                timestamp=datetime.now(timezone.utc),
                event_type="DAEMONSET_NOT_SCHEDULED",
                location=f"daemonset:{name}",
                severity="warning",
                details={"desired": desired, "current": current, "namespace": namespace},
                abstract_type="DAEMONSET_SCHEDULING_FAILURE"
            ))

        if ready < desired:
            events.append(Event(
                id=f"daemonset_{name}_not_ready",
                timestamp=datetime.now(timezone.utc),
                event_type="DAEMONSET_PODS_NOT_READY",
                location=f"daemonset:{name}",
                severity="warning",
                details={"desired": desired, "ready": ready, "namespace": namespace},
                abstract_type="DAEMONSET_DEGRADED"
            ))

        return events

    def _extract_job_events(self, job: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from Job resource"""
        events = []
        status = job.get("status", {})

        failed = status.get("failed", 0)
        if failed > 0:
            events.append(Event(
                id=f"job_{name}_failed",
                timestamp=datetime.now(timezone.utc),
                event_type="JOB_FAILED",
                location=f"job:{name}",
                severity="critical",
                details={"failed_count": failed, "namespace": namespace},
                abstract_type="JOB_FAILURE"
            ))

        active = status.get("active", 0)
        succeeded = status.get("succeeded", 0)
        if active > 0 and succeeded == 0:
            events.append(Event(
                id=f"job_{name}_stuck",
                timestamp=datetime.now(timezone.utc),
                event_type="JOB_STUCK",
                location=f"job:{name}",
                severity="warning",
                details={"active": active, "namespace": namespace},
                abstract_type="JOB_STUCK"
            ))

        return events

    def _extract_cronjob_events(self, cronjob: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from CronJob resource"""
        events = []
        status = cronjob.get("status", {})
        spec = cronjob.get("spec", {})

        active_jobs = status.get("active", [])
        if len(active_jobs) > 0:
            events.append(Event(
                id=f"cronjob_{name}_jobs_active",
                timestamp=datetime.now(timezone.utc),
                event_type="CRONJOB_JOBS_ACTIVE",
                location=f"cronjob:{name}",
                severity="info",
                details={"active_count": len(active_jobs), "namespace": namespace},
                abstract_type="CRONJOB_RUNNING"
            ))

        if spec.get("suspend", False):
            events.append(Event(
                id=f"cronjob_{name}_suspended",
                timestamp=datetime.now(timezone.utc),
                event_type="CRONJOB_SUSPENDED",
                location=f"cronjob:{name}",
                severity="warning",
                details={"suspended": True, "namespace": namespace},
                abstract_type="CRONJOB_SUSPENDED"
            ))

        return events

    def _extract_replicaset_events(self, rs: Dict, name: str, namespace: str) -> List[Event]:
        """Extract events from ReplicaSet resource"""
        events = []
        status = rs.get("status", {})

        desired = status.get("replicas", 0)
        ready = status.get("readyReplicas", 0)

        if ready < desired:
            events.append(Event(
                id=f"replicaset_{name}_replicas_not_ready",
                timestamp=datetime.now(timezone.utc),
                event_type="REPLICASET_REPLICAS_NOT_READY",
                location=f"replicaset:{name}",
                severity="warning",
                details={"desired": desired, "ready": ready, "namespace": namespace},
                abstract_type="REPLICASET_DEGRADED"
            ))

        return events

    async def extract_from_logs(self, logs: str, pod_name: str = "unknown") -> List[Event]:
        """Extract events from container logs"""
        events = []
        log_lines = logs.split("\n")

        for i, line in enumerate(log_lines):
            # Look for error patterns
            if self._is_error_log(line):
                events.append(Event(
                    id=f"log_error_{pod_name}_{i}",
                    timestamp=self._extract_timestamp_from_log(line),
                    event_type="LOG_ERROR",
                    location=f"pod:{pod_name}",
                    severity="warning",
                    details={"log_line": line},
                    abstract_type="APPLICATION_ERROR",
                    raw_message=line
                ))

        # Deduplicate and sort events
        events = self.deduplicate_and_sort_events(events)

        return events

    def _is_error_log(self, line: str) -> bool:
        """Detect if log line indicates an error"""
        error_patterns = [
            r"\bERROR\b",
            r"\bFATAL\b",
            r"\bException\b",
            r"\bfailed\b",
        ]
        return any(re.search(pattern, line, re.IGNORECASE) for pattern in error_patterns)

    def _extract_timestamp_from_log(self, line: str) -> datetime:
        """Try to extract timestamp from log line - always returns timezone-aware datetime"""
        iso_pattern = r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"
        match = re.search(iso_pattern, line)
        if match:
            try:
                dt = datetime.fromisoformat(match.group(0).replace(" ", "T"))
                # Ensure timezone-aware
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except:
                pass
        return datetime.now(timezone.utc)

    def _parse_timestamp(self, timestamp_str: Optional[str]) -> datetime:
        """Parse Kubernetes timestamp string - always returns timezone-aware datetime"""
        if not timestamp_str:
            return datetime.now(timezone.utc)

        try:
            dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            # Ensure timezone-aware
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except:
            return datetime.now(timezone.utc)

    def deduplicate_and_sort_events(self, events: List[Event]) -> List[Event]:
        """
        Deduplicate events based on unique key (event_type + location + timestamp)
        and sort chronologically
        """
        if not events:
            return events

        # Deduplicate using a dictionary with composite key
        unique_events = {}
        for event in events:
            # Create unique key: event_type + location + timestamp (rounded to second)
            # This allows same event type at same location at same time to be considered duplicate
            timestamp_key = event.timestamp.replace(microsecond=0) if hasattr(event.timestamp, 'replace') else event.timestamp
            unique_key = f"{event.event_type}:{event.location}:{timestamp_key}"

            # Keep first occurrence (or could keep the one with more details)
            if unique_key not in unique_events:
                unique_events[unique_key] = event
            else:
                # Optional: Log duplicates for debugging
                print(f"[EventExtractor] Duplicate event filtered: {event.event_type} @ {event.location} at {event.timestamp}")

        # Convert back to list and sort chronologically
        deduplicated_events = list(unique_events.values())
        deduplicated_events.sort(key=lambda e: e.timestamp)

        return deduplicated_events
