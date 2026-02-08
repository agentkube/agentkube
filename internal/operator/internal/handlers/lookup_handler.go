package handlers

import (
	"net/http"
	"strings"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/lookup"
	"github.com/gin-gonic/gin"
)

type LookupHandler struct {
	toolLookup *lookup.ToolLookup
}

func NewLookupHandler(kubeConfigStore kubeconfig.ContextStore) *LookupHandler {
	return &LookupHandler{
		toolLookup: lookup.NewToolLookup(kubeConfigStore),
	}
}


func (lh *LookupHandler) FindToolInCluster(c *gin.Context) {
	clusterName := c.Param("clusterName")
	toolName := c.Param("toolName")

	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Cluster name is required",
		})
		return
	}

	if toolName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Tool name is required",
		})
		return
	}

	toolName = strings.ToLower(strings.TrimSpace(toolName))

	logger.Log(logger.LevelInfo, map[string]string{
		"toolName":    toolName,
		"clusterName": clusterName,
	}, nil, "Looking up tool in specific cluster")

	instances, err := lh.toolLookup.FindToolInCluster(clusterName, toolName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"toolName":    toolName,
			"clusterName": clusterName,
		}, err, "Failed to find tool in cluster")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to find tool in cluster: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tool":        toolName,
		"cluster":     clusterName,
		"instances":   instances,
		"count":       len(instances),
	})
}

func (lh *LookupHandler) GetSupportedTools(c *gin.Context) {
	tools := lh.toolLookup.GetSupportedTools()

	c.JSON(http.StatusOK, gin.H{
		"supportedTools": tools,
		"count":          len(tools),
	})
}


func (lh *LookupHandler) FindToolsInCluster(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Cluster name is required",
		})
		return
	}

	var request struct {
		Tools []string `json:"tools"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format: " + err.Error(),
		})
		return
	}

	if len(request.Tools) == 0 {
		request.Tools = lh.toolLookup.GetSupportedTools()
	}

	results := make(map[string]interface{})

	for _, toolName := range request.Tools {
		toolName = strings.ToLower(strings.TrimSpace(toolName))
		
		instances, err := lh.toolLookup.FindToolInCluster(clusterName, toolName)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"toolName":    toolName,
				"clusterName": clusterName,
			}, err, "Failed to find tool in cluster")
			results[toolName] = gin.H{
				"error":     "Failed to find tool: " + err.Error(),
				"instances": []lookup.ToolInstance{},
				"count":     0,
			}
		} else {
			results[toolName] = gin.H{
				"instances": instances,
				"count":     len(instances),
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"cluster": clusterName,
		"results": results,
	})
}