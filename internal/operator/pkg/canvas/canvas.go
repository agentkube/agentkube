package canvas

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// Controller handles canvas operations
type Controller struct {
	restConfig *rest.Config
}

// NewController creates a new canvas controller
func NewController(restConfig *rest.Config) (*Controller, error) {
	return &Controller{
		restConfig: restConfig,
	}, nil
}

// GetGraphNodes retrieves the graph representation of Kubernetes resources
func (c *Controller) GetGraphNodes(ctx context.Context, resource ResourceIdentifier, attackPath bool) (*GraphResponse, error) {
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	response := &GraphResponse{
		Nodes: []Node{},
		Edges: []Edge{},
	}

	// Add main resource node
	mainNode, err := c.buildResourceNode(ctx, dynamicClient, resource)
	if err != nil {
		return nil, err
	}
	response.Nodes = append(response.Nodes, mainNode)

	// Check if this is a custom resource
	if c.isCustomResource(resource) {
		err = c.processCustomResourceGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
	} else {
		// Process related resources based on type for core resources
		switch resource.ResourceType {
		case "deployments":
			err = c.processDeploymentGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "statefulsets":
			err = c.processStatefulSetGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "daemonsets":
			err = c.processDaemonSetGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "services":
			err = c.processServiceGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "jobs":
			err = c.processJobGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "cronjobs":
			err = c.processCronJobGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "nodes":
			err = c.processNodeGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "roles":
			err = c.processRoleGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "clusterroles":
			err = c.processClusterRoleGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "rolebindings":
			err = c.processRoleBindingGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "clusterrolebindings":
			err = c.processClusterRoleBindingGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		case "serviceaccounts":
			err = c.processServiceAccountGraph(ctx, dynamicClient, mainNode.ID, resource, response, attackPath)
		default:
			// For other resource types, just return the single node
			return response, nil
		}
	}

	if err != nil {
		return nil, err
	}

	// If attack-path mode, add additional security-related resources
	if attackPath {
		err = c.addAttackPathResources(ctx, dynamicClient, resource, response)
		if err != nil {
			return nil, err
		}
	}

	return response, nil
}

// Resource Processing Functions

func (c *Controller) processDeploymentGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find ReplicaSets
	rsList, err := c.findReplicaSets(ctx, client, resource)
	if err != nil {
		return err
	}

	// Process each ReplicaSet
	for _, rs := range rsList {
		rsNode, err := c.buildResourceNode(ctx, client, rs)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, rsNode)

		// Add edge from deployment to replicaset
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: rsNode.ID,
			Type:   "smoothstep",
			Label:  "manages",
		})

		// Find and process pods
		pods, err := c.findPods(ctx, client, rs)
		if err != nil {
			continue
		}

		for _, pod := range pods {
			podNode, err := c.buildResourceNode(ctx, client, pod)
			if err != nil {
				continue
			}
			response.Nodes = append(response.Nodes, podNode)

			// Add edge from replicaset to pod
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: rsNode.ID,
				Target: podNode.ID,
				Type:   "smoothstep",
				Label:  "manages",
			})

			// If attack-path mode, add container details
			if attackPath {
				err = c.addContainerNodes(ctx, client, pod, podNode.ID, response)
				if err != nil {
					continue
				}
			}
		}
	}

	return nil
}

func (c *Controller) processStatefulSetGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Get the StatefulSet object to extract its UID
	stsObj, err := client.Resource(schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.ResourceType,
	}).Namespace(resource.Namespace).Get(ctx, resource.ResourceName, metav1.GetOptions{})
	if err == nil {
		stsUID := stsObj.GetUID()

		// Find ControllerRevisions owned by this StatefulSet
		controllerRevisions, err := c.findResourcesByOwnerUID(ctx, client, stsUID, resource.Namespace)
		if err == nil {
			for _, cr := range controllerRevisions {
				if cr.ResourceType == "controllerrevisions" {
					crNode, err := c.buildResourceNode(ctx, client, cr)
					if err != nil {
						continue
					}
					response.Nodes = append(response.Nodes, crNode)

					response.Edges = append(response.Edges, Edge{
						ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
						Source: parentID,
						Target: crNode.ID,
						Type:   "smoothstep",
						Label:  "tracks",
					})
				}
			}
		}
	}

	// Find controlled pods
	pods, err := c.findControlledPods(ctx, client, resource)
	if err != nil {
		return err
	}

	// Process each pod
	for _, pod := range pods {
		podNode, err := c.buildResourceNode(ctx, client, pod)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, podNode)

		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: podNode.ID,
			Type:   "smoothstep",
			Label:  "manages",
		})

		// If attack-path mode, add container details
		if attackPath {
			err = c.addContainerNodes(ctx, client, pod, podNode.ID, response)
			if err != nil {
				continue
			}
		}
	}

	return nil
}

func (c *Controller) processDaemonSetGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find controlled pods
	pods, err := c.findControlledPods(ctx, client, resource)
	if err != nil {
		return err
	}

	// Add each pod as a node with edge from daemonset
	for _, pod := range pods {
		podNode, err := c.buildResourceNode(ctx, client, pod)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, podNode)

		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: podNode.ID,
			Type:   "smoothstep",
			Label:  "manages",
		})

		// If attack-path mode, add container details
		if attackPath {
			err = c.addContainerNodes(ctx, client, pod, podNode.ID, response)
			if err != nil {
				continue
			}
		}
	}

	return nil
}

func (c *Controller) processServiceGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, _ bool) error {
	// Find EndpointSlices for this service
	endpointSlices, err := c.findEndpointSlicesForService(ctx, client, resource)
	if err == nil {
		for _, eps := range endpointSlices {
			epsNode, err := c.buildResourceNode(ctx, client, eps)
			if err != nil {
				continue
			}
			response.Nodes = append(response.Nodes, epsNode)

			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: parentID,
				Target: epsNode.ID,
				Type:   "smoothstep",
				Label:  "tracks-endpoints",
			})
		}
	}

	// Find pods that match service selector
	pods, err := c.findServicePods(ctx, client, resource)
	if err != nil {
		return err
	}

	// Process each pod
	for _, pod := range pods {
		podNode, err := c.buildResourceNode(ctx, client, pod)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, podNode)

		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: podNode.ID,
			Type:   "smoothstep",
			Label:  "routes-to",
		})
	}

	return nil
}

func (c *Controller) processJobGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find pods controlled by this job
	pods, err := c.findControlledPods(ctx, client, resource)
	if err != nil {
		return err
	}

	// Process each pod
	for _, pod := range pods {
		podNode, err := c.buildResourceNode(ctx, client, pod)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, podNode)

		// Add edge from job to pod
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: podNode.ID,
			Type:   "smoothstep",
			Label:  "manages",
		})

		// If attack-path mode, add container details
		if attackPath {
			err = c.addContainerNodes(ctx, client, pod, podNode.ID, response)
			if err != nil {
				continue
			}
		}
	}

	return nil
}

