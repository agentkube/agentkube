package metrics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/prometheus"
	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

// MetricsSource represents a source of metrics
type MetricsSource string

const (
	// MetricsServerSource indicates metrics from the Kubernetes Metrics Server
	MetricsServerSource MetricsSource = "metrics-server"
	// PrometheusSource indicates metrics from Prometheus
	PrometheusSource MetricsSource = "prometheus"
	// UnknownSource indicates an unknown source
	UnknownSource MetricsSource = "unknown"
)

// PodMetrics represents metrics for a pod
type PodMetrics struct {
	// Metadata about the pod
	PodName      string    `json:"podName"`
	Namespace    string    `json:"namespace"`
	Source       string    `json:"source"`
	Timestamp    time.Time `json:"timestamp"`
	LastUpdated  time.Time `json:"lastUpdated"`
	RefreshError string    `json:"refreshError,omitempty"`

	// Resource usage
	CPU    CPUMetrics    `json:"cpu"`
	Memory MemoryMetrics `json:"memory"`

	// Container-specific metrics
	Containers []ContainerMetrics `json:"containers"`

	// Historical data
	History []HistoricalMetrics `json:"history,omitempty"`
}

// CPUMetrics contains CPU usage information
type CPUMetrics struct {
	CurrentUsage     string  `json:"currentUsage"`
	CurrentUsageCore float64 `json:"currentUsageCore"`
	RequestedCPU     string  `json:"requestedCPU,omitempty"`
	LimitCPU         string  `json:"limitCPU,omitempty"`
	UsagePercentage  float64 `json:"usagePercentage,omitempty"`
}

// MemoryMetrics contains memory usage information
type MemoryMetrics struct {
	CurrentUsage       string  `json:"currentUsage"`
	CurrentUsageBytes  int64   `json:"currentUsageBytes"`
	RequestedMemory    string  `json:"requestedMemory,omitempty"`
	LimitMemory        string  `json:"limitMemory,omitempty"`
	UsagePercentage    float64 `json:"usagePercentage,omitempty"`
	CurrentUsageMiB    float64 `json:"currentUsageMiB"`
	RequestedMemoryMiB float64 `json:"requestedMemoryMiB,omitempty"`
	LimitMemoryMiB     float64 `json:"limitMemoryMiB,omitempty"`
}

// ContainerMetrics contains metrics for a container
type ContainerMetrics struct {
	Name   string        `json:"name"`
	CPU    CPUMetrics    `json:"cpu"`
	Memory MemoryMetrics `json:"memory"`
}

// HistoricalMetrics contains a single point of historical metrics data
type HistoricalMetrics struct {
	Timestamp time.Time `json:"timestamp"`
	CPU       float64   `json:"cpu"`
	Memory    float64   `json:"memory"`
}

// NetworkMetrics contains network usage information
type NetworkMetrics struct {
	RxBytes int64 `json:"rxBytes"`
	TxBytes int64 `json:"txBytes"`
}

// MetricsController is responsible for fetching metrics from various sources
type MetricsController struct {
	restConfig *rest.Config
	clientset  *kubernetes.Clientset
	promClient *prometheus.Controller
	metrics    map[string]*PodMetrics
	mu         sync.RWMutex
	// Maximum history points to keep per pod
	maxHistoryPoints int
	// Update interval for metrics in seconds
	updateInterval int
	// Maximum time to consider metrics valid in seconds
	metricsValidDuration int
}

// MetricsOptions contains configuration options for the metrics controller
type MetricsOptions struct {
	MaxHistoryPoints     int
	UpdateInterval       int
	MetricsValidDuration int
}

// NewMetricsController creates a new metrics controller
func NewMetricsController(config *rest.Config, options *MetricsOptions) (*MetricsController, error) {
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes clientset: %v", err)
	}

	promClient, err := prometheus.NewController(config)
	if err != nil {
		// Log but continue - we can still use metrics server
		logger.Log(logger.LevelWarn, nil, err, "creating Prometheus controller for metrics")
	}

	if options == nil {
		options = &MetricsOptions{
			MaxHistoryPoints:     120, // 2 hours at 1 sample per minute
			UpdateInterval:       60,  // 1 minute
			MetricsValidDuration: 90,  // 1.5 minutes
		}
	}

	return &MetricsController{
		restConfig:           config,
		clientset:            clientset,
		promClient:           promClient,
		metrics:              make(map[string]*PodMetrics),
		maxHistoryPoints:     options.MaxHistoryPoints,
		updateInterval:       options.UpdateInterval,
		metricsValidDuration: options.MetricsValidDuration,
	}, nil
}

