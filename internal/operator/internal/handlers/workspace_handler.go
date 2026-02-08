package handlers

import (
	"net/http"

	"github.com/agentkube/operator/pkg/workspace"
	"github.com/gin-gonic/gin"
)

type WorkspaceHandler struct {
	workspaceManager *workspace.WorkspaceManager
}

func NewWorkspaceHandler() *WorkspaceHandler {
	return &WorkspaceHandler{
		workspaceManager: workspace.NewWorkspaceManager(),
	}
}

type CreateWorkspaceRequest struct {
	Name        string                  `json:"name" binding:"required"`
	Description string                  `json:"description"`
	Clusters    []workspace.ClusterInfo `json:"clusters"`
}

type UpdateWorkspaceRequest struct {
	Name        string                  `json:"name"`
	Description string                  `json:"description"`
	Clusters    []workspace.ClusterInfo `json:"clusters"`
}

type AddClusterRequest struct {
	Name    string `json:"name" binding:"required"`
	Context string `json:"context" binding:"required"`
	Server  string `json:"server" binding:"required"`
}

func (wh *WorkspaceHandler) ListWorkspaces(c *gin.Context) {
	workspaces, err := wh.workspaceManager.ListWorkspaces()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to list workspaces",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"workspaces": workspaces,
	})
}

func (wh *WorkspaceHandler) GetWorkspace(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Workspace name is required",
		})
		return
	}

	workspace, err := wh.workspaceManager.GetWorkspace(name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "Workspace not found",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, workspace)
}

func (wh *WorkspaceHandler) CreateWorkspace(c *gin.Context) {
	var req CreateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
		return
	}

	workspace := workspace.Workspace{
		Name:        req.Name,
		Description: req.Description,
		Clusters:    req.Clusters,
	}

	if err := wh.workspaceManager.CreateWorkspace(workspace); err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error":   "Failed to create workspace",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":   "Workspace created successfully",
		"workspace": workspace,
	})
}

func (wh *WorkspaceHandler) UpdateWorkspace(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Workspace name is required",
		})
		return
	}

	var req UpdateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
		return
	}

	existingWorkspace, err := wh.workspaceManager.GetWorkspace(name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "Workspace not found",
			"details": err.Error(),
		})
		return
	}

	updatedWorkspace := workspace.Workspace{
		Name:        name,
		Description: existingWorkspace.Description,
		Clusters:    existingWorkspace.Clusters,
	}

	if req.Name != "" {
		updatedWorkspace.Name = req.Name
	}
	if req.Description != "" {
		updatedWorkspace.Description = req.Description
	}
	if req.Clusters != nil {
		updatedWorkspace.Clusters = req.Clusters
	}

	if err := wh.workspaceManager.UpdateWorkspace(name, updatedWorkspace); err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error":   "Failed to update workspace",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Workspace updated successfully",
		"workspace": updatedWorkspace,
	})
}

func (wh *WorkspaceHandler) DeleteWorkspace(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Workspace name is required",
		})
		return
	}

	if err := wh.workspaceManager.DeleteWorkspace(name); err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "Failed to delete workspace",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Workspace deleted successfully",
	})
}

func (wh *WorkspaceHandler) AddClusterToWorkspace(c *gin.Context) {
	workspaceName := c.Param("name")
	if workspaceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Workspace name is required",
		})
		return
	}

	var req AddClusterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
		return
	}

	cluster := workspace.ClusterInfo{
		Name:    req.Name,
		Context: req.Context,
		Server:  req.Server,
	}

	if err := wh.workspaceManager.AddClusterToWorkspace(workspaceName, cluster); err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error":   "Failed to add cluster to workspace",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Cluster added to workspace successfully",
		"cluster": cluster,
	})
}

func (wh *WorkspaceHandler) RemoveClusterFromWorkspace(c *gin.Context) {
	workspaceName := c.Param("name")
	clusterName := c.Param("clusterName")

	if workspaceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Workspace name is required",
		})
		return
	}

	if clusterName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Cluster name is required",
		})
		return
	}

	if err := wh.workspaceManager.RemoveClusterFromWorkspace(workspaceName, clusterName); err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "Failed to remove cluster from workspace",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Cluster removed from workspace successfully",
	})
}
