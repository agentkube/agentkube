package routes

import (
	"github.com/agentkube/operator/internal/handlers"
	"github.com/agentkube/operator/pkg/config"

	"github.com/gin-gonic/gin"
)

// SetupRouter configures the Gin router with all routes
func SetupRouter(cfg config.Config) *gin.Engine {
	// Create default gin router with Logger and Recovery middleware
	router := gin.Default()

	// Define routes
	// HTTP routes
	router.GET("/", handlers.HomeHandler)
	router.GET("/ping", handlers.PingHandler)

	// WebSocket route
	router.GET("/ws", handlers.WebSocketHandler)

	// You can define groups of routes
	api := router.Group("/api")
	{
		// API v1 routes
		v1 := api.Group("/v1")
		{
			v1.GET("/status", func(c *gin.Context) {
				c.JSON(200, gin.H{
					"status": "running",
					"port":   cfg.Port,
				})
			})

			// Add more API routes here
		}
	}

	return router
}
