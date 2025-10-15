package canvas

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
)

// isCustomResource checks if the given resource is a custom resource
// by checking if its group is not in the core Kubernetes groups
func (c *Controller) isCustomResource(resource ResourceIdentifier) bool {
	coreGroups := map[string]bool{
		"":                          true, // core/v1
		"apps":                      true,
		"batch":                     true,
		"extensions":                true,
		"networking.k8s.io":         true,
		"policy":                    true,
		"rbac.authorization.k8s.io": true,
		"storage.k8s.io":            true,
		"autoscaling":               true,
	}

	return !coreGroups[resource.Group]
}

// findResourcesByOwnerUID finds all resources in a namespace that are owned by a specific UID
func (c *Controller) findResourcesByOwnerUID(
	ctx context.Context,
	client dynamic.Interface,
	ownerUID types.UID,
	namespace string,
) ([]ResourceIdentifier, error) {
	var ownedResources []ResourceIdentifier

	// Resource types to check for ownership in hierarchical order
	// These are the most common resources that can be owned by custom resources
	resourceTypes := []schema.GroupVersionResource{
		// Core workloads (ordered by typical hierarchy)
		{Group: "", Version: "v1", Resource: "services"},
		{Group: "apps", Version: "v1", Resource: "deployments"},
		{Group: "apps", Version: "v1", Resource: "statefulsets"},
		{Group: "apps", Version: "v1", Resource: "daemonsets"},
		{Group: "batch", Version: "v1", Resource: "jobs"},
		{Group: "batch", Version: "v1", Resource: "cronjobs"},
		{Group: "apps", Version: "v1", Resource: "replicasets"},
		{Group: "", Version: "v1", Resource: "pods"},
		// Configuration and storage
		{Group: "", Version: "v1", Resource: "configmaps"},
		{Group: "", Version: "v1", Resource: "secrets"},
		{Group: "", Version: "v1", Resource: "serviceaccounts"},
		{Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
		// Networking
		{Group: "", Version: "v1", Resource: "endpoints"},
		{Group: "discovery.k8s.io", Version: "v1", Resource: "endpointslices"},
		{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
		{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"},
		// Controller tracking
		{Group: "apps", Version: "v1", Resource: "controllerrevisions"},
	}

	for _, gvr := range resourceTypes {
		list, err := client.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			// Ignore errors for resources that might not exist in this cluster
			continue
		}

		for _, item := range list.Items {
			for _, owner := range item.GetOwnerReferences() {
				if owner.UID == ownerUID {
					ownedResources = append(ownedResources, ResourceIdentifier{
						Namespace:    item.GetNamespace(),
						Group:        gvr.Group,
						Version:      gvr.Version,
						ResourceType: gvr.Resource,
						ResourceName: item.GetName(),
					})
					break
				}
			}
		}
	}

	return ownedResources, nil
}

// findAllControlledPods finds all pods that are ultimately controlled by the given resource
// This traverses the ownership chain (CR -> StatefulSet/Deployment -> ReplicaSet -> Pod)
func (c *Controller) findAllControlledPods(
	ctx context.Context,
	client dynamic.Interface,
	resource ResourceIdentifier,
	response *GraphResponse,
) []ResourceIdentifier {
	var allPods []ResourceIdentifier

	// Look through all nodes in the response to find pods
	for _, node := range response.Nodes {
		if resourceType, ok := node.Data["resourceType"].(string); ok && resourceType == "pods" {
			if namespace, ok := node.Data["namespace"].(string); ok {
				if resourceName, ok := node.Data["resourceName"].(string); ok {
					allPods = append(allPods, ResourceIdentifier{
						Namespace:    namespace,
						Group:        "",
						Version:      "v1",
						ResourceType: "pods",
						ResourceName: resourceName,
					})
				}
			}
		}
	}

	return allPods
}

// extractServiceAccount gets the ServiceAccount used by a pod
func (c *Controller) extractServiceAccount(
	ctx context.Context,
	client dynamic.Interface,
	pod ResourceIdentifier,
) (*ResourceIdentifier, error) {
	podObj, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).Namespace(pod.Namespace).Get(ctx, pod.ResourceName, metav1.GetOptions{})

	if err != nil {
		return nil, err
	}

	// Get ServiceAccount name from pod spec
	saName := "default"
	if sa, found, _ := getNestedString(podObj.Object, "spec", "serviceAccountName"); found && sa != "" {
		saName = sa
	} else if sa, found, _ := getNestedString(podObj.Object, "spec", "serviceAccount"); found && sa != "" {
		saName = sa
	}

	return &ResourceIdentifier{
		Namespace:    pod.Namespace,
		Group:        "",
		Version:      "v1",
		ResourceType: "serviceaccounts",
		ResourceName: saName,
	}, nil
}

// findRoleBindingsForServiceAccount finds RoleBindings that reference the given ServiceAccount
func (c *Controller) findRoleBindingsForServiceAccount(
	ctx context.Context,
	client dynamic.Interface,
	sa ResourceIdentifier,
) ([]ResourceIdentifier, error) {
	var roleBindings []ResourceIdentifier

	// Check RoleBindings in the namespace
	rbList, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "rolebindings",
	}).Namespace(sa.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return roleBindings, err
	}

	for _, rb := range rbList.Items {
		subjects, found, _ := getNestedSlice(rb.Object, "subjects")
		if !found {
			continue
		}

		for _, subject := range subjects {
			subjectMap, ok := subject.(map[string]interface{})
			if !ok {
				continue
			}

			kind, _, _ := getNestedString(subjectMap, "kind")
			name, _, _ := getNestedString(subjectMap, "name")
			namespace, _, _ := getNestedString(subjectMap, "namespace")

			if kind == "ServiceAccount" && name == sa.ResourceName &&
				(namespace == "" || namespace == sa.Namespace) {
				roleBindings = append(roleBindings, ResourceIdentifier{
					Namespace:    rb.GetNamespace(),
					Group:        "rbac.authorization.k8s.io",
					Version:      "v1",
					ResourceType: "rolebindings",
					ResourceName: rb.GetName(),
				})
				break
			}
		}
	}

	return roleBindings, nil
}

