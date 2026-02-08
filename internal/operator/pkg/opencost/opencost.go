package opencost

import (
	"context"
	"fmt"
	"os"
	"time"

	helmclient "github.com/mittwald/go-helm-client"
	"gopkg.in/yaml.v2"
	"helm.sh/helm/v3/pkg/repo"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/agentkube/operator/pkg/logger"
)

var (
	// Default configuration values for OpenCost Helm chart
	defaultOpenCostHelmRepo     = "https://opencost.github.io/opencost-helm-chart"
	defaultOpenCostChartVersion = "1.15.1"
	defaultOpenCostChartName    = "opencost"
	defaultOpenCostRepoName     = "opencost"
	defaultOpenCostReleaseName  = "opencost"
	defaultOpenCostNamespace    = "opencost"
)

// OpenCostStat contains basic information about OpenCost installation
type OpenCostStat struct {
	Installed     bool       `json:"installed"`
	Version       string     `json:"version,omitempty"`
	Namespace     string     `json:"namespace,omitempty"`
	InstallMethod string     `json:"installMethod,omitempty"`
	Status        string     `json:"status,omitempty"` // running, pending, error
	InstallTime   *time.Time `json:"installTime,omitempty"`
	PrometheusURL string     `json:"prometheusUrl,omitempty"`
	UIEndpoint    string     `json:"uiEndpoint,omitempty"`
	APIEndpoint   string     `json:"apiEndpoint,omitempty"`
}

// Controller manages OpenCost operations
type Controller struct {
	restConfig *rest.Config
	clientset  *kubernetes.Clientset
	helm       helmclient.Client
}

// NewController creates a new OpenCost controller
func NewController(restConfig *rest.Config) (*Controller, error) {
	// Create kubernetes clientset
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes clientset: %v", err)
	}

	// Initialize Helm client
	helmClient, err := helmclient.New(&helmclient.Options{})
	if err != nil {
		return nil, fmt.Errorf("failed to create helm client: %v", err)
	}

	return &Controller{
		restConfig: restConfig,
		clientset:  clientset,
		helm:       helmClient,
	}, nil
}

// InstallOpenCost installs OpenCost using Helm
func (c *Controller) InstallOpenCost(ctx context.Context, namespace string, values map[string]interface{}) error {
	if namespace == "" {
		namespace = defaultOpenCostNamespace
	}

	// Add Helm repository
	chartRepo := repo.Entry{
		Name: getEnvOrDefault("OPENCOST_REPO_NAME", defaultOpenCostRepoName),
		URL:  getEnvOrDefault("OPENCOST_REPO_URL", defaultOpenCostHelmRepo),
	}

	if err := c.helm.AddOrUpdateChartRepo(chartRepo); err != nil {
		return fmt.Errorf("failed to add opencost helm repo: %v", err)
	}

	// Create namespace if it doesn't exist
	_, err := c.clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err != nil && apierrors.IsNotFound(err) {
		_, err = c.clientset.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
			ObjectMeta: metav1.ObjectMeta{
				Name: namespace,
			},
		}, metav1.CreateOptions{})
		if err != nil {
			return fmt.Errorf("failed to create namespace %s: %v", namespace, err)
		}
	} else if err != nil {
		return fmt.Errorf("failed to check namespace %s: %v", namespace, err)
	}

	// Set default values if not provided
	if values == nil {
		values = make(map[string]interface{})
	}

	// If prometheus connection is not specified, try to detect it
	if _, ok := values["prometheus"]; !ok {
		// Try to detect Prometheus service
		prometheusService, err := c.findPrometheusService(ctx)
		if err == nil && prometheusService != "" {
			values["prometheus"] = map[string]interface{}{
				"server": prometheusService,
			}
		}
	}

	// Create values yaml from values map
	valuesYaml, err := createValuesYaml(values)
	if err != nil {
		return fmt.Errorf("failed to create values yaml: %v", err)
	}

	// Prepare chart installation
	chartSpec := helmclient.ChartSpec{
		ReleaseName:     getEnvOrDefault("OPENCOST_RELEASE_NAME", defaultOpenCostReleaseName),
		ChartName:       fmt.Sprintf("%s/%s", chartRepo.Name, defaultOpenCostChartName),
		Namespace:       namespace,
		Version:         getEnvOrDefault("OPENCOST_CHART_VERSION", defaultOpenCostChartVersion),
		UpgradeCRDs:     true,
		Wait:            true,
		Timeout:         300, // 5 minutes
		CreateNamespace: true,
		ValuesYaml:      valuesYaml,
	}

	// Install/upgrade the chart
	if _, err := c.helm.InstallOrUpgradeChart(ctx, &chartSpec, nil); err != nil {
		return fmt.Errorf("failed to install/upgrade opencost: %v", err)
	}

	return nil
}

