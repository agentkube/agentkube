package lookup

import (
	"context"
	"fmt"
	"strings"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type ToolInstance struct {
	ServiceAddress string        `json:"serviceAddress"`
	Namespace      string        `json:"namespace"`
	ServiceType    string        `json:"serviceType"`
	ServiceURL     string        `json:"serviceUrl"`
	Ports          []ServicePort `json:"ports"`
}

type ServicePort struct {
	Name               string `json:"name"`
	Port               int32  `json:"port"`
	TargetPort         int32  `json:"targetPort"`
	ContainerPort      int32  `json:"containerPort"`
	Protocol           string `json:"protocol"`
	NodePort           int32  `json:"nodePort,omitempty"`
	NamedPortToResolve string `json:"-"` // Internal field for resolving named ports
}

type ToolLookup struct {
	kubeConfigStore kubeconfig.ContextStore
}

type ToolMatcher struct {
	ServiceNames     []string
	LabelSelectors   map[string]string
	PodLabels        []string
	DeploymentNames  []string
	StatefulSetNames []string
}

var toolMatchers = map[string]ToolMatcher{
	"grafana": {
		ServiceNames: []string{"grafana", "grafana-service", "kube-prometheus-stack-grafana"},
		LabelSelectors: map[string]string{
			"app":                    "grafana",
			"app.kubernetes.io/name": "grafana",
		},
		PodLabels:        []string{"grafana"},
		DeploymentNames:  []string{"grafana", "grafana-deployment"},
		StatefulSetNames: []string{"grafana"},
	},
	"newrelic": {
		ServiceNames: []string{"newrelic", "newrelic-bundle", "nri-bundle"},
		LabelSelectors: map[string]string{
			"app":                    "newrelic",
			"app.kubernetes.io/name": "newrelic",
		},
		PodLabels:        []string{"newrelic"},
		DeploymentNames:  []string{"newrelic", "newrelic-agent"},
		StatefulSetNames: []string{},
	},
	"datadog": {
		ServiceNames: []string{"datadog", "datadog-agent", "dd-agent"},
		LabelSelectors: map[string]string{
			"app":                    "datadog",
			"app.kubernetes.io/name": "datadog",
		},
		PodLabels:        []string{"datadog"},
		DeploymentNames:  []string{"datadog", "datadog-agent"},
		StatefulSetNames: []string{},
	},
	"signoz": {
		ServiceNames: []string{"signoz", "signoz-frontend", "signoz-query-service"},
		LabelSelectors: map[string]string{
			"app":                    "signoz",
			"app.kubernetes.io/name": "signoz",
		},
		PodLabels:        []string{"signoz"},
		DeploymentNames:  []string{"signoz", "signoz-frontend", "signoz-query-service"},
		StatefulSetNames: []string{"signoz-clickhouse"},
	},
	"prometheus": {
		ServiceNames: []string{"prometheus", "prometheus-server", "kube-prometheus-stack-prometheus"},
		LabelSelectors: map[string]string{
			"app":                    "prometheus",
			"app.kubernetes.io/name": "prometheus",
		},
		PodLabels:        []string{"prometheus"},
		DeploymentNames:  []string{"prometheus", "prometheus-server"},
		StatefulSetNames: []string{"prometheus"},
	},
	"jaeger": {
		ServiceNames: []string{"jaeger", "jaeger-query", "jaeger-collector"},
		LabelSelectors: map[string]string{
			"app":                    "jaeger",
			"app.kubernetes.io/name": "jaeger",
		},
		PodLabels:        []string{"jaeger"},
		DeploymentNames:  []string{"jaeger", "jaeger-query", "jaeger-collector"},
		StatefulSetNames: []string{},
	},
	"elastic": {
		ServiceNames: []string{"elasticsearch", "elastic", "elasticsearch-master"},
		LabelSelectors: map[string]string{
			"app":                    "elasticsearch",
			"app.kubernetes.io/name": "elasticsearch",
		},
		PodLabels:        []string{"elasticsearch"},
		DeploymentNames:  []string{"elasticsearch"},
		StatefulSetNames: []string{"elasticsearch-master"},
	},
	"kibana": {
		ServiceNames: []string{"kibana", "kibana-service"},
		LabelSelectors: map[string]string{
			"app":                    "kibana",
			"app.kubernetes.io/name": "kibana",
		},
		PodLabels:        []string{"kibana"},
		DeploymentNames:  []string{"kibana"},
		StatefulSetNames: []string{},
	},
	"argocd": {
		ServiceNames: []string{"argocd-server", "argo-cd-argocd-server", "argocd-server-service"},
		LabelSelectors: map[string]string{
			"app.kubernetes.io/name":      "argocd-server",
			"app.kubernetes.io/component": "server",
			"app":                         "argocd-server",
		},
		PodLabels:        []string{"argocd-server"},
		DeploymentNames:  []string{"argocd-server", "argo-cd-argocd-server"},
		StatefulSetNames: []string{},
	},
	"loki": {
		ServiceNames: []string{"loki", "loki-service", "loki-gateway", "loki-read", "loki-write"},
		LabelSelectors: map[string]string{
			"app":                    "loki",
			"app.kubernetes.io/name": "loki",
		},
		PodLabels:        []string{"loki"},
		DeploymentNames:  []string{"loki", "loki-gateway"},
		StatefulSetNames: []string{"loki", "loki-read", "loki-write"},
	},
	"alertmanager": {
		ServiceNames: []string{"alertmanager", "alertmanager-service", "kube-prometheus-stack-alertmanager"},
		LabelSelectors: map[string]string{
			"app":                    "alertmanager",
			"app.kubernetes.io/name": "alertmanager",
		},
		PodLabels:        []string{"alertmanager"},
		DeploymentNames:  []string{"alertmanager"},
		StatefulSetNames: []string{"alertmanager"},
	},
	"opencost": {
		ServiceNames: []string{"opencost", "opencost-service"},
		LabelSelectors: map[string]string{
			"app":                    "opencost",
			"app.kubernetes.io/name": "opencost",
		},
		PodLabels:        []string{"opencost"},
		DeploymentNames:  []string{"opencost"},
		StatefulSetNames: []string{},
	},
}

func NewToolLookup(kubeConfigStore kubeconfig.ContextStore) *ToolLookup {
	return &ToolLookup{
		kubeConfigStore: kubeConfigStore,
	}
}

func (tl *ToolLookup) FindToolInCluster(clusterName, toolName string) ([]ToolInstance, error) {
	toolName = strings.ToLower(toolName)

	matcher, exists := toolMatchers[toolName]
	if !exists {
		return []ToolInstance{}, nil
	}

	ctx, err := tl.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		return nil, fmt.Errorf("failed to get context for cluster %s: %v", clusterName, err)
	}

	return tl.findToolInCluster(ctx, toolName, matcher)
}

