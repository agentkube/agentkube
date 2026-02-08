package canvas

import (
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// buildDependencyNode creates a DependencyNode from a resource
func (b *DependencyGraphBuilder) buildDependencyNode(ctx context.Context, resource ResourceIdentifier, category DependencyCategory, depth int, relationType string) (DependencyNode, error) {
	obj, err := b.getResource(ctx, resource)
	if err != nil {
		return DependencyNode{}, err
	}

	data := map[string]interface{}{
		"namespace":    resource.Namespace,
		"group":        resource.Group,
		"version":      resource.Version,
		"resourceType": resource.ResourceType,
		"resourceName": resource.ResourceName,
		"labels":       obj.GetLabels(),
		"createdAt":    obj.GetCreationTimestamp().String(),
	}

	return DependencyNode{
		Node: Node{
			ID:   b.getNodeID(resource),
			Type: string(category),
			Data: data,
		},
		Category:     category,
		Depth:        depth,
		RelationType: relationType,
	}, nil
}

// getNodeID generates a unique node ID for a resource
func (b *DependencyGraphBuilder) getNodeID(resource ResourceIdentifier) string {
	return fmt.Sprintf("%s-%s-%s-%s", resource.Namespace, resource.ResourceType, resource.Group, resource.ResourceName)
}

// getResourceKey generates a unique key for tracking visited resources
func (b *DependencyGraphBuilder) getResourceKey(resource ResourceIdentifier) string {
	return fmt.Sprintf("%s/%s/%s/%s/%s", resource.Group, resource.Version, resource.ResourceType, resource.Namespace, resource.ResourceName)
}

// addNode adds a node to the graph if not already present
func (b *DependencyGraphBuilder) addNode(node DependencyNode) {
	b.mu.Lock()
	defer b.mu.Unlock()

	key := node.ID
	if _, exists := b.nodeIDMap[key]; !exists {
		b.nodeIDMap[key] = len(b.nodes)
		b.nodes = append(b.nodes, node)
	}
}

// addEdge adds an edge to the graph
func (b *DependencyGraphBuilder) addEdge(edge DependencyEdge) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.edges = append(b.edges, edge)
}

// addDependencyWithEdge adds a dependency node and edge
func (b *DependencyGraphBuilder) addDependencyWithEdge(ctx context.Context, resource ResourceIdentifier, parentID string, category DependencyCategory, relationship string, depth int, critical bool) error {
	key := b.getResourceKey(resource)

	b.mu.Lock()
	if b.visited[key] {
		b.mu.Unlock()
		// Still add edge even if node exists
		b.addEdge(DependencyEdge{
			Edge: Edge{
				ID:     fmt.Sprintf("edge-%d", len(b.edges)+1),
				Source: parentID,
				Target: b.getNodeID(resource),
				Type:   "smoothstep",
				Label:  relationship,
			},
			Category:     category,
			Relationship: relationship,
			Critical:     critical,
		})
		return nil
	}
	b.visited[key] = true
	b.mu.Unlock()

	node, err := b.buildDependencyNode(ctx, resource, category, depth, relationship)
	if err != nil {
		return err
	}

	b.addNode(node)
	b.addEdge(DependencyEdge{
		Edge: Edge{
			ID:     fmt.Sprintf("edge-%d", len(b.edges)+1),
			Source: parentID,
			Target: node.ID,
			Type:   "smoothstep",
			Label:  relationship,
		},
		Category:     category,
		Relationship: relationship,
		Critical:     critical,
	})

	return nil
}

// getResource fetches a resource from the cluster
func (b *DependencyGraphBuilder) getResource(ctx context.Context, resource ResourceIdentifier) (*unstructured.Unstructured, error) {
	gvr := schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.ResourceType,
	}

	if resource.Namespace != "" {
		return b.client.Resource(gvr).Namespace(resource.Namespace).Get(ctx, resource.ResourceName, metav1.GetOptions{})
	}
	return b.client.Resource(gvr).Get(ctx, resource.ResourceName, metav1.GetOptions{})
}

// findOwnedResources finds resources owned by the given resource
func (b *DependencyGraphBuilder) findOwnedResources(ctx context.Context, owner ResourceIdentifier, group, version, resourceType string) ([]ResourceIdentifier, error) {
	ownerObj, err := b.getResource(ctx, owner)
	if err != nil {
		return nil, err
	}
	ownerUID := ownerObj.GetUID()

	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resourceType}
	list, err := b.client.Resource(gvr).Namespace(owner.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var owned []ResourceIdentifier
	for _, item := range list.Items {
		for _, ref := range item.GetOwnerReferences() {
			if ref.UID == ownerUID {
				owned = append(owned, ResourceIdentifier{
					Namespace:    item.GetNamespace(),
					Group:        group,
					Version:      version,
					ResourceType: resourceType,
					ResourceName: item.GetName(),
				})
				break
			}
		}
	}
	return owned, nil
}

