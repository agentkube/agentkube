package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/search"
	searchBleve "github.com/agentkube/operator/pkg/search/bleve"
	"github.com/blevesearch/bleve/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// SearchResources handles cluster resource search requests with Bleve fallback
func SearchResources(c *gin.Context) {
	// Parse the search options from the request body
	var searchOptions search.SearchOptions
	if err := c.ShouldBindJSON(&searchOptions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid search options: %v", err),
		})
		return
	}

	clusterName := c.Param("clusterName")

	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Use the existing GetContextKeyFromRequest method
	contextKey, err := clusterManager.GetContextKeyFromRequest(c)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting context key")
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	clusterCtx, err := clusterManager.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := clusterCtx.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Try to use Bleve index first
	bleveCtrl, err := searchBleve.GetController()
	if err == nil {
		index, err := bleveCtrl.GetClusterIndex(clusterName)
		if err == nil {
			// Bleve index exists, use it
			searcher := searchBleve.NewSearcher(index)
			results, duration, err := searcher.Search(c.Request.Context(), searchOptions, false)
			if err == nil {
				c.JSON(http.StatusOK, gin.H{
					"results":    results,
					"count":      len(results),
					"query":      searchOptions.Query,
					"cluster":    clusterName,
					"searchTime": duration.String(),
					"source":     "bleve",
				})
				return
			}

			// Bleve search failed, fall through to K8s API
			logger.Log(logger.LevelWarn, map[string]string{
				"cluster": clusterName,
			}, err, "Bleve search failed, falling back to K8s API")
		}
	}

	// Fallback to direct K8s API search
	searchController, err := search.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "creating search controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create search controller: %v", err),
		})
		return
	}

	// Perform search with timeout
	searchCtx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	results, err := searchController.Search(searchCtx, searchOptions)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "searching resources")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("search failed: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"count":   len(results),
		"query":   searchOptions.Query,
		"cluster": clusterName,
		"source":  "k8s_api",
	})
}

// IndexCluster handles index creation/rebuild requests
func IndexCluster(c *gin.Context) {
	var indexOptions searchBleve.IndexOptions
	if err := c.ShouldBindJSON(&indexOptions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid index options: %v", err),
		})
		return
	}

	clusterName := c.Param("clusterName")

	// Get cluster context
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	contextKey, err := clusterManager.GetContextKeyFromRequest(c)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting context key")
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	clusterCtx, err := clusterManager.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	restConfig, err := clusterCtx.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Get or create Bleve controller
	bleveCtrl, err := searchBleve.GetController()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting Bleve controller")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get Bleve controller: %v", err)})
		return
	}

	// Get or create index
	index, err := bleveCtrl.GetOrCreateClusterIndex(clusterName, restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "getting/creating index")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create index: %v", err)})
		return
	}

	if indexOptions.Async {
		// Start background indexing
		operationID := fmt.Sprintf("idx-%s-%s", indexOptions.Action, uuid.New().String()[:8])

		bleveCtrl.SetOperation(clusterName, &searchBleve.OperationInfo{
			OperationID: operationID,
			Type:        indexOptions.Action,
			Status:      "in_progress",
			Progress:    0,
			StartedAt:   time.Now(),
		})

		go performIndexingAsync(clusterName, index, restConfig, indexOptions, operationID, bleveCtrl)

		c.JSON(http.StatusAccepted, gin.H{
			"cluster":           clusterName,
			"action":            indexOptions.Action,
			"status":            "started",
			"operationId":       operationID,
			"estimatedDuration": "30s",
			"message":           "Indexing started in background",
		})
	} else {
		// Synchronous indexing
		stats, err := performIndexing(c.Request.Context(), clusterName, index, restConfig, indexOptions, bleveCtrl)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("indexing failed: %v", err)})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"cluster": clusterName,
			"action":  indexOptions.Action,
			"status":  "completed",
			"stats":   stats,
		})
	}
}

// GetIndexStatus handles index status requests
func GetIndexStatus(c *gin.Context) {
	clusterName := c.Param("clusterName")

	bleveCtrl, err := searchBleve.GetController()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get Bleve controller: %v", err),
		})
		return
	}

	status, err := bleveCtrl.GetIndexStatus(clusterName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get index status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"cluster":          clusterName,
		"status":           status.Status,
		"stats":            status.Stats,
		"sync":             status.Sync,
		"currentOperation": status.CurrentOperation,
		"message":          status.Message,
	})
}

