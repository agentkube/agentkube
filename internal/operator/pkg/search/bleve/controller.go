package bleve

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/blevesearch/bleve/v2"
	"k8s.io/client-go/rest"
)

// Controller manages Bleve indices for multiple clusters
type Controller struct {
	basePath     string
	indices      map[string]bleve.Index
	watchers     map[string]*ResourceWatcher
	metadata     map[string]*ClusterIndexMetadata
	operations   map[string]*OperationInfo
	mu           sync.RWMutex
	metadataFile string
}

var (
	globalController *Controller
	controllerOnce   sync.Once
)

// GetController returns the global Bleve controller instance
func GetController() (*Controller, error) {
	var err error
	controllerOnce.Do(func() {
		globalController, err = NewController()
	})
	return globalController, err
}

// getAppDataDirectory returns the platform-specific application data directory
func getAppDataDirectory() (string, error) {
	var appDir string

	switch runtime.GOOS {
	case "windows":
		// Windows: Use APPDATA
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
		}
		appDir = filepath.Join(appData, "Agentkube")

	case "darwin":
		// macOS: Use ~/Library/Application Support
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}
		appDir = filepath.Join(homeDir, "Library", "Application Support", "Agentkube")

	default:
		// Linux: Use ~/.local/share
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}
		appDir = filepath.Join(homeDir, ".local", "share", "agentkube")
	}

	return appDir, nil
}

// NewController creates a new Bleve controller
func NewController() (*Controller, error) {
	// Get platform-specific app data directory
	appDataDir, err := getAppDataDirectory()
	if err != nil {
		return nil, fmt.Errorf("failed to get app data directory: %w", err)
	}

	// Indices path: {appDataDir}/indices
	basePath := filepath.Join(appDataDir, "indices")
	metadataFile := filepath.Join(basePath, "indices.json")

	// Ensure base directory exists
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create indices directory: %w", err)
	}

	controller := &Controller{
		basePath:     basePath,
		indices:      make(map[string]bleve.Index),
		watchers:     make(map[string]*ResourceWatcher),
		metadata:     make(map[string]*ClusterIndexMetadata),
		operations:   make(map[string]*OperationInfo),
		metadataFile: metadataFile,
	}

	// Load metadata
	if err := controller.loadMetadata(); err != nil {
		logger.Log(logger.LevelWarn, nil, err, "failed to load index metadata")
	}

	return controller, nil
}

// GetOrCreateClusterIndex gets an existing index or creates a new one for the cluster
func (c *Controller) GetOrCreateClusterIndex(clusterName string, config *rest.Config) (bleve.Index, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if index already exists in memory
	if index, exists := c.indices[clusterName]; exists {
		return index, nil
	}

	indexPath := filepath.Join(c.basePath, clusterName)

	var index bleve.Index
	var err error

	// Try to open existing index
	if _, err := os.Stat(indexPath); err == nil {
		index, err = bleve.Open(indexPath)
		if err != nil {
			logger.Log(logger.LevelWarn, map[string]string{
				"cluster": clusterName,
			}, err, "failed to open existing index, creating new one")

			// If index is corrupted, remove it and create new
			os.RemoveAll(indexPath)
			index, err = c.createNewIndex(indexPath)
		}
	} else {
		// Index doesn't exist, create new
		index, err = c.createNewIndex(indexPath)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create/open index: %w", err)
	}

	c.indices[clusterName] = index

	// Initialize metadata if not exists
	if _, exists := c.metadata[clusterName]; !exists {
		c.metadata[clusterName] = &ClusterIndexMetadata{
			ClusterName: clusterName,
			IndexPath:   indexPath,
		}
	}

	return index, nil
}

// GetClusterIndex gets an existing cluster index
func (c *Controller) GetClusterIndex(clusterName string) (bleve.Index, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if index, exists := c.indices[clusterName]; exists {
		return index, nil
	}

	return nil, fmt.Errorf("index not found for cluster: %s", clusterName)
}

