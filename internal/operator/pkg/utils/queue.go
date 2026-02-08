package utils

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// OperationStatus represents the current status of an operation
type OperationStatus string

const (
	StatusPending   OperationStatus = "pending"
	StatusRunning   OperationStatus = "running"
	StatusCompleted OperationStatus = "completed"
	StatusFailed    OperationStatus = "failed"
	StatusCancelled OperationStatus = "cancelled"
)

// Operation represents a queued operation
type Operation struct {
	ID          string                 `json:"id"`
	Type        string                 `json:"type"`        // e.g., "metrics-install", "trivy-scan", "helm-install"
	Status      OperationStatus        `json:"status"`
	Target      string                 `json:"target"`      // e.g., cluster name, namespace, etc.
	StartTime   time.Time              `json:"startTime"`
	EndTime     *time.Time             `json:"endTime,omitempty"`
	Error       string                 `json:"error,omitempty"`
	Progress    int                    `json:"progress"`    // 0-100
	Message     string                 `json:"message,omitempty"`
	Data        map[string]interface{} `json:"data,omitempty"`        // Any operation-specific data
	RetryCount  int                    `json:"retryCount"`
	MaxRetries  int                    `json:"maxRetries"`
	CreatedBy   string                 `json:"createdBy,omitempty"`   // User or system that created the operation
	Tags        []string               `json:"tags,omitempty"`        // For categorization and filtering
}

// OperationProcessor defines the interface for processing operations
type OperationProcessor interface {
	ProcessOperation(op *Operation) error
	CanProcess(operationType string) bool
}

// Queue manages asynchronous operations
type Queue struct {
	operations map[string]*Operation
	mutex      sync.RWMutex
	workers    int
	workChan   chan string
	stopChan   chan bool
	processors map[string]OperationProcessor // Map of operation type to processor
}

// QueueConfig holds configuration for the queue
type QueueConfig struct {
	Workers    int
	MaxRetries int
}

// NewQueue creates a new operation queue
func NewQueue(config QueueConfig) *Queue {
	if config.Workers <= 0 {
		config.Workers = 3 // Default to 3 workers
	}
	if config.MaxRetries <= 0 {
		config.MaxRetries = 3 // Default to 3 retries
	}

	q := &Queue{
		operations: make(map[string]*Operation),
		workers:    config.Workers,
		workChan:   make(chan string, config.Workers*2), // Buffer for better throughput
		stopChan:   make(chan bool),
		processors: make(map[string]OperationProcessor),
	}

	// Start worker goroutines
	for i := 0; i < config.Workers; i++ {
		go q.worker()
	}

	// Start cleanup goroutine
	go q.cleanup()

	return q
}

// RegisterProcessor registers a processor for a specific operation type
func (q *Queue) RegisterProcessor(operationType string, processor OperationProcessor) {
	q.mutex.Lock()
	defer q.mutex.Unlock()
	q.processors[operationType] = processor
}

// AddOperation adds a new operation to the queue
func (q *Queue) AddOperation(operationType, target, createdBy string, data map[string]interface{}, tags []string) *Operation {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	op := &Operation{
		ID:         uuid.New().String(),
		Type:       operationType,
		Status:     StatusPending,
		Target:     target,
		StartTime:  time.Now(),
		Progress:   0,
		Data:       data,
		RetryCount: 0,
		MaxRetries: 3,
		CreatedBy:  createdBy,
		Tags:       tags,
	}

	q.operations[op.ID] = op

	// Queue for processing
	select {
	case q.workChan <- op.ID:
		// Successfully queued
	default:
		// Queue is full, mark as failed
		op.Status = StatusFailed
		op.Error = "Queue is full, operation could not be queued"
		endTime := time.Now()
		op.EndTime = &endTime
	}

	return op
}

// GetOperation retrieves an operation by ID
func (q *Queue) GetOperation(id string) (*Operation, bool) {
	q.mutex.RLock()
	defer q.mutex.RUnlock()

	op, exists := q.operations[id]
	if !exists {
		return nil, false
	}

	// Return a copy to prevent external modification
	opCopy := *op
	if op.Data != nil {
		opCopy.Data = make(map[string]interface{})
		for k, v := range op.Data {
			opCopy.Data[k] = v
		}
	}
	if op.Tags != nil {
		opCopy.Tags = make([]string, len(op.Tags))
		copy(opCopy.Tags, op.Tags)
	}
	
	return &opCopy, true
}

// ListOperations returns all operations, optionally filtered
func (q *Queue) ListOperations(filters map[string]string) []*Operation {
	q.mutex.RLock()
	defer q.mutex.RUnlock()

	var results []*Operation
	for _, op := range q.operations {
		if q.matchesFilters(op, filters) {
			// Return a copy
			opCopy := *op
			if op.Data != nil {
				opCopy.Data = make(map[string]interface{})
				for k, v := range op.Data {
					opCopy.Data[k] = v
				}
			}
			if op.Tags != nil {
				opCopy.Tags = make([]string, len(op.Tags))
				copy(opCopy.Tags, op.Tags)
			}
			results = append(results, &opCopy)
		}
	}

	return results
}

// matchesFilters checks if an operation matches the given filters
func (q *Queue) matchesFilters(op *Operation, filters map[string]string) bool {
	if filters == nil {
		return true
	}

	for key, value := range filters {
		switch key {
		case "target":
			if op.Target != value {
				return false
			}
		case "type":
			if op.Type != value {
				return false
			}
		case "status":
			if string(op.Status) != value {
				return false
			}
		case "createdBy":
			if op.CreatedBy != value {
				return false
			}
		case "tag":
			hasTag := false
			for _, tag := range op.Tags {
				if tag == value {
					hasTag = true
					break
				}
			}
			if !hasTag {
				return false
			}
		}
	}

	return true
}