// ListIndexedClusters handles listing all indexed clusters
func ListIndexedClusters(c *gin.Context) {
	bleveCtrl, err := searchBleve.GetController()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get Bleve controller: %v", err),
		})
		return
	}

	clusters, err := bleveCtrl.ListIndexedClusters()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to list indexed clusters: %v", err),
		})
		return
	}

	totalDocuments := uint64(0)
	for _, cluster := range clusters {
		if cluster.Stats != nil {
			totalDocuments += cluster.Stats.DocumentCount
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"clusters":       clusters,
		"totalClusters":  len(clusters),
		"totalDocuments": totalDocuments,
	})
}

// DeleteClusterIndex handles deleting a cluster index
func DeleteClusterIndex(c *gin.Context) {
	clusterName := c.Param("clusterName")

	bleveCtrl, err := searchBleve.GetController()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get Bleve controller: %v", err),
		})
		return
	}

	if err := bleveCtrl.DeleteClusterIndex(clusterName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to delete index: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"cluster": clusterName,
		"message": "Index deleted successfully",
	})
}

// performIndexing performs the actual indexing operation
func performIndexing(ctx context.Context, clusterName string, index bleve.Index, config *rest.Config, opts searchBleve.IndexOptions, ctrl *searchBleve.Controller) (*searchBleve.IndexStats, error) {
	indexer, err := searchBleve.NewIndexer(index, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create indexer: %w", err)
	}

	var stats *searchBleve.IndexStats

	switch opts.Action {
	case "rebuild":
		stats, err = indexer.IndexAllResources(ctx, opts)
	case "refresh":
		stats, err = indexer.RefreshIndex(ctx, opts)
	default:
		return nil, fmt.Errorf("unknown action: %s", opts.Action)
	}

	if err != nil {
		return nil, err
	}

	// Update metadata
	ctrl.UpdateMetadata(clusterName, func(metadata *searchBleve.ClusterIndexMetadata) {
		metadata.LastIndexed = time.Now()
		metadata.DocumentCount = stats.DocumentCount
	})

	// Start watchers automatically after indexing
	go startWatchersForCluster(clusterName, index, config, ctrl)

	return stats, nil
}

// performIndexingAsync performs indexing in the background
func performIndexingAsync(clusterName string, index bleve.Index, config *rest.Config, opts searchBleve.IndexOptions, operationID string, ctrl *searchBleve.Controller) {
	ctx := context.Background()

	stats, err := performIndexing(ctx, clusterName, index, config, opts, ctrl)

	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster":     clusterName,
			"operationID": operationID,
		}, err, "async indexing failed")

		ctrl.SetOperation(clusterName, &searchBleve.OperationInfo{
			OperationID: operationID,
			Type:        opts.Action,
			Status:      "error",
			StartedAt:   time.Now(),
		})
	} else {
		logger.Log(logger.LevelInfo, map[string]string{
			"cluster":       clusterName,
			"operationID":   operationID,
			"documentCount": fmt.Sprintf("%d", stats.DocumentCount),
		}, nil, "async indexing completed")

		ctrl.SetOperation(clusterName, &searchBleve.OperationInfo{
			OperationID: operationID,
			Type:        opts.Action,
			Status:      "completed",
			Progress:    100,
			StartedAt:   time.Now(),
		})
	}

	// Clear operation after some time
	time.Sleep(30 * time.Second)
	ctrl.ClearOperation(clusterName)
}

// startWatchersForCluster starts resource watchers for a cluster
func startWatchersForCluster(clusterName string, index bleve.Index, config *rest.Config, ctrl *searchBleve.Controller) {
	indexer, err := searchBleve.NewIndexer(index, config)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "failed to create indexer for watchers")
		return
	}

	// Get all standard resources
	resources, err := indexer.GetStandardResources(context.Background())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "failed to get resources for watchers")
		return
	}

	// Get all namespaces
	namespaces, err := indexer.GetNamespaces(context.Background(), nil)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "failed to get namespaces for watchers")
		return
	}

	// Create and start watcher
	dynamicClient, _ := dynamic.NewForConfig(config)
	watcher := searchBleve.NewResourceWatcher(index, dynamicClient, resources, namespaces)

	ctrl.RegisterWatcher(clusterName, watcher)

	if err := watcher.Start(context.Background()); err != nil {
		logger.Log(logger.LevelError, map[string]string{
			"cluster": clusterName,
		}, err, "failed to start watchers")
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
	}, nil, "started resource watchers")
}
