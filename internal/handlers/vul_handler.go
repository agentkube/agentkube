package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/vul"
	"github.com/gin-gonic/gin"
)

type VulnerabilityHandler struct {
	kubeConfigStore kubeconfig.ContextStore
}

func NewVulnerabilityHandler(kubeConfigStore kubeconfig.ContextStore) *VulnerabilityHandler {
	return &VulnerabilityHandler{
		kubeConfigStore: kubeConfigStore,
	}
}

// GetScannerStatus returns the current status of the vulnerability scanner
func (h *VulnerabilityHandler) GetScannerStatus(c *gin.Context) {
	if vul.ImgScanner == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": gin.H{
				"available":   false,
				"initialized": false,
			},
			"message": "Vulnerability scanner not initialized",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": gin.H{
			"available":   true,
			"initialized": vul.ImgScanner.IsEnabled(),
		},
	})
}

// ScanImages scans specified container images for vulnerabilities
func (h *VulnerabilityHandler) ScanImages(c *gin.Context) {
	var req ScanRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Images) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "images list cannot be empty"})
		return
	}

	if vul.ImgScanner == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vulnerability scanner not available"})
		return
	}

	// Check exclusions
	if req.Namespace != "" && req.Labels != nil {
		if vul.ImgScanner.ShouldExclude(req.Namespace, req.Labels) {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "Images excluded from scanning",
				"results": []interface{}{},
				"errors":  []interface{}{},
			})
			return
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Enqueue images for scanning
	vul.ImgScanner.Enqueue(ctx, req.Images...)

	// Wait briefly for scans to complete or return accepting status
	time.Sleep(2 * time.Second)

	var results []ScanResult
	var errors []string

	for _, img := range req.Images {
		scan, found := vul.ImgScanner.GetScan(img)
		if found && scan != nil {
			result := ScanResult{
				Image:           img,
				Vulnerabilities: convertVulnerabilities(scan),
				Summary: Summary{
					Critical: scan.Tally.Critical,
					High:     scan.Tally.High,
					Medium:   scan.Tally.Medium,
					Low:      scan.Tally.Low,
					Unknown:  scan.Tally.Unknown,
					Total:    scan.Tally.Total,
				},
				ScanTime: time.Now().Format(time.RFC3339),
				Status:   "completed",
			}
			results = append(results, result)
		} else {
			// Scan might still be in progress
			result := ScanResult{
				Image:    img,
				ScanTime: time.Now().Format(time.RFC3339),
				Status:   "in_progress",
			}
			results = append(results, result)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Vulnerability scan initiated",
		"results": results,
		"errors":  errors,
	})
}

// GetImageScanResults retrieves scan results for a specific image
func (h *VulnerabilityHandler) GetImageScanResults(c *gin.Context) {
	image := c.Query("image")
	if image == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image parameter is required"})
		return
	}

	if vul.ImgScanner == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vulnerability scanner not available"})
		return
	}

	scan, found := vul.ImgScanner.GetScan(image)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan results not found for image"})
		return
	}

	result := ScanResult{
		Image:           image,
		Vulnerabilities: convertVulnerabilities(scan),
		Summary: Summary{
			Critical: scan.Tally.Critical,
			High:     scan.Tally.High,
			Medium:   scan.Tally.Medium,
			Low:      scan.Tally.Low,
			Unknown:  scan.Tally.Unknown,
			Total:    scan.Tally.Total,
		},
		ScanTime: time.Now().Format(time.RFC3339),
		Status:   "completed",
	}

	c.JSON(http.StatusOK, result)
}

// ListAllScanResults lists all vulnerability scan results with optional filtering and pagination
func (h *VulnerabilityHandler) ListAllScanResults(c *gin.Context) {
	if vul.ImgScanner == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vulnerability scanner not available"})
		return
	}

	// TODO: Implement pagination and filtering
	_ = c.Query("severity") // Placeholder for future filtering

	var results []ScanResult

	// Since we can't directly iterate over scans map safely, we'll return empty for now
	// In a real implementation, you'd want to implement a proper scan results store
	c.JSON(http.StatusOK, gin.H{
		"results": results,
		"total":   len(results),
	})
}

// TriggerClusterImageScan triggers vulnerability scans for images found in cluster resources
func (h *VulnerabilityHandler) TriggerClusterImageScan(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cluster name is required"})
		return
	}

	var req ClusterScanRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if vul.ImgScanner == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vulnerability scanner not available"})
		return
	}

	// Validate cluster access
	_, err := h.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "getting kubeconfig context")
		c.JSON(http.StatusNotFound, gin.H{"error": "cluster not found or inaccessible"})
		return
	}

	// TODO: Implement actual cluster resource scanning
	// For now, just return a success message
	c.JSON(http.StatusOK, gin.H{
		"message":      "Image scan triggered for cluster",
		"cluster":      clusterName,
		"namespace":    req.Namespace,
		"resourceType": req.ResourceType,
	})
}

// Request/Response types
type ScanRequest struct {
	Images    []string          `json:"images" binding:"required"`
	Namespace string            `json:"namespace,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

type ClusterScanRequest struct {
	Namespace    string            `json:"namespace,omitempty"`
	ResourceType string            `json:"resourceType,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
}

type ScanResult struct {
	Image           string          `json:"image"`
	Vulnerabilities []Vulnerability `json:"vulnerabilities,omitempty"`
	Summary         Summary         `json:"summary"`
	ScanTime        string          `json:"scanTime"`
	Status          string          `json:"status"`
}

type Vulnerability struct {
	ID          string `json:"id"`
	Severity    string `json:"severity"`
	PackageName string `json:"packageName"`
	Version     string `json:"version"`
	FixVersion  string `json:"fixVersion"`
	PackageType string `json:"packageType"`
}

type Summary struct {
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Unknown  int `json:"unknown"`
	Total    int `json:"total"`
}

func convertVulnerabilities(scan *vul.Scan) []Vulnerability {
	var vulns []Vulnerability

	for _, row := range scan.Table.Rows {
		if len(row) >= 6 {
			vulns = append(vulns, Vulnerability{
				ID:          row.Vulnerability(),
				Severity:    row.Severity(),
				PackageName: row.Name(),
				Version:     row.Version(),
				FixVersion:  row.Fix(),
				PackageType: row.Type(),
			})
		}
	}

	return vulns
}
