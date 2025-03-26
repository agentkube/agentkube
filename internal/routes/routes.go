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
	// Initialize Helm handler
	helmHandler := handlers.NewHelmHandler(kubeConfigStore, cacheSvc)

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
					"version":    "1.0.0",
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

			// Search endpoint for cluster resources
			v1.POST("/cluster/:clusterName/search", handlers.SearchResources)

			v1.POST("/cluster/:clusterName/kubectl", handlers.KubectlHandler)

			// Terminal endpoint for shell access
			v1.GET("/exec", handlers.TerminalHandler(kubeConfigStore))
			v1.GET("/shell", handlers.SystemShellHandler(kubeConfigStore))
			v1.GET("/terminal", handlers.TermHandler())

			v1.GET("/externalUrl", handlers.ExternalURLHandler())
			v1.POST("/cluster/:clusterName/externalShell", handlers.ExternalShellHandler(kubeConfigStore))

			// Start the terminal cleanup task
			handlers.StartTerminalCleanupTask()

			// Canvas endpoint
			v1.POST("/cluster/:clusterName/canvas", handlers.GetCanvasNodes)

			v1.GET("/proxy/helm-values", helmHandler.HelmValuesProxyHandler)
			v1.GET("/proxy/helm-versions", helmHandler.HelmVersionsProxyHandler)
			helmGroup := v1.Group("/cluster/:clusterName/helm")
			{
				// Repository management
				helmGroup.GET("/repositories", helmHandler.ListReposHandler)
				helmGroup.POST("/repositories", helmHandler.AddRepoHandler)
				helmGroup.PUT("/repositories", helmHandler.UpdateRepoHandler)
				helmGroup.DELETE("/repositories", helmHandler.RemoveRepoHandler)

				// Charts
				helmGroup.GET("/charts", helmHandler.ListChartsHandler)

				// Releases
				helmGroup.GET("/releases", helmHandler.ListReleasesHandler)
				helmGroup.GET("/release", helmHandler.GetReleaseHandler)
				helmGroup.GET("/release/history", helmHandler.GetReleaseHistoryHandler)
				helmGroup.POST("/release/install", helmHandler.InstallReleaseHandler)
				helmGroup.POST("/release/upgrade", helmHandler.UpgradeReleaseHandler)
				helmGroup.POST("/release/rollback", helmHandler.RollbackReleaseHandler)
				helmGroup.DELETE("/release", helmHandler.UninstallReleaseHandler)
				helmGroup.GET("/release/status", helmHandler.GetActionStatusHandler)
			}

			metricsGroup := v1.Group("/cluster/:clusterName/metrics")
			{
				// Get available metrics sources
				metricsGroup.GET("/sources", handlers.GetMetricsSourcesHandler)
				// Get pod metrics
				metricsGroup.GET("/pods/:namespace/:podName", handlers.GetPodMetricsHandler)

				// Prometheus endpoints
				prometheusGroup := metricsGroup.Group("/prometheus")
				{
					prometheusGroup.GET("/status", handlers.GetPrometheusStatusHandler)
					prometheusGroup.POST("/install", handlers.InstallPrometheusHandler)
					prometheusGroup.POST("/uninstall", handlers.UninstallPrometheusHandler)
				}

				// OpenCost endpoints
				openCostGroup := metricsGroup.Group("/opencost")
				{
					openCostGroup.GET("/status", handlers.GetOpenCostStatusHandler)
					openCostGroup.POST("/install", handlers.InstallOpenCostHandler)
					openCostGroup.POST("/uninstall", handlers.UninstallOpenCostHandler)
				}
			}

			// Trivy security scanning routes
			trivyGroup := v1.Group("/cluster/:clusterName/trivy")
			{
				// Installation and status
				trivyGroup.POST("/install", handlers.InstallTrivyOperator)
				trivyGroup.POST("/uninstall", handlers.UninstallTrivyOperator)
				trivyGroup.GET("/status", handlers.GetTrivyStatus)

				// Reports
				trivyGroup.GET("/vulnerabilities", handlers.GetVulnerabilityReports)
				trivyGroup.GET("/compliance", handlers.GetClusterComplianceReports)
				trivyGroup.GET("/compliance/:reportName", handlers.GetComplianceDetails)
				trivyGroup.GET("/config-audit", handlers.GetConfigAuditReports)
			}

			// Port forward routes
			portforwardGroup := v1.Group("/portforward")
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
				portforwardGroup.GET("/:id", func(c *gin.Context) {
					portforward.GetPortForwardByID(cacheSvc, c.Writer, c.Request)
				})
			}
		}

	}

	return router
}
