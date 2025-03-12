package trivy

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/agentkube/operator/pkg/logger"

	helmclient "github.com/mittwald/go-helm-client"
	"helm.sh/helm/v3/pkg/repo"
	apiextclientset "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

var (
	// Default configuration values
	defaultHelmRepo     = "https://aquasecurity.github.io/helm-charts/"
	defaultChartVersion = "0.13.0"
	defaultChartName    = "trivy-operator"
	defaultRepoName     = "aqua"
	defaultReleaseName  = "trivy-operator"
)

// Controller manages Trivy operator and vulnerability scanning
type Controller struct {
	restConfig *rest.Config
	helm       helmclient.Client
}

// NewController creates a new Trivy controller instance
func NewController(restConfig *rest.Config) (*Controller, error) {
	// Initialize Helm client
	helmClient, err := helmclient.New(&helmclient.Options{})
	if err != nil {
		return nil, fmt.Errorf("failed to create helm client: %v", err)
	}

	return &Controller{
		restConfig: restConfig,
		helm:       helmClient,
	}, nil
}

// InstallOperator installs the Trivy operator using Helm
func (c *Controller) InstallOperator(ctx context.Context, namespace string) error {
	// Add Helm repository
	chartRepo := repo.Entry{
		Name: getEnvOrDefault("TRIVY_REPO_NAME", defaultRepoName),
		URL:  getEnvOrDefault("TRIVY_REPO_URL", defaultHelmRepo),
	}

	if err := c.helm.AddOrUpdateChartRepo(chartRepo); err != nil {
		return fmt.Errorf("failed to add helm repo: %v", err)
	}

	// Prepare chart installation
	chartSpec := helmclient.ChartSpec{
		ReleaseName:     getEnvOrDefault("TRIVY_RELEASE_NAME", defaultReleaseName),
		ChartName:       fmt.Sprintf("%s/%s", chartRepo.Name, defaultChartName),
		Namespace:       namespace,
		Version:         getEnvOrDefault("TRIVY_CHART_VERSION", defaultChartVersion),
		UpgradeCRDs:     true,
		Wait:            true,
		Timeout:         300,
		CreateNamespace: true,
	}

	// Install/upgrade the chart
	if _, err := c.helm.InstallOrUpgradeChart(ctx, &chartSpec, nil); err != nil {
		return fmt.Errorf("failed to install/upgrade Trivy operator: %v", err)
	}

	return nil
}

// UninstallOperator removes the Trivy operator
func (c *Controller) UninstallOperator(ctx context.Context, namespace string) error {
	chartSpec := helmclient.ChartSpec{
		ReleaseName: getEnvOrDefault("TRIVY_RELEASE_NAME", defaultReleaseName),
		Namespace:   namespace,
	}

	if err := c.helm.UninstallRelease(&chartSpec); err != nil {
		return fmt.Errorf("failed to uninstall Trivy operator: %v", err)
	}

	return nil
}

type VulnerabilitySummary struct {
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Unknown  int `json:"unknown"`
}

// OwnerReference contains the basic identifying information about the owner
type OwnerReference struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	APIVersion string `json:"apiVersion"`
}

// SimplifiedVulnerabilityReport contains only the requested fields
type SimplifiedVulnerabilityReport struct {
	Name              string               `json:"name"`
	Namespace         string               `json:"namespace"`
	Age               string               `json:"age"`
	CreationTimestamp time.Time            `json:"creationTimestamp"`
	Group             string               `json:"group"`
	Version           string               `json:"version"`
	Summary           VulnerabilitySummary `json:"summary"`
	Owner             *OwnerReference      `json:"owner,omitempty"`
}

