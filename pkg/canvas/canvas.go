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

	// Process related resources based on type
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
	default:
		// For other resource types, just return the single node
		return response, nil
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
