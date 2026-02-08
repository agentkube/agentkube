package stateless

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
)

const (
	// ContextCacheTTL is the time-to-live for context cache entries
	ContextCacheTTL = 24 * time.Hour
	// ContextUpdateCacheTTL is the time-to-live for updated context cache entries
	ContextUpdateCacheTTL = 24 * time.Hour
)

// Cluster represents a Kubernetes cluster
type Cluster struct {
	Name     string                 `json:"name"`
	Server   string                 `json:"server,omitempty"`
	AuthType string                 `json:"auth_type"`
	Metadata map[string]interface{} `json:"meta_data"`
	Error    string                 `json:"error,omitempty"`
}

// ClusterReq represents a request to add a cluster
type ClusterReq struct {
	Name                     *string                `json:"name"`
	Server                   *string                `json:"server"`
	InsecureSkipTLSVerify    bool                   `json:"insecure-skip-tls-verify,omitempty"`
	CertificateAuthorityData []byte                 `json:"certificate-authority-data,omitempty"`
	Metadata                 map[string]interface{} `json:"meta_data"`
	KubeConfig               *string                `json:"kubeconfig,omitempty"`
}

// KubeconfigRequest represents a request containing one or more kubeconfigs
type KubeconfigRequest struct {
	Kubeconfigs []string `json:"kubeconfigs"`
}

// RenameClusterRequest represents a request to rename a cluster
type RenameClusterRequest struct {
	NewClusterName string `json:"newClusterName"`
	Source         string `json:"source"`
	Stateless      bool   `json:"stateless"`
}

// ClientConfig contains contexts information and if dynamic clusters are enabled
type ClientConfig struct {
	Clusters              []Cluster `json:"clusters"`
	EnableDynamicClusters bool      `json:"dynamicClustersEnabled"`
}

// ClusterManager handles stateless cluster operations
type ClusterManager struct {
	kubeConfigStore       kubeconfig.ContextStore
	enableDynamicClusters bool
}

// NewClusterManager creates a new ClusterManager
func NewClusterManager(kubeConfigStore kubeconfig.ContextStore, enableDynamicClusters bool) *ClusterManager {
	return &ClusterManager{
		kubeConfigStore:       kubeConfigStore,
		enableDynamicClusters: enableDynamicClusters,
	}
}

// MarshalCustomObject marshals the runtime.Object into a CustomObject
func MarshalCustomObject(info interface{}, contextName string) (kubeconfig.CustomObject, error) {
	// Convert to a byte slice
	unknownBytes, err := json.Marshal(info)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
			err, "unmarshaling context data")
		return kubeconfig.CustomObject{}, err
	}

	// Decode into CustomObject
	var customObj kubeconfig.CustomObject
	err = json.Unmarshal(unknownBytes, &customObj)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
			err, "unmarshaling into CustomObject")
		return kubeconfig.CustomObject{}, err
	}

	return customObj, nil
}

// SetKeyInCache sets the context in the cache with the given key
func (cm *ClusterManager) SetKeyInCache(key string, context kubeconfig.Context) error {
	// Check if context is present
	_, err := cm.kubeConfigStore.GetContext(key)
	if err != nil && strings.Contains(err.Error(), "not found") {
		// To ensure stateless clusters are not visible to other users, they are marked as internal clusters.
		// They are stored in the proxy cache and accessed through the /config endpoint.
		context.Internal = true
		if err = cm.kubeConfigStore.AddContextWithKeyAndTTL(&context, key, ContextCacheTTL); err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": key},
				err, "adding context to cache")
			return err
		}
	} else {
		if err = cm.kubeConfigStore.UpdateTTL(key, ContextUpdateCacheTTL); err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": key},
				err, "updating context ttl")
			return err
		}
	}

	return nil
}

// HandleStatelessRequest processes a stateless cluster request
func (cm *ClusterManager) HandleStatelessRequest(c *gin.Context, kubeConfig string) (string, error) {
	var key string
	var contextKey string

	userID := c.GetHeader("X-USER-ID")
	clusterName := c.Param("clusterName")

	// Generate unique key for the context
	key = clusterName + userID

	contexts, contextLoadErrors, err := kubeconfig.LoadContextsFromBase64String(kubeConfig, kubeconfig.DynamicCluster)
	if len(contextLoadErrors) > 0 {
		// Log all errors
		for _, contextError := range contextLoadErrors {
			logger.Log(logger.LevelError, nil, contextError.Error, "loading contexts from kubeconfig")
		}

		if err != nil {
			logger.Log(logger.LevelError, nil, err, "loading contexts from kubeconfig")
			return "", err
		}

		// If no contexts were loaded, return an error
		if len(contexts) == 0 {
			return "", fmt.Errorf("failed to load any valid contexts from kubeconfig")
		}
	}

	if len(contexts) == 0 {
		logger.Log(logger.LevelError, nil, nil, "no contexts found in kubeconfig")
		return "", fmt.Errorf("no contexts found in kubeconfig")
	}

	for _, context := range contexts {
		context := context

		// Check if the context has extensions with custom info
		if context.KubeContext != nil && context.KubeContext.Extensions != nil {
			info, exists := context.KubeContext.Extensions["agentk_info"]
			if exists && info != nil {
				customObj, err := MarshalCustomObject(info, context.Name)
				if err != nil {
					logger.Log(logger.LevelError, map[string]string{"cluster": context.Name},
						err, "marshaling custom object")
					continue
				}

				// Check if the CustomName field is present
				if customObj.CustomName != "" {
					key = customObj.CustomName + userID
				}
			}
		} else if context.Name != clusterName {
			// Skip contexts that don't match the requested cluster name
			continue
		}

		// Save context in cache
		if err := cm.SetKeyInCache(key, context); err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": key},
				err, "setting key in cache")
			continue
		}

		contextKey = key
		break
	}

	if contextKey == "" {
		return "", fmt.Errorf("no matching context found for cluster: %s", clusterName)
	}

	return contextKey, nil
}

