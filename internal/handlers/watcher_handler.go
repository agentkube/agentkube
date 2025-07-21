package handlers

import (
	"fmt"
	"net/http"

	"github.com/agentkube/operator/config"
	"github.com/gin-gonic/gin"
)

// GetWatcherConfigHandler returns the current watcher configuration
func GetWatcherConfigHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg, err := config.New()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Failed to load watcher config: %v", err),
			})
			return
		}

		c.JSON(http.StatusOK, cfg)
	}
}

// PatchWatcherConfigHandler updates the watcher configuration with provided JSON patch
func PatchWatcherConfigHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Load current configuration
		cfg, err := config.New()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Failed to load watcher config: %v", err),
			})
			return
		}

		// Parse patch data as map to detect which fields are actually provided
		var patchData map[string]interface{}
		if err := c.ShouldBindJSON(&patchData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Invalid JSON patch data: %v", err),
			})
			return
		}

		// Apply patch to configuration
		applyConfigPatchFromMap(cfg, patchData)

		// Save updated configuration
		if err := cfg.Write(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Failed to save configuration: %v", err),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Watcher configuration updated successfully",
			"config":  cfg,
		})
	}
}

// applyConfigPatchFromMap applies configuration patches from a map to only update provided fields
func applyConfigPatchFromMap(target *config.Config, patchData map[string]interface{}) {
	// Handle resource patches
	if resourceData, ok := patchData["resource"].(map[string]interface{}); ok {
		if val, exists := resourceData["replicationcontroller"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.ReplicationController = boolVal
			}
		}
		if val, exists := resourceData["replicaset"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.ReplicaSet = boolVal
			}
		}
		if val, exists := resourceData["daemonset"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.DaemonSet = boolVal
			}
		}
		if val, exists := resourceData["deployment"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Deployment = boolVal
			}
		}
		if val, exists := resourceData["pod"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Pod = boolVal
			}
		}
		if val, exists := resourceData["services"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Services = boolVal
			}
		}
		if val, exists := resourceData["namespace"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Namespace = boolVal
			}
		}
		if val, exists := resourceData["configmap"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.ConfigMap = boolVal
			}
		}
		if val, exists := resourceData["clusterrole"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.ClusterRole = boolVal
			}
		}
		if val, exists := resourceData["clusterrolebinding"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.ClusterRoleBinding = boolVal
			}
		}
		if val, exists := resourceData["serviceaccount"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.ServiceAccount = boolVal
			}
		}
		if val, exists := resourceData["persistentvolume"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.PersistentVolume = boolVal
			}
		}
		if val, exists := resourceData["secret"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Secret = boolVal
			}
		}
		if val, exists := resourceData["ingress"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Ingress = boolVal
			}
		}
		if val, exists := resourceData["hpa"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.HPA = boolVal
			}
		}
		if val, exists := resourceData["event"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Event = boolVal
			}
		}
		if val, exists := resourceData["coreevent"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.CoreEvent = boolVal
			}
		}
		if val, exists := resourceData["job"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Job = boolVal
			}
		}
		if val, exists := resourceData["node"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.Node = boolVal
			}
		}
		if val, exists := resourceData["statefulset"]; exists {
			if boolVal, ok := val.(bool); ok {
				target.Resource.StatefulSet = boolVal
			}
		}
	}

	// Handle handler.webhook patches
	if handlerData, ok := patchData["handler"].(map[string]interface{}); ok {
		if webhookData, ok := handlerData["webhook"].(map[string]interface{}); ok {
			if val, exists := webhookData["url"]; exists {
				if strVal, ok := val.(string); ok {
					target.Handler.Webhook.Url = strVal
				}
			}
			if val, exists := webhookData["cert"]; exists {
				if strVal, ok := val.(string); ok {
					target.Handler.Webhook.Cert = strVal
				}
			}
			if val, exists := webhookData["tlsskip"]; exists {
				if boolVal, ok := val.(bool); ok {
					target.Handler.Webhook.TlsSkip = boolVal
				}
			}
		}
	}

	// Handle namespace patch
	if val, exists := patchData["namespace"]; exists {
		if strVal, ok := val.(string); ok {
			target.Namespace = strVal
		}
	}

	// Handle customresources patch
	if val, exists := patchData["customresources"]; exists {
		if crdArray, ok := val.([]interface{}); ok {
			var crds []config.CRD
			for _, crdData := range crdArray {
				if crdMap, ok := crdData.(map[string]interface{}); ok {
					crd := config.CRD{}
					if group, ok := crdMap["group"].(string); ok {
						crd.Group = group
					}
					if version, ok := crdMap["version"].(string); ok {
						crd.Version = version
					}
					if resource, ok := crdMap["resource"].(string); ok {
						crd.Resource = resource
					}
					crds = append(crds, crd)
				}
			}
			target.CustomResources = crds
		}
	}
}