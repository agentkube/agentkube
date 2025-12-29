package canvas

import (
	"context"
	"fmt"
	"sync"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// DependencyCategory represents a category of dependencies
type DependencyCategory string

const (
	CategoryCompute       DependencyCategory = "compute"       // Nodes only
	CategoryWorkloads     DependencyCategory = "workloads"     // Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
	CategoryConfiguration DependencyCategory = "configuration" // ConfigMaps, Secrets
	CategoryStorage       DependencyCategory = "storage"       // PVCs, PVs, StorageClasses
	CategoryNetwork       DependencyCategory = "network"       // Services, Ingresses, EndpointSlices, NetworkPolicies
	CategoryRBAC          DependencyCategory = "rbac"          // ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings
	CategoryScheduling    DependencyCategory = "scheduling"    // PriorityClasses, ResourceQuotas, LimitRanges
	CategoryAutoscaling   DependencyCategory = "autoscaling"   // HorizontalPodAutoscalers
	CategoryCustom        DependencyCategory = "custom"        // CRDs and custom resources
)

// DependencyNode extends Node with dependency metadata
type DependencyNode struct {
	Node
	Category     DependencyCategory `json:"category"`
	Depth        int                `json:"depth"`
	RelationType string             `json:"relation_type"` // owns, uses, references, configures, etc.
}

// DependencyEdge extends Edge with relationship metadata
type DependencyEdge struct {
	Edge
	Category     DependencyCategory `json:"category"`
	Relationship string             `json:"relationship"`
	Critical     bool               `json:"critical"` // Is this dependency critical for the workload?
}

// DependencyGraphResponse represents the deep dependency graph
type DependencyGraphResponse struct {
	Nodes      []DependencyNode `json:"nodes"`
	Edges      []DependencyEdge `json:"edges"`
	Categories []string         `json:"categories"`
	Stats      DependencyStats  `json:"stats"`
}

// DependencyStats provides statistics about the dependency graph
type DependencyStats struct {
	TotalNodes      int            `json:"total_nodes"`
	TotalEdges      int            `json:"total_edges"`
	MaxDepth        int            `json:"max_depth"`
	CategoryCounts  map[string]int `json:"category_counts"`
	CriticalPaths   int            `json:"critical_paths"`
	CustomResources int            `json:"custom_resources"`
}

// DependencyGraphBuilder builds the deep dependency graph
type DependencyGraphBuilder struct {
	controller *Controller
	client     dynamic.Interface
	visited    map[string]bool
	nodes      []DependencyNode
	edges      []DependencyEdge
	nodeIDMap  map[string]int // Maps resource key to node index
	mu         sync.Mutex
	maxDepth   int
}

// NewDependencyGraphBuilder creates a new dependency graph builder
func NewDependencyGraphBuilder(controller *Controller, client dynamic.Interface) *DependencyGraphBuilder {
	return &DependencyGraphBuilder{
		controller: controller,
		client:     client,
		visited:    make(map[string]bool),
		nodes:      []DependencyNode{},
		edges:      []DependencyEdge{},
		nodeIDMap:  make(map[string]int),
		maxDepth:   10,
	}
}

// GetDeepDependencyGraph builds the complete dependency graph for a workload
func (c *Controller) GetDeepDependencyGraph(ctx context.Context, resource ResourceIdentifier) (*DependencyGraphResponse, error) {
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	builder := NewDependencyGraphBuilder(c, dynamicClient)
	return builder.Build(ctx, resource)
}

// Build constructs the dependency graph starting from the given resource
func (b *DependencyGraphBuilder) Build(ctx context.Context, resource ResourceIdentifier) (*DependencyGraphResponse, error) {
	// Add the root resource
	if err := b.addRootResource(ctx, resource); err != nil {
		return nil, err
	}

	// Process dependencies based on resource type
	if err := b.processWorkloadDependencies(ctx, resource, 0); err != nil {
		return nil, err
	}

	// Build response
	response := &DependencyGraphResponse{
		Nodes:      b.nodes,
		Edges:      b.edges,
		Categories: b.getUniqueCategories(),
		Stats:      b.calculateStats(),
	}

	return response, nil
}

// addRootResource adds the main workload resource as the root node
func (b *DependencyGraphBuilder) addRootResource(ctx context.Context, resource ResourceIdentifier) error {
	node, err := b.buildDependencyNode(ctx, resource, CategoryWorkloads, 0, "root")
	if err != nil {
		return err
	}
	b.addNode(node)
	return nil
}

// processWorkloadDependencies processes all dependencies for a workload
func (b *DependencyGraphBuilder) processWorkloadDependencies(ctx context.Context, resource ResourceIdentifier, depth int) error {
	if depth > b.maxDepth {
		return nil
	}

	// Get the workload object
	obj, err := b.client.Resource(schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.ResourceType,
	}).Namespace(resource.Namespace).Get(ctx, resource.ResourceName, metav1.GetOptions{})
	if err != nil {
		return err
	}

	// Process based on workload type
	switch resource.ResourceType {
	case "pods":
		return b.processPodDependencies(ctx, resource, obj, depth)
	case "deployments":
		return b.processDeploymentDependencies(ctx, resource, obj, depth)
	case "statefulsets":
		return b.processStatefulSetDependencies(ctx, resource, obj, depth)
	case "daemonsets":
		return b.processDaemonSetDependencies(ctx, resource, obj, depth)
	case "replicasets":
		return b.processReplicaSetDependencies(ctx, resource, obj, depth)
	case "replicationcontrollers":
		return b.processReplicationControllerDependencies(ctx, resource, obj, depth)
	case "jobs":
		return b.processJobDependencies(ctx, resource, obj, depth)
	case "cronjobs":
		return b.processCronJobDependencies(ctx, resource, obj, depth)
	default:
		// For unknown types, try generic dependency discovery
		return b.processGenericDependencies(ctx, resource, obj, depth)
	}
}

