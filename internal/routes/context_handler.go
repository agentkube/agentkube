package routes

import (
	"fmt"
	"sort"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
)

// SimplifiedContext is a minimal representation of a kubeconfig context
type SimplifiedContext struct {
	Name        string                 `json:"name"`
	Server      string                 `json:"server"`
	AuthType    string                 `json:"auth_type"`
	KubeContext map[string]string      `json:"kubeContext"`
	MetaData    map[string]interface{} `json:"meta_data"`
}

// HandleGetContexts handles the GET /contexts endpoint
func HandleGetContexts(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		contexts, err := kubeConfigStore.GetContexts()
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		// Log context details for debugging
		logger.Log(logger.LevelInfo, map[string]string{"totalContexts": fmt.Sprintf("%d", len(contexts))}, nil, "HandleGetContexts called")
		for _, ctx := range contexts {
			sourceStr := "unknown"
			switch ctx.Source {
			case kubeconfig.KubeConfig:
				sourceStr = "kubeconfig"
			case kubeconfig.DynamicCluster:
				sourceStr = "dynamic_cluster" 
			case kubeconfig.InCluster:
				sourceStr = "incluster"
			}
			logger.Log(logger.LevelInfo, map[string]string{"contextName": ctx.Name, "source": sourceStr}, nil, "Context in store")
		}

		simplifiedContexts := make([]SimplifiedContext, 0, len(contexts))

		// Sort contexts by name for consistent ordering
		sort.Slice(contexts, func(i, j int) bool {
			return contexts[i].Name < contexts[j].Name
		})

		for _, ctx := range contexts {
			var authType string
			if ctx.AuthInfo != nil && ctx.AuthInfo.AuthProvider != nil {
				authType = "token"
			}

			// Get source as string
			source := "unknown"
			switch ctx.Source {
			case kubeconfig.KubeConfig:
				source = "kubeconfig"
			case kubeconfig.DynamicCluster:
				source = "dynamic_cluster"
			case kubeconfig.InCluster:
				source = "incluster"
			}

			// Get namespace (if set)
			namespace := ""
			if ctx.KubeContext != nil {
				namespace = ctx.KubeContext.Namespace
			}

			kubeContextInfo := map[string]string{
				"cluster": ctx.KubeContext.Cluster,
				"user":    ctx.KubeContext.AuthInfo,
			}

			simplifiedCtx := SimplifiedContext{
				Name:        ctx.Name,
				Server:      ctx.Cluster.Server,
				AuthType:    authType,
				KubeContext: kubeContextInfo,
				MetaData: map[string]interface{}{
					"extensions": map[string]interface{}{},
					"namespace":  namespace,
					"source":     source,
				},
			}

			simplifiedContexts = append(simplifiedContexts, simplifiedCtx)
		}

		c.JSON(200, simplifiedContexts)
	}
}

// HandleGetContextByName handles the GET /contexts/:name endpoint
func HandleGetContextByName(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("name")
		ctx, err := kubeConfigStore.GetContext(name)
		if err != nil {
			c.JSON(404, gin.H{"error": "Context not found"})
			return
		}

		var authType string
		if ctx.AuthInfo != nil && ctx.AuthInfo.AuthProvider != nil {
			authType = "token"
		}

		// Get source as string
		source := "unknown"
		switch ctx.Source {
		case kubeconfig.KubeConfig:
			source = "kubeconfig"
		case kubeconfig.DynamicCluster:
			source = "dynamic_cluster"
		case kubeconfig.InCluster:
			source = "incluster"
		}

		// Get namespace (if set)
		namespace := ""
		if ctx.KubeContext != nil {
			namespace = ctx.KubeContext.Namespace
		}

		// Create kubeContext info
		kubeContextInfo := map[string]string{
			"cluster": ctx.KubeContext.Cluster,
			"user":    ctx.KubeContext.AuthInfo,
		}

		// Create simplified context
		simplifiedCtx := SimplifiedContext{
			Name:        ctx.Name,
			Server:      ctx.Cluster.Server,
			AuthType:    authType,
			KubeContext: kubeContextInfo,
			MetaData: map[string]interface{}{
				"extensions": map[string]interface{}{},
				"namespace":  namespace,
				"source":     source,
			},
		}

		c.JSON(200, simplifiedCtx)
	}
}
