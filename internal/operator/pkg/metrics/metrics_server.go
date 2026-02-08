package metrics

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/utils"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

const (
	MetricsServerNamespace = "kube-system"
	MetricsServerName      = "metrics-server"
	ComponentLabel         = "k8s-app"
	ComponentValue         = "metrics-server"
)

// MetricsServerManager handles metrics server operations
type MetricsServerManager struct {
	kubeConfigStore kubeconfig.ContextStore
	queue           *utils.Queue
}

// InstallRequest represents the installation request payload
type InstallRequest struct {
	Type string `json:"type" binding:"required"` // "production" or "local"
}

// MetricsServerStatus represents the status of metrics server
type MetricsServerStatus struct {
	Installed      bool            `json:"installed"`
	Ready          bool            `json:"ready"`
	Version        string          `json:"version,omitempty"`
	ServiceAddress string          `json:"serviceAddress,omitempty"`
	Error          string          `json:"error,omitempty"`
	Deployment     *DeploymentInfo `json:"deployment,omitempty"`
	Service        *ServiceInfo    `json:"service,omitempty"`
	Components     []ComponentInfo `json:"components,omitempty"`
}

// DeploymentInfo contains deployment details
type DeploymentInfo struct {
	Name              string    `json:"name"`
	Namespace         string    `json:"namespace"`
	Replicas          int32     `json:"replicas"`
	ReadyReplicas     int32     `json:"readyReplicas"`
	AvailableReplicas int32     `json:"availableReplicas"`
	CreationTimestamp time.Time `json:"creationTimestamp"`
	Image             string    `json:"image,omitempty"`
	Args              []string  `json:"args,omitempty"`
}

// ServiceInfo contains service details
type ServiceInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	ClusterIP string `json:"clusterIP"`
	Port      int32  `json:"port"`
	Type      string `json:"type"`
}

// ComponentInfo represents status of individual components
type ComponentInfo struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

// NewMetricsServerManager creates a new metrics server manager
func NewMetricsServerManager(kubeConfigStore kubeconfig.ContextStore, queue *utils.Queue) *MetricsServerManager {
	return &MetricsServerManager{
		kubeConfigStore: kubeConfigStore,
		queue:           queue,
	}
}

// GetStatus checks the current status of metrics server in the cluster
func (m *MetricsServerManager) GetStatus(clusterName string) (*MetricsServerStatus, error) {
	clientset, _, err := m.getKubernetesClients(clusterName)
	if err != nil {
		return &MetricsServerStatus{
			Installed: false,
			Error:     fmt.Sprintf("Failed to connect to cluster: %v", err),
		}, err
	}

	status := &MetricsServerStatus{
		Components: []ComponentInfo{},
	}

	// Check deployment
	deployment, err := clientset.AppsV1().Deployments(MetricsServerNamespace).Get(
		context.Background(), MetricsServerName, metav1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			status.Installed = false
			status.Components = append(status.Components, ComponentInfo{
				Name:   "deployment",
				Type:   "Deployment",
				Status: "NotFound",
			})
			return status, nil
		}
		status.Error = fmt.Sprintf("Error checking deployment: %v", err)
		return status, err
	}

	status.Installed = true
	status.Ready = deployment.Status.ReadyReplicas > 0 && deployment.Status.ReadyReplicas == deployment.Status.Replicas

	// Extract version and args from deployment
	if len(deployment.Spec.Template.Spec.Containers) > 0 {
		container := deployment.Spec.Template.Spec.Containers[0]
		image := container.Image
		if strings.Contains(image, ":") {
			parts := strings.Split(image, ":")
			status.Version = parts[len(parts)-1]
		}

		status.Deployment = &DeploymentInfo{
			Name:              deployment.Name,
			Namespace:         deployment.Namespace,
			Replicas:          *deployment.Spec.Replicas,
			ReadyReplicas:     deployment.Status.ReadyReplicas,
			AvailableReplicas: deployment.Status.AvailableReplicas,
			CreationTimestamp: deployment.CreationTimestamp.Time,
			Image:             image,
			Args:              container.Args,
		}
	}

	status.Components = append(status.Components, ComponentInfo{
		Name:   "deployment",
		Type:   "Deployment",
		Status: "Ready",
	})

	// Check service
	service, err := clientset.CoreV1().Services(MetricsServerNamespace).Get(
		context.Background(), MetricsServerName, metav1.GetOptions{})
	if err != nil {
		if !errors.IsNotFound(err) {
			logger.Log(logger.LevelWarn, map[string]string{"cluster": clusterName}, err, "Failed to get metrics server service")
		}
		status.Components = append(status.Components, ComponentInfo{
			Name:   "service",
			Type:   "Service",
			Status: "NotFound",
			Error:  err.Error(),
		})
	} else {
		status.ServiceAddress = fmt.Sprintf("%s.%s.svc.cluster.local:%d",
			service.Name, service.Namespace, service.Spec.Ports[0].Port)
		status.Service = &ServiceInfo{
			Name:      service.Name,
			Namespace: service.Namespace,
			ClusterIP: service.Spec.ClusterIP,
			Port:      service.Spec.Ports[0].Port,
			Type:      string(service.Spec.Type),
		}
		status.Components = append(status.Components, ComponentInfo{
			Name:   "service",
			Type:   "Service",
			Status: "Ready",
		})
	}

	// Check other components
	m.checkComponentStatus(clientset, status, clusterName)

	return status, nil
}