// processPodDependencies extracts all dependencies from a Pod
func (b *DependencyGraphBuilder) processPodDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// 1. Node dependency
	if err := b.addNodeDependency(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 2. ServiceAccount and RBAC
	if err := b.addServiceAccountDependencies(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 3. ConfigMaps and Secrets from volumes
	if err := b.addVolumeDependencies(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 4. ConfigMaps and Secrets from env
	if err := b.addEnvDependencies(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 5. PVC dependencies
	if err := b.addPVCDependencies(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 6. Services that select this pod
	if err := b.addServiceDependencies(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 7. NetworkPolicies affecting this pod
	if err := b.addNetworkPolicyDependencies(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 8. PriorityClass
	if err := b.addPriorityClassDependency(ctx, resource, obj, parentID, depth); err != nil {
		// Log but continue
	}

	// 9. ResourceQuota and LimitRange in namespace
	if err := b.addNamespaceConstraints(ctx, resource, parentID, depth); err != nil {
		// Log but continue
	}

	return nil
}

// processDeploymentDependencies processes Deployment dependencies
func (b *DependencyGraphBuilder) processDeploymentDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Find ReplicaSets owned by this Deployment
	rsList, err := b.findOwnedResources(ctx, resource, "apps", "v1", "replicasets")
	if err == nil {
		for _, rs := range rsList {
			if err := b.addDependencyWithEdge(ctx, rs, parentID, CategoryWorkloads, "manages", depth+1, true); err != nil {
				continue
			}
			// Recursively process ReplicaSet dependencies
			rsObj, err := b.getResource(ctx, rs)
			if err == nil {
				b.processReplicaSetDependencies(ctx, rs, rsObj, depth+1)
			}
		}
	}

	// Add HPA if exists
	b.addHPADependency(ctx, resource, parentID, depth)

	// Process pod template dependencies
	return b.processPodTemplateDependencies(ctx, resource, obj, parentID, depth)
}

// processStatefulSetDependencies processes StatefulSet dependencies
func (b *DependencyGraphBuilder) processStatefulSetDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Find Pods owned by this StatefulSet
	pods, err := b.findOwnedResources(ctx, resource, "", "v1", "pods")
	if err == nil {
		for _, pod := range pods {
			if err := b.addDependencyWithEdge(ctx, pod, parentID, CategoryWorkloads, "manages", depth+1, true); err != nil {
				continue
			}
			podObj, err := b.getResource(ctx, pod)
			if err == nil {
				b.processPodDependencies(ctx, pod, podObj, depth+1)
			}
		}
	}

	// VolumeClaimTemplates
	b.addVolumeClaimTemplateDependencies(ctx, resource, obj, parentID, depth)

	// Add HPA if exists
	b.addHPADependency(ctx, resource, parentID, depth)

	return b.processPodTemplateDependencies(ctx, resource, obj, parentID, depth)
}

// processDaemonSetDependencies processes DaemonSet dependencies
func (b *DependencyGraphBuilder) processDaemonSetDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Find Pods owned by this DaemonSet
	pods, err := b.findOwnedResources(ctx, resource, "", "v1", "pods")
	if err == nil {
		for _, pod := range pods {
			if err := b.addDependencyWithEdge(ctx, pod, parentID, CategoryWorkloads, "manages", depth+1, true); err != nil {
				continue
			}
			podObj, err := b.getResource(ctx, pod)
			if err == nil {
				b.processPodDependencies(ctx, pod, podObj, depth+1)
			}
		}
	}

	return b.processPodTemplateDependencies(ctx, resource, obj, parentID, depth)
}

// processReplicaSetDependencies processes ReplicaSet dependencies
func (b *DependencyGraphBuilder) processReplicaSetDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Find Pods owned by this ReplicaSet
	pods, err := b.findOwnedResources(ctx, resource, "", "v1", "pods")
	if err == nil {
		for _, pod := range pods {
			if err := b.addDependencyWithEdge(ctx, pod, parentID, CategoryWorkloads, "manages", depth+1, true); err != nil {
				continue
			}
			podObj, err := b.getResource(ctx, pod)
			if err == nil {
				b.processPodDependencies(ctx, pod, podObj, depth+1)
			}
		}
	}

	return b.processPodTemplateDependencies(ctx, resource, obj, parentID, depth)
}

// processReplicationControllerDependencies processes RC dependencies
func (b *DependencyGraphBuilder) processReplicationControllerDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	return b.processReplicaSetDependencies(ctx, resource, obj, depth)
}

// processJobDependencies processes Job dependencies
func (b *DependencyGraphBuilder) processJobDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Find Pods owned by this Job
	pods, err := b.findOwnedResources(ctx, resource, "", "v1", "pods")
	if err == nil {
		for _, pod := range pods {
			if err := b.addDependencyWithEdge(ctx, pod, parentID, CategoryWorkloads, "manages", depth+1, true); err != nil {
				continue
			}
			podObj, err := b.getResource(ctx, pod)
			if err == nil {
				b.processPodDependencies(ctx, pod, podObj, depth+1)
			}
		}
	}

	return b.processPodTemplateDependencies(ctx, resource, obj, parentID, depth)
}

