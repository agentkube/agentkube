package helm

import (
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/go-playground/validator/v10"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/downloader"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/release"
	"sigs.k8s.io/yaml"
)

// ListReleaseRequest represents options for listing releases
type ListReleaseRequest struct {
	AllNamespaces *bool   `json:"allNamespaces,omitempty"`
	Namespace     *string `json:"namespace,omitempty"`
	All           *bool   `json:"all,omitempty"`
	ByDate        *bool   `json:"byDate,omitempty"`
	Limit         *int    `json:"limit,omitempty"`
	Offset        *int    `json:"offset,omitempty"`
	Filter        *string `json:"filter,omitempty"`
	Uninstalled   *bool   `json:"uninstalled,omitempty"`
	Superseded    *bool   `json:"superseded,omitempty"`
	Uninstalling  *bool   `json:"uninstalling,omitempty"`
	Deployed      *bool   `json:"deployed,omitempty"`
	Failed        *bool   `json:"failed,omitempty"`
	Pending       *bool   `json:"pending,omitempty"`
}

// CommonInstallUpdateRequest contains fields common to both Install and Upgrade requests
type CommonInstallUpdateRequest struct {
	Name        string `json:"name" validate:"required"`
	Namespace   string `json:"namespace" validate:"required"`
	Description string `json:"description" validate:"required"`
	Values      string `json:"values"`
	Chart       string `json:"chart" validate:"required"`
	Version     string `json:"version" validate:"required"`
}

// InstallRequest represents a request to install a Helm chart
type InstallRequest struct {
	CommonInstallUpdateRequest
	CreateNamespace  bool `json:"createNamespace"`
	DependencyUpdate bool `json:"dependencyUpdate"`
}

// Validate validates the InstallRequest
func (req *InstallRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

// UpgradeReleaseRequest represents a request to upgrade a Helm release
type UpgradeReleaseRequest struct {
	CommonInstallUpdateRequest
	Install *bool `json:"install"`
}

// Validate validates the UpgradeReleaseRequest
func (req *UpgradeReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

// UninstallReleaseRequest represents a request to uninstall a Helm release
type UninstallReleaseRequest struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

// RollbackReleaseRequest represents a request to rollback a Helm release
type RollbackReleaseRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
	Revision  int    `json:"revision" validate:"required"`
}

// Validate validates the RollbackReleaseRequest
func (req *RollbackReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

// ActionStatusRequest represents a request for checking the status of an action
type ActionStatusRequest struct {
	Name   string `json:"name" validate:"required"`
	Action string `json:"action" validate:"required"`
}

// Validate validates the ActionStatusRequest
func (a *ActionStatusRequest) Validate() error {
	validate := validator.New()

	err := validate.Struct(a)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"action": a.Action, "releaseName": a.Name},
			err, "validating request for status")

		return err
	}

	if a.Action != "install" && a.Action != "upgrade" && a.Action != "uninstall" && a.Action != "rollback" {
		return errors.New("invalid action")
	}

	return nil
}

// GetReleases returns releases based on the provided ListReleaseRequest
func GetReleases(req ListReleaseRequest, config *action.Configuration) ([]*release.Release, error) {
	// Get list client
	listClient := action.NewList(config)

	// Apply options from request
	if req.AllNamespaces != nil && *req.AllNamespaces {
		listClient.AllNamespaces = *req.AllNamespaces
	}

	if req.All != nil && *req.All {
		listClient.All = *req.All
	}

	if req.ByDate != nil && *req.ByDate {
		listClient.ByDate = *req.ByDate
	}

	if req.Limit != nil && *req.Limit > 0 {
		listClient.Limit = *req.Limit
	}

	if req.Offset != nil && *req.Offset > 0 {
		listClient.Offset = *req.Offset
	}

	if req.Filter != nil && *req.Filter != "" {
		listClient.Filter = *req.Filter
	}

	if req.Uninstalled != nil && *req.Uninstalled {
		listClient.Uninstalled = *req.Uninstalled
	}

	if req.Superseded != nil && *req.Superseded {
		listClient.Superseded = *req.Superseded
	}

	if req.Uninstalling != nil && *req.Uninstalling {
		listClient.Uninstalling = *req.Uninstalling
	}

	if req.Deployed != nil && *req.Deployed {
		listClient.Deployed = *req.Deployed
	}

	if req.Failed != nil && *req.Failed {
		listClient.Failed = *req.Failed
	}

	if req.Pending != nil && *req.Pending {
		listClient.Pending = *req.Pending
	}

	listClient.Short = true
	listClient.SetStateMask()

	return listClient.Run()
}

