package routes

import (
	"github.com/agentkube/operator/internal/handlers"
	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/portforward"
	"github.com/gin-gonic/gin"
)

// SetupRouter configures the Gin router with all routes
func SetupRouter(cfg config.Config, kubeConfigStore kubeconfig.ContextStore, cacheSvc cache.Cache[interface{}]) *gin.Engine {
	// Set gin mode based on config
	if !cfg.DevMode {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize WebSocket handler
	handlers.InitializeWebSocketHandler(kubeConfigStore, cfg)

	// Create default gin router with Logger and Recovery middleware
	router := gin.Default()

	// Define routes
	// HTTP routes
	router.GET("/", handlers.HomeHandler)
	router.GET("/ping", handlers.PingHandler)

	// WebSocket route
	router.GET("/ws", handlers.WebSocketHandler)

	// Base path setup if configured
	var apiRoot *gin.RouterGroup
	if cfg.BaseURL != "" {
		apiRoot = router.Group(cfg.BaseURL)
	} else {
		apiRoot = router.Group("")
	}

	// router.Any("/clusters/:clusterName/*path", handlers.ProxyHandler)

	// API routes
	api := apiRoot.Group("/api")
	{
		// API v1 routes
		v1 := api.Group("/v1")
		{
			v1.GET("/status", func(c *gin.Context) {
				c.JSON(200, gin.H{
					"status":     "running",
					"port":       cfg.Port,
					"in_cluster": cfg.InCluster,
					"version":    "1.0.0", // You may want to make this configurable
				})
			})

			// Kubernetes contexts endpoint
			v1.GET("/contexts", HandleGetContexts(kubeConfigStore))
			// Add an endpoint to get a specific context
			v1.GET("/contexts/:name", HandleGetContextByName(kubeConfigStore))
			// Parse kubeconfig endpoint
			v1.POST("/parse-kubeconfig", handlers.ParseKubeConfigHandler)

			// Keep the original proxy route as well for API compatibility
			v1.Any("/clusters/:clusterName/*path", handlers.ProxyHandler)
		}

		// Port forward routes
		portforwardGroup := api.Group("/portforward")
		{
			// Start port forward
			portforwardGroup.POST("/start", func(c *gin.Context) {
				portforward.StartPortForward(kubeConfigStore, cacheSvc, c.Writer, c.Request)
			})

			// Stop or delete port forward
			portforwardGroup.POST("/stop", func(c *gin.Context) {
				portforward.StopOrDeletePortForward(cacheSvc, c.Writer, c.Request)
			})

			// Get all port forwards
			portforwardGroup.GET("/", func(c *gin.Context) {
				portforward.GetPortForwards(cacheSvc, c.Writer, c.Request)
			})

			// Get port forward by ID
			portforwardGroup.GET("/id", func(c *gin.Context) {
				portforward.GetPortForwardByID(cacheSvc, c.Writer, c.Request)
			})
		}
	}

	return router
}
