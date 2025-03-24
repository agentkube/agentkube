package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/helm"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/storage/driver"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// HelmHandler handles Helm operations
type HelmHandler struct {
	kubeConfigStore kubeconfig.ContextStore
	cache           cache.Cache[interface{}]
	settings        *cli.EnvSettings
}

// NewHelmHandler creates a new HelmHandler
func NewHelmHandler(kubeConfigStore kubeconfig.ContextStore, cache cache.Cache[interface{}]) *HelmHandler {
	return &HelmHandler{
		kubeConfigStore: kubeConfigStore,
		cache:           cache,
		settings:        cli.New(),
	}
}

// ListReposHandler handles listing Helm repositories
func (h *HelmHandler) ListReposHandler(c *gin.Context) {
	helmHandler, err := h.getHelmHandler(c, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	repositories, err := helm.ListRepositories(helmHandler.EnvSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"repositories": repositories,
	})
}

// AddRepoHandler handles adding a Helm repository
func (h *HelmHandler) AddRepoHandler(c *gin.Context) {
	var req helm.AddUpdateRepoRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	helmHandler, err := h.getHelmHandler(c, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	err = helm.AddRepository(req.Name, req.URL, helmHandler.EnvSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "repository added successfully",
	})
}

// UpdateRepoHandler handles updating a Helm repository
func (h *HelmHandler) UpdateRepoHandler(c *gin.Context) {
	var req helm.AddUpdateRepoRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	helmHandler, err := h.getHelmHandler(c, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	err = helm.UpdateRepository(req.Name, req.URL, helmHandler.EnvSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "repository updated successfully",
	})
}

// RemoveRepoHandler handles removing a Helm repository
func (h *HelmHandler) RemoveRepoHandler(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "repository name is required"})
		return
	}

	helmHandler, err := h.getHelmHandler(c, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	err = helm.RemoveRepository(name, helmHandler.EnvSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "repository removed successfully",
	})
}

// ListChartsHandler handles listing Helm charts
func (h *HelmHandler) ListChartsHandler(c *gin.Context) {
	filterTerm := c.Query("filter")

	helmHandler, err := h.getHelmHandler(c, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	chartInfos, err := helm.ListCharts(filterTerm, helmHandler.EnvSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"charts": chartInfos,
	})
}

// ListReleasesHandler handles listing Helm releases
func (h *HelmHandler) ListReleasesHandler(c *gin.Context) {
	var req helm.ListReleaseRequest

	// Get namespace from query
	namespace := c.Query("namespace")
	if namespace != "" {
		req.Namespace = &namespace
	}

	// Check for allNamespaces
	allNamespacesStr := c.Query("allNamespaces")
	if allNamespacesStr == "true" {
		allNamespaces := true
		req.AllNamespaces = &allNamespaces
	}

	// Parse other optional parameters
	if c.Query("all") == "true" {
		all := true
		req.All = &all
	}

	if c.Query("byDate") == "true" {
		byDate := true
		req.ByDate = &byDate
	}

	helmHandler, err := h.getHelmHandler(c, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	releases, err := helm.GetReleases(req, helmHandler.Configuration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"releases": releases,
	})
}

// GetReleaseHandler handles getting a Helm release
func (h *HelmHandler) GetReleaseHandler(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "release name is required"})
		return
	}

	namespace := c.Query("namespace")
	if namespace == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required"})
		return
	}

	helmHandler, err := h.getHelmHandler(c, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if release exists
	_, err = helmHandler.Configuration.Releases.Deployed(name)
	if err == driver.ErrReleaseNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "release not found"})
		return
	}

	getClient := action.NewGet(helmHandler.Configuration)
	result, err := getClient.Run(name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetReleaseHistoryHandler handles getting a Helm release history
func (h *HelmHandler) GetReleaseHistoryHandler(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "release name is required"})
		return
	}

	namespace := c.Query("namespace")
	if namespace == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required"})
		return
	}

	helmHandler, err := h.getHelmHandler(c, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if release exists
	_, err = helmHandler.Configuration.Releases.Deployed(name)
	if err == driver.ErrReleaseNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "release not found"})
		return
	}

	getClient := action.NewHistory(helmHandler.Configuration)
	result, err := getClient.Run(name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"releases": result,
	})
}

