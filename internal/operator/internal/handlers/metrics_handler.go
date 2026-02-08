package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sync"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/metrics"
	"github.com/agentkube/operator/pkg/opencost"
	"github.com/agentkube/operator/pkg/prometheus"
	"github.com/gin-gonic/gin"
	"k8s.io/client-go/rest"
)

// GetMetricsSourcesHandler returns available metrics sources in the cluster
func GetMetricsSourcesHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Prometheus controller
	prometheusController, err := prometheus.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Prometheus controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Prometheus controller: %v", err),
		})
		return
	}

	// Get metrics sources
	sources, err := prometheusController.DetectMetricsSources(c.Request.Context())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "detecting metrics sources")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to detect metrics sources: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"sources": sources,
		"cluster": clusterName,
	})
}

// GetPrometheusStatusHandler returns status of Prometheus in the cluster
func GetPrometheusStatusHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Prometheus controller
	prometheusController, err := prometheus.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Prometheus controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Prometheus controller: %v", err),
		})
		return
	}

	// Get Prometheus status
	status, err := prometheusController.GetPrometheusStatus(c.Request.Context())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting Prometheus status")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get Prometheus status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"cluster": clusterName,
	})
}

// InstallPrometheusHandler handles Prometheus installation
func InstallPrometheusHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Parse request body for installation options
	var request struct {
		Namespace string                 `json:"namespace"`
		Values    map[string]interface{} `json:"values"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid request body: %v", err),
		})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Prometheus controller
	prometheusController, err := prometheus.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Prometheus controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Prometheus controller: %v", err),
		})
		return
	}

	// Install Prometheus
	if err := prometheusController.InstallPrometheus(c.Request.Context(), request.Namespace, request.Values); err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "installing Prometheus")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to install Prometheus: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Prometheus installation started successfully",
		"cluster": clusterName,
	})
}

// UninstallPrometheusHandler handles Prometheus uninstallation
func UninstallPrometheusHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get namespace from query
	namespace := c.Query("namespace")

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Prometheus controller
	prometheusController, err := prometheus.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Prometheus controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Prometheus controller: %v", err),
		})
		return
	}

	// Uninstall Prometheus
	if err := prometheusController.UninstallPrometheus(c.Request.Context(), namespace); err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "uninstalling Prometheus")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to uninstall Prometheus: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Prometheus uninstalled successfully",
		"cluster": clusterName,
	})
}

// GetOpenCostStatusHandler returns status of OpenCost in the cluster
func GetOpenCostStatusHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create OpenCost controller
	openCostController, err := opencost.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating OpenCost controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create OpenCost controller: %v", err),
		})
		return
	}

	// Get OpenCost status
	status, err := openCostController.GetOpenCostStatus(c.Request.Context())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting OpenCost status")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get OpenCost status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"cluster": clusterName,
	})
}

// InstallOpenCostHandler handles OpenCost installation
func InstallOpenCostHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Parse request body for installation options
	var request struct {
		Namespace string                 `json:"namespace"`
		Values    map[string]interface{} `json:"values"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid request body: %v", err),
		})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create OpenCost controller
	openCostController, err := opencost.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating OpenCost controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create OpenCost controller: %v", err),
		})
		return
	}

	// Install OpenCost
	if err := openCostController.InstallOpenCost(c.Request.Context(), request.Namespace, request.Values); err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "installing OpenCost")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to install OpenCost: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "OpenCost installation started successfully",
		"cluster": clusterName,
	})
}

// UninstallOpenCostHandler handles OpenCost uninstallation
func UninstallOpenCostHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get namespace from query
	namespace := c.Query("namespace")

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create OpenCost controller
	openCostController, err := opencost.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating OpenCost controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create OpenCost controller: %v", err),
		})
		return
	}

	// Uninstall OpenCost
	if err := openCostController.UninstallOpenCost(c.Request.Context(), namespace); err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "uninstalling OpenCost")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to uninstall OpenCost: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "OpenCost uninstalled successfully",
		"cluster": clusterName,
	})
}

func GetPodMetricsHandler(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get namespace and pod name from path
	namespace := c.Param("namespace")
	podName := c.Param("podName")
	if namespace == "" || podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Namespace and pod name are required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"clusterName": clusterName,
			"namespace":   namespace,
			"podName":     podName,
		}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"clusterName": clusterName,
			"namespace":   namespace,
			"podName":     podName,
		}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Get metrics controller from cache or create a new one
	metricsController, err := getOrCreateMetricsController(clusterName, restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"clusterName": clusterName,
			"namespace":   namespace,
			"podName":     podName,
		}, err, "creating metrics controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create metrics controller: %v", err),
		})
		return
	}

	// Get metrics for the pod
	metrics, err := metricsController.GetPodMetrics(c.Request.Context(), namespace, podName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"clusterName": clusterName,
			"namespace":   namespace,
			"podName":     podName,
		}, err, "getting pod metrics")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get pod metrics: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, metrics)
}

// ---------------------------------
// metrics controllers cache
// ---------------------------------
var (
	metricsControllers     = make(map[string]*metrics.MetricsController)
	metricsControllersLock sync.RWMutex
)

// getOrCreateMetricsController gets or creates a metrics controller for a cluster
func getOrCreateMetricsController(clusterName string, restConfig *rest.Config) (*metrics.MetricsController, error) {
	// Check if controller exists in cache
	metricsControllersLock.RLock()
	controller, exists := metricsControllers[clusterName]
	metricsControllersLock.RUnlock()

	if exists {
		return controller, nil
	}

	// Create new controller
	options := &metrics.MetricsOptions{
		MaxHistoryPoints:     120, // 2 hours at 1 sample per minute
		UpdateInterval:       60,  // 1 minute
		MetricsValidDuration: 90,  // 1.5 minutes
	}

	controller, err := metrics.NewMetricsController(restConfig, options)
	if err != nil {
		return nil, fmt.Errorf("failed to create metrics controller: %v", err)
	}

	// Start cache cleanup in background
	controller.StartCacheCleanup(context.Background())

	// Cache the controller
	metricsControllersLock.Lock()
	metricsControllers[clusterName] = controller
	metricsControllersLock.Unlock()

	return controller, nil
}
