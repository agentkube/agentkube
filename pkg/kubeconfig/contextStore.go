package kubeconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/logger"
)

// ContextStore is an interface for storing and retrieving contexts.
type ContextStore interface {
	AddContext(agentkubeContext *Context) error
	GetContexts() ([]*Context, error)
	GetContext(name string) (*Context, error)
	RemoveContext(name string) error
	AddContextWithKeyAndTTL(agentkubeContext *Context, key string, ttl time.Duration) error
	UpdateTTL(key string, ttl time.Duration) error
}

type contextStore struct {
	cache cache.Cache[*Context]
}

// NewContextStore creates a new ContextStore.
func NewContextStore() ContextStore {
	cache := cache.New[*Context]()

	return &contextStore{
		cache: cache,
	}
}

// AddContext adds a context to the store.
func (c *contextStore) AddContext(agentkubeContext *Context) error {
	name := agentkubeContext.Name

	if agentkubeContext.KubeContext != nil && agentkubeContext.KubeContext.Extensions != nil {
		if info, ok := agentkubeContext.KubeContext.Extensions["agentkube_info"]; ok {
			// Convert the runtime.Unknown object to a byte slice
			unknownBytes, err := json.Marshal(info)
			if err != nil {
				return err
			}

			// Now, decode the byte slice into your desired struct
			var customObj CustomObject

			err = json.Unmarshal(unknownBytes, &customObj)
			if err != nil {
				return err
			}

			// If the custom name is set, use it as the context name
			if customObj.CustomName != "" {
				name = customObj.CustomName
			}
		}
	}

	return c.cache.Set(context.Background(), name, agentkubeContext)
}

// GetContexts returns all contexts in the store.
func (c *contextStore) GetContexts() ([]*Context, error) {
	contexts := []*Context{}

	contextMap, err := c.cache.GetAll(context.Background(), nil)
	if err != nil {
		return nil, err
	}

	// Debug logging for context retrieval
	logger.Log(logger.LevelInfo, map[string]string{"cacheSize": fmt.Sprintf("%d", len(contextMap))}, nil, "GetContexts: Retrieved from cache")

	for _, ctx := range contextMap {
		contexts = append(contexts, ctx)
		logger.Log(logger.LevelInfo, map[string]string{"contextName": ctx.Name, "source": fmt.Sprintf("%d", ctx.Source)}, nil, "GetContexts: Found context")
	}

	return contexts, nil
}

// GetContext returns a context from the store.
func (c *contextStore) GetContext(name string) (*Context, error) {
	context, err := c.cache.Get(context.Background(), name)
	if err != nil {
		return nil, err
	}

	return context, nil
}

// RemoveContext removes a context from the store.
func (c *contextStore) RemoveContext(name string) error {
	logger.Log(logger.LevelInfo, map[string]string{"contextName": name}, nil, "RemoveContext: About to delete context")
	
	// Get cache size before deletion
	contextMap, _ := c.cache.GetAll(context.Background(), nil)
	logger.Log(logger.LevelInfo, map[string]string{"cacheSizeBefore": fmt.Sprintf("%d", len(contextMap))}, nil, "RemoveContext: Cache size before deletion")
	
	err := c.cache.Delete(context.Background(), name)
	
	// Get cache size after deletion
	contextMapAfter, _ := c.cache.GetAll(context.Background(), nil)
	logger.Log(logger.LevelInfo, map[string]string{"cacheSizeAfter": fmt.Sprintf("%d", len(contextMapAfter))}, nil, "RemoveContext: Cache size after deletion")
	
	return err
}

// AddContextWithKeyAndTTL adds a context to the store with a ttl.
func (c *contextStore) AddContextWithKeyAndTTL(agentkubeContext *Context, key string, ttl time.Duration) error {
	return c.cache.SetWithTTL(context.Background(), key, agentkubeContext, ttl)
}

// UpdateTTL updates the ttl of a context.
func (c *contextStore) UpdateTTL(key string, ttl time.Duration) error {
	return c.cache.UpdateTTL(context.Background(), key, ttl)
}