// InstallReleaseHandler handles installing a Helm release
func (h *HelmHandler) InstallReleaseHandler(c *gin.Context) {
	var req helm.InstallRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := req.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	helmHandler, err := h.getHelmHandler(c, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	err = helmHandler.SetReleaseStatus("install", req.Name, helm.Processing, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	go func() {
		helmHandler.InstallRelease(req)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "install request accepted",
	})
}

// UpgradeReleaseHandler handles upgrading a Helm release
func (h *HelmHandler) UpgradeReleaseHandler(c *gin.Context) {
	var req helm.UpgradeReleaseRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := req.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	helmHandler, err := h.getHelmHandler(c, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if release exists
	_, err = helmHandler.Configuration.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "release not found"})
		return
	}

	err = helmHandler.SetReleaseStatus("upgrade", req.Name, helm.Processing, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	go func() {
		helmHandler.UpgradeRelease(req)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "upgrade request accepted",
	})
}

// UninstallReleaseHandler handles uninstalling a Helm release
func (h *HelmHandler) UninstallReleaseHandler(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "release name is required"})
		return
	}

	namespace := c.Query("namespace")
	if namespace == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required"})
		return
	}

	helmHandler, err := h.getHelmHandler(c, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if release exists
	_, err = helmHandler.Configuration.Releases.Deployed(name)
	if err == driver.ErrReleaseNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "release not found"})
		return
	}

	err = helmHandler.SetReleaseStatus("uninstall", name, helm.Processing, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	req := helm.UninstallReleaseRequest{
		Name:      name,
		Namespace: namespace,
	}

	go func() {
		helmHandler.UninstallRelease(req)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "uninstall request accepted",
	})
}

// RollbackReleaseHandler handles rolling back a Helm release
func (h *HelmHandler) RollbackReleaseHandler(c *gin.Context) {
	var req helm.RollbackReleaseRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := req.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	helmHandler, err := h.getHelmHandler(c, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if release exists
	_, err = helmHandler.Configuration.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "release not found"})
		return
	}

	err = helmHandler.SetReleaseStatus("rollback", req.Name, helm.Processing, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	go func() {
		helmHandler.RollbackRelease(req)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "rollback request accepted",
	})
}

