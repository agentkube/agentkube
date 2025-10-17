package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/vul"
	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
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

	// Enqueue images for scanning (non-blocking)
	vul.ImgScanner.Enqueue(ctx, req.Images...)

	var results []ScanResult
	var errors []string

	// Immediately check current scan status without waiting
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
			// Scan is queued/in progress
			result := ScanResult{
				Image:    img,
				ScanTime: time.Now().Format(time.RFC3339),
				Status:   "queued",
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
		c.JSON(http.StatusOK, ScanResult{
			Image:    image,
			ScanTime: time.Now().Format(time.RFC3339),
			Status:   "not_found",
		})
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

// GetClusterImages discovers and returns all container images in a cluster
func (h *VulnerabilityHandler) GetClusterImages(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cluster name is required"})
		return
	}

	// Optional filters
	namespace := c.Query("namespace")

	// Validate cluster access
	kubeContext, err := h.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "getting kubeconfig context")
		c.JSON(http.StatusNotFound, gin.H{"error": "cluster not found or inaccessible"})
		return
	}

	// Create kubernetes client
	clientset, err := kubeContext.ClientSetWithToken("")
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "creating kubernetes client")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create kubernetes client"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	images, err := h.discoverClusterImages(ctx, clientset, namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName, "namespace": namespace}, err, "discovering cluster images")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to discover cluster images"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"cluster":   clusterName,
		"namespace": namespace,
		"images":    images,
		"count":     len(images),
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

