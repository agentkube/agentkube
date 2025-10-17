package routes

import (
	"github.com/agentkube/operator/internal/handlers"
	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/portforward"
	"github.com/agentkube/operator/pkg/utils"
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
	// Initialize Vulnerability handler
	vulHandler := handlers.NewVulnerabilityHandler(kubeConfigStore)
	// Initialize Lookup handler
	lookupHandler := handlers.NewLookupHandler(kubeConfigStore)
	// Initialize Workspace handler
	workspaceHandler := handlers.NewWorkspaceHandler()
	
	// Initialize Queue for async operations
	queueConfig := utils.QueueConfig{
		Workers:    3,
		MaxRetries: 3,
	}
	operationQueue := utils.NewQueue(queueConfig)
	
	// Initialize Metrics Server handler
	metricsServerHandler := handlers.NewMetricsServerHandler(kubeConfigStore, operationQueue)

	// Create default gin router with Logger and Recovery middleware
	router := gin.Default()

	// Define routes
	// HTTP routes
	router.GET("/", handlers.HomeHandler)
	router.GET("/ping", handlers.PingHandler)

	// WebSocket routes
	router.GET("/ws", handlers.WebSocketHandler)

	// WebSocket multiplexer for advanced cluster operations
	router.GET("/wsMultiplexer", handlers.WebSocketHandler)

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

			kubeconfigGroup := v1.Group("/kubeconfig")
			{
				// Upload kubeconfig file (multipart form)
				kubeconfigGroup.POST("/upload-file", handlers.UploadKubeconfigFileHandler(kubeConfigStore))
				// Upload kubeconfig content (JSON/form)
				kubeconfigGroup.POST("/upload-content", handlers.UploadKubeconfigContentHandler(kubeConfigStore))
				// List uploaded contexts
				kubeconfigGroup.GET("/uploaded-contexts", handlers.ListUploadedContextsHandler(kubeConfigStore))
				// Delete context (system or imported)
				kubeconfigGroup.DELETE("/contexts/:name", handlers.DeleteContextHandler(kubeConfigStore))
				// Rename context (system or imported)
				kubeconfigGroup.PATCH("/contexts/:name", handlers.RenameContextHandler(kubeConfigStore))

				// Validate and add kubeconfig path
				kubeconfigGroup.POST("/validate-path", handlers.AddKubeconfigPathHandler(kubeConfigStore))
				// Validate and scan folder for kubeconfigs
				kubeconfigGroup.POST("/validate-folder", handlers.AddKubeconfigFolderHandler(kubeConfigStore))
			}

			// Popeye endpoints
			v1.GET("/popeye/status", handlers.PopeyeStatusHandler(kubeConfigStore))
			// Cluster report endpoint using Popeye
			v1.GET("/cluster/:clusterName/report", handlers.ClusterReportHandler(kubeConfigStore))

			// Kubernetes contexts endpoint
			v1.GET("/contexts", HandleGetContexts(kubeConfigStore))
			// Add an endpoint to get a specific context
			v1.GET("/contexts/:name", HandleGetContextByName(kubeConfigStore))
			// Parse kubeconfig endpoint
			v1.POST("/parse-kubeconfig", handlers.ParseKubeConfigHandler)

			// Cluster API proxy routes - handles both HTTP and WebSocket
			v1.Any("/clusters/:clusterName/*path", handlers.ProxyHandler)

			// Direct WebSocket routes for cluster streaming APIs
			v1.GET("/socket/clusters/:clusterName/ws", handlers.WebSocketHandler)
			v1.GET("/socket/clusters/:clusterName/watch", handlers.WebSocketHandler)

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

				// Metrics Server endpoints
				metricsServerGroup := metricsGroup.Group("/server")
				{
					metricsServerGroup.GET("/status", metricsServerHandler.GetMetricsServerStatus)
					metricsServerGroup.POST("/install", metricsServerHandler.InstallMetricsServer)
					metricsServerGroup.POST("/uninstall", metricsServerHandler.UninstallMetricsServer)
				}

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

			// Watcher configuration routes
			watcherGroup := v1.Group("/watcher")
			{
				// Get current watcher configuration
				watcherGroup.GET("/config", handlers.GetWatcherConfigHandler())
				// Patch watcher configuration
				watcherGroup.PATCH("/config", handlers.PatchWatcherConfigHandler())
			}

			// Vulnerability scanning routes
			vulGroup := v1.Group("/vulnerability")
			{
				// General vulnerability scanner endpoints
				vulGroup.GET("/status", vulHandler.GetScannerStatus)
				vulGroup.POST("/scan", vulHandler.ScanImages)
				vulGroup.GET("/results", vulHandler.GetImageScanResults)
				vulGroup.GET("/scans", vulHandler.ListAllScanResults)
			}

			// Cluster-specific vulnerability scanning routes
			v1.GET("/cluster/:clusterName/images", vulHandler.GetClusterImages)
			v1.POST("/cluster/:clusterName/vulnerability/scan", vulHandler.TriggerClusterImageScan)
			v1.POST("/cluster/:clusterName/vulnerability/workloads", vulHandler.GetWorkloadsByImage)
			
			// Operation status endpoints
			v1.GET("/operations/:operationId", metricsServerHandler.GetOperationStatus)

			// Tool lookup endpoints
			lookupGroup := v1.Group("/lookup")
			{
				// Get supported tools
				lookupGroup.GET("/tools", lookupHandler.GetSupportedTools)
				// Find tool in specific cluster
				lookupGroup.GET("/cluster/:clusterName/tool/:toolName", lookupHandler.FindToolInCluster)
				// Find tools in specific cluster
				lookupGroup.POST("/cluster/:clusterName/tools", lookupHandler.FindToolsInCluster)
			}

			// Workspace management endpoints
			v1.GET("/workspaces", workspaceHandler.ListWorkspaces)
			v1.POST("/workspaces", workspaceHandler.CreateWorkspace)
			v1.GET("/workspaces/:name", workspaceHandler.GetWorkspace)
			v1.PATCH("/workspaces/:name", workspaceHandler.UpdateWorkspace)
			v1.DELETE("/workspaces/:name", workspaceHandler.DeleteWorkspace)

			// Cluster operations within workspace
			v1.POST("/workspaces/:name/clusters", workspaceHandler.AddClusterToWorkspace)
			v1.DELETE("/workspaces/:name/clusters/:clusterName", workspaceHandler.RemoveClusterFromWorkspace)
		}

	}

	return router
}