// GetActionStatusHandler handles getting the status of a Helm action
func (h *HelmHandler) GetActionStatusHandler(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "release name is required"})
		return
	}

	action := c.Query("action")
	if action == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "action is required"})
		return
	}

	// Validate action
	if action != "install" && action != "upgrade" && action != "uninstall" && action != "rollback" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action"})
		return
	}

	namespace := c.Query("namespace")

	helmHandler, err := h.getHelmHandler(c, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	stat, err := helmHandler.GetReleaseStatus(action, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := map[string]string{
		"status": stat.Status,
	}

	if stat.Status == helm.Success {
		response["message"] = "action completed successfully"
	}

	if stat.Status == helm.Failed && stat.Err != nil {
		response["message"] = "action failed with error: " + *stat.Err
	}

	c.JSON(http.StatusAccepted, response)
}

// createClientConfigFromContext creates a clientcmd.ClientConfig directly from the kubeconfig.Context
func createClientConfigFromContext(ctx *kubeconfig.Context) clientcmd.ClientConfig {
	// Create a new api.Config
	config := api.NewConfig()

	// Add cluster info
	config.Clusters[ctx.KubeContext.Cluster] = &api.Cluster{
		Server:                   ctx.Cluster.Server,
		InsecureSkipTLSVerify:    ctx.Cluster.InsecureSkipTLSVerify,
		CertificateAuthority:     ctx.Cluster.CertificateAuthority,
		CertificateAuthorityData: ctx.Cluster.CertificateAuthorityData,
	}

	// Add auth info
	config.AuthInfos[ctx.KubeContext.AuthInfo] = &api.AuthInfo{
		ClientCertificate:     ctx.AuthInfo.ClientCertificate,
		ClientCertificateData: ctx.AuthInfo.ClientCertificateData,
		ClientKey:             ctx.AuthInfo.ClientKey,
		ClientKeyData:         ctx.AuthInfo.ClientKeyData,
		Token:                 ctx.AuthInfo.Token,
		Username:              ctx.AuthInfo.Username,
		Password:              ctx.AuthInfo.Password,
	}

	// If there's an auth provider, add it
	if ctx.AuthInfo.AuthProvider != nil {
		config.AuthInfos[ctx.KubeContext.AuthInfo].AuthProvider = &api.AuthProviderConfig{
			Name:   ctx.AuthInfo.AuthProvider.Name,
			Config: ctx.AuthInfo.AuthProvider.Config,
		}
	}

	// Add context
	config.Contexts[ctx.Name] = &api.Context{
		Cluster:   ctx.KubeContext.Cluster,
		AuthInfo:  ctx.KubeContext.AuthInfo,
		Namespace: ctx.KubeContext.Namespace,
	}

	// Set current context
	config.CurrentContext = ctx.Name

	// Create ClientConfig from api.Config
	return clientcmd.NewDefaultClientConfig(*config, &clientcmd.ConfigOverrides{})
}

// getHelmHandler returns a Helm handler for the given namespace
func (h *HelmHandler) getHelmHandler(c *gin.Context, namespace string) (*helm.Handler, error) {
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		// Try to get from query
		clusterName = c.Query("cluster")
	}

	if clusterName == "" {
		return nil, errors.New("cluster name is required")
	}

	ctx, err := h.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "getting kubeconfig context")
		return nil, fmt.Errorf("failed to get kubeconfig context: %v", err)
	}

	// Create a clientConfig without relying on a method from kubeconfig.Context
	clientConfig := createClientConfigFromContext(ctx)

	// Create and return the helm handler
	helmHandler, err := helm.NewHandler(clientConfig, h.cache, namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "creating helm handler")
		return nil, fmt.Errorf("failed to create helm handler: %v", err)
	}

	return helmHandler, nil
}

// HelmValuesProxyHandler is a handler for proxying Helm chart values from Artifact Hub
func (h *HelmHandler) HelmValuesProxyHandler(c *gin.Context) {
	packageID := c.Query("package")
	version := c.Query("version")

	if packageID == "" || version == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "package ID and version are required"})
		return
	}

	// Create URL to fetch values from Artifact Hub
	url := fmt.Sprintf("https://artifacthub.io/api/v1/packages/%s/%s/values", packageID, version)

	// Make request to Artifact Hub
	resp, err := http.Get(url)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to fetch values: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Check if response is successful
	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": fmt.Sprintf("failed to fetch values, status: %d", resp.StatusCode)})
		return
	}

	// Read response body
	valuesData, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to read values: %v", err)})
		return
	}

	// Set content type header (important for YAML)
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, string(valuesData))
}

// HelmVersionsProxyHandler is a handler for proxying Helm chart versions from Artifact Hub
func (h *HelmHandler) HelmVersionsProxyHandler(c *gin.Context) {
	repoName := c.Query("repo")
	chartName := c.Query("chart")

	if repoName == "" || chartName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "repository name and chart name are required"})
		return
	}

	// Create URL to fetch versions from Artifact Hub
	url := fmt.Sprintf("https://artifacthub.io/api/v1/packages/helm/%s/%s/feed/rss", repoName, chartName)

	// Make request to Artifact Hub
	resp, err := http.Get(url)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to fetch versions: %v", err)})
		return
	}
	defer resp.Body.Close()

	// Check if response is successful
	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": fmt.Sprintf("failed to fetch versions, status: %d", resp.StatusCode)})
		return
	}

	// Read response body
	versionsData, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to read versions: %v", err)})
		return
	}

	// Set content type header for XML
	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.String(http.StatusOK, string(versionsData))
}