func (c *Controller) processCronJobGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find jobs created by this cronjob
	jobs, err := c.findCronJobJobs(ctx, client, resource)
	if err != nil {
		return err
	}

	// Process each job
	for _, job := range jobs {
		jobNode, err := c.buildResourceNode(ctx, client, job)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, jobNode)

		// Add edge from cronjob to job
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: jobNode.ID,
			Type:   "smoothstep",
			Label:  "creates",
		})

		// Process pods for each job
		pods, err := c.findControlledPods(ctx, client, job)
		if err != nil {
			continue
		}

		for _, pod := range pods {
			podNode, err := c.buildResourceNode(ctx, client, pod)
			if err != nil {
				continue
			}
			response.Nodes = append(response.Nodes, podNode)

			// Add edge from job to pod
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: jobNode.ID,
				Target: podNode.ID,
				Type:   "smoothstep",
				Label:  "manages",
			})

			// If attack-path mode, add container details
			if attackPath {
				err = c.addContainerNodes(ctx, client, pod, podNode.ID, response)
				if err != nil {
					continue
				}
			}
		}
	}

	return nil
}

func (c *Controller) processNodeGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, _ bool) error {
	// Get all pods running on this node
	podList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s,status.phase=Running", resource.ResourceName),
	})

	if err != nil {
		return fmt.Errorf("failed to list pods on node %s: %v", resource.ResourceName, err)
	}

	// Add each running pod as a node
	for _, pod := range podList.Items {
		podResource := ResourceIdentifier{
			Namespace:    pod.GetNamespace(),
			Group:        "",
			Version:      "v1",
			ResourceType: "pods",
			ResourceName: pod.GetName(),
		}

		podNode, err := c.buildResourceNode(ctx, client, podResource)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, podNode)

		// Add edge from node to pod to show which pods are running on this node
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: podNode.ID,
			Type:   "smoothstep",
			Label:  "running",
		})
	}

	return nil
}

// processRoleGraph handles graph generation for Roles
func (c *Controller) processRoleGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find RoleBindings that reference this Role
	roleBindings, err := c.findRoleBindingsForRole(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, rb := range roleBindings {
		rbNode, err := c.buildResourceNode(ctx, client, rb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, rbNode)

		// Add edge from rolebinding to role
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: rbNode.ID,
			Type:   "smoothstep",
			Label:  "grant-permissions",
		})

		// Find ServiceAccounts bound by this RoleBinding
		serviceAccounts, err := c.findServiceAccountsForRoleBinding(ctx, client, rb)
		if err != nil {
			continue
		}

		for _, sa := range serviceAccounts {
			saNode, err := c.buildResourceNode(ctx, client, sa)
			if err != nil {
				continue
			}
			response.Nodes = append(response.Nodes, saNode)

			// Add edge from rolebinding to serviceaccount
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: saNode.ID,
				Target: rbNode.ID,
				Type:   "smoothstep",
				Label:  "binds-to",
			})
		}
	}

	return nil
}

// processClusterRoleGraph handles graph generation for ClusterRoles
func (c *Controller) processClusterRoleGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find RoleBindings and ClusterRoleBindings that reference this ClusterRole
	roleBindings, err := c.findRoleBindingsForClusterRole(ctx, client, resource)
	if err != nil {
		return err
	}

	clusterRoleBindings, err := c.findClusterRoleBindingsForClusterRole(ctx, client, resource)
	if err != nil {
		return err
	}

	// Process RoleBindings
	for _, rb := range roleBindings {
		rbNode, err := c.buildResourceNode(ctx, client, rb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, rbNode)

		// Add edge from rolebinding to clusterrole
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: rbNode.ID,
			Target: parentID,
			Type:   "smoothstep",
			Label:  "uses-permissions",
		})

		// Find ServiceAccounts bound by this RoleBinding
		serviceAccounts, err := c.findServiceAccountsForRoleBinding(ctx, client, rb)
		if err != nil {
			continue
		}

		for _, sa := range serviceAccounts {
			saNode, err := c.buildResourceNode(ctx, client, sa)
			if err != nil {
				continue
			}
			response.Nodes = append(response.Nodes, saNode)

			// Add edge from rolebinding to serviceaccount
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: rbNode.ID,
				Target: saNode.ID,
				Type:   "smoothstep",
				Label:  "binds-to",
			})
		}
	}

	// Process ClusterRoleBindings
	for _, crb := range clusterRoleBindings {
		crbNode, err := c.buildResourceNode(ctx, client, crb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, crbNode)

		// Add edge from clusterrolebinding to clusterrole
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: crbNode.ID,
			Type:   "smoothstep",
			Label:  "uses-permissions",
		})

		// Find ServiceAccounts bound by this ClusterRoleBinding
		serviceAccounts, err := c.findServiceAccountsForClusterRoleBinding(ctx, client, crb)
		if err != nil {
			continue
		}

		for _, sa := range serviceAccounts {
			saNode, err := c.buildResourceNode(ctx, client, sa)
			if err != nil {
				continue
			}
			response.Nodes = append(response.Nodes, saNode)

			// Add edge from clusterrolebinding to serviceaccount
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: saNode.ID,
				Target: crbNode.ID,
				Type:   "smoothstep",
				Label:  "binds-to",
			})
		}
	}

	return nil
}

// processRoleBindingGraph handles graph generation for RoleBindings
func (c *Controller) processRoleBindingGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find the Role referenced by this RoleBinding
	role, err := c.getRoleFromRoleBinding(ctx, client, resource)
	if err == nil && role != nil {
		roleNode, err := c.buildResourceNode(ctx, client, *role)
		if err == nil {
			response.Nodes = append(response.Nodes, roleNode)

			// Add edge from rolebinding to role
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: roleNode.ID,
				Target: parentID,
				Type:   "smoothstep",
				Label:  "grant-permissions",
			})
		}
	}

	// Find ServiceAccounts bound by this RoleBinding
	serviceAccounts, err := c.findServiceAccountsForRoleBinding(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, sa := range serviceAccounts {
		saNode, err := c.buildResourceNode(ctx, client, sa)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, saNode)

		// Add edge from rolebinding to serviceaccount
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: saNode.ID,
			Target: parentID,
			Type:   "smoothstep",
			Label:  "binds-to",
		})
	}

	return nil
}

// processClusterRoleBindingGraph handles graph generation for ClusterRoleBindings
func (c *Controller) processClusterRoleBindingGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find the ClusterRole referenced by this ClusterRoleBinding
	clusterRole, err := c.getClusterRoleFromClusterRoleBinding(ctx, client, resource)
	if err == nil && clusterRole != nil {
		crNode, err := c.buildResourceNode(ctx, client, *clusterRole)
		if err == nil {
			response.Nodes = append(response.Nodes, crNode)

			// Add edge from clusterrolebinding to clusterrole
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: crNode.ID,
				Target: parentID,
				Type:   "smoothstep",
				Label:  "uses-permissions",
			})
		}
	}

	// Find ServiceAccounts bound by this ClusterRoleBinding
	serviceAccounts, err := c.findServiceAccountsForClusterRoleBinding(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, sa := range serviceAccounts {
		saNode, err := c.buildResourceNode(ctx, client, sa)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, saNode)

		// Add edge from clusterrolebinding to serviceaccount
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: saNode.ID,
			Target: parentID,
			Type:   "smoothstep",
			Label:  "binds-to",
		})
	}

	return nil
}

