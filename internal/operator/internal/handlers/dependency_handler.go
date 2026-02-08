package handlers

import (
	"fmt"
	"net/http"

	"github.com/agentkube/operator/pkg/canvas"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
)

// GetDependencyGraph handles requests to retrieve deep dependency graph for workloads
// This endpoint provides an extreme deep analysis of all dependencies for a given workload
// including compute, configuration, storage, network, RBAC, scheduling, and custom resources
func GetDependencyGraph(c *gin.Context) {
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

	// Parse resource identification from request body
	var resource canvas.ResourceIdentifier
	if err := c.ShouldBindJSON(&resource); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	// Validate resource type is a supported workload
	supportedWorkloads := map[string]bool{
		"pods":                   true,
		"deployments":            true,
		"statefulsets":           true,
		"daemonsets":             true,
		"replicasets":            true,
		"replicationcontrollers": true,
		"jobs":                   true,
		"cronjobs":               true,
	}

	if !supportedWorkloads[resource.ResourceType] {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("unsupported workload type: %s. Supported types: pods, deployments, statefulsets, daemonsets, replicasets, replicationcontrollers, jobs, cronjobs", resource.ResourceType),
		})
		return
	}

	// Handle 'core' group as empty string to match k8s API expectations
	if resource.Group == "core" {
		resource.Group = ""
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

	// Create canvas controller
	canvasController, err := canvas.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating canvas controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create canvas controller: %v", err),
		})
		return
	}

	// Get deep dependency graph
	response, err := canvasController.GetDeepDependencyGraph(c.Request.Context(), resource)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"clusterName":  clusterName,
			"namespace":    resource.Namespace,
			"resourceType": resource.ResourceType,
			"resourceName": resource.ResourceName,
		}, err, "getting dependency graph")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get dependency graph: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}
