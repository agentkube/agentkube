package canvas

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// addEnvDependencies adds ConfigMap and Secret dependencies from environment variables
func (b *DependencyGraphBuilder) addEnvDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	containers, found, _ := unstructured.NestedSlice(obj.Object, "spec", "containers")
	if !found {
		return nil
	}

	allContainers := containers
	if initContainers, found, _ := unstructured.NestedSlice(obj.Object, "spec", "initContainers"); found {
		allContainers = append(allContainers, initContainers...)
	}

	for _, container := range allContainers {
		containerMap, ok := container.(map[string]interface{})
		if !ok {
			continue
		}

		// Check envFrom
		if envFrom, found, _ := unstructured.NestedSlice(containerMap, "envFrom"); found {
			for _, envSource := range envFrom {
				envMap, ok := envSource.(map[string]interface{})
				if !ok {
					continue
				}

				if cmName, found, _ := unstructured.NestedString(envMap, "configMapRef", "name"); found && cmName != "" {
					cmResource := ResourceIdentifier{
						Namespace:    resource.Namespace,
						Group:        "",
						Version:      "v1",
						ResourceType: "configmaps",
						ResourceName: cmName,
					}
					b.addDependencyWithEdge(ctx, cmResource, parentID, CategoryConfiguration, "env-from", depth+1, true)
				}

				if secretName, found, _ := unstructured.NestedString(envMap, "secretRef", "name"); found && secretName != "" {
					secretResource := ResourceIdentifier{
						Namespace:    resource.Namespace,
						Group:        "",
						Version:      "v1",
						ResourceType: "secrets",
						ResourceName: secretName,
					}
					b.addDependencyWithEdge(ctx, secretResource, parentID, CategoryConfiguration, "env-from", depth+1, true)
				}
			}
		}

		// Check env
		if env, found, _ := unstructured.NestedSlice(containerMap, "env"); found {
			for _, envVar := range env {
				envVarMap, ok := envVar.(map[string]interface{})
				if !ok {
					continue
				}

				if valueFrom, found, _ := unstructured.NestedMap(envVarMap, "valueFrom"); found {
					if cmKeyRef, found, _ := unstructured.NestedMap(valueFrom, "configMapKeyRef"); found {
						if cmName, found, _ := unstructured.NestedString(cmKeyRef, "name"); found && cmName != "" {
							cmResource := ResourceIdentifier{
								Namespace:    resource.Namespace,
								Group:        "",
								Version:      "v1",
								ResourceType: "configmaps",
								ResourceName: cmName,
							}
							b.addDependencyWithEdge(ctx, cmResource, parentID, CategoryConfiguration, "env-key", depth+1, false)
						}
					}

					if secretKeyRef, found, _ := unstructured.NestedMap(valueFrom, "secretKeyRef"); found {
						if secretName, found, _ := unstructured.NestedString(secretKeyRef, "name"); found && secretName != "" {
							secretResource := ResourceIdentifier{
								Namespace:    resource.Namespace,
								Group:        "",
								Version:      "v1",
								ResourceType: "secrets",
								ResourceName: secretName,
							}
							b.addDependencyWithEdge(ctx, secretResource, parentID, CategoryConfiguration, "env-key", depth+1, false)
						}
					}
				}
			}
		}
	}

	return nil
}

// addPVCDependencies adds PersistentVolumeClaim dependencies
func (b *DependencyGraphBuilder) addPVCDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	volumes, found, _ := unstructured.NestedSlice(obj.Object, "spec", "volumes")
	if !found {
		return nil
	}

	for _, volume := range volumes {
		volumeMap, ok := volume.(map[string]interface{})
		if !ok {
			continue
		}

		if pvcName, found, _ := unstructured.NestedString(volumeMap, "persistentVolumeClaim", "claimName"); found && pvcName != "" {
			pvcResource := ResourceIdentifier{
				Namespace:    resource.Namespace,
				Group:        "",
				Version:      "v1",
				ResourceType: "persistentvolumeclaims",
				ResourceName: pvcName,
			}

			if err := b.addDependencyWithEdge(ctx, pvcResource, parentID, CategoryStorage, "claims", depth+1, true); err != nil {
				continue
			}

			// Try to find the bound PV and StorageClass
			b.addPVandStorageClass(ctx, pvcResource, b.getNodeID(pvcResource), depth+1)
		}
	}

	return nil
}