// processServiceAccountGraph handles graph generation for ServiceAccounts
func (c *Controller) processServiceAccountGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Find RoleBindings that reference this ServiceAccount
	roleBindings, err := c.findRoleBindingsForServiceAccount(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, rb := range roleBindings {
		rbNode, err := c.buildResourceNode(ctx, client, rb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, rbNode)

		// Add edge from serviceaccount to rolebinding
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: rbNode.ID,
			Type:   "smoothstep",
			Label:  "bound-by",
		})

		// Find the Role referenced by this RoleBinding
		role, err := c.getRoleFromRoleBinding(ctx, client, rb)
		if err == nil && role != nil {
			roleNode, err := c.buildResourceNode(ctx, client, *role)
			if err == nil {
				response.Nodes = append(response.Nodes, roleNode)

				// Add edge from rolebinding to role
				response.Edges = append(response.Edges, Edge{
					ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
					Source: roleNode.ID,
					Target: rbNode.ID,
					Type:   "smoothstep",
					Label:  "grant-permissions",
				})
			}
		}
	}

	// Find ClusterRoleBindings that reference this ServiceAccount
	clusterRoleBindings, err := c.findClusterRoleBindingsForServiceAccount(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, crb := range clusterRoleBindings {
		crbNode, err := c.buildResourceNode(ctx, client, crb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, crbNode)

		// Add edge from serviceaccount to clusterrolebinding
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: crbNode.ID,
			Type:   "smoothstep",
			Label:  "bound-by",
		})

		// Find the ClusterRole referenced by this ClusterRoleBinding
		clusterRole, err := c.getClusterRoleFromClusterRoleBinding(ctx, client, crb)
		if err == nil && clusterRole != nil {
			crNode, err := c.buildResourceNode(ctx, client, *clusterRole)
			if err == nil {
				response.Nodes = append(response.Nodes, crNode)

				// Add edge from clusterrolebinding to clusterrole
				response.Edges = append(response.Edges, Edge{
					ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
					Source: crNode.ID,
					Target: crbNode.ID,
					Type:   "smoothstep",
					Label:  "grant-permissions",
				})
			}
		}
	}

	// Find pods that use this ServiceAccount
	pods, err := c.findPodsUsingServiceAccount(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, pod := range pods {
		podNode, err := c.buildResourceNode(ctx, client, pod)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, podNode)

		// Add edge from serviceaccount to pod
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: parentID,
			Target: podNode.ID,
			Type:   "smoothstep",
			Label:  "used-by",
		})
	}

	return nil
}

// processCustomResourceGraph handles graph generation for custom resources
func (c *Controller) processCustomResourceGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Get the custom resource object to extract its UID
	crObj, err := client.Resource(schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.ResourceType,
	}).Namespace(resource.Namespace).Get(ctx, resource.ResourceName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get custom resource: %v", err)
	}

	crUID := crObj.GetUID()

	// Find all resources owned by this custom resource
	ownedResources, err := c.findResourcesByOwnerUID(ctx, client, crUID, resource.Namespace)
	if err != nil {
		return fmt.Errorf("failed to find owned resources: %v", err)
	}

	// Sort owned resources by hierarchy (services, deployments/statefulsets/daemonsets, replicasets, pods)
	sortedResources := c.sortResourcesByHierarchy(ownedResources)

	// Process each owned resource in hierarchical order
	for _, ownedResource := range sortedResources {
		err := c.processOwnedResource(ctx, client, parentID, ownedResource, response, attackPath)
		if err != nil {
			// Log but don't fail - continue processing other resources
			continue
		}
	}

	// If attack-path mode, add RBAC and security-related resources
	if attackPath {
		err = c.addCRDAttackPathResources(ctx, client, resource, response)
		if err != nil {
			// Log but don't fail
			return nil
		}
	}

	return nil
}

// processOwnedResource processes a resource owned by a custom resource
func (c *Controller) processOwnedResource(ctx context.Context, client dynamic.Interface, parentID string, ownedResource ResourceIdentifier, response *GraphResponse, attackPath bool) error {
	// Build node for the owned resource
	resourceNode, err := c.buildResourceNode(ctx, client, ownedResource)
	if err != nil {
		return err
	}
	response.Nodes = append(response.Nodes, resourceNode)

	// Add edge from parent (custom resource) to owned resource
	response.Edges = append(response.Edges, Edge{
		ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
		Source: parentID,
		Target: resourceNode.ID,
		Type:   "smoothstep",
		Label:  "owns",
	})

	// Recursively process based on the owned resource type
	// This allows us to discover pods from deployments, endpoints from services, etc.
	switch ownedResource.ResourceType {
	case "statefulsets":
		return c.processStatefulSetGraph(ctx, client, resourceNode.ID, ownedResource, response, attackPath)
	case "deployments":
		return c.processDeploymentGraph(ctx, client, resourceNode.ID, ownedResource, response, attackPath)
	case "daemonsets":
		return c.processDaemonSetGraph(ctx, client, resourceNode.ID, ownedResource, response, attackPath)
	case "services":
		return c.processServiceGraph(ctx, client, resourceNode.ID, ownedResource, response, attackPath)
	case "jobs":
		return c.processJobGraph(ctx, client, resourceNode.ID, ownedResource, response, attackPath)
	case "cronjobs":
		return c.processCronJobGraph(ctx, client, resourceNode.ID, ownedResource, response, attackPath)
	// Secrets, ConfigMaps, ServiceAccounts don't need further processing
	default:
		return nil
	}
}

// #######################
// Helper Functions
// #######################
func (c *Controller) buildResourceNode(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier) (Node, error) {
	obj, err := client.Resource(schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.ResourceType,
	}).Namespace(resource.Namespace).Get(ctx, resource.ResourceName, metav1.GetOptions{})
	if err != nil {
		return Node{}, err
	}

	// Build node data
	data := map[string]interface{}{
		"namespace":    resource.Namespace,
		"group":        resource.Group,
		"version":      resource.Version,
		"resourceType": resource.ResourceType,
		"resourceName": resource.ResourceName,
		"status":       c.getResourceStatus(obj),
		"createdAt":    obj.GetCreationTimestamp().String(),
		"labels":       obj.GetLabels(),
	}

	return Node{
		ID:   fmt.Sprintf("node-%s-%s", resource.ResourceType[:len(resource.ResourceType)-1], resource.ResourceName),
		Type: "resource",
		Data: data,
	}, nil
}