// ParseKubeConfig parses kubeconfigs and returns a list of clusters
func (cm *ClusterManager) ParseKubeConfig(c *gin.Context) {
	var kubeconfigReq KubeconfigRequest

	if err := c.ShouldBindJSON(&kubeconfigReq); err != nil {
		logger.Log(logger.LevelError, nil, err, "decoding kubeconfig request")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON request body"})
		return
	}

	kubeconfigs := kubeconfigReq.Kubeconfigs
	var clusters []Cluster
	var setupErrors []error

	for _, kubeconfigStr := range kubeconfigs {
		// Parse kubeconfig
		contexts, contextErrors, err := kubeconfig.LoadContextsFromBase64String(kubeconfigStr, kubeconfig.DynamicCluster)
		if err != nil {
			setupErrors = append(setupErrors, err)
			continue
		}

		if len(contextErrors) > 0 {
			for _, ctxErr := range contextErrors {
				setupErrors = append(setupErrors, fmt.Errorf("context '%s': %v", ctxErr.ContextName, ctxErr.Error))
			}
		}

		// Convert contexts to clusters
		for _, ctx := range contexts {
			var authType string
			if ctx.AuthInfo != nil && ctx.AuthInfo.AuthProvider != nil {
				authType = "token"
			}

			source := "unknown"
			switch ctx.Source {
			case kubeconfig.KubeConfig:
				source = "kubeconfig"
			case kubeconfig.DynamicCluster:
				source = "dynamic_cluster"
			case kubeconfig.InCluster:
				source = "incluster"
			}

			namespace := ""
			if ctx.KubeContext != nil {
				namespace = ctx.KubeContext.Namespace
			}

			cluster := Cluster{
				Name:     ctx.Name,
				Server:   ctx.Cluster.Server,
				AuthType: authType,
				Metadata: map[string]interface{}{
					"extensions": map[string]interface{}{},
					"namespace":  namespace,
					"source":     source,
				},
			}

			clusters = append(clusters, cluster)
		}
	}

	if len(setupErrors) > 0 {
		logger.Log(logger.LevelWarn, nil, fmt.Errorf("%v", setupErrors), "setting up contexts from kubeconfig")
		// Continue with the clusters we were able to parse
	}

	clientConfig := ClientConfig{
		Clusters:              clusters,
		EnableDynamicClusters: cm.enableDynamicClusters,
	}

	c.JSON(http.StatusOK, clientConfig)
}

// GetContextKeyFromRequest extracts the context key from the request
func (cm *ClusterManager) GetContextKeyFromRequest(c *gin.Context) (string, error) {
	var contextKey string

	clusterName := c.Param("clusterName")
	if clusterName == "" {
		return "", fmt.Errorf("cluster name is required")
	}

	// Check if kubeConfig exists in headers
	kubeConfig := c.GetHeader("KUBECONFIG")

	if kubeConfig != "" && cm.enableDynamicClusters {
		// If kubeConfig is set and dynamic clusters are enabled, handle stateless cluster requests
		key, err := cm.HandleStatelessRequest(c, kubeConfig)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "handling stateless request")
			return "", err
		}
		contextKey = key
	} else {
		contextKey = clusterName
	}

	// For WebSocket connections, handle the special case
	if c.GetHeader("Upgrade") == "websocket" {
		contextKey = extractWebSocketContextKey(c, clusterName)
	}

	return contextKey, nil
}

// Extract context key from WebSocket request
func extractWebSocketContextKey(c *gin.Context, clusterName string) string {
	// Expected number of submatches in the regular expression
	const expectedSubmatches = 2

	var contextKey string
	// Define a regular expression pattern for base64url.agentk.authorization.k8s.io
	pattern := `base64url\.agentk\.authorization\.k8s\.io\.([a-zA-Z0-9_-]+)`

	// Compile the regular expression
	re := regexp.MustCompile(pattern)

	// Find the match in the header value
	matches := re.FindStringSubmatch(c.GetHeader("Sec-Websocket-Protocol"))

	// Check if a match is found
	if len(matches) >= expectedSubmatches {
		// Extract the value after the specified prefix
		contextKey = clusterName + matches[1]
	} else {
		contextKey = clusterName
	}

	// Remove the base64url.agentk.authorization.k8s.io subprotocol from the list
	// because it is unrecognized by the k8s server.
	protocols := strings.Split(c.GetHeader("Sec-Websocket-Protocol"), ", ")

	var updatedProtocols []string

	for _, protocol := range protocols {
		if !strings.HasPrefix(protocol, "base64url.agentk.authorization.k8s.io.") {
			updatedProtocols = append(updatedProtocols, protocol)
		}
	}

	updatedProtocol := strings.Join(updatedProtocols, ", ")

	// Remove the existing Sec-Websocket-Protocol header and add the updated one
	c.Request.Header.Set("Sec-Websocket-Protocol", updatedProtocol)

	return contextKey
}

func (cm *ClusterManager) GetContext(key string) (*kubeconfig.Context, error) {
	return cm.kubeConfigStore.GetContext(key)
}