// findClusterRoleBindingsForServiceAccount finds ClusterRoleBindings that reference the given ServiceAccount
func (c *Controller) findClusterRoleBindingsForServiceAccount(
	ctx context.Context,
	client dynamic.Interface,
	sa ResourceIdentifier,
) ([]ResourceIdentifier, error) {
	var clusterRoleBindings []ResourceIdentifier

	crbList, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "clusterrolebindings",
	}).List(ctx, metav1.ListOptions{})

	if err != nil {
		return clusterRoleBindings, err
	}

	for _, crb := range crbList.Items {
		subjects, found, _ := getNestedSlice(crb.Object, "subjects")
		if !found {
			continue
		}

		for _, subject := range subjects {
			subjectMap, ok := subject.(map[string]interface{})
			if !ok {
				continue
			}

			kind, _, _ := getNestedString(subjectMap, "kind")
			name, _, _ := getNestedString(subjectMap, "name")
			namespace, _, _ := getNestedString(subjectMap, "namespace")

			if kind == "ServiceAccount" && name == sa.ResourceName && namespace == sa.Namespace {
				clusterRoleBindings = append(clusterRoleBindings, ResourceIdentifier{
					Namespace:    "",
					Group:        "rbac.authorization.k8s.io",
					Version:      "v1",
					ResourceType: "clusterrolebindings",
					ResourceName: crb.GetName(),
				})
				break
			}
		}
	}

	return clusterRoleBindings, nil
}

// getRoleFromBinding extracts the Role reference from a RoleBinding
func (c *Controller) getRoleFromBinding(
	ctx context.Context,
	client dynamic.Interface,
	binding ResourceIdentifier,
) (*ResourceIdentifier, error) {
	bindingObj, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: binding.ResourceType,
	}).Namespace(binding.Namespace).Get(ctx, binding.ResourceName, metav1.GetOptions{})

	if err != nil {
		return nil, err
	}

	roleRefKind, found, _ := getNestedString(bindingObj.Object, "roleRef", "kind")
	if !found {
		return nil, fmt.Errorf("roleRef not found in binding")
	}

	roleRefName, found, _ := getNestedString(bindingObj.Object, "roleRef", "name")
	if !found {
		return nil, fmt.Errorf("roleRef name not found in binding")
	}

	// Determine resource type based on kind
	resourceType := "roles"
	namespace := binding.Namespace
	if roleRefKind == "ClusterRole" {
		resourceType = "clusterroles"
		namespace = ""
	}

	return &ResourceIdentifier{
		Namespace:    namespace,
		Group:        "rbac.authorization.k8s.io",
		Version:      "v1",
		ResourceType: resourceType,
		ResourceName: roleRefName,
	}, nil
}

// Helper function to safely get nested string from unstructured object
func getNestedString(obj map[string]interface{}, fields ...string) (string, bool, error) {
	val, found, err := getNestedValue(obj, fields...)
	if !found || err != nil {
		return "", found, err
	}
	str, ok := val.(string)
	return str, ok, nil
}

// Helper function to safely get nested slice from unstructured object
func getNestedSlice(obj map[string]interface{}, fields ...string) ([]interface{}, bool, error) {
	val, found, err := getNestedValue(obj, fields...)
	if !found || err != nil {
		return nil, found, err
	}
	slice, ok := val.([]interface{})
	return slice, ok, nil
}

// Helper function to get nested value
func getNestedValue(obj map[string]interface{}, fields ...string) (interface{}, bool, error) {
	current := obj
	for i, field := range fields {
		val, found := current[field]
		if !found {
			return nil, false, nil
		}

		if i == len(fields)-1 {
			return val, true, nil
		}

		current, found = val.(map[string]interface{})
		if !found {
			return nil, false, fmt.Errorf("field %s is not a map", field)
		}
	}
	return nil, false, nil
}