func (c *Controller) getResourceStatus(obj *unstructured.Unstructured) map[string]interface{} {
	status := make(map[string]interface{})

	// Get conditions
	conditions, found, _ := unstructured.NestedSlice(obj.Object, "status", "conditions")
	if found {
		status["conditions"] = conditions
	}

	// Get replicas if present
	replicas, found, _ := unstructured.NestedMap(obj.Object, "status")
	if found {
		status["replicas"] = replicas
	}

	// For services, include spec information that's relevant for display
	if obj.GetKind() == "Service" {
		if replicas == nil {
			replicas = make(map[string]interface{})
		}

		// Add service type
		if serviceType, found, _ := unstructured.NestedString(obj.Object, "spec", "type"); found {
			replicas["type"] = serviceType
		}

		// Add cluster IP
		if clusterIP, found, _ := unstructured.NestedString(obj.Object, "spec", "clusterIP"); found {
			replicas["clusterIP"] = clusterIP
		}

		// Add ports
		if ports, found, _ := unstructured.NestedSlice(obj.Object, "spec", "ports"); found {
			replicas["ports"] = ports
		}

		status["replicas"] = replicas
	}

	// Add age
	if timestamp := obj.GetCreationTimestamp(); !timestamp.IsZero() {
		status["age"] = time.Since(timestamp.Time).Round(time.Second).String()
	}

	return status
}

func (c *Controller) findReplicaSets(ctx context.Context, client dynamic.Interface, owner ResourceIdentifier) ([]ResourceIdentifier, error) {
	rsList, err := client.Resource(schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "replicasets",
	}).Namespace(owner.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return nil, err
	}

	var replicaSets []ResourceIdentifier
	for _, rs := range rsList.Items {
		for _, ownerRef := range rs.GetOwnerReferences() {
			if ownerRef.Kind == "Deployment" && ownerRef.Name == owner.ResourceName {
				replicaSets = append(replicaSets, ResourceIdentifier{
					Namespace:    owner.Namespace,
					Group:        "apps",
					Version:      "v1",
					ResourceType: "replicasets",
					ResourceName: rs.GetName(),
				})
				break
			}
		}
	}

	return replicaSets, nil
}

func (c *Controller) findPods(ctx context.Context, client dynamic.Interface, owner ResourceIdentifier) ([]ResourceIdentifier, error) {
	podList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).Namespace(owner.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return nil, err
	}

	var pods []ResourceIdentifier
	for _, pod := range podList.Items {
		for _, ownerRef := range pod.GetOwnerReferences() {
			if ownerRef.Name == owner.ResourceName {
				pods = append(pods, ResourceIdentifier{
					Namespace:    owner.Namespace,
					Group:        "",
					Version:      "v1",
					ResourceType: "pods",
					ResourceName: pod.GetName(),
				})
				break
			}
		}
	}

	return pods, nil
}

func (c *Controller) findControlledPods(ctx context.Context, client dynamic.Interface, owner ResourceIdentifier) ([]ResourceIdentifier, error) {
	ownerObj, err := client.Resource(schema.GroupVersionResource{
		Group:    owner.Group,
		Version:  owner.Version,
		Resource: owner.ResourceType,
	}).Namespace(owner.Namespace).Get(ctx, owner.ResourceName, metav1.GetOptions{})

	if err != nil {
		return nil, err
	}

	podList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).Namespace(owner.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return nil, err
	}

	var pods []ResourceIdentifier
	ownerUID := ownerObj.GetUID()

	for _, pod := range podList.Items {
		for _, ref := range pod.GetOwnerReferences() {
			if ref.UID == ownerUID {
				pods = append(pods, ResourceIdentifier{
					Namespace:    owner.Namespace,
					Group:        "",
					Version:      "v1",
					ResourceType: "pods",
					ResourceName: pod.GetName(),
				})
				break
			}
		}
	}

	return pods, nil
}

func (c *Controller) findServicePods(ctx context.Context, client dynamic.Interface, service ResourceIdentifier) ([]ResourceIdentifier, error) {
	// Get service selector
	svcObj, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "services",
	}).Namespace(service.Namespace).Get(ctx, service.ResourceName, metav1.GetOptions{})

	if err != nil {
		return nil, err
	}

	selector, found, err := unstructured.NestedStringMap(svcObj.Object, "spec", "selector")
	if err != nil || !found {
		return nil, fmt.Errorf("failed to get service selector: %v", err)
	}

	// Find matching pods
	podList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).Namespace(service.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return nil, err
	}

	var pods []ResourceIdentifier
	for _, pod := range podList.Items {
		if matchLabels(selector, pod.GetLabels()) {
			pods = append(pods, ResourceIdentifier{
				Namespace:    service.Namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "pods",
				ResourceName: pod.GetName(),
			})
		}
	}

	return pods, nil
}

func (c *Controller) findCronJobJobs(ctx context.Context, client dynamic.Interface, cronJob ResourceIdentifier) ([]ResourceIdentifier, error) {
	jobList, err := client.Resource(schema.GroupVersionResource{
		Group:    "batch",
		Version:  "v1",
		Resource: "jobs",
	}).Namespace(cronJob.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return nil, err
	}

	var jobs []ResourceIdentifier
	for _, job := range jobList.Items {
		for _, ownerRef := range job.GetOwnerReferences() {
			if ownerRef.Kind == "CronJob" && ownerRef.Name == cronJob.ResourceName {
				jobs = append(jobs, ResourceIdentifier{
					Namespace:    cronJob.Namespace,
					Group:        "batch",
					Version:      "v1",
					ResourceType: "jobs",
					ResourceName: job.GetName(),
				})
				break
			}
		}
	}

	return jobs, nil
}

// Helper function to match labels
func matchLabels(selector, labels map[string]string) bool {
	for key, value := range selector {
		if labels[key] != value {
			return false
		}
	}
	return len(selector) > 0
}

// findEndpointSlicesForService finds EndpointSlices associated with a service
func (c *Controller) findEndpointSlicesForService(ctx context.Context, client dynamic.Interface, service ResourceIdentifier) ([]ResourceIdentifier, error) {
	// EndpointSlices are labeled with kubernetes.io/service-name
	epsList, err := client.Resource(schema.GroupVersionResource{
		Group:    "discovery.k8s.io",
		Version:  "v1",
		Resource: "endpointslices",
	}).Namespace(service.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("kubernetes.io/service-name=%s", service.ResourceName),
	})

	if err != nil {
		return nil, err
	}

	var endpointSlices []ResourceIdentifier
	for _, eps := range epsList.Items {
		endpointSlices = append(endpointSlices, ResourceIdentifier{
			Namespace:    eps.GetNamespace(),
			Group:        "discovery.k8s.io",
			Version:      "v1",
			ResourceType: "endpointslices",
			ResourceName: eps.GetName(),
		})
	}

	return endpointSlices, nil
}

// addAttackPathResources adds security-related resources for attack path analysis
func (c *Controller) addAttackPathResources(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier, response *GraphResponse) error {
	// Find services that expose this resource
	err := c.findAndAddServices(ctx, client, resource, response)
	if err != nil {
		return err
	}

	// Find ingresses that route to services
	err = c.findAndAddIngresses(ctx, client, resource, response)
	if err != nil {
		return err
	}

	// Find ConfigMaps and Secrets used by pods
	err = c.findAndAddConfigResources(ctx, client, resource, response)
	if err != nil {
		return err
	}

	return nil
}

