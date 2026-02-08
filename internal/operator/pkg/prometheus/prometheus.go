package prometheus

import (
	"context"
	"fmt"
	"os"
	"time"

	helmclient "github.com/mittwald/go-helm-client"
	"helm.sh/helm/v3/pkg/repo"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/agentkube/operator/pkg/logger"
	"gopkg.in/yaml.v3"
)

var (
	// Default configuration values for Prometheus Helm chart
	defaultPrometheusHelmRepo     = "https://prometheus-community.github.io/helm-charts"
	defaultPrometheusChartVersion = "45.0.0"
	defaultPrometheusChartName    = "kube-prometheus-stack"
	defaultPrometheusRepoName     = "prometheus-community"
	defaultPrometheusReleaseName  = "prometheus"
	defaultPrometheusNamespace    = "monitoring"
)

// PrometheusStat contains basic information about Prometheus
type PrometheusStat struct {
	Installed      bool       `json:"installed"`
	Version        string     `json:"version,omitempty"`
	Namespace      string     `json:"namespace,omitempty"`
	InstallMethod  string     `json:"installMethod,omitempty"`
	ComponentsUp   []string   `json:"componentsUp,omitempty"`
	ComponentsDown []string   `json:"componentsDown,omitempty"`
	InstallTime    *time.Time `json:"installTime,omitempty"`
}

// MetricsSource represents a source of metrics
type MetricsSource struct {
	Type     string `json:"type"`
	Endpoint string `json:"endpoint,omitempty"`
	Status   string `json:"status"` // available, unavailable
}

// Controller manages Prometheus operations
type Controller struct {
	restConfig *rest.Config
	clientset  *kubernetes.Clientset
	dynamic    dynamic.Interface
	helm       helmclient.Client
}

// NewController creates a new Prometheus controller
func NewController(restConfig *rest.Config) (*Controller, error) {
	// Create kubernetes clientset
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes clientset: %v", err)
	}

	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	// Initialize Helm client
	helmClient, err := helmclient.New(&helmclient.Options{})
	if err != nil {
		return nil, fmt.Errorf("failed to create helm client: %v", err)
	}

	return &Controller{
		restConfig: restConfig,
		clientset:  clientset,
		dynamic:    dynamicClient,
		helm:       helmClient,
	}, nil
}

