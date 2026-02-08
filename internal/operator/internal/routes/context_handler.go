package routes

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
	"k8s.io/client-go/tools/clientcmd"
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

			// Generate clusterID and origin based on source
			var clusterID string
			var origin map[string]interface{}

			if ctx.Source == kubeconfig.KubeConfig {
				// For system kubeconfig contexts, use format: path+contextName
				kubeconfigPath := config.GetDefaultKubeConfigPath()
				clusterID = fmt.Sprintf("%s+%s", kubeconfigPath, ctx.Name)
				origin = map[string]interface{}{
					"kubeconfig": kubeconfigPath,
				}
			} else if ctx.Source == kubeconfig.DynamicCluster {
				// For dynamic clusters, try to find the source kubeconfig path
				clusterID = fmt.Sprintf("dynamic+%s", ctx.Name)
				// Check if this is an uploaded kubeconfig by looking for the source file
				kubeconfigPath := findDynamicClusterKubeconfigPath(ctx.Name)
				if kubeconfigPath != "" {
					origin = map[string]interface{}{
						"kubeconfig": kubeconfigPath,
					}
				} else {
					origin = map[string]interface{}{
						"dynamic": true,
					}
				}
			} else {
				// For other sources (like InCluster)
				clusterID = ctx.Name
				origin = map[string]interface{}{
					"source": ctx.SourceStr(),
				}
			}

			simplifiedCtx := SimplifiedContext{
				Name:        ctx.Name,
				Server:      ctx.Cluster.Server,
				AuthType:    authType,
				KubeContext: kubeContextInfo,
				MetaData: map[string]interface{}{
					"clusterID":    clusterID,
					"extensions":   map[string]interface{}{},
					"namespace":    namespace,
					"origin":       origin,
					"originalName": ctx.Name,
					"source":       source,
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
		// Generate clusterID and origin based on source
		var clusterID string
		var origin map[string]interface{}

		if ctx.Source == kubeconfig.KubeConfig {
			// For system kubeconfig contexts, use format: path+contextName
			kubeconfigPath := config.GetDefaultKubeConfigPath()
			clusterID = fmt.Sprintf("%s+%s", kubeconfigPath, ctx.Name)
			origin = map[string]interface{}{
				"kubeconfig": kubeconfigPath,
			}
		} else if ctx.Source == kubeconfig.DynamicCluster {
			// For dynamic clusters, try to find the source kubeconfig path
			clusterID = fmt.Sprintf("dynamic+%s", ctx.Name)
			// Check if this is an uploaded kubeconfig by looking for the source file
			kubeconfigPath := findDynamicClusterKubeconfigPath(ctx.Name)
			if kubeconfigPath != "" {
				origin = map[string]interface{}{
					"kubeconfig": kubeconfigPath,
				}
			} else {
				origin = map[string]interface{}{
					"dynamic": true,
				}
			}
		} else {
			// For other sources (like InCluster)
			clusterID = ctx.Name
			origin = map[string]interface{}{
				"source": ctx.SourceStr(),
			}
		}

		simplifiedCtx := SimplifiedContext{
			Name:        ctx.Name,
			Server:      ctx.Cluster.Server,
			AuthType:    authType,
			KubeContext: kubeContextInfo,
			MetaData: map[string]interface{}{
				"clusterID":    clusterID,
				"extensions":   map[string]interface{}{},
				"namespace":    namespace,
				"origin":       origin,
				"originalName": ctx.Name,
				"source":       source,
			},
		}

		c.JSON(200, simplifiedCtx)
	}
}

// getHomeDir returns the user's home directory
func getHomeDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "/unknown"
	}
	return homeDir
}

// findDynamicClusterKubeconfigPath tries to find the original kubeconfig path for a dynamic cluster context
func findDynamicClusterKubeconfigPath(contextName string) string {
	homeDir := getHomeDir()
	kubeconfigDir := filepath.Join(homeDir, ".agentkube", "kubeconfig")

	// Check if the main config directory exists
	if _, err := os.Stat(kubeconfigDir); os.IsNotExist(err) {
		return ""
	}

	// Look through subdirectories for the context
	entries, err := os.ReadDir(kubeconfigDir)
	if err != nil {
		return ""
	}

	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "config_") {
			configPath := filepath.Join(kubeconfigDir, entry.Name(), "config")
			if contextExistsInFile(configPath, contextName) {
				return configPath
			}
		}
	}

	// Also check the main persistence file
	mainConfigPath := filepath.Join(kubeconfigDir, "config")
	if contextExistsInFile(mainConfigPath, contextName) {
		return mainConfigPath
	}

	return ""
}

// contextExistsInFile checks if a context exists in a kubeconfig file
func contextExistsInFile(configPath, contextName string) bool {
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return false
	}

	config, err := clientcmd.LoadFromFile(configPath)
	if err != nil {
		return false
	}

	// Check for exact match
	if _, exists := config.Contexts[contextName]; exists {
		return true
	}

	// Check for prefixed contexts (uploaded contexts are often prefixed)
	for existingContextName := range config.Contexts {
		if strings.Contains(existingContextName, "-") {
			parts := strings.SplitN(existingContextName, "-", 2)
			if len(parts) == 2 && parts[1] == contextName {
				return true
			}
		}

		// Also check if our contextName is actually the prefixed version
		if strings.Contains(contextName, "-") {
			parts := strings.SplitN(contextName, "-", 2)
			if len(parts) == 2 && existingContextName == parts[1] {
				return true
			}
		}
	}

	return false
}