// GetVulnerabilityReports retrieves vulnerability reports from the cluster
func (c *Controller) GetVulnerabilityReports(ctx context.Context, namespace string) ([]SimplifiedVulnerabilityReport, error) {
	// Create dynamic client to interact with CRDs
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	// Define the GVR for VulnerabilityReports
	vulReportsGVR := schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "vulnerabilityreports",
	}

	// List the vulnerability reports
	var vulReportsList *unstructured.UnstructuredList
	if namespace != "" {
		vulReportsList, err = dynamicClient.Resource(vulReportsGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		vulReportsList, err = dynamicClient.Resource(vulReportsGVR).List(ctx, metav1.ListOptions{})
	}

	if err != nil {
		return nil, fmt.Errorf("failed to list vulnerability reports: %v", err)
	}

	// Process the reports
	reports := make([]SimplifiedVulnerabilityReport, 0, len(vulReportsList.Items))
	for _, item := range vulReportsList.Items {
		report, err := simplifyVulnerabilityReport(item)
		if err != nil {
			logger.Log(logger.LevelWarn, nil, err, fmt.Sprintf("failed to simplify report %s", item.GetName()))
			continue
		}
		reports = append(reports, report)
	}

	return reports, nil
}

type ComplianceSummary struct {
	FailCount int `json:"failCount"`
	PassCount int `json:"passCount"`
}