// InstallPrometheus installs Prometheus using Helm
func (c *Controller) InstallPrometheus(ctx context.Context, namespace string, values map[string]interface{}) error {
	if namespace == "" {
		namespace = defaultPrometheusNamespace
	}

	// Add Helm repository
	chartRepo := repo.Entry{
		Name: getEnvOrDefault("PROMETHEUS_REPO_NAME", defaultPrometheusRepoName),
		URL:  getEnvOrDefault("PROMETHEUS_REPO_URL", defaultPrometheusHelmRepo),
	}

	if err := c.helm.AddOrUpdateChartRepo(chartRepo); err != nil {
		return fmt.Errorf("failed to add prometheus helm repo: %v", err)
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

	// Prepare chart installation
	chartSpec := helmclient.ChartSpec{
		ReleaseName:     getEnvOrDefault("PROMETHEUS_RELEASE_NAME", defaultPrometheusReleaseName),
		ChartName:       fmt.Sprintf("%s/%s", chartRepo.Name, defaultPrometheusChartName),
		Namespace:       namespace,
		Version:         getEnvOrDefault("PROMETHEUS_CHART_VERSION", defaultPrometheusChartVersion),
		UpgradeCRDs:     true,
		Wait:            true,
		Timeout:         600, // 10 minutes - Prometheus stack can take a while
		CreateNamespace: true,
	}

	// Convert values to YAML
	if values != nil {
		valuesYaml, err := yaml.Marshal(values)
		if err != nil {
			return fmt.Errorf("failed to marshal values to YAML: %v", err)
		}
		chartSpec.ValuesYaml = string(valuesYaml)
	}

	// Install/upgrade the chart
	if _, err := c.helm.InstallOrUpgradeChart(ctx, &chartSpec, nil); err != nil {
		return fmt.Errorf("failed to install/upgrade prometheus: %v", err)
	}

	return nil
}

// UninstallPrometheus removes Prometheus installation
func (c *Controller) UninstallPrometheus(ctx context.Context, namespace string) error {
	if namespace == "" {
		namespace = defaultPrometheusNamespace
	}

	releaseName := getEnvOrDefault("PROMETHEUS_RELEASE_NAME", defaultPrometheusReleaseName)

	// Check if Prometheus is installed via Helm
	installed, method, _, err := c.isPrometheusInstalledViaHelm(releaseName, namespace)
	if err != nil {
		return fmt.Errorf("failed to check prometheus installation: %v", err)
	}

	if installed && method == "helm" {
		// Uninstall Helm release
		chartSpec := helmclient.ChartSpec{
			ReleaseName: releaseName,
			Namespace:   namespace,
		}

		if err := c.helm.UninstallRelease(&chartSpec); err != nil {
			return fmt.Errorf("failed to uninstall prometheus: %v", err)
		}
	} else {
		// For non-Helm installations, we'll need to delete resources manually
		// This is a simplified approach
		deploymentGVR := schema.GroupVersionResource{
			Group:    "apps",
			Version:  "v1",
			Resource: "deployments",
		}

		serviceGVR := schema.GroupVersionResource{
			Group:    "",
			Version:  "v1",
			Resource: "services",
		}

		// Delete common Prometheus-related resources
		promResources := []string{
			"prometheus-server",
			"prometheus-alertmanager",
			"prometheus-kube-state-metrics",
			"prometheus-node-exporter",
		}

		for _, resource := range promResources {
			// Try to delete deployment
			err := c.dynamic.Resource(deploymentGVR).Namespace(namespace).Delete(ctx, resource, metav1.DeleteOptions{})
			if err != nil && !apierrors.IsNotFound(err) {
				logger.Log(logger.LevelWarn, nil, err, fmt.Sprintf("failed to delete deployment %s", resource))
			}

			// Try to delete service
			err = c.dynamic.Resource(serviceGVR).Namespace(namespace).Delete(ctx, resource, metav1.DeleteOptions{})
			if err != nil && !apierrors.IsNotFound(err) {
				logger.Log(logger.LevelWarn, nil, err, fmt.Sprintf("failed to delete service %s", resource))
			}
		}
	}

	return nil
}

// GetPrometheusStatus checks if Prometheus is installed and returns its status
func (c *Controller) GetPrometheusStatus(ctx context.Context) (*PrometheusStat, error) {
	stat := &PrometheusStat{
		Installed:      false,
		ComponentsUp:   []string{},
		ComponentsDown: []string{},
	}

	// Method 1: Check via Helm release
	releaseName := getEnvOrDefault("PROMETHEUS_RELEASE_NAME", defaultPrometheusReleaseName)
	namespace := getEnvOrDefault("PROMETHEUS_NAMESPACE", defaultPrometheusNamespace)

	installed, method, installTime, err := c.isPrometheusInstalledViaHelm(releaseName, namespace)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "checking helm installation")
	}

	if installed {
		stat.Installed = true
		stat.InstallMethod = method
		stat.Namespace = namespace
		stat.InstallTime = installTime
	}

	// Method 2: Check via Kubernetes resources
	if !stat.Installed {
		// Try to find in other namespaces
		namespaces, err := c.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return stat, fmt.Errorf("failed to list namespaces: %v", err)
		}

		for _, ns := range namespaces.Items {
			nsName := ns.Name

			// Check for Prometheus Server deployment
			deployment, err := c.clientset.AppsV1().Deployments(nsName).Get(ctx, "prometheus-server", metav1.GetOptions{})
			if err == nil && deployment != nil {
				stat.Installed = true
				stat.InstallMethod = "direct"
				stat.Namespace = nsName
				stat.InstallTime = &deployment.CreationTimestamp.Time
				break
			}

			// Check for Prometheus StatefulSets (newer versions use StatefulSets)
			statefulSetGVR := schema.GroupVersionResource{
				Group:    "apps",
				Version:  "v1",
				Resource: "statefulsets",
			}

			// Try both common naming conventions
			for _, name := range []string{"prometheus-prometheus", "prometheus"} {
				sts, err := c.dynamic.Resource(statefulSetGVR).Namespace(nsName).Get(ctx, name, metav1.GetOptions{})
				if err == nil && sts != nil {
					stat.Installed = true
					stat.InstallMethod = "direct or operator"
					stat.Namespace = nsName
					creationTime := sts.GetCreationTimestamp()
					if !creationTime.IsZero() {
						t := creationTime.Time
						stat.InstallTime = &t
					}
					break
				}
			}

			if stat.Installed {
				break
			}
		}
	}

	// If Prometheus is installed, check component status
	if stat.Installed {
		// Check status of common Prometheus components
		components := map[string]schema.GroupVersionResource{
			"prometheus-server": {
				Group:    "apps",
				Version:  "v1",
				Resource: "deployments",
			},
			"prometheus-alertmanager": {
				Group:    "apps",
				Version:  "v1",
				Resource: "deployments",
			},
			"prometheus-kube-state-metrics": {
				Group:    "apps",
				Version:  "v1",
				Resource: "deployments",
			},
			"prometheus": {
				Group:    "apps",
				Version:  "v1",
				Resource: "statefulsets",
			},
		}

		for name, gvr := range components {
			var ready bool

			if gvr.Resource == "deployments" {
				deployment, err := c.clientset.AppsV1().Deployments(stat.Namespace).Get(ctx, name, metav1.GetOptions{})
				if err == nil && deployment != nil {
					if deployment.Status.ReadyReplicas > 0 {
						stat.ComponentsUp = append(stat.ComponentsUp, name)
						ready = true
					}
				}
			} else if gvr.Resource == "statefulsets" {
				statefulSet, err := c.clientset.AppsV1().StatefulSets(stat.Namespace).Get(ctx, name, metav1.GetOptions{})
				if err == nil && statefulSet != nil {
					if statefulSet.Status.ReadyReplicas > 0 {
						stat.ComponentsUp = append(stat.ComponentsUp, name)
						ready = true
					}
				}
			}

			if !ready {
				stat.ComponentsDown = append(stat.ComponentsDown, name)
			}
		}

		// Try to get Prometheus version
		stsGVR := schema.GroupVersionResource{
			Group:    "apps",
			Version:  "v1",
			Resource: "statefulsets",
		}

		// Check for StatefulSet first (newer installations)
		for _, name := range []string{"prometheus-prometheus", "prometheus"} {
			sts, err := c.dynamic.Resource(stsGVR).Namespace(stat.Namespace).Get(ctx, name, metav1.GetOptions{})
			if err == nil {
				containers, found, _ := unstructured.NestedSlice(sts.Object, "spec", "template", "spec", "containers")
				if found && len(containers) > 0 {
					container := containers[0].(map[string]interface{})
					image, found := container["image"].(string)
					if found {
						// Extract version from image tag
						for i := len(image) - 1; i >= 0; i-- {
							if image[i] == ':' {
								stat.Version = image[i+1:]
								break
							}
						}
						break
					}
				}
			}
		}

		// If no version found, try deployment
		if stat.Version == "" {
			deployment, err := c.clientset.AppsV1().Deployments(stat.Namespace).Get(ctx, "prometheus-server", metav1.GetOptions{})
			if err == nil && len(deployment.Spec.Template.Spec.Containers) > 0 {
				image := deployment.Spec.Template.Spec.Containers[0].Image
				// Extract version from image tag
				for i := len(image) - 1; i >= 0; i-- {
					if image[i] == ':' {
						stat.Version = image[i+1:]
						break
					}
				}
			}
		}
	}

	return stat, nil
}