// GetPodMetrics retrieves metrics for a specific pod
func (mc *MetricsController) GetPodMetrics(ctx context.Context, namespace, podName string) (*PodMetrics, error) {
	key := fmt.Sprintf("%s/%s", namespace, podName)

	// Check if we have cached metrics that are still valid
	mc.mu.RLock()
	cachedMetrics, found := mc.metrics[key]
	mc.mu.RUnlock()

	// If metrics are found and still valid, return them
	if found && time.Since(cachedMetrics.LastUpdated).Seconds() < float64(mc.metricsValidDuration) {
		return cachedMetrics, nil
	}

	// Otherwise, try to refresh the metrics
	refreshedMetrics, err := mc.refreshPodMetrics(ctx, namespace, podName)
	if err != nil {
		// If we have stale metrics, return them with the error
		if found {
			cachedMetrics.RefreshError = err.Error()
			return cachedMetrics, nil
		}
		return nil, err
	}

	return refreshedMetrics, nil
}

// refreshPodMetrics fetches fresh metrics from available sources
func (mc *MetricsController) refreshPodMetrics(ctx context.Context, namespace, podName string) (*PodMetrics, error) {
	key := fmt.Sprintf("%s/%s", namespace, podName)

	// Try metrics server first
	metrics, source, err := mc.getMetricsFromMetricsServer(ctx, namespace, podName)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "fetching metrics from metrics server")

		// Fallback to Prometheus if available
		if mc.promClient != nil {
			promMetrics, promSource, promErr := mc.getMetricsFromPrometheus(ctx, namespace, podName)
			if promErr != nil {
				logger.Log(logger.LevelWarn, nil, promErr, "fetching metrics from prometheus")
				return nil, fmt.Errorf("failed to get metrics: %v (metrics server), %v (prometheus)", err, promErr)
			}
			metrics = promMetrics
			source = promSource
		} else {
			return nil, fmt.Errorf("failed to get metrics and no fallback available: %v", err)
		}
	}

	// Get the pod to fetch resource requests and limits
	pod, err := mc.clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "getting pod details")
		// Continue with metrics but without requests/limits
	} else {
		// Enrich metrics with pod resource requests and limits
		mc.enrichWithResourceRequests(metrics, pod)
	}

	// Update timestamp
	metrics.LastUpdated = time.Now()
	metrics.Source = string(source)

	// Store metrics in cache
	mc.mu.Lock()

	// Get existing metrics if available for history
	if existingMetrics, exists := mc.metrics[key]; exists {
		// Add current metrics to history
		newHistoryPoint := HistoricalMetrics{
			Timestamp: time.Now(),
			CPU:       metrics.CPU.CurrentUsageCore,
			Memory:    metrics.Memory.CurrentUsageMiB,
		}

		// Copy existing history
		metrics.History = append(existingMetrics.History, newHistoryPoint)

		// Trim history if needed
		if len(metrics.History) > mc.maxHistoryPoints {
			metrics.History = metrics.History[len(metrics.History)-mc.maxHistoryPoints:]
		}
	} else {
		// Initialize history with current metrics
		metrics.History = []HistoricalMetrics{
			{
				Timestamp: time.Now(),
				CPU:       metrics.CPU.CurrentUsageCore,
				Memory:    metrics.Memory.CurrentUsageMiB,
			},
		}
	}

	mc.metrics[key] = metrics
	mc.mu.Unlock()

	return metrics, nil
}