// addPVandStorageClass adds PV and StorageClass dependencies for a PVC
func (b *DependencyGraphBuilder) addPVandStorageClass(ctx context.Context, pvc ResourceIdentifier, pvcNodeID string, depth int) {
	pvcObj, err := b.getResource(ctx, pvc)
	if err != nil {
		return
	}

	// Get bound PV
	if pvName, found, _ := unstructured.NestedString(pvcObj.Object, "spec", "volumeName"); found && pvName != "" {
		pvResource := ResourceIdentifier{
			Namespace:    "",
			Group:        "",
			Version:      "v1",
			ResourceType: "persistentvolumes",
			ResourceName: pvName,
		}
		b.addDependencyWithEdge(ctx, pvResource, pvcNodeID, CategoryStorage, "bound-to", depth+1, true)
	}

	// Get StorageClass
	if scName, found, _ := unstructured.NestedString(pvcObj.Object, "spec", "storageClassName"); found && scName != "" {
		scResource := ResourceIdentifier{
			Namespace:    "",
			Group:        "storage.k8s.io",
			Version:      "v1",
			ResourceType: "storageclasses",
			ResourceName: scName,
		}
		b.addDependencyWithEdge(ctx, scResource, pvcNodeID, CategoryStorage, "uses-class", depth+1, false)
	}
}

// addServiceDependencies finds Services that select this pod
func (b *DependencyGraphBuilder) addServiceDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	podLabels := obj.GetLabels()
	if len(podLabels) == 0 {
		return nil
	}

	svcList, err := b.client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "services",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}

	for _, svc := range svcList.Items {
		selector, found, _ := unstructured.NestedStringMap(svc.Object, "spec", "selector")
		if !found || len(selector) == 0 {
			continue
		}

		if matchLabels(selector, podLabels) {
			svcResource := ResourceIdentifier{
				Namespace:    svc.GetNamespace(),
				Group:        "",
				Version:      "v1",
				ResourceType: "services",
				ResourceName: svc.GetName(),
			}

			if err := b.addDependencyWithEdge(ctx, svcResource, parentID, CategoryNetwork, "selected-by", depth+1, false); err != nil {
				continue
			}

			// Add Ingresses that route to this service
			b.addIngressesForService(ctx, svcResource, b.getNodeID(svcResource), depth+1)

			// Add EndpointSlices
			b.addEndpointSlicesForService(ctx, svcResource, b.getNodeID(svcResource), depth+1)
		}
	}

	return nil
}

// addIngressesForService finds Ingresses routing to a Service
func (b *DependencyGraphBuilder) addIngressesForService(ctx context.Context, svc ResourceIdentifier, svcNodeID string, depth int) {
	ingressList, err := b.client.Resource(schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "ingresses",
	}).Namespace(svc.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return
	}

	for _, ingress := range ingressList.Items {
		rules, found, _ := unstructured.NestedSlice(ingress.Object, "spec", "rules")
		if !found {
			continue
		}

		for _, rule := range rules {
			ruleMap, ok := rule.(map[string]interface{})
			if !ok {
				continue
			}

			paths, found, _ := unstructured.NestedSlice(ruleMap, "http", "paths")
			if !found {
				continue
			}

			for _, path := range paths {
				pathMap, ok := path.(map[string]interface{})
				if !ok {
					continue
				}

				serviceName, found, _ := unstructured.NestedString(pathMap, "backend", "service", "name")
				if found && serviceName == svc.ResourceName {
					ingressResource := ResourceIdentifier{
						Namespace:    ingress.GetNamespace(),
						Group:        "networking.k8s.io",
						Version:      "v1",
						ResourceType: "ingresses",
						ResourceName: ingress.GetName(),
					}
					b.addDependencyWithEdge(ctx, ingressResource, svcNodeID, CategoryNetwork, "routes-to", depth+1, false)
					break
				}
			}
		}
	}
}

// addEndpointSlicesForService adds EndpointSlices for a Service
func (b *DependencyGraphBuilder) addEndpointSlicesForService(ctx context.Context, svc ResourceIdentifier, svcNodeID string, depth int) {
	epsList, err := b.client.Resource(schema.GroupVersionResource{
		Group:    "discovery.k8s.io",
		Version:  "v1",
		Resource: "endpointslices",
	}).Namespace(svc.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("kubernetes.io/service-name=%s", svc.ResourceName),
	})
	if err != nil {
		return
	}

	for _, eps := range epsList.Items {
		epsResource := ResourceIdentifier{
			Namespace:    eps.GetNamespace(),
			Group:        "discovery.k8s.io",
			Version:      "v1",
			ResourceType: "endpointslices",
			ResourceName: eps.GetName(),
		}
		b.addDependencyWithEdge(ctx, epsResource, svcNodeID, CategoryNetwork, "tracks-endpoints", depth+1, false)
	}
}