// DetectMetricsSources scans the cluster for available metrics sources
func (c *Controller) DetectMetricsSources(ctx context.Context) ([]MetricsSource, error) {
	sources := []MetricsSource{}

	// Check for Kubernetes Metrics Server
	metricsServerAvailable := false
	apiGroups, err := c.clientset.Discovery().ServerGroups()
	if err == nil {
		for _, group := range apiGroups.Groups {
			if group.Name == "metrics.k8s.io" {
				metricsServerAvailable = true
				break
			}
		}
	}

	if metricsServerAvailable {
		sources = append(sources, MetricsSource{
			Type:   "Kubernetes Metrics Server",
			Status: "available",
		})
	}

	// Check for Prometheus
	promStatus, err := c.GetPrometheusStatus(ctx)
	if err == nil && promStatus.Installed {
		// Try to find Prometheus service
		svc, err := c.clientset.CoreV1().Services(promStatus.Namespace).Get(ctx, "prometheus-server", metav1.GetOptions{})
		if err == nil {
			endpoint := fmt.Sprintf("http://%s.%s.svc.cluster.local:%d", svc.Name, svc.Namespace, svc.Spec.Ports[0].Port)
			sources = append(sources, MetricsSource{
				Type:     "Prometheus",
				Endpoint: endpoint,
				Status:   "available",
			})
		} else {
			// Try other common Prometheus service names
			for _, name := range []string{"prometheus", "prometheus-operated"} {
				svc, err := c.clientset.CoreV1().Services(promStatus.Namespace).Get(ctx, name, metav1.GetOptions{})
				if err == nil {
					endpoint := fmt.Sprintf("http://%s.%s.svc.cluster.local:%d", svc.Name, svc.Namespace, svc.Spec.Ports[0].Port)
					sources = append(sources, MetricsSource{
						Type:     "Prometheus",
						Endpoint: endpoint,
						Status:   "available",
					})
					break
				}
			}
		}
	}

	// If no sources were found but we know Prometheus is installed
	if len(sources) == 0 && promStatus != nil && promStatus.Installed {
		sources = append(sources, MetricsSource{
			Type:   "Prometheus",
			Status: "installed but not accessible",
		})
	}

	// Add "No metrics" option if no sources are available
	if len(sources) == 0 {
		sources = append(sources, MetricsSource{
			Type:   "No metrics",
			Status: "unavailable",
		})
	}

	return sources, nil
}

// isPrometheusInstalledViaHelm checks if Prometheus is installed via Helm
func (c *Controller) isPrometheusInstalledViaHelm(releaseName, namespace string) (bool, string, *time.Time, error) {
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

// Helper function to get environment variables with defaults
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