// getMetricsFromMetricsServer fetches metrics from Kubernetes Metrics Server
func (mc *MetricsController) getMetricsFromMetricsServer(ctx context.Context, namespace, podName string) (*PodMetrics, MetricsSource, error) {
	// Get pod metrics from metrics API
	req := mc.clientset.RESTClient().Get().
		Resource("pods").
		Namespace(namespace).
		Name(podName).
		SubResource("proxy").
		Suffix("metrics/cadvisor")

	// Alternative: directly access metrics API
	url := fmt.Sprintf("/apis/metrics.k8s.io/v1beta1/namespaces/%s/pods/%s", namespace, podName)
	req = mc.clientset.RESTClient().Get().AbsPath(url)

	result := &v1beta1.PodMetrics{}
	err := req.Do(ctx).Into(result)
	if err != nil {
		return nil, UnknownSource, fmt.Errorf("failed to get pod metrics: %v", err)
	}

	// Process metrics
	metrics := &PodMetrics{
		PodName:     result.Name,
		Namespace:   result.Namespace,
		Timestamp:   result.Timestamp.Time,
		LastUpdated: time.Now(),
		Containers:  make([]ContainerMetrics, 0, len(result.Containers)),
	}

	// Calculate total CPU and memory usage
	var totalCPU int64
	var totalMemory int64

	for _, container := range result.Containers {
		// Parse CPU and memory usage
		cpuUsage := container.Usage.Cpu().MilliValue()
		memoryUsage := container.Usage.Memory().Value()

		// Add to totals
		totalCPU += cpuUsage
		totalMemory += memoryUsage

		// Create container metrics
		containerMetrics := ContainerMetrics{
			Name: container.Name,
			CPU: CPUMetrics{
				CurrentUsage:     container.Usage.Cpu().String(),
				CurrentUsageCore: float64(cpuUsage) / 1000.0,
			},
			Memory: MemoryMetrics{
				CurrentUsage:      container.Usage.Memory().String(),
				CurrentUsageBytes: memoryUsage,
				CurrentUsageMiB:   float64(memoryUsage) / (1024 * 1024),
			},
		}

		metrics.Containers = append(metrics.Containers, containerMetrics)
	}

	// Set total CPU and memory usage
	metrics.CPU = CPUMetrics{
		CurrentUsage:     resource.NewMilliQuantity(totalCPU, resource.DecimalSI).String(),
		CurrentUsageCore: float64(totalCPU) / 1000.0,
	}

	metrics.Memory = MemoryMetrics{
		CurrentUsage:      resource.NewQuantity(totalMemory, resource.BinarySI).String(),
		CurrentUsageBytes: totalMemory,
		CurrentUsageMiB:   float64(totalMemory) / (1024 * 1024),
	}

	return metrics, MetricsServerSource, nil
}

// getMetricsFromPrometheus fetches metrics from Prometheus if available
func (mc *MetricsController) getMetricsFromPrometheus(ctx context.Context, namespace, podName string) (*PodMetrics, MetricsSource, error) {
	if mc.promClient == nil {
		return nil, UnknownSource, fmt.Errorf("prometheus client not initialized")
	}

	// Get available metrics sources
	sources, err := mc.promClient.DetectMetricsSources(ctx)
	if err != nil {
		return nil, UnknownSource, fmt.Errorf("failed to detect metrics sources: %v", err)
	}

	// Find Prometheus endpoint
	var prometheusEndpoint string
	for _, source := range sources {
		if source.Type == "Prometheus" && source.Status == "available" {
			prometheusEndpoint = source.Endpoint
			break
		}
	}

	if prometheusEndpoint == "" {
		return nil, UnknownSource, fmt.Errorf("no available Prometheus endpoint found")
	}

	// Create metrics object
	metrics := &PodMetrics{
		PodName:     podName,
		Namespace:   namespace,
		Timestamp:   time.Now(),
		LastUpdated: time.Now(),
		Containers:  []ContainerMetrics{},
	}

	// Query Prometheus for pod CPU usage
	cpuQuery := fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace="%s", pod="%s", container!="POD", container!=""}[5m]))`, namespace, podName)
	cpuValue, err := mc.queryPrometheus(ctx, prometheusEndpoint, cpuQuery)
	if err != nil {
		return nil, UnknownSource, fmt.Errorf("failed to query pod CPU usage: %v", err)
	}

	// Query Prometheus for pod memory usage
	memoryQuery := fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace="%s", pod="%s", container!="POD", container!=""})/1024/1024`, namespace, podName)
	memoryValue, err := mc.queryPrometheus(ctx, prometheusEndpoint, memoryQuery)
	if err != nil {
		return nil, UnknownSource, fmt.Errorf("failed to query pod memory usage: %v", err)
	}

	// Get container metrics if available
	containerNames, err := mc.getContainerNames(ctx, namespace, podName)
	if err == nil {
		for _, containerName := range containerNames {
			containerCPUQuery := fmt.Sprintf(`rate(container_cpu_usage_seconds_total{namespace="%s", pod="%s", container="%s"}[5m])`,
				namespace, podName, containerName)
			containerCPUValue, err := mc.queryPrometheus(ctx, prometheusEndpoint, containerCPUQuery)

			containerMemoryQuery := fmt.Sprintf(`container_memory_working_set_bytes{namespace="%s", pod="%s", container="%s"}/1024/1024`,
				namespace, podName, containerName)
			containerMemoryValue, err2 := mc.queryPrometheus(ctx, prometheusEndpoint, containerMemoryQuery)

			if err == nil && err2 == nil {
				containerMetrics := ContainerMetrics{
					Name: containerName,
					CPU: CPUMetrics{
						CurrentUsageCore: containerCPUValue,
						CurrentUsage:     fmt.Sprintf("%vm", containerCPUValue*1000),
					},
					Memory: MemoryMetrics{
						CurrentUsageMiB:   containerMemoryValue,
						CurrentUsageBytes: int64(containerMemoryValue * 1024 * 1024),
						CurrentUsage:      fmt.Sprintf("%vMi", containerMemoryValue),
					},
				}
				metrics.Containers = append(metrics.Containers, containerMetrics)
			}
		}
	}

	// Set total metrics
	metrics.CPU = CPUMetrics{
		CurrentUsageCore: cpuValue,
		CurrentUsage:     fmt.Sprintf("%vm", cpuValue*1000),
	}

	metrics.Memory = MemoryMetrics{
		CurrentUsageMiB:   memoryValue,
		CurrentUsageBytes: int64(memoryValue * 1024 * 1024),
		CurrentUsage:      fmt.Sprintf("%vMi", memoryValue),
	}

	return metrics, PrometheusSource, nil
}