// addNetworkPolicyDependencies finds NetworkPolicies affecting this pod
func (b *DependencyGraphBuilder) addNetworkPolicyDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	podLabels := obj.GetLabels()

	npList, err := b.client.Resource(schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "networkpolicies",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil // NetworkPolicies might not be available
	}

	for _, np := range npList.Items {
		selector, found, _ := unstructured.NestedStringMap(np.Object, "spec", "podSelector", "matchLabels")
		if !found {
			// Empty selector matches all pods
			npResource := ResourceIdentifier{
				Namespace:    np.GetNamespace(),
				Group:        "networking.k8s.io",
				Version:      "v1",
				ResourceType: "networkpolicies",
				ResourceName: np.GetName(),
			}
			b.addDependencyWithEdge(ctx, npResource, parentID, CategoryNetwork, "affected-by", depth+1, false)
			continue
		}

		if matchLabels(selector, podLabels) {
			npResource := ResourceIdentifier{
				Namespace:    np.GetNamespace(),
				Group:        "networking.k8s.io",
				Version:      "v1",
				ResourceType: "networkpolicies",
				ResourceName: np.GetName(),
			}
			b.addDependencyWithEdge(ctx, npResource, parentID, CategoryNetwork, "affected-by", depth+1, false)
		}
	}

	return nil
}

// addPriorityClassDependency adds PriorityClass dependency
func (b *DependencyGraphBuilder) addPriorityClassDependency(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	pcName, found, _ := unstructured.NestedString(obj.Object, "spec", "priorityClassName")
	if !found || pcName == "" {
		return nil
	}

	pcResource := ResourceIdentifier{
		Namespace:    "",
		Group:        "scheduling.k8s.io",
		Version:      "v1",
		ResourceType: "priorityclasses",
		ResourceName: pcName,
	}

	return b.addDependencyWithEdge(ctx, pcResource, parentID, CategoryScheduling, "uses-priority", depth+1, false)
}

// addNamespaceConstraints adds ResourceQuota and LimitRange in the namespace
func (b *DependencyGraphBuilder) addNamespaceConstraints(ctx context.Context, resource ResourceIdentifier, parentID string, depth int) error {
	// ResourceQuotas
	rqList, err := b.client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "resourcequotas",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rq := range rqList.Items {
			rqResource := ResourceIdentifier{
				Namespace:    rq.GetNamespace(),
				Group:        "",
				Version:      "v1",
				ResourceType: "resourcequotas",
				ResourceName: rq.GetName(),
			}
			b.addDependencyWithEdge(ctx, rqResource, parentID, CategoryScheduling, "constrained-by", depth+1, false)
		}
	}

	// LimitRanges
	lrList, err := b.client.Resource(schema.GroupVersionResource{
		Version:  "v1",
		Resource: "limitranges",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, lr := range lrList.Items {
			lrResource := ResourceIdentifier{
				Namespace:    lr.GetNamespace(),
				Group:        "",
				Version:      "v1",
				ResourceType: "limitranges",
				ResourceName: lr.GetName(),
			}
			b.addDependencyWithEdge(ctx, lrResource, parentID, CategoryScheduling, "constrained-by", depth+1, false)
		}
	}

	return nil
}

// addHPADependency finds HPA targeting this workload
func (b *DependencyGraphBuilder) addHPADependency(ctx context.Context, resource ResourceIdentifier, parentID string, depth int) {
	hpaList, err := b.client.Resource(schema.GroupVersionResource{
		Group:    "autoscaling",
		Version:  "v2",
		Resource: "horizontalpodautoscalers",
	}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// Try v1
		hpaList, err = b.client.Resource(schema.GroupVersionResource{
			Group:    "autoscaling",
			Version:  "v1",
			Resource: "horizontalpodautoscalers",
		}).Namespace(resource.Namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return
		}
	}

	for _, hpa := range hpaList.Items {
		targetKind, _, _ := unstructured.NestedString(hpa.Object, "spec", "scaleTargetRef", "kind")
		targetName, _, _ := unstructured.NestedString(hpa.Object, "spec", "scaleTargetRef", "name")

		expectedKind := resourceToKind(resource.ResourceType)
		if targetKind == expectedKind && targetName == resource.ResourceName {
			hpaResource := ResourceIdentifier{
				Namespace:    hpa.GetNamespace(),
				Group:        "autoscaling",
				Version:      "v2",
				ResourceType: "horizontalpodautoscalers",
				ResourceName: hpa.GetName(),
			}
			b.addDependencyWithEdge(ctx, hpaResource, parentID, CategoryAutoscaling, "scales", depth+1, false)
		}
	}
}