// GetOperationsByTarget returns all operations for a specific target
func (q *Queue) GetOperationsByTarget(target string) []*Operation {
	return q.ListOperations(map[string]string{"target": target})
}

// GetOperationsByStatus returns all operations with a specific status
func (q *Queue) GetOperationsByStatus(status OperationStatus) []*Operation {
	return q.ListOperations(map[string]string{"status": string(status)})
}

// GetOperationsByType returns all operations of a specific type
func (q *Queue) GetOperationsByType(operationType string) []*Operation {
	return q.ListOperations(map[string]string{"type": operationType})
}

// UpdateOperation updates an operation's status and progress
func (q *Queue) UpdateOperation(id string, status OperationStatus, progress int, message string, err error) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	op, exists := q.operations[id]
	if !exists {
		return
	}

	op.Status = status
	op.Progress = progress
	op.Message = message

	if err != nil {
		op.Error = err.Error()
	}

	if status == StatusCompleted || status == StatusFailed || status == StatusCancelled {
		endTime := time.Now()
		op.EndTime = &endTime
	}
}

// UpdateOperationData updates the data field of an operation
func (q *Queue) UpdateOperationData(id string, data map[string]interface{}) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	op, exists := q.operations[id]
	if !exists {
		return
	}

	if op.Data == nil {
		op.Data = make(map[string]interface{})
	}

	for k, v := range data {
		op.Data[k] = v
	}
}

// CancelOperation cancels a pending or running operation
func (q *Queue) CancelOperation(id string) bool {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	op, exists := q.operations[id]
	if !exists {
		return false
	}

	if op.Status == StatusPending {
		op.Status = StatusCancelled
		op.Message = "Operation cancelled by user"
		endTime := time.Now()
		op.EndTime = &endTime
		return true
	}

	// Cannot cancel running operations easily without more complex coordination
	return false
}

// RemoveOperation removes an operation from the queue
func (q *Queue) RemoveOperation(id string) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	delete(q.operations, id)
}

// worker processes operations from the work channel
func (q *Queue) worker() {
	for {
		select {
		case opID := <-q.workChan:
			q.processOperation(opID)
		case <-q.stopChan:
			return
		}
	}
}

// processOperation processes a single operation
func (q *Queue) processOperation(opID string) {
	q.mutex.Lock()
	op, exists := q.operations[opID]
	if !exists {
		q.mutex.Unlock()
		return
	}

	// Check if operation was cancelled
	if op.Status == StatusCancelled {
		q.mutex.Unlock()
		return
	}

	// Mark as running
	op.Status = StatusRunning
	op.Progress = 10
	operationType := op.Type
	q.mutex.Unlock()

	// Find processor for this operation type
	q.mutex.RLock()
	processor, exists := q.processors[operationType]
	q.mutex.RUnlock()

	if !exists {
		q.UpdateOperation(op.ID, StatusFailed, 0, "No processor registered for operation type: "+operationType, nil)
		return
	}

	// Process the operation
	err := processor.ProcessOperation(op)
	if err != nil {
		q.handleOperationError(op, err)
	} else {
		q.UpdateOperation(op.ID, StatusCompleted, 100, "Operation completed successfully", nil)
	}
}

// handleOperationError handles operation errors and implements retry logic
func (q *Queue) handleOperationError(op *Operation, err error) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	op.RetryCount++
	op.Error = err.Error()

	if op.RetryCount < op.MaxRetries {
		// Retry the operation
		op.Status = StatusPending
		op.Progress = 0
		op.Message = "Retrying operation"

		// Re-queue with exponential backoff
		go func() {
			backoff := time.Duration(op.RetryCount) * time.Second * 2
			time.Sleep(backoff)

			select {
			case q.workChan <- op.ID:
				// Successfully re-queued
			default:
				// Could not re-queue, mark as failed
				q.UpdateOperation(op.ID, StatusFailed, 0, "Failed to retry operation", err)
			}
		}()
	} else {
		// Max retries reached, mark as failed
		op.Status = StatusFailed
		op.Progress = 0
		op.Message = "Max retries exceeded"
		endTime := time.Now()
		op.EndTime = &endTime
	}
}

// cleanup removes old completed operations
func (q *Queue) cleanup() {
	ticker := time.NewTicker(10 * time.Minute) // Cleanup every 10 minutes
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			q.cleanupOldOperations()
		case <-q.stopChan:
			return
		}
	}
}

// cleanupOldOperations removes operations older than 1 hour that are completed or failed
func (q *Queue) cleanupOldOperations() {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	cutoff := time.Now().Add(-1 * time.Hour)
	for id, op := range q.operations {
		if (op.Status == StatusCompleted || op.Status == StatusFailed || op.Status == StatusCancelled) &&
			op.StartTime.Before(cutoff) {
			delete(q.operations, id)
		}
	}
}

// Stop stops the queue and all workers
func (q *Queue) Stop() {
	close(q.stopChan)
	close(q.workChan)
}

// GetQueueStats returns statistics about the queue
func (q *Queue) GetQueueStats() map[string]int {
	q.mutex.RLock()
	defer q.mutex.RUnlock()

	stats := map[string]int{
		"total":     len(q.operations),
		"pending":   0,
		"running":   0,
		"completed": 0,
		"failed":    0,
		"cancelled": 0,
	}

	for _, op := range q.operations {
		switch op.Status {
		case StatusPending:
			stats["pending"]++
		case StatusRunning:
			stats["running"]++
		case StatusCompleted:
			stats["completed"]++
		case StatusFailed:
			stats["failed"]++
		case StatusCancelled:
			stats["cancelled"]++
		}
	}

	return stats
}