func (tl *ToolLookup) findToolInCluster(ctx *kubeconfig.Context, toolName string, matcher ToolMatcher) ([]ToolInstance, error) {
	clientset, err := ctx.ClientSetWithToken("")
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %v", err)
	}

	var instances []ToolInstance

	// Only find by services - these are the main dashboard instances for port forwarding
	instances = append(instances, tl.findByServices(clientset, ctx.Name, toolName, matcher)...)

	return tl.deduplicateInstances(instances), nil
}

func (tl *ToolLookup) findByServices(clientset *kubernetes.Clientset, clusterName, toolName string, matcher ToolMatcher) []ToolInstance {
	var instances []ToolInstance

	namespaces, err := clientset.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "Failed to list namespaces")
		return instances
	}

	for _, ns := range namespaces.Items {
		services, err := clientset.CoreV1().Services(ns.Name).List(context.TODO(), metav1.ListOptions{})
		if err != nil {
			continue
		}

		for _, svc := range services.Items {
			if tl.matchesService(svc.Name, svc.Labels, matcher) {
				var ports []ServicePort
				for _, port := range svc.Spec.Ports {
					targetPort := int32(0)
					namedPortToResolve := ""

					if port.TargetPort.IntVal != 0 {
						targetPort = port.TargetPort.IntVal
					} else if port.TargetPort.StrVal != "" {
						// For named ports like "grafana", we'll resolve this in getDetailedPorts
						namedPortToResolve = port.TargetPort.StrVal
						targetPort = 0
					} else {
						// If no targetPort specified, it defaults to the port value
						targetPort = port.Port
					}

					ports = append(ports, ServicePort{
						Name:               port.Name,
						Port:               port.Port,
						TargetPort:         targetPort,
						Protocol:           string(port.Protocol),
						NodePort:           port.NodePort,
						NamedPortToResolve: namedPortToResolve,
					})
				}

				serviceURL := tl.buildServiceURL(svc.Name, ns.Name, ports)

				instances = append(instances, ToolInstance{
					ServiceAddress: fmt.Sprintf("%s.%s.svc.cluster.local", svc.Name, ns.Name),
					Namespace:      ns.Name,
					ServiceType:    string(svc.Spec.Type),
					ServiceURL:     serviceURL,
					Ports:          tl.getDetailedPorts(clientset, ns.Name, svc.Name, ports),
				})
			}
		}
	}

	return instances
}

