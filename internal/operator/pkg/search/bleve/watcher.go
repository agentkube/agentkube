package bleve

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/search"
	"github.com/blevesearch/bleve/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

const (
	batchWindow  = 500 * time.Millisecond
	maxBatchSize = 100
)

// ResourceWatcher watches Kubernetes resources and updates the index in real-time
type ResourceWatcher struct {
	index           bleve.Index
	dynamicClient   dynamic.Interface
	resources       []search.APIResource
	namespaces      []string
	stopCh          chan struct{}
	eventCh         chan WatchEvent
	wg              sync.WaitGroup
	mu              sync.RWMutex
	lastEventTime   time.Time
	eventsProcessed uint64
}

// NewResourceWatcher creates a new resource watcher
func NewResourceWatcher(index bleve.Index, dynamicClient dynamic.Interface, resources []search.APIResource, namespaces []string) *ResourceWatcher {
	return &ResourceWatcher{
		index:         index,
		dynamicClient: dynamicClient,
		resources:     resources,
		namespaces:    namespaces,
		stopCh:        make(chan struct{}),
		eventCh:       make(chan WatchEvent, 1000),
	}
}

// Start starts watching all resources
func (w *ResourceWatcher) Start(ctx context.Context) error {
	// Start batch processor
	w.wg.Add(1)
	go w.processBatches(ctx)

	// Start watchers for each resource type
	for _, resource := range w.resources {
		if resource.Namespaced {
			// Watch across all namespaces
			for _, ns := range w.namespaces {
				w.wg.Add(1)
				go w.watchResource(ctx, resource, ns)
			}
		} else {
			// Watch cluster-scoped resource
			w.wg.Add(1)
			go w.watchResource(ctx, resource, "")
		}
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"resourceTypes": fmt.Sprintf("%d", len(w.resources)),
		"namespaces":    fmt.Sprintf("%d", len(w.namespaces)),
	}, nil, "started resource watchers")

	return nil
}

// Stop stops all watchers
func (w *ResourceWatcher) Stop() {
	close(w.stopCh)
	w.wg.Wait()
	close(w.eventCh)

	logger.Log(logger.LevelInfo, nil, nil, "stopped resource watchers")
}

// watchResource watches a specific resource type
func (w *ResourceWatcher) watchResource(ctx context.Context, resource search.APIResource, namespace string) {
	defer w.wg.Done()

	gvr := schema.GroupVersionResource{
		Group:    resource.Group,
		Version:  resource.Version,
		Resource: resource.Resource,
	}

	for {
		select {
		case <-w.stopCh:
			return
		case <-ctx.Done():
			return
		default:
		}

		var watcher watch.Interface
		var err error

		if namespace != "" {
			watcher, err = w.dynamicClient.Resource(gvr).Namespace(namespace).Watch(ctx, metav1.ListOptions{})
		} else {
			watcher, err = w.dynamicClient.Resource(gvr).Watch(ctx, metav1.ListOptions{})
		}

		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"resource":  resource.Resource,
				"namespace": namespace,
			}, err, "failed to create watcher, retrying")

			// Backoff before retry
			select {
			case <-time.After(5 * time.Second):
				continue
			case <-w.stopCh:
				return
			}
		}

		w.processWatchEvents(watcher, resource)

		// If watch stopped, retry
		select {
		case <-time.After(1 * time.Second):
			continue
		case <-w.stopCh:
			return
		}
	}
}

// processWatchEvents processes events from a watcher
func (w *ResourceWatcher) processWatchEvents(watcher watch.Interface, resource search.APIResource) {
	defer watcher.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case event, ok := <-watcher.ResultChan():
			if !ok {
				// Channel closed, watcher stopped
				return
			}

			// Convert to unstructured
			obj, ok := event.Object.(*unstructured.Unstructured)
			if !ok {
				logger.Log(logger.LevelWarn, nil, nil, "failed to convert watch event to unstructured")
				continue
			}

			// Send event to batch processor
			w.eventCh <- WatchEvent{
				Type:     string(event.Type),
				Resource: mapResourceToWatchEvent(obj, resource, event.Type),
			}
		}
	}
}

// processBatches processes events in batches
func (w *ResourceWatcher) processBatches(ctx context.Context) {
	defer w.wg.Done()

	ticker := time.NewTicker(batchWindow)
	defer ticker.Stop()

	eventBuffer := make([]WatchEvent, 0, maxBatchSize)

	for {
		select {
		case <-w.stopCh:
			// Process remaining events
			if len(eventBuffer) > 0 {
				w.executeBatch(eventBuffer)
			}
			return

		case <-ctx.Done():
			return

		case event := <-w.eventCh:
			eventBuffer = append(eventBuffer, event)

			// Execute batch if it reaches max size
			if len(eventBuffer) >= maxBatchSize {
				w.executeBatch(eventBuffer)
				eventBuffer = make([]WatchEvent, 0, maxBatchSize)
			}

		case <-ticker.C:
			// Execute batch on timer
			if len(eventBuffer) > 0 {
				w.executeBatch(eventBuffer)
				eventBuffer = make([]WatchEvent, 0, maxBatchSize)
			}
		}
	}
}

// executeBatch executes a batch of watch events
func (w *ResourceWatcher) executeBatch(events []WatchEvent) {
	if len(events) == 0 {
		return
	}

	batch := w.index.NewBatch()

	for _, event := range events {
		switch event.Type {
		case string(watch.Added), string(watch.Modified):
			doc, ok := event.Resource.(ResourceDocument)
			if !ok {
				continue
			}
			if err := batch.Index(doc.ID, doc); err != nil {
				logger.Log(logger.LevelWarn, map[string]string{
					"docID": doc.ID,
				}, err, "failed to add document to batch")
			}

		case string(watch.Deleted):
			doc, ok := event.Resource.(ResourceDocument)
			if !ok {
				continue
			}
			batch.Delete(doc.ID)
		}
	}

	if batch.Size() > 0 {
		if err := w.index.Batch(batch); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to execute watch batch")
		} else {
			w.mu.Lock()
			w.eventsProcessed += uint64(len(events))
			w.lastEventTime = time.Now()
			w.mu.Unlock()
		}
	}
}

// GetLastEventTime returns the time of the last processed event
func (w *ResourceWatcher) GetLastEventTime() time.Time {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.lastEventTime
}

// GetEventsProcessed returns the total number of events processed
func (w *ResourceWatcher) GetEventsProcessed() uint64 {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.eventsProcessed
}

// mapResourceToWatchEvent converts an unstructured resource to a watch event
func mapResourceToWatchEvent(resource *unstructured.Unstructured, apiResource search.APIResource, eventType watch.EventType) ResourceDocument {
	labels := resource.GetLabels()
	if labels == nil {
		labels = make(map[string]string)
	}

	annotations := resource.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}

	var docID string
	if resource.GetNamespace() != "" {
		docID = fmt.Sprintf("%s:%s:%s", resource.GetNamespace(), apiResource.Resource, resource.GetName())
	} else {
		docID = fmt.Sprintf("%s:%s", apiResource.Resource, resource.GetName())
	}

	return ResourceDocument{
		ID:           docID,
		Name:         resource.GetName(),
		Namespace:    resource.GetNamespace(),
		ResourceType: apiResource.Resource,
		Group:        apiResource.Group,
		Version:      apiResource.Version,
		Namespaced:   apiResource.Namespaced,
		Labels:       labels,
		Annotations:  annotations,
		CreatedAt:    resource.GetCreationTimestamp().Time,
	}
}