// GetWorkloadsByImage returns all workloads using a specific image in a cluster
func (h *VulnerabilityHandler) GetWorkloadsByImage(c *gin.Context) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cluster name is required"})
		return
	}

	var req ImageWorkloadsRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Image == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image is required in request body"})
		return
	}

	// Validate cluster access
	kubeContext, err := h.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "getting kubeconfig context")
		c.JSON(http.StatusNotFound, gin.H{"error": "cluster not found or inaccessible"})
		return
	}

	// Create kubernetes client
	clientset, err := kubeContext.ClientSetWithToken("")
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "creating kubernetes client")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create kubernetes client"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	workloads, err := h.discoverWorkloadsByImage(ctx, clientset, req.Image)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName, "image": req.Image}, err, "discovering workloads by image")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to discover workloads"})
		return
	}

	c.JSON(http.StatusOK, ImageWorkloadsResponse{
		Image:     req.Image,
		Workloads: workloads,
		Count:     len(workloads),
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

type ImageWorkloadsRequest struct {
	Image string `json:"image" binding:"required"`
}

type WorkloadResource struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Kind        string            `json:"kind"` // Pod, Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, CronJob
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Containers  []ContainerInfo   `json:"containers"`
	CreatedAt   string            `json:"createdAt,omitempty"`
	Status      string            `json:"status,omitempty"`
}

type ContainerInfo struct {
	Name    string `json:"name"`
	Image   string `json:"image"`
	ImageID string `json:"imageId,omitempty"`
}

type ImageWorkloadsResponse struct {
	Image     string             `json:"image"`
	Workloads []WorkloadResource `json:"workloads"`
	Count     int                `json:"count"`
}

type ScanResult struct {
	Image           string          `json:"image"`
	Vulnerabilities []Vulnerability `json:"vulnerabilities,omitempty"`
	Summary         Summary         `json:"summary"`
	ScanTime        string          `json:"scanTime"`
	Status          string          `json:"status"`
}

type Vulnerability struct {
	ID                     string                  `json:"id"`
	Severity               string                  `json:"severity"`
	PackageName            string                  `json:"packageName"`
	Version                string                  `json:"version"`
	FixVersion             string                  `json:"fixVersion"`
	PackageType            string                  `json:"packageType"`
	DataSource             string                  `json:"dataSource,omitempty"`
	Description            string                  `json:"description,omitempty"`
	PublishedDate          string                  `json:"publishedDate,omitempty"`
	LastModifiedDate       string                  `json:"lastModifiedDate,omitempty"`
	CVSSScore              *float64                `json:"cvssScore,omitempty"`
	CVSSVector             string                  `json:"cvssVector,omitempty"`
	CWEIDs                 []string                `json:"cweIds,omitempty"`
	Namespace              string                  `json:"namespace,omitempty"`
	PURL                   string                  `json:"purl,omitempty"`
	URLs                   []string                `json:"urls,omitempty"`
	Locations              []VulnerabilityLocation `json:"locations,omitempty"`
	RelatedVulnerabilities []RelatedVulnerability  `json:"relatedVulnerabilities,omitempty"`
}

type VulnerabilityLocation struct {
	Path    string `json:"path"`
	LayerID string `json:"layerID,omitempty"`
}

type RelatedVulnerability struct {
	ID        string `json:"id"`
	Namespace string `json:"namespace,omitempty"`
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

	for i, row := range scan.Table.Rows {
		if len(row) >= 6 {
			vuln := Vulnerability{
				ID:          row.Vulnerability(),
				Severity:    row.Severity(),
				PackageName: row.Name(),
				Version:     row.Version(),
				FixVersion:  row.Fix(),
				PackageType: row.Type(),
			}

			// Add enhanced metadata if available
			if i < len(scan.Table.Metadata) {
				meta := scan.Table.Metadata[i]
				if meta.VulnMetadata != nil {
					vuln.DataSource = meta.VulnMetadata.DataSource
					vuln.Description = meta.VulnMetadata.Description
					vuln.Namespace = meta.VulnMetadata.Namespace
					vuln.URLs = meta.VulnMetadata.URLs

					// Add CVSS information
					if len(meta.VulnMetadata.Cvss) > 0 {
						// Get the first (typically highest priority) CVSS score
						for _, cvss := range meta.VulnMetadata.Cvss {
							if cvss.Metrics.BaseScore > 0 {
								score := cvss.Metrics.BaseScore
								vuln.CVSSScore = &score
								vuln.CVSSVector = cvss.Vector
								break
							}
						}
					}

					// Add CISA KEV date if available
					if len(meta.VulnMetadata.KnownExploited) > 0 && meta.VulnMetadata.KnownExploited[0].DateAdded != nil {
						vuln.PublishedDate = meta.VulnMetadata.KnownExploited[0].DateAdded.Format("2006-01-02T15:04:05Z")
					}

					// Add EPSS date if available
					if len(meta.VulnMetadata.EPSS) > 0 {
						vuln.LastModifiedDate = meta.VulnMetadata.EPSS[0].Date.Format("2006-01-02T15:04:05Z")
					}
				}

				if meta.Match != nil {
					// Add package URL if available
					if meta.Match.Package.PURL != "" {
						vuln.PURL = meta.Match.Package.PURL
					}

					// Add locations
					for _, location := range meta.Match.Package.Locations.ToSlice() {
						vuln.Locations = append(vuln.Locations, VulnerabilityLocation{
							Path:    location.RealPath,
							LayerID: "", // LayerID not directly available in file.Location
						})
					}

					// Add related vulnerabilities
					for _, related := range meta.Match.Vulnerability.RelatedVulnerabilities {
						vuln.RelatedVulnerabilities = append(vuln.RelatedVulnerabilities, RelatedVulnerability{
							ID:        related.ID,
							Namespace: related.Namespace,
						})
					}
				}
			}

			vulns = append(vulns, vuln)
		}
	}

	return vulns
}

// discoverClusterImages discovers all container images in cluster pods
func (h *VulnerabilityHandler) discoverClusterImages(ctx context.Context, clientset *kubernetes.Clientset, namespace string) ([]vul.ImageInfo, error) {
	var images []vul.ImageInfo
	imageMap := make(map[string]vul.ImageInfo) // To avoid duplicates

	// Get pods from all namespaces or specific namespace
	listOptions := metav1.ListOptions{}

	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, listOptions)
	if err != nil {
		return nil, err
	}

	for _, pod := range pods.Items {
		// Process init containers
		for _, container := range pod.Spec.InitContainers {
			imageInfo := vul.ImageInfo{
				Name:        container.Name,
				Namespace:   pod.Namespace,
				PodName:     pod.Name,
				Container:   container.Name,
				Labels:      pod.Labels,
				Annotations: pod.Annotations,
				Image:       container.Image,
				ImageID:     "", // Will be populated from status if available
			}

			// Use image as unique key to avoid duplicates
			imageMap[container.Image] = imageInfo
		}

		// Process regular containers
		for _, container := range pod.Spec.Containers {
			imageInfo := vul.ImageInfo{
				Name:        container.Name,
				Namespace:   pod.Namespace,
				PodName:     pod.Name,
				Container:   container.Name,
				Labels:      pod.Labels,
				Annotations: pod.Annotations,
				Image:       container.Image,
				ImageID:     "", // Will be populated from status if available
			}

			// Use image as unique key to avoid duplicates
			imageMap[container.Image] = imageInfo
		}

		// Update with actual image IDs from pod status
		for _, containerStatus := range pod.Status.ContainerStatuses {
			for imageKey, imageInfo := range imageMap {
				if imageInfo.Container == containerStatus.Name &&
					imageInfo.PodName == pod.Name &&
					imageInfo.Namespace == pod.Namespace {
					imageInfo.ImageID = containerStatus.ImageID
					imageMap[imageKey] = imageInfo
				}
			}
		}

		// Update with actual image IDs from init container status
		for _, containerStatus := range pod.Status.InitContainerStatuses {
			for imageKey, imageInfo := range imageMap {
				if imageInfo.Container == containerStatus.Name &&
					imageInfo.PodName == pod.Name &&
					imageInfo.Namespace == pod.Namespace {
					imageInfo.ImageID = containerStatus.ImageID
					imageMap[imageKey] = imageInfo
				}
			}
		}
	}

	// Convert map to slice
	for _, imageInfo := range imageMap {
		images = append(images, imageInfo)
	}

	return images, nil
}