// UninstallOpenCost removes OpenCost installation
func (c *Controller) UninstallOpenCost(ctx context.Context, namespace string) error {
	if namespace == "" {
		namespace = defaultOpenCostNamespace
	}

	releaseName := getEnvOrDefault("OPENCOST_RELEASE_NAME", defaultOpenCostReleaseName)

	// Check if OpenCost is installed via Helm
	installed, method, _, err := c.isOpenCostInstalledViaHelm(releaseName, namespace)
	if err != nil {
		return fmt.Errorf("failed to check opencost installation: %v", err)
	}

	if installed && method == "helm" {
		// Uninstall Helm release
		chartSpec := helmclient.ChartSpec{
			ReleaseName: releaseName,
			Namespace:   namespace,
		}

		if err := c.helm.UninstallRelease(&chartSpec); err != nil {
			return fmt.Errorf("failed to uninstall opencost: %v", err)
		}
	} else {
		// For non-Helm installations, we need to delete resources manually
		// This is a simplified approach - in a real implementation, you might want to be more thorough
		err := c.clientset.AppsV1().Deployments(namespace).Delete(ctx, "opencost", metav1.DeleteOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			return fmt.Errorf("failed to delete opencost deployment: %v", err)
		}

		err = c.clientset.CoreV1().Services(namespace).Delete(ctx, "opencost", metav1.DeleteOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			return fmt.Errorf("failed to delete opencost service: %v", err)
		}
	}

	return nil
}

// GetOpenCostStatus checks if OpenCost is installed and returns its status
func (c *Controller) GetOpenCostStatus(ctx context.Context) (*OpenCostStat, error) {
	stat := &OpenCostStat{
		Installed: false,
	}

	// Method 1: Check via Helm release
	releaseName := getEnvOrDefault("OPENCOST_RELEASE_NAME", defaultOpenCostReleaseName)
	namespace := getEnvOrDefault("OPENCOST_NAMESPACE", defaultOpenCostNamespace)

	installed, method, installTime, err := c.isOpenCostInstalledViaHelm(releaseName, namespace)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "checking helm installation")
	}

	if installed {
		stat.Installed = true
		stat.InstallMethod = method
		stat.Namespace = namespace
		stat.InstallTime = installTime
	}

	// Method 2: Check via Kubernetes resources if not found via Helm
	if !stat.Installed {
		// Try to find in other namespaces
		namespaces, err := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return stat, fmt.Errorf("failed to list namespaces: %v", err)
		}

		for _, ns := range namespaces.Items {
			nsName := ns.Name

			// Check for OpenCost deployment
			deployment, err := c.clientset.AppsV1().Deployments(nsName).Get(ctx, "opencost", metav1.GetOptions{})
			if err == nil && deployment != nil {
				stat.Installed = true
				stat.InstallMethod = "direct"
				stat.Namespace = nsName
				stat.InstallTime = &deployment.CreationTimestamp.Time

				// Get version from image
				if len(deployment.Spec.Template.Spec.Containers) > 0 {
					image := deployment.Spec.Template.Spec.Containers[0].Image
					// Extract version from image tag
					for i := len(image) - 1; i >= 0; i-- {
						if image[i] == ':' {
							stat.Version = image[i+1:]
							break
						}
					}
				}
				break
			}
		}
	}

	// If OpenCost is installed, collect additional information
	if stat.Installed {
		// Check deployment status
		deployment, err := c.clientset.AppsV1().Deployments(stat.Namespace).Get(ctx, "opencost", metav1.GetOptions{})
		if err == nil {
			if deployment.Status.ReadyReplicas > 0 {
				stat.Status = "running"
			} else if deployment.Status.Replicas > 0 {
				stat.Status = "pending"
			} else {
				stat.Status = "error"
			}

			// If version wasn't set from Helm, try to get it from the deployment
			if stat.Version == "" && len(deployment.Spec.Template.Spec.Containers) > 0 {
				image := deployment.Spec.Template.Spec.Containers[0].Image
				// Extract version from image tag
				for i := len(image) - 1; i >= 0; i-- {
					if image[i] == ':' {
						stat.Version = image[i+1:]
						break
					}
				}
			}

			// Try to find Prometheus URL from config
			for _, container := range deployment.Spec.Template.Spec.Containers {
				for _, env := range container.Env {
					if env.Name == "PROMETHEUS_SERVER_ENDPOINT" {
						stat.PrometheusURL = env.Value
						break
					}
				}
				if stat.PrometheusURL != "" {
					break
				}
			}
		}

		// Get UI and API endpoints
		service, err := c.clientset.CoreV1().Services(stat.Namespace).Get(ctx, "opencost", metav1.GetOptions{})
		if err == nil {
			// Check for NodePort or LoadBalancer service
			if service.Spec.Type == corev1.ServiceTypeNodePort {
				// Using NodePort service
				nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
				if err == nil && len(nodes.Items) > 0 {
					// Get the first node's external IP or internal IP if external is not available
					var nodeIP string
					for _, address := range nodes.Items[0].Status.Addresses {
						if address.Type == corev1.NodeExternalIP {
							nodeIP = address.Address
							break
						} else if address.Type == corev1.NodeInternalIP && nodeIP == "" {
							nodeIP = address.Address
						}
					}

					if nodeIP != "" {
						for _, port := range service.Spec.Ports {
							if port.Name == "ui" || port.Name == "http" || port.Port == 9003 {
								stat.UIEndpoint = fmt.Sprintf("http://%s:%d", nodeIP, port.NodePort)
							} else if port.Name == "api" || port.Port == 9002 {
								stat.APIEndpoint = fmt.Sprintf("http://%s:%d", nodeIP, port.NodePort)
							}
						}
					}
				}
			} else if service.Spec.Type == corev1.ServiceTypeLoadBalancer {
				// Using LoadBalancer service
				if len(service.Status.LoadBalancer.Ingress) > 0 {
					lbHost := service.Status.LoadBalancer.Ingress[0].IP
					if lbHost == "" {
						lbHost = service.Status.LoadBalancer.Ingress[0].Hostname
					}

					if lbHost != "" {
						for _, port := range service.Spec.Ports {
							if port.Name == "ui" || port.Name == "http" || port.Port == 9003 {
								stat.UIEndpoint = fmt.Sprintf("http://%s:%d", lbHost, port.Port)
							} else if port.Name == "api" || port.Port == 9002 {
								stat.APIEndpoint = fmt.Sprintf("http://%s:%d", lbHost, port.Port)
							}
						}
					}
				}
			} else {
				// Using ClusterIP service (internal only)
				svcHost := fmt.Sprintf("%s.%s.svc.cluster.local", service.Name, service.Namespace)
				for _, port := range service.Spec.Ports {
					if port.Name == "ui" || port.Name == "http" || port.Port == 9003 {
						stat.UIEndpoint = fmt.Sprintf("http://%s:%d", svcHost, port.Port)
					} else if port.Name == "api" || port.Port == 9002 {
						stat.APIEndpoint = fmt.Sprintf("http://%s:%d", svcHost, port.Port)
					}
				}
			}
		}
	}

	return stat, nil
}

