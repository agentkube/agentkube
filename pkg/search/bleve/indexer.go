package bleve

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/search"
	"github.com/blevesearch/bleve/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

const batchSize = 1000

// Indexer handles indexing of Kubernetes resources into Bleve
type Indexer struct {
	index           bleve.Index
	dynamicClient   dynamic.Interface
	discoveryClient *discovery.DiscoveryClient
	restConfig      *rest.Config
}

// NewIndexer creates a new indexer
func NewIndexer(index bleve.Index, config *rest.Config) (*Indexer, error) {
	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery client: %w", err)
	}

	return &Indexer{
		index:           index,
		dynamicClient:   dynamicClient,
		discoveryClient: discoveryClient,
		restConfig:      config,
	}, nil
}

// IndexAllResources indexes all standard Kubernetes resources
func (i *Indexer) IndexAllResources(ctx context.Context, opts IndexOptions) (*IndexStats, error) {
	stats := &IndexStats{
		IndexingStarted: time.Now(),
		ResourceCounts:  make(map[string]uint64),
	}

	// Get all standard resources
	resources, err := i.GetStandardResources(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get standard resources: %w", err)
	}

	// Filter resources if specific types are requested
	if len(opts.ResourceTypes) > 0 {
		resources = filterResourceTypes(resources, opts.ResourceTypes)
	}

	// Get namespaces to index
	namespaces, err := i.GetNamespaces(ctx, opts.Namespaces)
	if err != nil {
		return nil, fmt.Errorf("failed to get namespaces: %w", err)
	}

	// Index each resource type
	for _, resource := range resources {
		select {
		case <-ctx.Done():
			return stats, ctx.Err()
		default:
		}

		count, err := i.indexResourceType(ctx, resource, namespaces)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"resource": resource.Resource,
				"group":    resource.Group,
			}, err, "failed to index resource type")
			continue
		}

		stats.ResourceCounts[resource.Resource] = count
		stats.DocumentCount += count
		stats.TotalBatches++
	}

	stats.IndexingEnded = time.Now()
	stats.LastIndexed = stats.IndexingEnded
	stats.LastUpdated = stats.IndexingEnded

	logger.Log(logger.LevelInfo, map[string]string{
		"documentCount": fmt.Sprintf("%d", stats.DocumentCount),
		"duration":      stats.IndexingEnded.Sub(stats.IndexingStarted).String(),
	}, nil, "indexing completed")

	return stats, nil
}

// indexResourceType indexes all resources of a specific type
func (i *Indexer) indexResourceType(ctx context.Context, resource search.APIResource, namespaces []string) (uint64, error) {
	gvr := schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.Resource,
	}

	var totalCount uint64

	if resource.Namespaced {
		// For namespaced resources, index across all namespaces
		for _, ns := range namespaces {
			count, err := i.indexNamespacedResources(ctx, gvr, ns, resource)
			if err != nil {
				logger.Log(logger.LevelWarn, map[string]string{
					"resource":  resource.Resource,
					"namespace": ns,
				}, err, "failed to index namespaced resources")
				continue
			}
			totalCount += count
		}
	} else {
		// For cluster-scoped resources
		count, err := i.indexClusterResources(ctx, gvr, resource)
		if err != nil {
			return 0, err
		}
		totalCount = count
	}

	return totalCount, nil
}

// indexNamespacedResources indexes resources in a specific namespace
func (i *Indexer) indexNamespacedResources(ctx context.Context, gvr schema.GroupVersionResource, namespace string, resource search.APIResource) (uint64, error) {
	list, err := i.dynamicClient.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, err
	}

	return i.batchIndexDocuments(list.Items, resource)
}

// indexClusterResources indexes cluster-scoped resources
func (i *Indexer) indexClusterResources(ctx context.Context, gvr schema.GroupVersionResource, resource search.APIResource) (uint64, error) {
	list, err := i.dynamicClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, err
	}

	return i.batchIndexDocuments(list.Items, resource)
}

// batchIndexDocuments indexes a batch of documents
func (i *Indexer) batchIndexDocuments(items []unstructured.Unstructured, resource search.APIResource) (uint64, error) {
	if len(items) == 0 {
		return 0, nil
	}

	batch := i.index.NewBatch()
	var count uint64

	for idx, item := range items {
		doc := mapResourceToDocument(&item, resource)
		if err := batch.Index(doc.ID, doc); err != nil {
			logger.Log(logger.LevelWarn, map[string]string{
				"docID": doc.ID,
			}, err, "failed to add document to batch")
			continue
		}

		count++

		// Execute batch when it reaches batchSize
		if (idx+1)%batchSize == 0 {
			if err := i.index.Batch(batch); err != nil {
				return count, fmt.Errorf("failed to execute batch: %w", err)
			}
			batch = i.index.NewBatch()
		}
	}

	// Execute remaining batch
	if batch.Size() > 0 {
		if err := i.index.Batch(batch); err != nil {
			return count, fmt.Errorf("failed to execute final batch: %w", err)
		}
	}

	return count, nil
}

// RefreshIndex re-syncs the index with current cluster state
func (i *Indexer) RefreshIndex(ctx context.Context, opts IndexOptions) (*IndexStats, error) {
	// For refresh, we re-index all resources
	// A more sophisticated implementation could track changes and only update diffs
	return i.IndexAllResources(ctx, opts)
}

