package search

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/agentkube/operator/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

var standardResources = map[string][]string{
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

var (
	resourceCache   = make(map[string][]APIResource)
	resourceCacheMu sync.RWMutex
)

// Controller handles resource search operations
type Controller struct {
	restConfig      *rest.Config
	discoveryClient *discovery.DiscoveryClient
	dynamicClient   dynamic.Interface
}

// SearchResult represents a single search result
type SearchResult struct {
	Namespace    string `json:"namespace"`
	Group        string `json:"group"`
	Version      string `json:"version"`
	ResourceType string `json:"resourceType"`
	ResourceName string `json:"resourceName"`
	Namespaced   bool   `json:"namespaced"`
}

// SearchOptions contains parameters for search operations
type SearchOptions struct {
	Query        string   `json:"query"`
	Limit        int      `json:"limit,omitempty"`
	ClusterKey   string   `json:"clusterKey"`
	ResourceType string   `json:"resourceType,omitempty"`
	Namespaces   []string `json:"namespaces,omitempty"`
}

// APIResource represents a Kubernetes API resource
type APIResource struct {
	Group      string
	Version    string
	Resource   string
	Kind       string
	Namespaced bool
}

// NewController creates a new search controller
func NewController(config *rest.Config) (*Controller, error) {
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery client: %v", err)
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	return &Controller{
		restConfig:      config,
		discoveryClient: discoveryClient,
		dynamicClient:   dynamicClient,
	}, nil
}

// Search searches across Kubernetes native resources based on the provided options
func (c *Controller) Search(ctx context.Context, options SearchOptions) ([]SearchResult, error) {
	// Get the list of available API resources that match our standard resources
	allResources, err := c.getStandardResources(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get standard resources: %v", err)
	}

	// Split query into search terms
	searchTerms := splitSearchTerms(options.Query)

	// Filter resources by type if specified
	var resources []APIResource
	if options.ResourceType != "" {
		// Filter resources by the specified type
		for _, resource := range allResources {
			if strings.EqualFold(resource.Resource, options.ResourceType) {
				resources = append(resources, resource)
				break // Found the exact match, no need to continue
			}
		}
		// If no match found, check for partial matches
		if len(resources) == 0 {
			for _, resource := range allResources {
				if strings.Contains(strings.ToLower(resource.Resource), strings.ToLower(options.ResourceType)) {
					resources = append(resources, resource)
				}
			}
		}
	} else {
		// Check if any term is a resource type, if so filter by resource type
		for _, term := range searchTerms {
			resourcesByType := c.filterResourcesByType(allResources, term)
			if len(resourcesByType) > 0 {
				// We found a resource type match, use these resources
				resources = resourcesByType
				break
			}
		}
	}

	// If no resource type was found in the query, use all resources
	if len(resources) == 0 {
		resources = allResources
	}

	// Determine namespaces to search
	useClusterWide := len(options.Namespaces) == 0
	namespacesToSearch := options.Namespaces
	if !useClusterWide && len(namespacesToSearch) == 0 {
		// This case should be covered by useClusterWide, but for safety
		useClusterWide = true
	}

	// Prepare search
	var (
		results   []SearchResult
		resultsMu sync.Mutex
		wg        sync.WaitGroup
		semaphore = make(chan struct{}, 10) // Limit concurrent operations
	)

	// Search across resources
	for _, resource := range resources {
		wg.Add(1)
		go func(resource APIResource) {
			defer wg.Done()

			// Acquire semaphore
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// If no namespaces specified, search cluster-wide (optimized)
			if useClusterWide || !resource.Namespaced {
				resourceResults, err := c.searchClusterResource(ctx, resource, searchTerms)
				if err != nil {
					logger.Log(logger.LevelError, map[string]string{
						"resource": resource.Resource,
					}, err, "searching cluster-wide resources")
					return
				}

				resultsMu.Lock()
				results = append(results, resourceResults...)
				resultsMu.Unlock()
			} else {
				// Search only in specific namespaces
				for _, namespace := range namespacesToSearch {
					resourceResults, err := c.searchNamespacedResource(ctx, namespace, resource, searchTerms)
					if err != nil {
						logger.Log(logger.LevelError, map[string]string{
							"resource":  resource.Resource,
							"namespace": namespace,
						}, err, "searching namespaced resources")
						continue
					}

					resultsMu.Lock()
					results = append(results, resourceResults...)
					resultsMu.Unlock()

					// Check if we've reached the limit
					if options.Limit > 0 {
						resultsMu.Lock()
						reachedLimit := len(results) >= options.Limit
						resultsMu.Unlock()
						if reachedLimit {
							return
						}
					}
				}
			}
		}(resource)
	}

	wg.Wait()

	// Apply limit
	if options.Limit > 0 && len(results) > options.Limit {
		results = results[:options.Limit]
	}

	return results, nil
}

// splitSearchTerms splits the query into individual search terms
func splitSearchTerms(query string) []string {
	query = strings.TrimSpace(query)
	if query == "" {
		return []string{}
	}

	// Split by whitespace into terms
	terms := strings.Fields(query)

	// Convert all terms to lowercase
	for i, term := range terms {
		terms[i] = strings.ToLower(term)
	}

	return terms
}

// filterResourcesByType checks if the term matches any resource type and filters accordingly
func (c *Controller) filterResourcesByType(resources []APIResource, term string) []APIResource {
	if term == "" {
		return nil
	}

	var filteredResources []APIResource

	// First, check for exact matches with resource types
	for _, resource := range resources {
		resourceLower := strings.ToLower(resource.Resource)
		if resourceLower == term {
			// Exact match, prioritize this
			return []APIResource{resource}
		}
	}

	// Then check for partial matches
	for _, resource := range resources {
		resourceLower := strings.ToLower(resource.Resource)
		if strings.Contains(resourceLower, term) {
			filteredResources = append(filteredResources, resource)
		}
	}

	return filteredResources
}

// getStandardResources returns only the standard Kubernetes resources (cached version)
func (c *Controller) getStandardResources(_ context.Context) ([]APIResource, error) {
	clusterHost := c.restConfig.Host

	resourceCacheMu.RLock()
	if resources, ok := resourceCache[clusterHost]; ok {
		resourceCacheMu.RUnlock()
		return resources, nil
	}
	resourceCacheMu.RUnlock()

	resourceCacheMu.Lock()
	defer resourceCacheMu.Unlock()

	// Double check after acquiring write lock
	if resources, ok := resourceCache[clusterHost]; ok {
		return resources, nil
	}

	// Get server preferred versions for each group
	groups, err := c.discoveryClient.ServerGroups()
	if err != nil {
		return nil, fmt.Errorf("failed to get server groups: %v", err)
	}

	// Build a map of group to preferred version
	preferredVersions := make(map[string]string)
	for _, group := range groups.Groups {
		if len(group.Versions) > 0 {
			// Preferred version is first in the list
			preferredVersions[group.Name] = group.Versions[0].Version
		}
	}

	// For core group, use v1
	preferredVersions[""] = "v1"

	var resources []APIResource

	// Now get all resources of standard groups/kinds
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

		resourceList, err := c.discoveryClient.ServerResourcesForGroupVersion(groupVersion)
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
					resources = append(resources, APIResource{
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

	resourceCache[clusterHost] = resources
	return resources, nil
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

// listNamespaces returns all namespaces in the cluster
func (c *Controller) listNamespaces(ctx context.Context) ([]string, error) {
	gvr := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "namespaces",
	}

	namespaceList, err := c.dynamicClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var namespaces []string
	for _, item := range namespaceList.Items {
		namespaces = append(namespaces, item.GetName())
	}

	return namespaces, nil
}

// searchNamespacedResource searches for the query in a specific namespaced resource
func (c *Controller) searchNamespacedResource(ctx context.Context, namespace string, resource APIResource, searchTerms []string) ([]SearchResult, error) {
	gvr := schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.Resource,
	}

	list, err := c.dynamicClient.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var results []SearchResult
	for _, item := range list.Items {
		if c.resourceMatchesAllTerms(item, resource, searchTerms) {
			results = append(results, SearchResult{
				Namespace:    namespace,
				Group:        resource.Group,
				Version:      resource.Version,
				ResourceType: resource.Resource,
				ResourceName: item.GetName(),
				Namespaced:   true,
			})
		}
	}

	return results, nil
}

// searchClusterResource searches for the query in a cluster-scoped resource
func (c *Controller) searchClusterResource(ctx context.Context, resource APIResource, searchTerms []string) ([]SearchResult, error) {
	gvr := schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.Resource,
	}

	list, err := c.dynamicClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var results []SearchResult
	for _, item := range list.Items {
		if c.resourceMatchesAllTerms(item, resource, searchTerms) {
			results = append(results, SearchResult{
				Namespace:    item.GetNamespace(),
				Group:        resource.Group,
				Version:      resource.Version,
				ResourceType: resource.Resource,
				ResourceName: item.GetName(),
				Namespaced:   resource.Namespaced,
			})
		}
	}

	return results, nil
}

// resourceMatchesAllTerms checks if a resource matches all search terms
func (c *Controller) resourceMatchesAllTerms(item unstructured.Unstructured, resource APIResource, searchTerms []string) bool {
	// If no search terms, match everything
	if len(searchTerms) == 0 {
		return true
	}

	// Resource must match ALL terms to be included
	for _, term := range searchTerms {
		if !c.resourceMatchesTerm(item, resource, term) {
			return false
		}
	}

	return true
}

// resourceMatchesTerm checks if a resource matches a single search term
func (c *Controller) resourceMatchesTerm(item unstructured.Unstructured, resource APIResource, term string) bool {
	// Get resource name and namespace
	name := strings.ToLower(item.GetName())
	namespace := strings.ToLower(item.GetNamespace())
	resourceType := strings.ToLower(resource.Resource)

	// Check for matches in resource name
	if strings.Contains(name, term) {
		return true
	}

	// Check for matches in namespace
	if strings.Contains(namespace, term) {
		return true
	}

	// Check for matches in resource type
	if strings.Contains(resourceType, term) {
		return true
	}

	// Check for matches in labels
	labels := item.GetLabels()
	for k, v := range labels {
		if strings.Contains(strings.ToLower(k), term) ||
			strings.Contains(strings.ToLower(v), term) {
			return true
		}
	}

	// Check for matches in annotations
	annotations := item.GetAnnotations()
	for k, v := range annotations {
		if strings.Contains(strings.ToLower(k), term) ||
			strings.Contains(strings.ToLower(v), term) {
			return true
		}
	}

	return false
}