// processCronJobDependencies processes CronJob dependencies
func (b *DependencyGraphBuilder) processCronJobDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Find Jobs owned by this CronJob
	jobs, err := b.findOwnedResources(ctx, resource, "batch", "v1", "jobs")
	if err == nil {
		for _, job := range jobs {
			if err := b.addDependencyWithEdge(ctx, job, parentID, CategoryWorkloads, "creates", depth+1, true); err != nil {
				continue
			}
			jobObj, err := b.getResource(ctx, job)
			if err == nil {
				b.processJobDependencies(ctx, job, jobObj, depth+1)
			}
		}
	}

	return b.processPodTemplateDependencies(ctx, resource, obj, parentID, depth)
}

// processGenericDependencies handles unknown resource types
func (b *DependencyGraphBuilder) processGenericDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, depth int) error {
	parentID := b.getNodeID(resource)

	// Check for owner references (what owns this resource)
	for _, ownerRef := range obj.GetOwnerReferences() {
		ownerResource := ResourceIdentifier{
			Namespace:    resource.Namespace,
			Group:        getGroupFromAPIVersion(ownerRef.APIVersion),
			Version:      getVersionFromAPIVersion(ownerRef.APIVersion),
			ResourceType: kindToResource(ownerRef.Kind),
			ResourceName: ownerRef.Name,
		}
		b.addDependencyWithEdge(ctx, ownerResource, parentID, CategoryCustom, "owned-by", depth+1, false)
	}

	return nil
}