// InstallRelease installs a Helm chart release
func (h *Handler) InstallRelease(req InstallRequest) {
	// Get install client
	installClient := action.NewInstall(h.Configuration)
	installClient.ReleaseName = req.Name
	installClient.Namespace = req.Namespace
	installClient.Description = req.Description
	installClient.CreateNamespace = req.CreateNamespace
	installClient.ChartPathOptions.Version = req.Version
	
	// Configure timeout and wait settings
	installClient.Wait = true
	installClient.WaitForJobs = true
	installClient.Timeout = 10 * time.Minute  // Set reasonable timeout for complex charts

	chart, err := h.getChart("install", req.Chart, req.Name,
		installClient.ChartPathOptions, req.DependencyUpdate, h.EnvSettings)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "getting chart")
		h.SetReleaseStatusSilent("install", req.Name, Failed, err)
		return
	}

	values := make(map[string]interface{})

	decodedBytes, err := base64.StdEncoding.DecodeString(req.Values)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "decoding values")
		h.SetReleaseStatusSilent("install", req.Name, Failed, err)
		return
	}

	err = yaml.Unmarshal(decodedBytes, &values)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "unmarshalling values")
		h.SetReleaseStatusSilent("install", req.Name, Failed, err)
		return
	}

	// Install chart
	_, err = installClient.Run(chart, values)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "installing chart")
		h.SetReleaseStatusSilent("install", req.Name, Failed, err)
		return
	}

	logger.Log(logger.LevelInfo, map[string]string{"chart": req.Chart, "releaseName": req.Name},
		nil, "chart installed successfully")

	h.SetReleaseStatusSilent("install", req.Name, Success, nil)
}

// UpgradeRelease upgrades a Helm chart release
func (h *Handler) UpgradeRelease(req UpgradeReleaseRequest) {
	// Find chart
	upgradeClient := action.NewUpgrade(h.Configuration)
	upgradeClient.Namespace = req.Namespace
	upgradeClient.Description = req.Description
	upgradeClient.ChartPathOptions.Version = req.Version
	
	// Configure timeout and wait settings
	upgradeClient.Wait = true
	upgradeClient.WaitForJobs = true
	upgradeClient.Timeout = 10 * time.Minute  // Set reasonable timeout for complex charts

	chart, err := h.getChart("upgrade", req.Chart, req.Name, upgradeClient.ChartPathOptions, true, h.EnvSettings)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, Failed, "getting chart")
		return
	}

	values := make(map[string]interface{})

	valuesStr, err := base64.StdEncoding.DecodeString(req.Values)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, Failed, "values decoding failed")
		return
	}

	err = yaml.Unmarshal(valuesStr, &values)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, Failed, "values un-marshalling failed")
		return
	}

	// Upgrade chart
	_, err = upgradeClient.Run(req.Name, chart, values)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, Failed, "chart upgrade failed")
		return
	}

	h.logActionState(zlog.Info(), nil, "upgrade", req.Chart, req.Name, Success, "chart upgrade is successful")
}

// UninstallRelease uninstalls a Helm chart release
func (h *Handler) UninstallRelease(req UninstallReleaseRequest) {
	// Get uninstall client
	uninstallClient := action.NewUninstall(h.Configuration)
	
	// Configure timeout and wait settings
	uninstallClient.Wait = true
	uninstallClient.Timeout = 5 * time.Minute  // Reasonable timeout for uninstall

	status := Success

	_, err := uninstallClient.Run(req.Name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name, "namespace": req.Namespace},
			err, "uninstalling release")

		status = Failed
	}

	h.SetReleaseStatusSilent("uninstall", req.Name, status, err)
}

// RollbackRelease rolls back a Helm chart release to a specific revision
func (h *Handler) RollbackRelease(req RollbackReleaseRequest) {
	rollbackClient := action.NewRollback(h.Configuration)
	rollbackClient.Version = req.Revision

	status := Success

	err := rollbackClient.Run(req.Name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name},
			err, "rolling back release")

		status = Failed
	}

	h.SetReleaseStatusSilent("rollback", req.Name, status, err)
}

// getChart returns the chart, and err, and if dependencyUpdate is true then we also update the chart dependencies
func (h *Handler) getChart(
	actionName string,
	reqChart string,
	reqName string,
	chartPathOptions action.ChartPathOptions,
	dependencyUpdate bool,
	settings *cli.EnvSettings,
) (*chart.Chart, error) {
	// locate chart
	chartPath, err := chartPathOptions.LocateChart(reqChart, settings)
	if err != nil {
		h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, Failed, "locating chart")
		return nil, err
	}

	// load chart
	chart, err := loader.Load(chartPath)
	if err != nil {
		h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, Failed, "loading chart")
		return nil, err
	}

	// chart is installable only if it is of type application or empty
	if chart.Metadata.Type != "" && chart.Metadata.Type != "application" {
		err := fmt.Errorf("chart is not installable: %s", chart.Metadata.Type)
		h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, Failed, "chart is not installable")
		return nil, err
	}

	// Update chart dependencies
	if chart.Metadata.Dependencies != nil && dependencyUpdate {
		err = action.CheckDependencies(chart, chart.Metadata.Dependencies)
		if err != nil {
			manager := &downloader.Manager{
				ChartPath:        chartPath,
				Keyring:          chartPathOptions.Keyring,
				SkipUpdate:       false,
				Getters:          getter.All(settings),
				RepositoryConfig: settings.RepositoryConfig,
				RepositoryCache:  settings.RepositoryCache,
			}

			err = manager.Update()
			if err != nil {
				h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, Failed, "updating dependencies")
				return nil, err
			}
		}
	}

	return chart, nil
}

// logActionState logs the action state
func (h *Handler) logActionState(zlog *zerolog.Event,
	err error,
	action string,
	chart string,
	releaseName string,
	status string,
	message string,
) {
	if err != nil {
		zlog = zlog.Err(err)
	}

	zlog.Str("chart", chart).
		Str("action", action).
		Str("releaseName", releaseName).
		Str("status", status).
		Msg(message)

	h.SetReleaseStatusSilent(action, releaseName, status, err)
}
