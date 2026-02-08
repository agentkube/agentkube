package bleve

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/search"
	"github.com/blevesearch/bleve/v2"
	bleveQuery "github.com/blevesearch/bleve/v2/search/query"
)

// Searcher handles search operations on a Bleve index
type Searcher struct {
	index bleve.Index
}

// NewSearcher creates a new searcher
func NewSearcher(index bleve.Index) *Searcher {
	return &Searcher{
		index: index,
	}
}

// Search performs a search on the index
func (s *Searcher) Search(ctx context.Context, opts search.SearchOptions, fuzzy bool) ([]search.SearchResult, time.Duration, error) {
	startTime := time.Now()

	// Build query
	query := s.buildQuery(opts, fuzzy)

	// Create search request
	searchRequest := bleve.NewSearchRequest(query)

	// Set limit
	limit := opts.Limit
	if limit == 0 {
		limit = 50 // Default limit
	}
	searchRequest.Size = limit
	searchRequest.From = 0

	// Execute search
	searchResults, err := s.index.Search(searchRequest)
	if err != nil {
		return nil, 0, fmt.Errorf("search failed: %w", err)
	}

	// Convert to search results
	results := make([]search.SearchResult, 0, len(searchResults.Hits))
	for _, hit := range searchResults.Hits {
		// Parse document ID to extract namespace, resource type, and name
		result := s.parseDocID(hit.ID)
		if result != nil {
			results = append(results, *result)
		}
	}

	duration := time.Since(startTime)
	return results, duration, nil
}

// buildQuery builds a Bleve query from search options
func (s *Searcher) buildQuery(opts search.SearchOptions, fuzzy bool) bleveQuery.Query {
	queries := []bleveQuery.Query{}

	// Full-text search on query string
	if opts.Query != "" {
		// Split query into terms
		terms := strings.Fields(opts.Query)

		for _, term := range terms {
			var q bleveQuery.Query
			if fuzzy {
				// Fuzzy match query
				matchQuery := bleveQuery.NewMatchQuery(term)
				matchQuery.SetFuzziness(1)
				q = matchQuery
			} else {
				// Exact match query (still uses match query for better results)
				q = bleveQuery.NewMatchQuery(term)
			}
			queries = append(queries, q)
		}
	}

	// Filter by resource type
	if opts.ResourceType != "" {
		termQuery := bleveQuery.NewTermQuery(opts.ResourceType)
		termQuery.SetField("resourceType")
		queries = append(queries, termQuery)
	}

	// Filter by namespaces
	if len(opts.Namespaces) > 0 {
		nsQueries := make([]bleveQuery.Query, 0, len(opts.Namespaces))
		for _, ns := range opts.Namespaces {
			termQuery := bleveQuery.NewTermQuery(ns)
			termQuery.SetField("namespace")
			nsQueries = append(nsQueries, termQuery)
		}
		queries = append(queries, bleveQuery.NewDisjunctionQuery(nsQueries))
	}

	// If no queries, match all
	if len(queries) == 0 {
		return bleveQuery.NewMatchAllQuery()
	}

	// Combine all queries with AND
	if len(queries) == 1 {
		return queries[0]
	}

	return bleveQuery.NewConjunctionQuery(queries)
}

// parseDocID parses a document ID back to a SearchResult
func (s *Searcher) parseDocID(docID string) *search.SearchResult {
	// Document ID format: {namespace}:{resourceType}:{name} or {resourceType}:{name}
	parts := strings.Split(docID, ":")

	if len(parts) == 3 {
		// Namespaced resource
		return &search.SearchResult{
			Namespace:    parts[0],
			ResourceType: parts[1],
			ResourceName: parts[2],
			Namespaced:   true,
		}
	} else if len(parts) == 2 {
		// Cluster-scoped resource
		return &search.SearchResult{
			ResourceType: parts[0],
			ResourceName: parts[1],
			Namespaced:   false,
		}
	}

	return nil
}

// GetDocumentByID retrieves a document by its ID
func (s *Searcher) GetDocumentByID(docID string) (*ResourceDocument, error) {
	doc, err := s.index.Document(docID)
	if err != nil {
		return nil, fmt.Errorf("failed to get document: %w", err)
	}

	if doc == nil {
		return nil, fmt.Errorf("document not found: %s", docID)
	}

	// Parse the stored document back to ResourceDocument
	// This is a simplified version - in production you'd want to properly unmarshal
	result := &ResourceDocument{
		ID: docID,
	}

	return result, nil
}
