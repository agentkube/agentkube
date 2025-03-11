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
func (c *Controller) GetGraphNodes(ctx context.Context, resource ResourceIdentifier) (*GraphResponse, error) {
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

	// Process related resources based on type
	switch resource.ResourceType {
	case "deployments":
		err = c.processDeploymentGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	case "statefulsets":
		err = c.processStatefulSetGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	case "daemonsets":
		err = c.processDaemonSetGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	case "services":
		err = c.processServiceGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	case "jobs":
		err = c.processJobGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	case "cronjobs":
		err = c.processCronJobGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	case "nodes":
		err = c.processNodeGraph(ctx, dynamicClient, mainNode.ID, resource, response)
	default:
		// For other resource types, just return the single node
		return response, nil
	}

	if err != nil {
		return nil, err
	}

	return response, nil
}

// Resource Processing Functions

func (c *Controller) processDeploymentGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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
		}
	}

	return nil
}

func (c *Controller) processStatefulSetGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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
	}

	return nil
}

func (c *Controller) processDaemonSetGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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
	}

	return nil
}

func (c *Controller) processServiceGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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

func (c *Controller) processJobGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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
	}

	return nil
}

func (c *Controller) processCronJobGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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
		}
	}

	return nil
}

func (c *Controller) processNodeGraph(ctx context.Context, client dynamic.Interface, parentID string, resource ResourceIdentifier, response *GraphResponse) error {
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