// SimplifiedComplianceReport contains only the requested fields
type SimplifiedComplianceReport struct {
	Name              string            `json:"name"`
	Group             string            `json:"group"`
	Version           string            `json:"version"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Summary           ComplianceSummary `json:"summary"`
}

// GetClusterComplianceReports retrieves all cluster compliance reports
func (c *Controller) GetClusterComplianceReports(ctx context.Context) ([]SimplifiedComplianceReport, error) {
	// Create dynamic client to interact with CRDs
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	// Define the GVR for ClusterComplianceReports
	complianceReportsGVR := schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "clustercompliancereports",
	}

	// List the compliance reports
	complianceReportsList, err := dynamicClient.Resource(complianceReportsGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			// Return empty list if CRD not found (Trivy might be installed but this feature not enabled)
			return []SimplifiedComplianceReport{}, nil
		}
		return nil, fmt.Errorf("failed to list cluster compliance reports: %v", err)
	}

	// Process the reports
	reports := make([]SimplifiedComplianceReport, 0, len(complianceReportsList.Items))
	for _, item := range complianceReportsList.Items {
		report := SimplifiedComplianceReport{
			Name:              item.GetName(),
			Group:             item.GroupVersionKind().Group,
			Version:           item.GroupVersionKind().Version,
			CreationTimestamp: item.GetCreationTimestamp().Time,
			Summary:           ComplianceSummary{},
		}

		// Try to extract summary data
		status, found, _ := unstructured.NestedMap(item.Object, "status")
		if found {
			summary, found, _ := unstructured.NestedMap(status, "summary")
			if found {
				failCount, found, _ := unstructured.NestedFloat64(summary, "failCount")
				if found {
					report.Summary.FailCount = int(failCount)
				}
				passCount, found, _ := unstructured.NestedFloat64(summary, "passCount")
				if found {
					report.Summary.PassCount = int(passCount)
				}
			}
		}

		reports = append(reports, report)
	}

	return reports, nil
}

// GetComplianceDetails retrieves detailed information about a specific compliance report
func (c *Controller) GetComplianceDetails(ctx context.Context, reportName string) (map[string]interface{}, error) {
	// Create dynamic client to interact with CRDs
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	// Define the GVR for ClusterComplianceReports
	complianceReportsGVR := schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "clustercompliancereports",
	}

	// Get the specific compliance report
	report, err := dynamicClient.Resource(complianceReportsGVR).Get(ctx, reportName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get compliance report %s: %v", reportName, err)
	}

	// Extract the compliance checks from the report status
	reportStatus, found, err := unstructured.NestedMap(report.Object, "status")
	if err != nil || !found {
		return nil, fmt.Errorf("failed to extract status from report: %v", err)
	}

	// Create a simplified representation with just the necessary details
	result := map[string]interface{}{
		"name":              report.GetName(),
		"creationTimestamp": report.GetCreationTimestamp().Time,
		"group":             report.GroupVersionKind().Group,
		"version":           report.GroupVersionKind().Version,
	}

	// Extract summary information if available
	summaryReport, found, _ := unstructured.NestedMap(reportStatus, "summaryReport")
	if found {
		result["summaryReport"] = summaryReport
	}

	// Extract checks if available
	controlChecks, found, _ := unstructured.NestedSlice(summaryReport, "controlCheck")
	if found {
		// Process controlChecks into a more usable format
		processedChecks := make([]map[string]interface{}, 0, len(controlChecks))

		for _, checkObj := range controlChecks {
			checkMap, ok := checkObj.(map[string]interface{})
			if !ok {
				continue
			}

			// Create a simplified check object with the core information
			check := map[string]interface{}{
				"id":       checkMap["id"],
				"name":     checkMap["name"],
				"severity": checkMap["severity"],
			}

			// Try to extract other useful information
			if totalFail, ok := checkMap["totalFail"].(float64); ok {
				check["totalFail"] = int(totalFail)
			} else {
				check["totalFail"] = 0
			}

			processedChecks = append(processedChecks, check)
		}

		result["controlChecks"] = processedChecks
	}

	return result, nil
}

// ConfigAuditReport represents a simplified config audit report
type ConfigAuditReport struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
}

// GetConfigAuditReports retrieves configuration audit reports
func (c *Controller) GetConfigAuditReports(ctx context.Context, namespace string) ([]ConfigAuditReport, error) {
	// Create dynamic client to interact with CRDs
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	// Define the GVR for ConfigAuditReports
	configAuditReportsGVR := schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "configauditreports",
	}

	// List the config audit reports
	var configAuditList *unstructured.UnstructuredList
	if namespace != "" {
		configAuditList, err = dynamicClient.Resource(configAuditReportsGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		configAuditList, err = dynamicClient.Resource(configAuditReportsGVR).List(ctx, metav1.ListOptions{})
	}

	if err != nil {
		if errors.IsNotFound(err) {
			// Return empty list if CRD not found (Trivy might be installed but this feature not enabled)
			return []ConfigAuditReport{}, nil
		}
		return nil, fmt.Errorf("failed to list config audit reports: %v", err)
	}

	// Process the reports
	reports := make([]ConfigAuditReport, 0, len(configAuditList.Items))
	for _, item := range configAuditList.Items {
		// Extract owner information if available to determine resource kind
		var kind string
		ownerRefs := item.GetOwnerReferences()
		if len(ownerRefs) > 0 {
			kind = ownerRefs[0].Kind
		} else {
			kind = "Unknown"
		}

		// Try to determine status
		status := "Unknown"
		reportStatus, found, _ := unstructured.NestedMap(item.Object, "report", "summary")
		if found {
			if lowCount, ok, _ := unstructured.NestedFloat64(reportStatus, "lowCount"); ok && lowCount > 0 {
				status = "Warning"
			}
			if mediumCount, ok, _ := unstructured.NestedFloat64(reportStatus, "mediumCount"); ok && mediumCount > 0 {
				status = "Warning"
			}
			if highCount, ok, _ := unstructured.NestedFloat64(reportStatus, "highCount"); ok && highCount > 0 {
				status = "Failed"
			}
			if criticalCount, ok, _ := unstructured.NestedFloat64(reportStatus, "criticalCount"); ok && criticalCount > 0 {
				status = "Critical"
			}
		}

		report := ConfigAuditReport{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Kind:      kind,
			Status:    status,
		}

		reports = append(reports, report)
	}

	return reports, nil
}

// IsOperatorInstalled checks if Trivy operator is installed
func (c *Controller) IsOperatorInstalled(ctx context.Context) (bool, error) {
	// First check via Helm releases
	releases, err := c.helm.ListDeployedReleases()
	if err == nil {
		releaseName := getEnvOrDefault("TRIVY_RELEASE_NAME", defaultReleaseName)
		for _, release := range releases {
			if release.Name == releaseName {
				return true, nil
			}
		}
	}

	// If Helm check fails or doesn't find Trivy, check via API directly
	// Create a kubernetes client to check for Trivy resources
	clientset, err := kubernetes.NewForConfig(c.restConfig)
	if err != nil {
		return false, fmt.Errorf("failed to create kubernetes client: %v", err)
	}

	// Check for the Trivy deployment in the default namespace or trivy-system
	trivyNamespaces := []string{"trivy-system", "default"}
	for _, ns := range trivyNamespaces {
		deployments, err := clientset.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{
			LabelSelector: "app.kubernetes.io/name=trivy-operator",
		})

		if err != nil {
			// Just log the error and continue checking - namespace might not exist
			continue
		}

		if len(deployments.Items) > 0 {
			return true, nil
		}
	}

	// Check for VulnerabilityReport CRD existence, which is a definitive sign of Trivy being installed
	apiextClient, err := apiextclientset.NewForConfig(c.restConfig)
	if err != nil {
		return false, fmt.Errorf("failed to create apiextensions client: %v", err)
	}

	crd, err := apiextClient.ApiextensionsV1().CustomResourceDefinitions().Get(ctx, "vulnerabilityreports.aquasecurity.github.io", metav1.GetOptions{})
	if err == nil && crd != nil {
		return true, nil
	}

	// Check if we can list vulnerabilityreports, which would indicate Trivy is working
	dynamicClient, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return false, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	vulReportsGVR := schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "vulnerabilityreports",
	}

	_, err = dynamicClient.Resource(vulReportsGVR).List(ctx, metav1.ListOptions{})
	if err == nil {
		// We successfully listed vulnerability reports - Trivy is installed and working
		return true, nil
	}

	return false, nil
}

// Helper function to get environment variables with defaults
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// simplifyVulnerabilityReport converts an unstructured vulnerability report to a SimplifiedVulnerabilityReport
func simplifyVulnerabilityReport(report unstructured.Unstructured) (SimplifiedVulnerabilityReport, error) {
	simplified := SimplifiedVulnerabilityReport{
		Name:              report.GetName(),
		Namespace:         report.GetNamespace(),
		CreationTimestamp: report.GetCreationTimestamp().Time,
		Age:               time.Since(report.GetCreationTimestamp().Time).Round(time.Second).String(),
		Group:             report.GroupVersionKind().Group,
		Version:           report.GroupVersionKind().Version,
		Summary:           VulnerabilitySummary{},
	}

	// Extract owner references if available
	ownerRefs := report.GetOwnerReferences()
	if len(ownerRefs) > 0 {
		simplified.Owner = &OwnerReference{
			Name:       ownerRefs[0].Name,
			Kind:       ownerRefs[0].Kind,
			APIVersion: ownerRefs[0].APIVersion,
		}
	}

	// Try to extract vulnerability summary
	reportObj, found, err := unstructured.NestedMap(report.Object, "report")
	if err != nil || !found {
		return simplified, nil // Return what we have so far
	}

	// Count vulnerabilities by severity
	vulnerabilities, found, err := unstructured.NestedSlice(reportObj, "vulnerabilities")
	if err != nil || !found {
		return simplified, nil // Return what we have so far
	}

	// Process each vulnerability and count by severity
	for _, vuln := range vulnerabilities {
		vulnMap, ok := vuln.(map[string]interface{})
		if !ok {
			continue
		}

		severity, ok := vulnMap["severity"].(string)
		if !ok {
			continue
		}

		switch severity {
		case "CRITICAL":
			simplified.Summary.Critical++
		case "HIGH":
			simplified.Summary.High++
		case "MEDIUM":
			simplified.Summary.Medium++
		case "LOW":
			simplified.Summary.Low++
		default:
			simplified.Summary.Unknown++
		}
	}

	return simplified, nil
}