// getContainerNames gets the container names for a pod
func (mc *MetricsController) getContainerNames(ctx context.Context, namespace, podName string) ([]string, error) {
	pod, err := mc.clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	containerNames := make([]string, 0, len(pod.Spec.Containers))
	for _, container := range pod.Spec.Containers {
		containerNames = append(containerNames, container.Name)
	}

	return containerNames, nil
}

// queryPrometheus sends a query to Prometheus and returns the result
func (mc *MetricsController) queryPrometheus(ctx context.Context, endpoint, query string) (float64, error) {
	// Sanitize endpoint and build query URL
	if !strings.HasPrefix(endpoint, "http") {
		endpoint = "http://" + endpoint
	}

	url := fmt.Sprintf("%s/api/v1/query?query=%s", endpoint, query)

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to create request: %v", err)
	}

	// Send request
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %v", err)
	}

	// Parse response JSON
	var result struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Value []interface{} `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("failed to parse response: %v", err)
	}

	// Check if we have a result
	if result.Status != "success" || len(result.Data.Result) == 0 {
		return 0, fmt.Errorf("no data returned for query")
	}

	// Extract the metric value
	valueArray := result.Data.Result[0].Value
	if len(valueArray) < 2 {
		return 0, fmt.Errorf("invalid metric value format")
	}

	// Convert value to float64
	valueStr, ok := valueArray[1].(string)
	if !ok {
		return 0, fmt.Errorf("invalid metric value type")
	}

	value, err := parseFloat(valueStr)
	if err != nil {
		return 0, fmt.Errorf("failed to parse metric value: %v", err)
	}

	return value, nil
}

// enrichWithResourceRequests adds resource requests and limits to metrics
func (mc *MetricsController) enrichWithResourceRequests(metrics *PodMetrics, pod *v1.Pod) {
	// Calculate totals
	var totalCPURequest int64
	var totalCPULimit int64
	var totalMemoryRequest int64
	var totalMemoryLimit int64

	// Track which containers we've processed
	processedContainers := make(map[string]bool)

	// Process each container
	for _, container := range pod.Spec.Containers {
		// Get resource requests
		cpuRequest := container.Resources.Requests.Cpu()
		memoryRequest := container.Resources.Requests.Memory()
		cpuLimit := container.Resources.Limits.Cpu()
		memoryLimit := container.Resources.Limits.Memory()

		// Add to totals
		if cpuRequest != nil {
			totalCPURequest += cpuRequest.MilliValue()
		}
		if cpuLimit != nil {
			totalCPULimit += cpuLimit.MilliValue()
		}
		if memoryRequest != nil {
			totalMemoryRequest += memoryRequest.Value()
		}
		if memoryLimit != nil {
			totalMemoryLimit += memoryLimit.Value()
		}

		// Find matching container metrics
		for j, containerMetrics := range metrics.Containers {
			if containerMetrics.Name == container.Name {
				// Update container metrics with requests and limits
				if cpuRequest != nil {
					metrics.Containers[j].CPU.RequestedCPU = cpuRequest.String()
					if metrics.Containers[j].CPU.CurrentUsageCore > 0 {
						metrics.Containers[j].CPU.UsagePercentage = (metrics.Containers[j].CPU.CurrentUsageCore * 1000 / float64(cpuRequest.MilliValue())) * 100
					}
				}

				if cpuLimit != nil {
					metrics.Containers[j].CPU.LimitCPU = cpuLimit.String()
				}

				if memoryRequest != nil {
					metrics.Containers[j].Memory.RequestedMemory = memoryRequest.String()
					metrics.Containers[j].Memory.RequestedMemoryMiB = float64(memoryRequest.Value()) / (1024 * 1024)
					if metrics.Containers[j].Memory.CurrentUsageBytes > 0 {
						metrics.Containers[j].Memory.UsagePercentage = (float64(metrics.Containers[j].Memory.CurrentUsageBytes) / float64(memoryRequest.Value())) * 100
					}
				}

				if memoryLimit != nil {
					metrics.Containers[j].Memory.LimitMemory = memoryLimit.String()
					metrics.Containers[j].Memory.LimitMemoryMiB = float64(memoryLimit.Value()) / (1024 * 1024)
				}

				processedContainers[container.Name] = true
				break
			}
		}

		// If we didn't find a matching container in metrics, add it
		if !processedContainers[container.Name] {
			containerMetrics := ContainerMetrics{
				Name: container.Name,
				CPU: CPUMetrics{
					RequestedCPU: cpuRequest.String(),
					LimitCPU:     cpuLimit.String(),
				},
				Memory: MemoryMetrics{
					RequestedMemory:    memoryRequest.String(),
					LimitMemory:        memoryLimit.String(),
					RequestedMemoryMiB: float64(memoryRequest.Value()) / (1024 * 1024),
					LimitMemoryMiB:     float64(memoryLimit.Value()) / (1024 * 1024),
				},
			}
			metrics.Containers = append(metrics.Containers, containerMetrics)
		}
	}

	// Update pod-level metrics
	if totalCPURequest > 0 {
		cpuRequest := resource.NewMilliQuantity(totalCPURequest, resource.DecimalSI)
		metrics.CPU.RequestedCPU = cpuRequest.String()

		if metrics.CPU.CurrentUsageCore > 0 {
			metrics.CPU.UsagePercentage = (metrics.CPU.CurrentUsageCore * 1000 / float64(totalCPURequest)) * 100
		}
	}

	if totalCPULimit > 0 {
		cpuLimit := resource.NewMilliQuantity(totalCPULimit, resource.DecimalSI)
		metrics.CPU.LimitCPU = cpuLimit.String()
	}

	if totalMemoryRequest > 0 {
		memoryRequest := resource.NewQuantity(totalMemoryRequest, resource.BinarySI)
		metrics.Memory.RequestedMemory = memoryRequest.String()
		metrics.Memory.RequestedMemoryMiB = float64(totalMemoryRequest) / (1024 * 1024)

		if metrics.Memory.CurrentUsageBytes > 0 {
			metrics.Memory.UsagePercentage = (float64(metrics.Memory.CurrentUsageBytes) / float64(totalMemoryRequest)) * 100
		}
	}

	if totalMemoryLimit > 0 {
		memoryLimit := resource.NewQuantity(totalMemoryLimit, resource.BinarySI)
		metrics.Memory.LimitMemory = memoryLimit.String()
		metrics.Memory.LimitMemoryMiB = float64(totalMemoryLimit) / (1024 * 1024)
	}
}

// parseFloat parses a string to float64
func parseFloat(value string) (float64, error) {
	var f float64
	if _, err := fmt.Sscanf(value, "%f", &f); err != nil {
		return 0, err
	}
	return f, nil
}

// CleanupCache removes stale entries from the metrics cache
func (mc *MetricsController) CleanupCache() {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	staleTime := time.Now().Add(-time.Duration(mc.metricsValidDuration*2) * time.Second)

	for key, metrics := range mc.metrics {
		if metrics.LastUpdated.Before(staleTime) {
			delete(mc.metrics, key)
		}
	}
}

// StartCacheCleanup starts a background goroutine to periodically clean the cache
func (mc *MetricsController) StartCacheCleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(mc.metricsValidDuration*3) * time.Second)

	go func() {
		for {
			select {
			case <-ticker.C:
				mc.CleanupCache()
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}