// CloseClusterIndex closes and removes the index from memory
func (c *Controller) CloseClusterIndex(clusterName string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if index, exists := c.indices[clusterName]; exists {
		if err := index.Close(); err != nil {
			return fmt.Errorf("failed to close index: %w", err)
		}
		delete(c.indices, clusterName)
	}

	// Stop watchers
	if watcher, exists := c.watchers[clusterName]; exists {
		watcher.Stop()
		delete(c.watchers, clusterName)
	}

	return nil
}

// GetIndexStatus returns the status of a cluster index
func (c *Controller) GetIndexStatus(clusterName string) (*IndexStatus, error) {
	c.mu.RLock()
	index, exists := c.indices[clusterName]
	metadata := c.metadata[clusterName]
	operation := c.operations[clusterName]
	watcher := c.watchers[clusterName]
	c.mu.RUnlock()

	if !exists {
		// Check if index exists on disk but not in memory
		indexPath := filepath.Join(c.basePath, clusterName)
		if _, err := os.Stat(indexPath); os.IsNotExist(err) {
			return &IndexStatus{
				Cluster: clusterName,
				Status:  "not_indexed",
				Message: "No index found for this cluster",
			}, nil
		}

		// Index exists on disk, try to open it
		var err error
		index, err = c.GetOrCreateClusterIndex(clusterName, nil)
		if err != nil {
			return &IndexStatus{
				Cluster: clusterName,
				Status:  "error",
				Error:   fmt.Sprintf("failed to open index: %v", err),
			}, nil
		}
		c.mu.RLock()
		metadata = c.metadata[clusterName]
		watcher = c.watchers[clusterName]
		c.mu.RUnlock()
	}

	// Get stats from index
	docCount, err := index.DocCount()
	if err != nil {
		return &IndexStatus{
			Cluster: clusterName,
			Status:  "error",
			Error:   fmt.Sprintf("failed to get doc count: %v", err),
		}, nil
	}

	// Calculate index size
	indexSize := "0 B"
	if metadata != nil {
		size, _ := c.getDirectorySize(metadata.IndexPath)
		indexSize = formatBytes(size)
	}

	stats := &IndexStats{
		DocumentCount: docCount,
		IndexSize:     indexSize,
	}

	if metadata != nil {
		stats.LastIndexed = metadata.LastIndexed
		stats.LastUpdated = metadata.LastIndexed
	}

	// Determine status
	status := "healthy"
	if operation != nil && operation.Status == "in_progress" {
		status = "indexing"
	}

	result := &IndexStatus{
		Cluster: clusterName,
		Status:  status,
		Stats:   stats,
	}

	// Add sync status if watcher exists
	if watcher != nil {
		result.Sync = &SyncStatus{
			Enabled:         true,
			Status:          "active",
			LastEvent:       watcher.GetLastEventTime(),
			EventsProcessed: watcher.GetEventsProcessed(),
		}
	}

	if operation != nil {
		result.CurrentOperation = operation
	}

	return result, nil
}

// ListIndexedClusters returns a list of all indexed clusters
func (c *Controller) ListIndexedClusters() ([]*IndexStatus, error) {
	c.mu.RLock()
	clusterNames := make([]string, 0, len(c.metadata))
	for name := range c.metadata {
		clusterNames = append(clusterNames, name)
	}
	c.mu.RUnlock()

	results := make([]*IndexStatus, 0, len(clusterNames))
	for _, name := range clusterNames {
		status, err := c.GetIndexStatus(name)
		if err != nil {
			logger.Log(logger.LevelWarn, map[string]string{
				"cluster": name,
			}, err, "failed to get index status")
			continue
		}
		results = append(results, status)
	}

	return results, nil
}

