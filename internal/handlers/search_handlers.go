package handlers

import (
	"fmt"
	"net/http"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/search"
	"github.com/gin-gonic/gin"
)

// SearchResources handles cluster resource search requests
func SearchResources(c *gin.Context) {
	// Parse the search options from the request body
	var searchOptions search.SearchOptions
	if err := c.ShouldBindJSON(&searchOptions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid search options: %v", err),
		})
		return
	}

	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Use the existing GetContextKeyFromRequest method
	contextKey, err := clusterManager.GetContextKeyFromRequest(c)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting context key")
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	context, err := clusterManager.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create search controller
	searchController, err := search.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "creating search controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create search controller: %v", err),
		})
		return
	}

	// Perform search
	results, err := searchController.Search(c.Request.Context(), searchOptions)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "searching resources")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("search failed: %v", err),
		})
		return
	}

	clusterName := c.Param("clusterName")
	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"count":   len(results),
		"query":   searchOptions.Query,
		"cluster": clusterName,
	})
}
