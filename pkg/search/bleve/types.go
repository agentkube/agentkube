package bleve

import (
	"time"

	"github.com/agentkube/operator/pkg/search"
)

// ResourceDocument represents a Kubernetes resource indexed in Bleve
type ResourceDocument struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	ResourceType string            `json:"resourceType"`
	Group        string            `json:"group"`
	Version      string            `json:"version"`
	Namespaced   bool              `json:"namespaced"`
	Labels       map[string]string `json:"labels"`
	Annotations  map[string]string `json:"annotations"`
	CreatedAt    time.Time         `json:"createdAt"`
}

// IndexOptions contains parameters for indexing operations
type IndexOptions struct {
	Action        string   `json:"action"`        // rebuild, refresh, optimize
	ResourceTypes []string `json:"resourceTypes"` // Optional: specific resource types to index
	Namespaces    []string `json:"namespaces"`    // Optional: specific namespaces to index
	Async         bool     `json:"async"`         // Run in background
}

// IndexStats contains statistics about an index
type IndexStats struct {
	DocumentCount   uint64            `json:"documentCount"`
	IndexSize       string            `json:"indexSize"`
	LastIndexed     time.Time         `json:"lastIndexed"`
	LastUpdated     time.Time         `json:"lastUpdated"`
	TotalUpdates    uint64            `json:"totalUpdates"`
	TotalDeletes    uint64            `json:"totalDeletes"`
	TotalBatches    uint64            `json:"totalBatches"`
	ResourceCounts  map[string]uint64 `json:"resourceBreakdown"`
	IndexingStarted time.Time         `json:"indexingStarted,omitempty"`
	IndexingEnded   time.Time         `json:"indexingEnded,omitempty"`
}

// IndexStatus represents the current status of an index
type IndexStatus struct {
	Cluster          string          `json:"cluster"`
	Status           string          `json:"status"` // not_indexed, healthy, indexing, error
	Stats            *IndexStats     `json:"stats,omitempty"`
	Sync             *SyncStatus     `json:"sync,omitempty"`
	CurrentOperation *OperationInfo  `json:"currentOperation,omitempty"`
	Error            string          `json:"error,omitempty"`
	Message          string          `json:"message,omitempty"`
}

// SyncStatus contains real-time sync information
type SyncStatus struct {
	Enabled         bool      `json:"enabled"`
	Status          string    `json:"status"` // active, inactive, error
	LastEvent       time.Time `json:"lastEvent"`
	EventsProcessed uint64    `json:"eventsProcessed"`
}

// OperationInfo contains information about ongoing operations
type OperationInfo struct {
	OperationID string    `json:"operationId"`
	Type        string    `json:"type"` // rebuild, refresh
	Status      string    `json:"status"`
	Progress    int       `json:"progress"`
	StartedAt   time.Time `json:"startedAt"`
}

// SearchOptions extends the base search options with Bleve-specific features
type BleveSearchOptions struct {
	search.SearchOptions
	Fuzzy bool `json:"fuzzy"`
}

// SearchResults contains search results with metadata
type SearchResults struct {
	Results    []search.SearchResult `json:"results"`
	Count      int                   `json:"count"`
	Query      string                `json:"query"`
	Cluster    string                `json:"cluster"`
	SearchTime string                `json:"searchTime"`
	Source     string                `json:"source"` // "bleve" or "k8s_api"
}

// WatchEvent represents a Kubernetes watch event
type WatchEvent struct {
	Type     string
	Resource interface{}
}

// ClusterIndexMetadata stores metadata about a cluster index
type ClusterIndexMetadata struct {
	ClusterName     string    `json:"clusterName"`
	IndexPath       string    `json:"indexPath"`
	LastIndexed     time.Time `json:"lastIndexed"`
	DocumentCount   uint64    `json:"documentCount"`
	ResourceTypes   []string  `json:"resourceTypes"`
	WatchersEnabled bool      `json:"watchersEnabled"`
}