// addContainerNodes adds container and image details to pods
func (c *Controller) addContainerNodes(ctx context.Context, client dynamic.Interface, pod ResourceIdentifier, podNodeID string, response *GraphResponse) error {
	// Get pod object
	podObj, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).Namespace(pod.Namespace).Get(ctx, pod.ResourceName, metav1.GetOptions{})
	if err != nil {
		return err
	}

	// Extract containers from pod spec
	containers, found, err := unstructured.NestedSlice(podObj.Object, "spec", "containers")
	if err != nil || !found {
		return nil
	}

	for i, container := range containers {
		containerMap, ok := container.(map[string]interface{})
		if !ok {
			continue
		}

		containerName, _, _ := unstructured.NestedString(containerMap, "name")
		containerImage, _, _ := unstructured.NestedString(containerMap, "image")

		// Create container node
		containerNode := Node{
			ID:   fmt.Sprintf("container-%s-%s-%d", pod.ResourceName, containerName, i),
			Type: "container",
			Data: map[string]interface{}{
				"name":      containerName,
				"image":     containerImage,
				"podName":   pod.ResourceName,
				"namespace": pod.Namespace,
			},
		}

		response.Nodes = append(response.Nodes, containerNode)

		// Add edge from pod to container
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: podNodeID,
			Target: containerNode.ID,
			Type:   "smoothstep",
			Label:  "contains",
		})

		// Create image node
		imageNode := Node{
			ID:   fmt.Sprintf("image-%s", fmt.Sprintf("%x", containerImage)),
			Type: "image",
			Data: map[string]interface{}{
				"image":     containerImage,
				"container": containerName,
			},
		}

		response.Nodes = append(response.Nodes, imageNode)

		// Add edge from container to image
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: containerNode.ID,
			Target: imageNode.ID,
			Type:   "smoothstep",
			Label:  "uses",
		})
	}

	return nil
}

// findAndAddServices finds services that expose the given resource
func (c *Controller) findAndAddServices(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier, response *GraphResponse) error {
	// Get all services in the namespace
	serviceList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "services",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}

	// Find pods controlled by the resource
	pods, err := c.getResourcePods(ctx, client, resource)
	if err != nil {
		return err
	}

	for _, service := range serviceList.Items {
		// Get service selector
		selector, found, err := unstructured.NestedStringMap(service.Object, "spec", "selector")
		if err != nil || !found || len(selector) == 0 {
			continue
		}

		// Check if any pod matches this service selector
		hasMatchingPod := false
		for _, pod := range pods {
			podObj, err := client.Resource(schema.GroupVersionResource{
				Version:  "v1",
				Resource: "pods",
			}).Namespace(pod.Namespace).Get(ctx, pod.ResourceName, metav1.GetOptions{})
			if err != nil {
				continue
			}

			if matchLabels(selector, podObj.GetLabels()) {
				hasMatchingPod = true
				break
			}
		}

		if hasMatchingPod {
			serviceNode, err := c.buildResourceNode(ctx, client, ResourceIdentifier{
				Namespace:    resource.Namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "services",
				ResourceName: service.GetName(),
			})
			if err != nil {
				continue
			}

			response.Nodes = append(response.Nodes, serviceNode)

			// Add edge from service to deployment
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: serviceNode.ID,
				Target: fmt.Sprintf("node-%s-%s", resource.ResourceType[:len(resource.ResourceType)-1], resource.ResourceName),
				Type:   "smoothstep",
				Label:  "exposes",
			})
		}
	}

	return nil
}

// findAndAddIngresses finds ingresses that route to services
func (c *Controller) findAndAddIngresses(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier, response *GraphResponse) error {
	// Get all ingresses in the namespace
	ingressList, err := client.Resource(schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "ingresses",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// If ingresses API is not available, try extensions/v1beta1
		ingressList, err = client.Resource(schema.GroupVersionResource{
			Group:    "extensions",
			Version:  "v1beta1",
			Resource: "ingresses",
		}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil // Ignore if ingresses are not available
		}
	}

	// Find service nodes in the response
	serviceNodes := make(map[string]string)
	for _, node := range response.Nodes {
		nodeData := node.Data
		if resourceType, ok := nodeData["resourceType"].(string); ok && resourceType == "services" {
			if serviceName, ok := nodeData["resourceName"].(string); ok {
				serviceNodes[serviceName] = node.ID
			}
		}
	}

	for _, ingress := range ingressList.Items {
		// Check if ingress routes to any of our services
		rules, found, err := unstructured.NestedSlice(ingress.Object, "spec", "rules")
		if err != nil || !found {
			continue
		}

		hasMatchingService := false
		for _, rule := range rules {
			ruleMap, ok := rule.(map[string]interface{})
			if !ok {
				continue
			}

			http, found, err := unstructured.NestedMap(ruleMap, "http")
			if err != nil || !found {
				continue
			}

			paths, found, err := unstructured.NestedSlice(http, "paths")
			if err != nil || !found {
				continue
			}

			for _, path := range paths {
				pathMap, ok := path.(map[string]interface{})
				if !ok {
					continue
				}

				backend, found, err := unstructured.NestedMap(pathMap, "backend")
				if err != nil || !found {
					continue
				}

				serviceName, found, err := unstructured.NestedString(backend, "service", "name")
				if err != nil || !found {
					// Try old format
					serviceName, found, err = unstructured.NestedString(backend, "serviceName")
					if err != nil || !found {
						continue
					}
				}

				if _, exists := serviceNodes[serviceName]; exists {
					hasMatchingService = true
					break
				}
			}
			if hasMatchingService {
				break
			}
		}

		if hasMatchingService {
			ingressNode, err := c.buildResourceNode(ctx, client, ResourceIdentifier{
				Namespace:    resource.Namespace,
				Group:        "networking.k8s.io",
				Version:      "v1",
				ResourceType: "ingresses",
				ResourceName: ingress.GetName(),
			})
			if err != nil {
				continue
			}

			response.Nodes = append(response.Nodes, ingressNode)

			// Add edges from ingress to services
			for _, serviceNodeID := range serviceNodes {
				response.Edges = append(response.Edges, Edge{
					ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
					Source: ingressNode.ID,
					Target: serviceNodeID,
					Type:   "smoothstep",
					Label:  "routes-to",
				})
			}
		}
	}

	return nil
}