// addVolumeClaimTemplateDependencies processes volumeClaimTemplates in StatefulSet
func (b *DependencyGraphBuilder) addVolumeClaimTemplateDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) {
	vcts, found, _ := unstructured.NestedSlice(obj.Object, "spec", "volumeClaimTemplates")
	if !found {
		return
	}

	for _, vct := range vcts {
		vctMap, ok := vct.(map[string]interface{})
		if !ok {
			continue
		}

		if scName, found, _ := unstructured.NestedString(vctMap, "spec", "storageClassName"); found && scName != "" {
			scResource := ResourceIdentifier{
				Namespace:    "",
				Group:        "storage.k8s.io",
				Version:      "v1",
				ResourceType: "storageclasses",
				ResourceName: scName,
			}
			b.addDependencyWithEdge(ctx, scResource, parentID, CategoryStorage, "uses-class", depth+1, false)
		}
	}
}

// processPodTemplateDependencies processes pod template spec for workload controllers
func (b *DependencyGraphBuilder) processPodTemplateDependencies(ctx context.Context, resource ResourceIdentifier, obj *unstructured.Unstructured, parentID string, depth int) error {
	// Create a fake pod resource to extract template dependencies
	templateSpec, found, _ := unstructured.NestedMap(obj.Object, "spec", "template", "spec")
	if !found {
		// Try jobTemplate for CronJobs
		templateSpec, found, _ = unstructured.NestedMap(obj.Object, "spec", "jobTemplate", "spec", "template", "spec")
		if !found {
			return nil
		}
	}

	// Create a temporary object with the template spec
	tempObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": templateSpec,
		},
	}

	// Extract dependencies from pod template
	b.addVolumeDependencies(ctx, resource, tempObj, parentID, depth)
	b.addEnvDependencies(ctx, resource, tempObj, parentID, depth)

	// Extract ServiceAccount from template
	if saName, found, _ := unstructured.NestedString(templateSpec, "serviceAccountName"); found && saName != "" {
		saResource := ResourceIdentifier{
			Namespace:    resource.Namespace,
			Group:        "",
			Version:      "v1",
			ResourceType: "serviceaccounts",
			ResourceName: saName,
		}
		b.addDependencyWithEdge(ctx, saResource, parentID, CategoryRBAC, "uses-account", depth+1, true)
	}

	return nil
}

// getUniqueCategories returns unique categories in the graph
func (b *DependencyGraphBuilder) getUniqueCategories() []string {
	categoryMap := make(map[string]bool)
	for _, node := range b.nodes {
		categoryMap[string(node.Category)] = true
	}

	var categories []string
	for cat := range categoryMap {
		categories = append(categories, cat)
	}
	return categories
}

// calculateStats calculates statistics for the dependency graph
func (b *DependencyGraphBuilder) calculateStats() DependencyStats {
	stats := DependencyStats{
		TotalNodes:     len(b.nodes),
		TotalEdges:     len(b.edges),
		CategoryCounts: make(map[string]int),
	}

	maxDepth := 0
	criticalPaths := 0
	customResources := 0

	for _, node := range b.nodes {
		stats.CategoryCounts[string(node.Category)]++
		if node.Depth > maxDepth {
			maxDepth = node.Depth
		}
		if node.Category == CategoryCustom {
			customResources++
		}
	}

	for _, edge := range b.edges {
		if edge.Critical {
			criticalPaths++
		}
	}

	stats.MaxDepth = maxDepth
	stats.CriticalPaths = criticalPaths
	stats.CustomResources = customResources

	return stats
}

// resourceToKind converts resource type to Kind
func resourceToKind(resource string) string {
	kindMap := map[string]string{
		"deployments":            "Deployment",
		"statefulsets":           "StatefulSet",
		"daemonsets":             "DaemonSet",
		"replicasets":            "ReplicaSet",
		"replicationcontrollers": "ReplicationController",
		"jobs":                   "Job",
		"cronjobs":               "CronJob",
	}
	if kind, ok := kindMap[resource]; ok {
		return kind
	}
	return resource
}
