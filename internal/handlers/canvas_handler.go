package handlers

import (
	"fmt"
	"net/http"

	"github.com/agentkube/operator/pkg/canvas"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
)

// GetCanvasNodes handles requests to retrieve graph representation for resources
func GetCanvasNodes(c *gin.Context) {
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

	// Check for attack-path query parameter
	attackPath := c.Query("query") == "attack-path"

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

	// Get graph nodes representation
	response, err := canvasController.GetGraphNodes(c.Request.Context(), resource, attackPath)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"clusterName":  clusterName,
			"namespace":    resource.Namespace,
			"resourceType": resource.ResourceType,
			"resourceName": resource.ResourceName,
		}, err, "getting graph nodes")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get graph nodes: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}