// GetStandardResources returns the list of standard Kubernetes resources
func (i *Indexer) GetStandardResources(ctx context.Context) ([]search.APIResource, error) {
	// Use the same standardResources map from search package
	standardResources := map[string][]string{
		"": { // Core API group
			"pods",
			"configmaps",
			"secrets",
			"services",
			"endpoints",
			"nodes",
			"namespaces",
			"events",
			"persistentvolumes",
			"persistentvolumeclaims",
			"resourcequotas",
			"serviceaccounts",
		},
		"apps": {
			"deployments",
			"statefulsets",
			"daemonsets",
			"replicasets",
		},
		"batch": {
			"jobs",
			"cronjobs",
		},
		"autoscaling": {
			"horizontalpodautoscalers",
		},
		"networking.k8s.io": {
			"ingresses",
			"ingressclasses",
			"networkpolicies",
		},
		"storage.k8s.io": {
			"storageclasses",
		},
		"rbac.authorization.k8s.io": {
			"clusterroles",
			"clusterrolebindings",
			"roles",
			"rolebindings",
		},
	}

	// Get server preferred versions for each group
	groups, err := i.discoveryClient.ServerGroups()
	if err != nil {
		return nil, fmt.Errorf("failed to get server groups: %w", err)
	}

	// Build a map of group to preferred version
	preferredVersions := make(map[string]string)
	for _, group := range groups.Groups {
		if len(group.Versions) > 0 {
			preferredVersions[group.Name] = group.Versions[0].Version
		}
	}
	preferredVersions[""] = "v1"

	var resources []search.APIResource

	// Get all resources of standard groups/kinds
	for group, kinds := range standardResources {
		version := preferredVersions[group]
		if version == "" {
			continue
		}

		var groupVersion string
		if group == "" {
			groupVersion = version
		} else {
			groupVersion = group + "/" + version
		}

		resourceList, err := i.discoveryClient.ServerResourcesForGroupVersion(groupVersion)
		if err != nil {
			logger.Log(logger.LevelInfo, map[string]string{
				"groupVersion": groupVersion,
			}, err, "group/version not available")
			continue
		}

		for _, resource := range resourceList.APIResources {
			// Skip subresources
			if strings.Contains(resource.Name, "/") {
				continue
			}

			// Skip resources that cannot be listed
			if !hasVerb(resource, "list") {
				continue
			}

			// Check if this resource is in our standard list
			for _, kind := range kinds {
				if resource.Name == kind {
					resources = append(resources, search.APIResource{
						Group:      group,
						Version:    version,
						Resource:   resource.Name,
						Kind:       resource.Kind,
						Namespaced: resource.Namespaced,
					})
					break
				}
			}
		}
	}

	return resources, nil
}

// GetNamespaces returns namespaces to index
func (i *Indexer) GetNamespaces(ctx context.Context, requestedNamespaces []string) ([]string, error) {
	if len(requestedNamespaces) > 0 {
		return requestedNamespaces, nil
	}

	// Get all namespaces
	gvr := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "namespaces",
	}

	namespaceList, err := i.dynamicClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var namespaces []string
	for _, item := range namespaceList.Items {
		namespaces = append(namespaces, item.GetName())
	}

	return namespaces, nil
}

// mapResourceToDocument converts a Kubernetes resource to a Bleve document
func mapResourceToDocument(resource *unstructured.Unstructured, apiResource search.APIResource) ResourceDocument {
	docID := generateDocID(resource, apiResource)

	labels := resource.GetLabels()
	if labels == nil {
		labels = make(map[string]string)
	}

	annotations := resource.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}

	return ResourceDocument{
		ID:           docID,
		Name:         resource.GetName(),
		Namespace:    resource.GetNamespace(),
		ResourceType: apiResource.Resource,
		Group:        apiResource.Group,
		Version:      apiResource.Version,
		Namespaced:   apiResource.Namespaced,
		Labels:       labels,
		Annotations:  annotations,
		CreatedAt:    resource.GetCreationTimestamp().Time,
	}
}

// generateDocID generates a unique document ID for a resource
func generateDocID(resource *unstructured.Unstructured, apiResource search.APIResource) string {
	if resource.GetNamespace() != "" {
		return fmt.Sprintf("%s:%s:%s", resource.GetNamespace(), apiResource.Resource, resource.GetName())
	}
	return fmt.Sprintf("%s:%s", apiResource.Resource, resource.GetName())
}

// hasVerb checks if a resource has a specific verb
func hasVerb(resource metav1.APIResource, verb string) bool {
	for _, v := range resource.Verbs {
		if v == verb {
			return true
		}
	}
	return false
}

// filterResourceTypes filters resources by type
func filterResourceTypes(resources []search.APIResource, types []string) []search.APIResource {
	if len(types) == 0 {
		return resources
	}

	typeMap := make(map[string]bool)
	for _, t := range types {
		typeMap[strings.ToLower(t)] = true
	}

	var filtered []search.APIResource
	for _, r := range resources {
		if typeMap[strings.ToLower(r.Resource)] {
			filtered = append(filtered, r)
		}
	}

	return filtered
}