// findAndAddConfigResources finds ConfigMaps and Secrets used by pods
func (c *Controller) findAndAddConfigResources(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier, response *GraphResponse) error {
	// Find pods controlled by the resource
	pods, err := c.getResourcePods(ctx, client, resource)
	if err != nil {
		return err
	}

	configMaps := make(map[string]bool)
	secrets := make(map[string]bool)

	for _, pod := range pods {
		podObj, err := client.Resource(schema.GroupVersionResource{
			Version:  "v1",
			Resource: "pods",
		}).Namespace(pod.Namespace).Get(ctx, pod.ResourceName, metav1.GetOptions{})
		if err != nil {
			continue
		}

		// Check volumes for configMaps and secrets
		volumes, found, err := unstructured.NestedSlice(podObj.Object, "spec", "volumes")
		if err == nil && found {
			for _, volume := range volumes {
				volumeMap, ok := volume.(map[string]interface{})
				if !ok {
					continue
				}

				// Check for configMap
				if configMap, found, _ := unstructured.NestedString(volumeMap, "configMap", "name"); found {
					configMaps[configMap] = true
				}

				// Check for secret
				if secret, found, _ := unstructured.NestedString(volumeMap, "secret", "secretName"); found {
					secrets[secret] = true
				}
			}
		}

		// Check envFrom for configMaps and secrets
		containers, found, err := unstructured.NestedSlice(podObj.Object, "spec", "containers")
		if err == nil && found {
			for _, container := range containers {
				containerMap, ok := container.(map[string]interface{})
				if !ok {
					continue
				}

				envFrom, found, err := unstructured.NestedSlice(containerMap, "envFrom")
				if err == nil && found {
					for _, envSource := range envFrom {
						envMap, ok := envSource.(map[string]interface{})
						if !ok {
							continue
						}

						if configMapRef, found, _ := unstructured.NestedString(envMap, "configMapRef", "name"); found {
							configMaps[configMapRef] = true
						}

						if secretRef, found, _ := unstructured.NestedString(envMap, "secretRef", "name"); found {
							secrets[secretRef] = true
						}
					}
				}
			}
		}
	}

	// Add ConfigMap nodes
	for configMapName := range configMaps {
		configMapNode, err := c.buildResourceNode(ctx, client, ResourceIdentifier{
			Namespace:    resource.Namespace,
			Group:        "",
			Version:      "v1",
			ResourceType: "configmaps",
			ResourceName: configMapName,
		})
		if err != nil {
			continue
		}

		response.Nodes = append(response.Nodes, configMapNode)

		// Add edge from configmap to deployment
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: configMapNode.ID,
			Target: fmt.Sprintf("node-%s-%s", resource.ResourceType[:len(resource.ResourceType)-1], resource.ResourceName),
			Type:   "smoothstep",
			Label:  "configures",
		})
	}

	// Add Secret nodes
	for secretName := range secrets {
		secretNode, err := c.buildResourceNode(ctx, client, ResourceIdentifier{
			Namespace:    resource.Namespace,
			Group:        "",
			Version:      "v1",
			ResourceType: "secrets",
			ResourceName: secretName,
		})
		if err != nil {
			continue
		}

		response.Nodes = append(response.Nodes, secretNode)

		// Add edge from secret to deployment
		response.Edges = append(response.Edges, Edge{
			ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
			Source: secretNode.ID,
			Target: fmt.Sprintf("node-%s-%s", resource.ResourceType[:len(resource.ResourceType)-1], resource.ResourceName),
			Type:   "smoothstep",
			Label:  "provides-secrets",
		})
	}

	return nil
}

// addCRDAttackPathResources adds RBAC and security-related resources for custom resources in attack-path mode
func (c *Controller) addCRDAttackPathResources(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier, response *GraphResponse) error {
	// Find all pods controlled by this custom resource (through the graph we've already built)
	pods := c.findAllControlledPods(ctx, client, resource, response)

	// Track unique ServiceAccounts, RoleBindings, and Roles to avoid duplicates
	serviceAccounts := make(map[string]ResourceIdentifier)
	roleBindings := make(map[string]ResourceIdentifier)
	clusterRoleBindings := make(map[string]ResourceIdentifier)
	roles := make(map[string]ResourceIdentifier)
	clusterRoles := make(map[string]ResourceIdentifier)

	// For each pod, find its ServiceAccount and RBAC resources
	for _, pod := range pods {
		sa, err := c.extractServiceAccount(ctx, client, pod)
		if err != nil || sa == nil {
			continue
		}

		// Track the ServiceAccount
		saKey := fmt.Sprintf("%s/%s", sa.Namespace, sa.ResourceName)
		if _, exists := serviceAccounts[saKey]; !exists {
			serviceAccounts[saKey] = *sa
		}

		// Find RoleBindings for this ServiceAccount
		rbs, err := c.findRoleBindingsForServiceAccount(ctx, client, *sa)
		if err == nil {
			for _, rb := range rbs {
				rbKey := fmt.Sprintf("%s/%s", rb.Namespace, rb.ResourceName)
				if _, exists := roleBindings[rbKey]; !exists {
					roleBindings[rbKey] = rb

					// Get the Role referenced by this RoleBinding
					role, err := c.getRoleFromBinding(ctx, client, rb)
					if err == nil && role != nil {
						roleKey := fmt.Sprintf("%s/%s", role.Namespace, role.ResourceName)
						if role.ResourceType == "clusterroles" {
							clusterRoles[roleKey] = *role
						} else {
							roles[roleKey] = *role
						}
					}
				}
			}
		}

		// Find ClusterRoleBindings for this ServiceAccount
		crbs, err := c.findClusterRoleBindingsForServiceAccount(ctx, client, *sa)
		if err == nil {
			for _, crb := range crbs {
				crbKey := crb.ResourceName
				if _, exists := clusterRoleBindings[crbKey]; !exists {
					clusterRoleBindings[crbKey] = crb

					// Get the ClusterRole referenced by this ClusterRoleBinding
					role, err := c.getRoleFromBinding(ctx, client, crb)
					if err == nil && role != nil {
						roleKey := role.ResourceName
						clusterRoles[roleKey] = *role
					}
				}
			}
		}
	}

	// Add ServiceAccount nodes and edges
	for _, sa := range serviceAccounts {
		saNode, err := c.buildResourceNode(ctx, client, sa)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, saNode)

		// Find pods using this ServiceAccount and add edges
		for _, pod := range pods {
			podSA, err := c.extractServiceAccount(ctx, client, pod)
			if err == nil && podSA != nil && podSA.ResourceName == sa.ResourceName {
				// Add edge from pod to ServiceAccount
				response.Edges = append(response.Edges, Edge{
					ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
					Source: fmt.Sprintf("node-pod-%s", pod.ResourceName),
					Target: saNode.ID,
					Type:   "smoothstep",
					Label:  "uses-account",
				})
			}
		}
	}

	// Add RoleBinding nodes and edges
	for _, rb := range roleBindings {
		rbNode, err := c.buildResourceNode(ctx, client, rb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, rbNode)

		// Add edge from RoleBinding to ServiceAccount
		for _, sa := range serviceAccounts {
			// Check if this RoleBinding references this ServiceAccount
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: rbNode.ID,
				Target: fmt.Sprintf("node-serviceaccount-%s", sa.ResourceName),
				Type:   "smoothstep",
				Label:  "binds-to",
			})
			break // Only add one edge per RoleBinding
		}
	}

	// Add ClusterRoleBinding nodes and edges
	for _, crb := range clusterRoleBindings {
		crbNode, err := c.buildResourceNode(ctx, client, crb)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, crbNode)

		// Add edge from ClusterRoleBinding to ServiceAccount
		for _, sa := range serviceAccounts {
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: crbNode.ID,
				Target: fmt.Sprintf("node-serviceaccount-%s", sa.ResourceName),
				Type:   "smoothstep",
				Label:  "binds-to",
			})
			break
		}
	}

	// Add Role nodes and edges
	for _, role := range roles {
		roleNode, err := c.buildResourceNode(ctx, client, role)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, roleNode)

		// Add edge from Role to RoleBinding
		for _, rb := range roleBindings {
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: roleNode.ID,
				Target: fmt.Sprintf("node-rolebinding-%s", rb.ResourceName),
				Type:   "smoothstep",
				Label:  "permits",
			})
			break
		}
	}

	// Add ClusterRole nodes and edges
	for _, clusterRole := range clusterRoles {
		crNode, err := c.buildResourceNode(ctx, client, clusterRole)
		if err != nil {
			continue
		}
		response.Nodes = append(response.Nodes, crNode)

		// Add edges from ClusterRole to both RoleBindings and ClusterRoleBindings
		for _, rb := range roleBindings {
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: crNode.ID,
				Target: fmt.Sprintf("node-rolebinding-%s", rb.ResourceName),
				Type:   "smoothstep",
				Label:  "permits",
			})
			break
		}
		for _, crb := range clusterRoleBindings {
			response.Edges = append(response.Edges, Edge{
				ID:     fmt.Sprintf("edge-%d", len(response.Edges)+1),
				Source: crNode.ID,
				Target: fmt.Sprintf("node-clusterrolebinding-%s", crb.ResourceName),
				Type:   "smoothstep",
				Label:  "permits",
			})
			break
		}
	}

	return nil
}