// addNodeDependency adds the node where the pod is scheduled
func (b *DependencyGraphBuilder) addNodeDependency(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	nodeName, found, _ := unstructured.NestedString(obj.Object, "spec", "nodeName")
	if !found || nodeName == "" {
		return nil
	}

	nodeResource := ResourceIdentifier{
		Namespace:    "",
		Group:        "",
		Version:      "v1",
		ResourceType: "nodes",
		ResourceName: nodeName,
	}

	return b.addDependencyWithEdge(ctx, nodeResource, parentID, CategoryCompute, "scheduled-on", depth+1, true)
}

// addServiceAccountDependencies adds ServiceAccount and RBAC dependencies
func (b *DependencyGraphBuilder) addServiceAccountDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	saName, found, _ := unstructured.NestedString(obj.Object, "spec", "serviceAccountName")
	if !found || saName == "" {
		saName = "default"
	}

	saResource := ResourceIdentifier{
		Namespace:    resource.Namespace,
		Group:        "",
		Version:      "v1",
		ResourceType: "serviceaccounts",
		ResourceName: saName,
	}

	if err := b.addDependencyWithEdge(ctx, saResource, parentID, CategoryRBAC, "uses-account", depth+1, true); err != nil {
		return err
	}

	// Find RoleBindings for this SA
	b.addRoleBindingsForSA(ctx, saResource, b.getNodeID(saResource), depth+1)

	// Find ClusterRoleBindings for this SA
	b.addClusterRoleBindingsForSA(ctx, saResource, b.getNodeID(saResource), depth+1)

	return nil
}

// addRoleBindingsForSA finds and adds RoleBindings for a ServiceAccount
func (b *DependencyGraphBuilder) addRoleBindingsForSA(ctx context.Context, sa ResourceIdentifier, saNodeID string, depth int) {
	rbList, err := b.client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "rolebindings",
	}).Namespace(sa.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return
	}

	for _, rb := range rbList.Items {
		subjects, found, _ := unstructured.NestedSlice(rb.Object, "subjects")
		if !found {
			continue
		}

		for _, subject := range subjects {
			subjectMap, ok := subject.(map[string]interface{})
			if !ok {
				continue
			}

			kind, _, _ := unstructured.NestedString(subjectMap, "kind")
			name, _, _ := unstructured.NestedString(subjectMap, "name")
			ns, _, _ := unstructured.NestedString(subjectMap, "namespace")

			if kind == "ServiceAccount" && name == sa.ResourceName && (ns == "" || ns == sa.Namespace) {
				rbResource := ResourceIdentifier{
					Namespace:    rb.GetNamespace(),
					Group:        "rbac.authorization.k8s.io",
					Version:      "v1",
					ResourceType: "rolebindings",
					ResourceName: rb.GetName(),
				}
				b.addDependencyWithEdge(ctx, rbResource, saNodeID, CategoryRBAC, "bound-by", depth+1, false)

				// Add the Role/ClusterRole referenced
				b.addRoleFromBinding(ctx, rbResource, b.getNodeID(rbResource), depth+1)
				break
			}
		}
	}
}

// addClusterRoleBindingsForSA finds and adds ClusterRoleBindings for a ServiceAccount
func (b *DependencyGraphBuilder) addClusterRoleBindingsForSA(ctx context.Context, sa ResourceIdentifier, saNodeID string, depth int) {
	crbList, err := b.client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "clusterrolebindings",
	}).List(ctx, metav1.ListOptions{})
	if err != nil {
		return
	}

	for _, crb := range crbList.Items {
		subjects, found, _ := unstructured.NestedSlice(crb.Object, "subjects")
		if !found {
			continue
		}

		for _, subject := range subjects {
			subjectMap, ok := subject.(map[string]interface{})
			if !ok {
				continue
			}

			kind, _, _ := unstructured.NestedString(subjectMap, "kind")
			name, _, _ := unstructured.NestedString(subjectMap, "name")
			ns, _, _ := unstructured.NestedString(subjectMap, "namespace")

			if kind == "ServiceAccount" && name == sa.ResourceName && ns == sa.Namespace {
				crbResource := ResourceIdentifier{
					Namespace:    "",
					Group:        "rbac.authorization.k8s.io",
					Version:      "v1",
					ResourceType: "clusterrolebindings",
					ResourceName: crb.GetName(),
				}
				b.addDependencyWithEdge(ctx, crbResource, saNodeID, CategoryRBAC, "bound-by", depth+1, false)

				// Add the ClusterRole referenced
				b.addRoleFromBinding(ctx, crbResource, b.getNodeID(crbResource), depth+1)
				break
			}
		}
	}
}