func (tl *ToolLookup) matchesService(name string, labels map[string]string, matcher ToolMatcher) bool {
	name = strings.ToLower(name)

	for _, serviceName := range matcher.ServiceNames {
		if strings.Contains(name, strings.ToLower(serviceName)) {
			return true
		}
	}

	return tl.matchesLabels(labels, matcher.LabelSelectors)
}

func (tl *ToolLookup) matchesLabels(labels map[string]string, selectors map[string]string) bool {
	if len(selectors) == 0 {
		return false
	}

	for key, value := range selectors {
		if labelValue, exists := labels[key]; exists && labelValue == value {
			return true
		}
	}

	return false
}

func (tl *ToolLookup) buildServiceURL(serviceName, namespace string, ports []ServicePort) string {
	if len(ports) == 0 {
		return fmt.Sprintf("%s.%s.svc.cluster.local", serviceName, namespace)
	}

	var httpPort ServicePort
	for _, port := range ports {
		if strings.Contains(strings.ToLower(port.Name), "http") || port.Port == 80 || port.Port == 8080 || port.Port == 3000 {
			httpPort = port
			break
		}
	}

	if httpPort.Port == 0 {
		httpPort = ports[0]
	}

	return fmt.Sprintf("http://%s.%s.svc.cluster.local:%d", serviceName, namespace, httpPort.Port)
}

func (tl *ToolLookup) findAssociatedService(clientset *kubernetes.Clientset, resourceName, namespace string) string {
	services, err := clientset.CoreV1().Services(namespace).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return ""
	}

	for _, svc := range services.Items {
		if strings.Contains(strings.ToLower(svc.Name), strings.ToLower(resourceName)) ||
			strings.Contains(strings.ToLower(resourceName), strings.ToLower(svc.Name)) {
			var ports []ServicePort
			for _, port := range svc.Spec.Ports {
				ports = append(ports, ServicePort{
					Port: port.Port,
				})
			}
			return tl.buildServiceURL(svc.Name, namespace, ports)
		}
	}

	return ""
}

func (tl *ToolLookup) deduplicateInstances(instances []ToolInstance) []ToolInstance {
	seen := make(map[string]bool)
	var result []ToolInstance

	for _, instance := range instances {
		key := fmt.Sprintf("%s-%s", instance.Namespace, instance.ServiceAddress)
		if !seen[key] {
			seen[key] = true
			result = append(result, instance)
		}
	}

	return result
}

func (tl *ToolLookup) getDetailedPorts(clientset *kubernetes.Clientset, namespace, serviceName string, servicePorts []ServicePort) []ServicePort {
	var detailedPorts []ServicePort

	// Get the service to find its selector
	svc, err := clientset.CoreV1().Services(namespace).Get(context.TODO(), serviceName, metav1.GetOptions{})
	if err != nil {
		return servicePorts
	}

	// Use service selector to find matching pods
	selector := ""
	if svc.Spec.Selector != nil {
		var selectorParts []string
		for key, value := range svc.Spec.Selector {
			selectorParts = append(selectorParts, fmt.Sprintf("%s=%s", key, value))
		}
		selector = strings.Join(selectorParts, ",")
	}

	pods, err := clientset.CoreV1().Pods(namespace).List(context.TODO(), metav1.ListOptions{
		LabelSelector: selector,
	})
	if err != nil {
		return servicePorts
	}

	for _, servicePort := range servicePorts {
		detailedPort := servicePort

		// For each service port, find the corresponding container port
		for _, pod := range pods.Items {
			for _, container := range pod.Spec.Containers {
				for _, containerPort := range container.Ports {
					// Priority matching:
					// 1. Named port resolution (targetPort: "grafana" -> containerPort.name: "grafana")
					// 2. Direct port name match
					// 3. Port number match
					if (servicePort.NamedPortToResolve != "" && containerPort.Name == servicePort.NamedPortToResolve) ||
						containerPort.Name == servicePort.Name ||
						containerPort.ContainerPort == servicePort.Port ||
						(servicePort.TargetPort != 0 && containerPort.ContainerPort == servicePort.TargetPort) {
						detailedPort.ContainerPort = containerPort.ContainerPort
						// If targetPort was 0 (named port), resolve it to the actual port number
						if detailedPort.TargetPort == 0 {
							detailedPort.TargetPort = containerPort.ContainerPort
						}
						// Clear the internal field since we've resolved it
						detailedPort.NamedPortToResolve = ""
						break
					}
				}
			}
		}

		detailedPorts = append(detailedPorts, detailedPort)
	}

	return detailedPorts
}

func (tl *ToolLookup) GetSupportedTools() []string {
	var tools []string
	for tool := range toolMatchers {
		tools = append(tools, tool)
	}
	return tools
}