// getResourcePods returns all pods controlled by a resource
func (c *Controller) getResourcePods(ctx context.Context, client dynamic.Interface, resource ResourceIdentifier) ([]ResourceIdentifier, error) {
	switch resource.ResourceType {
	case "deployments":
		// Find ReplicaSets first, then pods
		replicaSets, err := c.findReplicaSets(ctx, client, resource)
		if err != nil {
			return nil, err
		}

		var allPods []ResourceIdentifier
		for _, rs := range replicaSets {
			pods, err := c.findPods(ctx, client, rs)
			if err != nil {
				continue
			}
			allPods = append(allPods, pods...)
		}
		return allPods, nil

	case "statefulsets", "daemonsets", "jobs":
		return c.findControlledPods(ctx, client, resource)

	default:
		return nil, nil
	}
}

// sortResourcesByHierarchy sorts resources in a logical hierarchy for display
// Order: services, deployments/statefulsets/daemonsets, replicasets, pods, configmaps/secrets/serviceaccounts
func (c *Controller) sortResourcesByHierarchy(resources []ResourceIdentifier) []ResourceIdentifier {
	// Define hierarchy order
	hierarchyOrder := map[string]int{
		"services":               1,
		"deployments":            2,
		"statefulsets":           2,
		"daemonsets":             2,
		"jobs":                   2,
		"cronjobs":               2,
		"replicasets":            3,
		"pods":                   4,
		"configmaps":             5,
		"secrets":                5,
		"serviceaccounts":        5,
		"persistentvolumeclaims": 5,
		"endpoints":              6,
		"endpointslices":         6,
		"controllerrevisions":    7,
	}

	// Sort based on hierarchy order
	sortedResources := make([]ResourceIdentifier, len(resources))
	copy(sortedResources, resources)

	// Simple insertion sort based on hierarchy
	for i := 1; i < len(sortedResources); i++ {
		key := sortedResources[i]
		keyOrder := hierarchyOrder[key.ResourceType]
		if keyOrder == 0 {
			keyOrder = 10 // Unknown resources go to the end
		}

		j := i - 1
		for j >= 0 {
			currentOrder := hierarchyOrder[sortedResources[j].ResourceType]
			if currentOrder == 0 {
				currentOrder = 10
			}
			if currentOrder <= keyOrder {
				break
			}
			sortedResources[j+1] = sortedResources[j]
			j--
		}
		sortedResources[j+1] = key
	}

	return sortedResources
}

// RBAC Helper Functions

// findRoleBindingsForRole finds RoleBindings that reference a specific Role
func (c *Controller) findRoleBindingsForRole(ctx context.Context, client dynamic.Interface, role ResourceIdentifier) ([]ResourceIdentifier, error) {
	var roleBindings []ResourceIdentifier

	rbList, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "rolebindings",
	}).Namespace(role.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return roleBindings, err
	}

	for _, rb := range rbList.Items {
		roleRefKind, found, _ := unstructured.NestedString(rb.Object, "roleRef", "kind")
		if !found || roleRefKind != "Role" {
			continue
		}

		roleRefName, found, _ := unstructured.NestedString(rb.Object, "roleRef", "name")
		if found && roleRefName == role.ResourceName {
			roleBindings = append(roleBindings, ResourceIdentifier{
				Namespace:    rb.GetNamespace(),
				Group:        "rbac.authorization.k8s.io",
				Version:      "v1",
				ResourceType: "rolebindings",
				ResourceName: rb.GetName(),
			})
		}
	}

	return roleBindings, nil
}

// findRoleBindingsForClusterRole finds RoleBindings that reference a specific ClusterRole
func (c *Controller) findRoleBindingsForClusterRole(ctx context.Context, client dynamic.Interface, clusterRole ResourceIdentifier) ([]ResourceIdentifier, error) {
	var roleBindings []ResourceIdentifier

	// Check all namespaces for RoleBindings that reference this ClusterRole
	namespaceList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "namespaces",
	}).List(ctx, metav1.ListOptions{})

	if err != nil {
		return roleBindings, err
	}

	for _, ns := range namespaceList.Items {
		rbList, err := client.Resource(schema.GroupVersionResource{
			Group:    "rbac.authorization.k8s.io",
			Version:  "v1",
			Resource: "rolebindings",
		}).Namespace(ns.GetName()).List(ctx, metav1.ListOptions{})

		if err != nil {
			continue
		}

		for _, rb := range rbList.Items {
			roleRefKind, found, _ := unstructured.NestedString(rb.Object, "roleRef", "kind")
			if !found || roleRefKind != "ClusterRole" {
				continue
			}

			roleRefName, found, _ := unstructured.NestedString(rb.Object, "roleRef", "name")
			if found && roleRefName == clusterRole.ResourceName {
				roleBindings = append(roleBindings, ResourceIdentifier{
					Namespace:    rb.GetNamespace(),
					Group:        "rbac.authorization.k8s.io",
					Version:      "v1",
					ResourceType: "rolebindings",
					ResourceName: rb.GetName(),
				})
			}
		}
	}

	return roleBindings, nil
}

// findClusterRoleBindingsForClusterRole finds ClusterRoleBindings that reference a specific ClusterRole
func (c *Controller) findClusterRoleBindingsForClusterRole(ctx context.Context, client dynamic.Interface, clusterRole ResourceIdentifier) ([]ResourceIdentifier, error) {
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
		roleRefKind, found, _ := unstructured.NestedString(crb.Object, "roleRef", "kind")
		if !found || roleRefKind != "ClusterRole" {
			continue
		}

		roleRefName, found, _ := unstructured.NestedString(crb.Object, "roleRef", "name")
		if found && roleRefName == clusterRole.ResourceName {
			clusterRoleBindings = append(clusterRoleBindings, ResourceIdentifier{
				Namespace:    "",
				Group:        "rbac.authorization.k8s.io",
				Version:      "v1",
				ResourceType: "clusterrolebindings",
				ResourceName: crb.GetName(),
			})
		}
	}

	return clusterRoleBindings, nil
}