// findPrometheusService tries to find a Prometheus service in the cluster
func (c *Controller) findPrometheusService(ctx context.Context) (string, error) {
	// Common namespaces where Prometheus might be installed
	namespaces := []string{"monitoring", "prometheus", "kube-prometheus-stack", "observability"}

	// Try with the default namespace list first
	for _, ns := range namespaces {
		// Try common service names
		for _, svcName := range []string{"prometheus-server", "prometheus", "prometheus-operated"} {
			svc, err := c.clientset.CoreV1().Services(ns).Get(ctx, svcName, metav1.GetOptions{})
			if err == nil {
				return fmt.Sprintf("http://%s.%s.svc.cluster.local:%d", svc.Name, svc.Namespace, svc.Spec.Ports[0].Port), nil
			}
		}
	}

	// If not found in common namespaces, list all namespaces and check
	nsList, err := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list namespaces: %v", err)
	}

	for _, ns := range nsList.Items {
		// List services in this namespace and look for Prometheus
		services, err := c.clientset.CoreV1().Services(ns.Name).List(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}

		for _, svc := range services.Items {
			// Check if service name contains "prometheus"
			name := svc.GetName()
			if len(name) >= 10 && (name[:10] == "prometheus" || name == "kube-prometheus-stack-prometheus") {
				return fmt.Sprintf("http://%s.%s.svc.cluster.local:%d", svc.Name, svc.Namespace, svc.Spec.Ports[0].Port), nil
			}
		}
	}

	return "", fmt.Errorf("prometheus service not found")
}

// isOpenCostInstalledViaHelm checks if OpenCost is installed via Helm
func (c *Controller) isOpenCostInstalledViaHelm(releaseName, namespace string) (bool, string, *time.Time, error) {
	releases, err := c.helm.ListDeployedReleases()
	if err != nil {
		return false, "", nil, fmt.Errorf("failed to list helm releases: %v", err)
	}

	for _, release := range releases {
		if release.Name == releaseName && release.Namespace == namespace {
			t := release.Info.LastDeployed.Time
			return true, "helm", &t, nil
		}
	}

	return false, "", nil, nil
}

// createValuesYaml converts a map to YAML format for Helm
func createValuesYaml(values map[string]interface{}) (string, error) {
	// For simple values, convert directly to YAML
	yamlData, err := yaml.Marshal(values)
	if err != nil {
		return "", fmt.Errorf("failed to marshal values to YAML: %v", err)
	}

	return string(yamlData), nil
}

// Helper function to get environment variables with defaults
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