// createNewIndex creates a new Bleve index with optimized configuration
func (c *Controller) createNewIndex(indexPath string) (bleve.Index, error) {
	// Create index mapping optimized for Kubernetes resources
	mapping := bleve.NewIndexMapping()

	// Document mapping
	resourceMapping := bleve.NewDocumentMapping()

	// Text fields with standard analyzer
	textFieldMapping := bleve.NewTextFieldMapping()
	resourceMapping.AddFieldMappingsAt("name", textFieldMapping)
	resourceMapping.AddFieldMappingsAt("namespace", textFieldMapping)
	resourceMapping.AddFieldMappingsAt("resourceType", textFieldMapping)

	mapping.DefaultMapping = resourceMapping

	// Performance configuration kvConfig
	_ = map[string]interface{}{
		"unsafe_batch":                  false,    // Ensure durability
		"NumPersisterWorkers":           4,        // Parallel flushing
		"MaxSizeInMemoryMergePerWorker": 10485760, // 10MB per worker
	}

	index, err := bleve.New(indexPath, mapping)
	if err != nil {
		return nil, fmt.Errorf("failed to create index: %w", err)
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"indexPath": indexPath,
	}, nil, "created new Bleve index")

	return index, nil
}

// saveMetadata persists index metadata to disk
func (c *Controller) saveMetadata() error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	data, err := json.MarshalIndent(c.metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	if err := os.WriteFile(c.metadataFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write metadata file: %w", err)
	}

	return nil
}

// loadMetadata loads index metadata from disk
func (c *Controller) loadMetadata() error {
	if _, err := os.Stat(c.metadataFile); os.IsNotExist(err) {
		return nil // Metadata file doesn't exist yet
	}

	data, err := os.ReadFile(c.metadataFile)
	if err != nil {
		return fmt.Errorf("failed to read metadata file: %w", err)
	}

	if err := json.Unmarshal(data, &c.metadata); err != nil {
		return fmt.Errorf("failed to unmarshal metadata: %w", err)
	}

	return nil
}

// UpdateMetadata updates the metadata for a cluster
func (c *Controller) UpdateMetadata(clusterName string, update func(*ClusterIndexMetadata)) error {
	c.mu.Lock()
	if metadata, exists := c.metadata[clusterName]; exists {
		update(metadata)
	}
	c.mu.Unlock()

	return c.saveMetadata()
}

// SetOperation sets an operation for tracking
func (c *Controller) SetOperation(clusterName string, op *OperationInfo) {
	c.mu.Lock()
	c.operations[clusterName] = op
	c.mu.Unlock()
}

// ClearOperation clears an operation
func (c *Controller) ClearOperation(clusterName string) {
	c.mu.Lock()
	delete(c.operations, clusterName)
	c.mu.Unlock()
}

// RegisterWatcher registers a resource watcher for a cluster
func (c *Controller) RegisterWatcher(clusterName string, watcher *ResourceWatcher) {
	c.mu.Lock()
	c.watchers[clusterName] = watcher
	c.mu.Unlock()
}

// DeleteClusterIndex deletes the index for a cluster
func (c *Controller) DeleteClusterIndex(clusterName string) error {
	// Close the index if it's open
	if err := c.CloseClusterIndex(clusterName); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{
			"cluster": clusterName,
		}, err, "failed to close index before deletion")
	}

	// Delete index files from disk
	indexPath := filepath.Join(c.basePath, clusterName)
	if err := os.RemoveAll(indexPath); err != nil {
		return fmt.Errorf("failed to delete index directory: %w", err)
	}

	// Remove from metadata
	c.mu.Lock()
	delete(c.metadata, clusterName)
	c.mu.Unlock()

	// Save updated metadata
	if err := c.saveMetadata(); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{
			"cluster": clusterName,
		}, err, "failed to save metadata after deletion")
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
	}, nil, "deleted cluster index")

	return nil
}

// getDirectorySize calculates the size of a directory
func (c *Controller) getDirectorySize(path string) (int64, error) {
	var size int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size, err
}

// formatBytes formats bytes to human-readable string
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