// findServiceAccountsForRoleBinding finds ServiceAccounts bound by a specific RoleBinding
func (c *Controller) findServiceAccountsForRoleBinding(ctx context.Context, client dynamic.Interface, roleBinding ResourceIdentifier) ([]ResourceIdentifier, error) {
	var serviceAccounts []ResourceIdentifier

	rbObj, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "rolebindings",
	}).Namespace(roleBinding.Namespace).Get(ctx, roleBinding.ResourceName, metav1.GetOptions{})

	if err != nil {
		return serviceAccounts, err
	}

	subjects, found, _ := unstructured.NestedSlice(rbObj.Object, "subjects")
	if !found {
		return serviceAccounts, nil
	}

	for _, subject := range subjects {
		subjectMap, ok := subject.(map[string]interface{})
		if !ok {
			continue
		}

		kind, _, _ := unstructured.NestedString(subjectMap, "kind")
		name, _, _ := unstructured.NestedString(subjectMap, "name")
		namespace, _, _ := unstructured.NestedString(subjectMap, "namespace")

		if kind == "ServiceAccount" && name != "" {
			if namespace == "" {
				namespace = roleBinding.Namespace
			}

			serviceAccounts = append(serviceAccounts, ResourceIdentifier{
				Namespace:    namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "serviceaccounts",
				ResourceName: name,
			})
		}
	}

	return serviceAccounts, nil
}

// findServiceAccountsForClusterRoleBinding finds ServiceAccounts bound by a specific ClusterRoleBinding
func (c *Controller) findServiceAccountsForClusterRoleBinding(ctx context.Context, client dynamic.Interface, clusterRoleBinding ResourceIdentifier) ([]ResourceIdentifier, error) {
	var serviceAccounts []ResourceIdentifier

	crbObj, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "clusterrolebindings",
	}).Get(ctx, clusterRoleBinding.ResourceName, metav1.GetOptions{})

	if err != nil {
		return serviceAccounts, err
	}

	subjects, found, _ := unstructured.NestedSlice(crbObj.Object, "subjects")
	if !found {
		return serviceAccounts, nil
	}

	for _, subject := range subjects {
		subjectMap, ok := subject.(map[string]interface{})
		if !ok {
			continue
		}

		kind, _, _ := unstructured.NestedString(subjectMap, "kind")
		name, _, _ := unstructured.NestedString(subjectMap, "name")
		namespace, _, _ := unstructured.NestedString(subjectMap, "namespace")

		if kind == "ServiceAccount" && name != "" && namespace != "" {
			serviceAccounts = append(serviceAccounts, ResourceIdentifier{
				Namespace:    namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "serviceaccounts",
				ResourceName: name,
			})
		}
	}

	return serviceAccounts, nil
}

// getRoleFromRoleBinding gets the Role referenced by a RoleBinding
func (c *Controller) getRoleFromRoleBinding(ctx context.Context, client dynamic.Interface, roleBinding ResourceIdentifier) (*ResourceIdentifier, error) {
	rbObj, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "rolebindings",
	}).Namespace(roleBinding.Namespace).Get(ctx, roleBinding.ResourceName, metav1.GetOptions{})

	if err != nil {
		return nil, err
	}

	roleRefKind, found, _ := unstructured.NestedString(rbObj.Object, "roleRef", "kind")
	if !found {
		return nil, fmt.Errorf("roleRef not found in rolebinding")
	}

	roleRefName, found, _ := unstructured.NestedString(rbObj.Object, "roleRef", "name")
	if !found {
		return nil, fmt.Errorf("roleRef name not found in rolebinding")
	}

	if roleRefKind == "Role" {
		return &ResourceIdentifier{
			Namespace:    roleBinding.Namespace,
			Group:        "rbac.authorization.k8s.io",
			Version:      "v1",
			ResourceType: "roles",
			ResourceName: roleRefName,
		}, nil
	} else if roleRefKind == "ClusterRole" {
		return &ResourceIdentifier{
			Namespace:    "",
			Group:        "rbac.authorization.k8s.io",
			Version:      "v1",
			ResourceType: "clusterroles",
			ResourceName: roleRefName,
		}, nil
	}

	return nil, fmt.Errorf("unknown roleRef kind: %s", roleRefKind)
}

// getClusterRoleFromClusterRoleBinding gets the ClusterRole referenced by a ClusterRoleBinding
func (c *Controller) getClusterRoleFromClusterRoleBinding(ctx context.Context, client dynamic.Interface, clusterRoleBinding ResourceIdentifier) (*ResourceIdentifier, error) {
	crbObj, err := client.Resource(schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "clusterrolebindings",
	}).Get(ctx, clusterRoleBinding.ResourceName, metav1.GetOptions{})

	if err != nil {
		return nil, err
	}

	roleRefKind, found, _ := unstructured.NestedString(crbObj.Object, "roleRef", "kind")
	if !found || roleRefKind != "ClusterRole" {
		return nil, fmt.Errorf("roleRef not found or not a ClusterRole")
	}

	roleRefName, found, _ := unstructured.NestedString(crbObj.Object, "roleRef", "name")
	if !found {
		return nil, fmt.Errorf("roleRef name not found in clusterrolebinding")
	}

	return &ResourceIdentifier{
		Namespace:    "",
		Group:        "rbac.authorization.k8s.io",
		Version:      "v1",
		ResourceType: "clusterroles",
		ResourceName: roleRefName,
	}, nil
}

// findPodsUsingServiceAccount finds pods that use a specific ServiceAccount
func (c *Controller) findPodsUsingServiceAccount(ctx context.Context, client dynamic.Interface, serviceAccount ResourceIdentifier) ([]ResourceIdentifier, error) {
	var pods []ResourceIdentifier

	podList, err := client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "pods",
	}).Namespace(serviceAccount.Namespace).List(ctx, metav1.ListOptions{})

	if err != nil {
		return pods, err
	}

	for _, pod := range podList.Items {
		// Check if pod uses this ServiceAccount
		podSAName, found, _ := unstructured.NestedString(pod.Object, "spec", "serviceAccountName")
		if !found {
			podSAName, found, _ = unstructured.NestedString(pod.Object, "spec", "serviceAccount")
		}

		// Default ServiceAccount is "default"
		if !found || podSAName == "" {
			podSAName = "default"
		}

		if podSAName == serviceAccount.ResourceName {
			pods = append(pods, ResourceIdentifier{
				Namespace:    pod.GetNamespace(),
				Group:        "",
				Version:      "v1",
				ResourceType: "pods",
				ResourceName: pod.GetName(),
			})
		}
	}

	return pods, nil
}
