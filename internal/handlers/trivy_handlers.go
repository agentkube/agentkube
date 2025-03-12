package handlers

import (
	"fmt"
	"net/http"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/trivy"
	"github.com/gin-gonic/gin"
)

// InstallTrivyOperator handles the installation of Trivy operator
func InstallTrivyOperator(c *gin.Context) {
	namespace := c.DefaultQuery("namespace", "trivy-system")

	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Install the operator
	if err := trivyController.InstallOperator(c.Request.Context(), namespace); err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName, "namespace": namespace}, err, "installing Trivy operator")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to install Trivy operator: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Trivy operator installed successfully",
		"namespace": namespace,
		"cluster":   clusterName,
	})
}

// UninstallTrivyOperator handles the uninstallation of Trivy operator
func UninstallTrivyOperator(c *gin.Context) {
	namespace := c.DefaultQuery("namespace", "trivy-system")

	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Uninstall the operator
	if err := trivyController.UninstallOperator(c.Request.Context(), namespace); err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName, "namespace": namespace}, err, "uninstalling Trivy operator")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to uninstall Trivy operator: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Trivy operator uninstalled successfully",
		"cluster": clusterName,
	})
}

// GetVulnerabilityReports handles retrieving vulnerability reports
func GetVulnerabilityReports(c *gin.Context) {
	namespace := c.Query("namespace")

	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Get vulnerability reports
	reports, err := trivyController.GetVulnerabilityReports(c.Request.Context(), namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName, "namespace": namespace}, err, "getting vulnerability reports")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get vulnerability reports: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reports":   reports,
		"cluster":   clusterName,
		"namespace": namespace,
	})
}

// GetClusterComplianceReports handles retrieving cluster compliance reports
func GetClusterComplianceReports(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Get cluster compliance reports
	reports, err := trivyController.GetClusterComplianceReports(c.Request.Context())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting cluster compliance reports")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get cluster compliance reports: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reports": reports,
		"cluster": clusterName,
	})
}

// GetConfigAuditReports handles retrieving configuration audit reports
func GetConfigAuditReports(c *gin.Context) {
	namespace := c.Query("namespace")

	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Get config audit reports
	reports, err := trivyController.GetConfigAuditReports(c.Request.Context(), namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName, "namespace": namespace}, err, "getting config audit reports")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get config audit reports: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reports":   reports,
		"cluster":   clusterName,
		"namespace": namespace,
	})
}

// GetTrivyStatus handles checking if Trivy operator is installed
func GetTrivyStatus(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Check if Trivy is installed
	installed, err := trivyController.IsOperatorInstalled(c.Request.Context())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "checking Trivy operator status")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to check Trivy operator status: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"installed": installed,
		"cluster":   clusterName,
	})
}

// GetComplianceDetails handles retrieving detailed information about a specific compliance report
func GetComplianceDetails(c *gin.Context) {
	// Get context from the cluster manager
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Get the cluster context key from the request
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cluster name is required"})
		return
	}

	// Get the report name from the request
	reportName := c.Param("reportName")
	if reportName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Report name is required"})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Get REST config for the context
	restConfig, err := context.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "getting REST config")
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get REST config: %v", err)})
		return
	}

	// Create Trivy controller
	trivyController, err := trivy.NewController(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "creating Trivy controller")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to create Trivy controller: %v", err),
		})
		return
	}

	// Get detailed compliance report
	reportDetails, err := trivyController.GetComplianceDetails(c.Request.Context(), reportName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName, "reportName": reportName}, err, "getting compliance details")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get compliance details: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"report":  reportDetails,
		"cluster": clusterName,
	})
}