// Install installs metrics server in the cluster using client-go
func (m *MetricsServerManager) Install(clusterName string, installType string) (*utils.Operation, error) {
	// Queue the installation operation
	data := map[string]interface{}{
		"installType": installType,
	}
	tags := []string{"metrics-server", "installation"}

	operation := m.queue.AddOperation("metrics-install", clusterName, "system", data, tags)

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"type":        installType,
		"operationId": operation.ID,
	}, nil, "Queued metrics server installation")

	return operation, nil
}

// Uninstall removes metrics server from the cluster
func (m *MetricsServerManager) Uninstall(clusterName string) (*utils.Operation, error) {
	// Queue the uninstallation operation
	data := map[string]interface{}{}
	tags := []string{"metrics-server", "uninstallation"}

	operation := m.queue.AddOperation("metrics-uninstall", clusterName, "system", data, tags)

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"operationId": operation.ID,
	}, nil, "Queued metrics server uninstallation")

	return operation, nil
}

// getKubernetesClients creates kubernetes clients for the given cluster
func (m *MetricsServerManager) getKubernetesClients(clusterName string) (*kubernetes.Clientset, interface{}, error) {
	ctx, err := m.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		return nil, nil, fmt.Errorf("context not found: %w", err)
	}

	restConfig, err := ctx.RESTConfig()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create REST config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create kubernetes clientset: %w", err)
	}

	return clientset, restConfig, nil
}

// checkComponentStatus checks the status of various metrics server components
func (m *MetricsServerManager) checkComponentStatus(clientset *kubernetes.Clientset, status *MetricsServerStatus, clusterName string) {
	ctx := context.Background()

	// Check ServiceAccount
	_, err := clientset.CoreV1().ServiceAccounts(MetricsServerNamespace).Get(ctx, MetricsServerName, metav1.GetOptions{})
	if err != nil {
		status.Components = append(status.Components, ComponentInfo{
			Name:   "serviceaccount",
			Type:   "ServiceAccount",
			Status: "NotFound",
			Error:  err.Error(),
		})
	} else {
		status.Components = append(status.Components, ComponentInfo{
			Name:   "serviceaccount",
			Type:   "ServiceAccount",
			Status: "Ready",
		})
	}

	// Check ClusterRole
	_, err = clientset.RbacV1().ClusterRoles().Get(ctx, "system:metrics-server", metav1.GetOptions{})
	if err != nil {
		status.Components = append(status.Components, ComponentInfo{
			Name:   "clusterrole",
			Type:   "ClusterRole",
			Status: "NotFound",
			Error:  err.Error(),
		})
	} else {
		status.Components = append(status.Components, ComponentInfo{
			Name:   "clusterrole",
			Type:   "ClusterRole",
			Status: "Ready",
		})
	}

	// Check ClusterRoleBinding
	_, err = clientset.RbacV1().ClusterRoleBindings().Get(ctx, "system:metrics-server", metav1.GetOptions{})
	if err != nil {
		status.Components = append(status.Components, ComponentInfo{
			Name:   "clusterrolebinding",
			Type:   "ClusterRoleBinding",
			Status: "NotFound",
			Error:  err.Error(),
		})
	} else {
		status.Components = append(status.Components, ComponentInfo{
			Name:   "clusterrolebinding",
			Type:   "ClusterRoleBinding",
			Status: "Ready",
		})
	}
}

// GetRESTConfig returns the REST config for a cluster - used by the processor
func (m *MetricsServerManager) GetRESTConfig(clusterName string) (*rest.Config, error) {
	ctx, err := m.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		return nil, fmt.Errorf("context not found: %w", err)
	}

	return ctx.RESTConfig()
}

// GetQueue returns the queue instance
func (m *MetricsServerManager) GetQueue() *utils.Queue {
	return m.queue
}