// addRoleFromBinding adds the Role/ClusterRole referenced by a binding
func (b *DependencyGraphBuilder) addRoleFromBinding(ctx context.Context, binding ResourceIdentifier, bindingNodeID string, depth int) {
	bindingObj, err := b.getResource(ctx, binding)
	if err != nil {
		return
	}

	roleRefKind, _, _ := unstructured.NestedString(bindingObj.Object, "roleRef", "kind")
	roleRefName, _, _ := unstructured.NestedString(bindingObj.Object, "roleRef", "name")

	if roleRefName == "" {
		return
	}

	var roleResource ResourceIdentifier
	if roleRefKind == "ClusterRole" {
		roleResource = ResourceIdentifier{
			Namespace:    "",
			Group:        "rbac.authorization.k8s.io",
			Version:      "v1",
			ResourceType: "clusterroles",
			ResourceName: roleRefName,
		}
	} else {
		roleResource = ResourceIdentifier{
			Namespace:    binding.Namespace,
			Group:        "rbac.authorization.k8s.io",
			Version:      "v1",
			ResourceType: "roles",
			ResourceName: roleRefName,
		}
	}

	b.addDependencyWithEdge(ctx, roleResource, bindingNodeID, CategoryRBAC, "grants", depth+1, false)
}

// addVolumeDependencies adds ConfigMap and Secret dependencies from volumes
func (b *DependencyGraphBuilder) addVolumeDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	volumes, found, _ := unstructured.NestedSlice(obj.Object, "spec", "volumes")
	if !found {
		return nil
	}

	for _, volume := range volumes {
		volumeMap, ok := volume.(map[string]interface{})
		if !ok {
			continue
		}

		// ConfigMap volumes
		if cmName, found, _ := unstructured.NestedString(volumeMap, "configMap", "name"); found && cmName != "" {
			cmResource := ResourceIdentifier{
				Namespace:    resource.Namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "configmaps",
				ResourceName: cmName,
			}
			b.addDependencyWithEdge(ctx, cmResource, parentID, CategoryConfiguration, "mounts", depth+1, true)
		}

		// Secret volumes
		if secretName, found, _ := unstructured.NestedString(volumeMap, "secret", "secretName"); found && secretName != "" {
			secretResource := ResourceIdentifier{
				Namespace:    resource.Namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "secrets",
				ResourceName: secretName,
			}
			b.addDependencyWithEdge(ctx, secretResource, parentID, CategoryConfiguration, "mounts", depth+1, true)
		}

		// Projected volumes
		if sources, found, _ := unstructured.NestedSlice(volumeMap, "projected", "sources"); found {
			for _, source := range sources {
				sourceMap, ok := source.(map[string]interface{})
				if !ok {
					continue
				}

				if cmName, found, _ := unstructured.NestedString(sourceMap, "configMap", "name"); found && cmName != "" {
					cmResource := ResourceIdentifier{
						Namespace:    resource.Namespace,
						Group:        "",
						Version:      "v1",
						ResourceType: "configmaps",
						ResourceName: cmName,
					}
					b.addDependencyWithEdge(ctx, cmResource, parentID, CategoryConfiguration, "projects", depth+1, false)
				}

				if secretName, found, _ := unstructured.NestedString(sourceMap, "secret", "name"); found && secretName != "" {
					secretResource := ResourceIdentifier{
						Namespace:    resource.Namespace,
						Group:        "",
						Version:      "v1",
						ResourceType: "secrets",
						ResourceName: secretName,
					}
					b.addDependencyWithEdge(ctx, secretResource, parentID, CategoryConfiguration, "projects", depth+1, false)
				}
			}
		}
	}

	return nil
}

// Helper functions
func getGroupFromAPIVersion(apiVersion string) string {
	parts := strings.Split(apiVersion, "/")
	if len(parts) == 2 {
		return parts[0]
	}
	return "" // core API group
}

func getVersionFromAPIVersion(apiVersion string) string {
	parts := strings.Split(apiVersion, "/")
	if len(parts) == 2 {
		return parts[1]
	}
	return apiVersion
}

func kindToResource(kind string) string {
	// Simple pluralization
	kind = strings.ToLower(kind)
	if strings.HasSuffix(kind, "s") {
		return kind + "es"
	}
	return kind + "s"
}
