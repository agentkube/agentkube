package handlers

import (
	"net/http"

	"github.com/agentkube/operator/internal/multiplexer"
	"github.com/agentkube/operator/internal/stateless"
	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
)

// WebSocketHandler is the shared multiplexer instance
var wsMultiplexer *multiplexer.Multiplexer

// ClusterManager is the shared cluster manager instance
var clusterManager *stateless.ClusterManager

// InitializeWebSocketHandler initializes the WebSocket handler with the given kubeconfig store
func InitializeWebSocketHandler(kubeConfigStore kubeconfig.ContextStore, cfg config.Config) {
	wsMultiplexer = multiplexer.NewMultiplexer(kubeConfigStore)
	clusterManager = stateless.NewClusterManager(kubeConfigStore, cfg.EnableDynamicClusters)
}

// WebSocketHandler handles WebSocket connections

func WebSocketHandler(c *gin.Context) {
	if wsMultiplexer == nil {
		logger.Log(logger.LevelError, nil, nil, "WebSocket multiplexer not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return

	}

	// Handle the WebSocket connection
	wsMultiplexer.HandleClientWebSocket(c.Writer, c.Request)

}

// PingHandler handles the ping endpoint
func PingHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "pong",
	})
}

// HomeHandler handles the root endpoint
func HomeHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "Welcome to the API server",
	})
}

// ParseKubeConfigHandler handles requests to parse kubeconfig
func ParseKubeConfigHandler(c *gin.Context) {
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	clusterManager.ParseKubeConfig(c)
}

// ProxyHandler handles proxy requests to Kubernetes API

func ProxyHandler(c *gin.Context) {
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	contextKey, err := clusterManager.GetContextKeyFromRequest(c)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting context key")
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Extract only the path part that should be forwarded to the Kubernetes API
	path := c.Param("path")

	// Log the path for debugging
	logger.Log(logger.LevelInfo, map[string]string{
		"contextKey": contextKey,
		"path":       path,
		"fullPath":   c.Request.URL.Path,
	}, nil, "proxying request")

	// Modify the request path to only include the part after /clusters/{clusterName}
	c.Request.URL.Path = path

	// Proxy the request to the Kubernetes API
	if err := context.ProxyRequest(c.Writer, c.Request); err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "proxying request")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to proxy request"})
		return
	}
}