// discoverWorkloadsByImage discovers all workloads (Deployments, ReplicaSets, StatefulSets, DaemonSets, Jobs, CronJobs, Pods) using a specific image
func (h *VulnerabilityHandler) discoverWorkloadsByImage(ctx context.Context, clientset *kubernetes.Clientset, targetImage string) ([]WorkloadResource, error) {
	var workloads []WorkloadResource

	// Helper function to check if image matches
	imageMatches := func(image string) bool {
		return image == targetImage
	}

	// 1. Discover Pods
	pods, err := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, pod := range pods.Items {
			var containers []ContainerInfo

			// Check all containers and init containers
			for _, container := range pod.Spec.Containers {
				if imageMatches(container.Image) {
					imageID := ""
					for _, status := range pod.Status.ContainerStatuses {
						if status.Name == container.Name {
							imageID = status.ImageID
							break
						}
					}
					containers = append(containers, ContainerInfo{
						Name:    container.Name,
						Image:   container.Image,
						ImageID: imageID,
					})
				}
			}

			for _, container := range pod.Spec.InitContainers {
				if imageMatches(container.Image) {
					imageID := ""
					for _, status := range pod.Status.InitContainerStatuses {
						if status.Name == container.Name {
							imageID = status.ImageID
							break
						}
					}
					containers = append(containers, ContainerInfo{
						Name:    container.Name,
						Image:   container.Image,
						ImageID: imageID,
					})
				}
			}

			if len(containers) > 0 {
				workloads = append(workloads, WorkloadResource{
					Name:        pod.Name,
					Namespace:   pod.Namespace,
					Kind:        "Pod",
					Labels:      pod.Labels,
					Annotations: pod.Annotations,
					Containers:  containers,
					CreatedAt:   pod.CreationTimestamp.Format(time.RFC3339),
					Status:      string(pod.Status.Phase),
				})
			}
		}
	}

	// 2. Discover Deployments
	deployments, err := clientset.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, deployment := range deployments.Items {
			var containers []ContainerInfo

			for _, container := range deployment.Spec.Template.Spec.Containers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			for _, container := range deployment.Spec.Template.Spec.InitContainers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			if len(containers) > 0 {
				status := fmt.Sprintf("%d/%d ready", deployment.Status.ReadyReplicas, deployment.Status.Replicas)
				workloads = append(workloads, WorkloadResource{
					Name:        deployment.Name,
					Namespace:   deployment.Namespace,
					Kind:        "Deployment",
					Labels:      deployment.Labels,
					Annotations: deployment.Annotations,
					Containers:  containers,
					CreatedAt:   deployment.CreationTimestamp.Format(time.RFC3339),
					Status:      status,
				})
			}
		}
	}

	// 3. Discover ReplicaSets
	replicaSets, err := clientset.AppsV1().ReplicaSets("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rs := range replicaSets.Items {
			var containers []ContainerInfo

			for _, container := range rs.Spec.Template.Spec.Containers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			for _, container := range rs.Spec.Template.Spec.InitContainers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			if len(containers) > 0 {
				status := fmt.Sprintf("%d/%d ready", rs.Status.ReadyReplicas, rs.Status.Replicas)
				workloads = append(workloads, WorkloadResource{
					Name:        rs.Name,
					Namespace:   rs.Namespace,
					Kind:        "ReplicaSet",
					Labels:      rs.Labels,
					Annotations: rs.Annotations,
					Containers:  containers,
					CreatedAt:   rs.CreationTimestamp.Format(time.RFC3339),
					Status:      status,
				})
			}
		}
	}

	// 4. Discover StatefulSets
	statefulSets, err := clientset.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, sts := range statefulSets.Items {
			var containers []ContainerInfo

			for _, container := range sts.Spec.Template.Spec.Containers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			for _, container := range sts.Spec.Template.Spec.InitContainers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			if len(containers) > 0 {
				status := fmt.Sprintf("%d/%d ready", sts.Status.ReadyReplicas, sts.Status.Replicas)
				workloads = append(workloads, WorkloadResource{
					Name:        sts.Name,
					Namespace:   sts.Namespace,
					Kind:        "StatefulSet",
					Labels:      sts.Labels,
					Annotations: sts.Annotations,
					Containers:  containers,
					CreatedAt:   sts.CreationTimestamp.Format(time.RFC3339),
					Status:      status,
				})
			}
		}
	}

	// 5. Discover DaemonSets
	daemonSets, err := clientset.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, ds := range daemonSets.Items {
			var containers []ContainerInfo

			for _, container := range ds.Spec.Template.Spec.Containers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			for _, container := range ds.Spec.Template.Spec.InitContainers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			if len(containers) > 0 {
				status := fmt.Sprintf("%d/%d ready", ds.Status.NumberReady, ds.Status.DesiredNumberScheduled)
				workloads = append(workloads, WorkloadResource{
					Name:        ds.Name,
					Namespace:   ds.Namespace,
					Kind:        "DaemonSet",
					Labels:      ds.Labels,
					Annotations: ds.Annotations,
					Containers:  containers,
					CreatedAt:   ds.CreationTimestamp.Format(time.RFC3339),
					Status:      status,
				})
			}
		}
	}

	// 6. Discover Jobs
	jobs, err := clientset.BatchV1().Jobs("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, job := range jobs.Items {
			var containers []ContainerInfo

			for _, container := range job.Spec.Template.Spec.Containers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			for _, container := range job.Spec.Template.Spec.InitContainers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			if len(containers) > 0 {
				status := "Running"
				if job.Status.Succeeded > 0 {
					status = fmt.Sprintf("%d succeeded", job.Status.Succeeded)
				} else if job.Status.Active > 0 {
					status = fmt.Sprintf("%d active", job.Status.Active)
				} else if job.Status.Failed > 0 {
					status = fmt.Sprintf("%d failed", job.Status.Failed)
				}
				workloads = append(workloads, WorkloadResource{
					Name:        job.Name,
					Namespace:   job.Namespace,
					Kind:        "Job",
					Labels:      job.Labels,
					Annotations: job.Annotations,
					Containers:  containers,
					CreatedAt:   job.CreationTimestamp.Format(time.RFC3339),
					Status:      status,
				})
			}
		}
	}

	// 7. Discover CronJobs
	cronJobs, err := clientset.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, cronJob := range cronJobs.Items {
			var containers []ContainerInfo

			for _, container := range cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			for _, container := range cronJob.Spec.JobTemplate.Spec.Template.Spec.InitContainers {
				if imageMatches(container.Image) {
					containers = append(containers, ContainerInfo{
						Name:  container.Name,
						Image: container.Image,
					})
				}
			}

			if len(containers) > 0 {
				status := fmt.Sprintf("Schedule: %s", cronJob.Spec.Schedule)
				if cronJob.Status.LastScheduleTime != nil {
					status += fmt.Sprintf(", Last: %s", cronJob.Status.LastScheduleTime.Format(time.RFC3339))
				}
				workloads = append(workloads, WorkloadResource{
					Name:        cronJob.Name,
					Namespace:   cronJob.Namespace,
					Kind:        "CronJob",
					Labels:      cronJob.Labels,
					Annotations: cronJob.Annotations,
					Containers:  containers,
					CreatedAt:   cronJob.CreationTimestamp.Format(time.RFC3339),
					Status:      status,
				})
			}
		}
	}

	return workloads, nil
}
