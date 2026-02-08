package handlers

import (
	"net/http"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/metrics"
	"github.com/agentkube/operator/pkg/utils"
	"github.com/gin-gonic/gin"
)

type MetricsServerHandler struct {
	manager *metrics.MetricsServerManager
}

func NewMetricsServerHandler(kubeConfigStore kubeconfig.ContextStore, queue *utils.Queue) *MetricsServerHandler {
	manager := metrics.NewMetricsServerManager(kubeConfigStore, queue)
	
	// Register the metrics processor
	processor := metrics.NewMetricsProcessor(manager)
	queue.RegisterProcessor("metrics-install", processor)
	queue.RegisterProcessor("metrics-uninstall", processor)
	
	return &MetricsServerHandler{
		manager: manager,
	}
}

func (h *MetricsServerHandler) InstallMetricsServer(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Cluster name is required",
		})
		return
	}

	var req metrics.InstallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request body",
			"error":   err.Error(),
		})
		return
	}

	// Validate install type
	if req.Type != "production" && req.Type != "local" {
		req.Type = "production" // Default to production
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
		"type":    req.Type,
	}, nil, "Received metrics server install request")

	operation, err := h.manager.Install(clusterName, req.Type)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "Failed to queue metrics server installation")

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to start installation",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"success":     true,
		"message":     "Metrics server installation started",
		"operationId": operation.ID,
		"data": gin.H{
			"status":  operation.Status,
			"cluster": clusterName,
			"type":    req.Type,
		},
	})
}

func (h *MetricsServerHandler) GetMetricsServerStatus(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Cluster name is required",
		})
		return
	}

	status, err := h.manager.GetStatus(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "Failed to get metrics server status")

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to get metrics server status",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Metrics server status retrieved",
		"data":    status,
	})
}

func (h *MetricsServerHandler) UninstallMetricsServer(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Cluster name is required",
		})
		return
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
	}, nil, "Received metrics server uninstall request")

	operation, err := h.manager.Uninstall(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "Failed to queue metrics server uninstallation")

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to start uninstallation",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"success":     true,
		"message":     "Metrics server uninstallation started",
		"operationId": operation.ID,
		"data": gin.H{
			"status":  operation.Status,
			"cluster": clusterName,
		},
	})
}

func (h *MetricsServerHandler) GetOperationStatus(c *gin.Context) {
	operationId := c.Param("operationId")
	if operationId == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Operation ID is required",
		})
		return
	}

	operation, exists := h.manager.GetQueue().GetOperation(operationId)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Operation not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Operation status retrieved",
		"data":    operation,
	})
}

func (h *MetricsServerHandler) GetQueue() *utils.Queue {
	return h.manager.GetQueue()
}