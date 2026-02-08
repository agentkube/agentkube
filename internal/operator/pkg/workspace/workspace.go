package workspace

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type ClusterInfo struct {
	Name    string `json:"name"`
	Context string `json:"context"`
	Server  string `json:"server"`
}

type Workspace struct {
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Clusters    []ClusterInfo `json:"clusters"`
}

type WorkspaceData struct {
	Workspaces []Workspace `json:"workspaces"`
}

type WorkspaceManager struct {
	filePath string
}

func NewWorkspaceManager() *WorkspaceManager {
	return &WorkspaceManager{
		filePath: GetWorkspaceFilePath(),
	}
}

func GetWorkspaceFilePath() string {
	return filepath.Join(getConfigDir(), "workspace.json")
}

func getConfigDir() string {
	if configDir := os.Getenv("CONFIG"); configDir != "" {
		return configDir
	}

	var home string
	if runtime.GOOS == "windows" {
		home = os.Getenv("USERPROFILE")
	} else {
		home = os.Getenv("HOME")
	}

	agentKubeDir := filepath.Join(home, ".agentkube")
	if _, err := os.Stat(agentKubeDir); os.IsNotExist(err) {
		os.MkdirAll(agentKubeDir, 0755)
	}
	return agentKubeDir
}

func (wm *WorkspaceManager) InitializeFile() error {
	if _, err := os.Stat(wm.filePath); os.IsNotExist(err) {
		emptyData := WorkspaceData{
			Workspaces: []Workspace{},
		}
		return wm.saveData(&emptyData)
	}
	return nil
}

func (wm *WorkspaceManager) loadData() (*WorkspaceData, error) {
	file, err := os.Open(wm.filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open workspace file: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("failed to read workspace file: %w", err)
	}

	if len(data) == 0 {
		return &WorkspaceData{Workspaces: []Workspace{}}, nil
	}

	var workspaceData WorkspaceData
	if err := json.Unmarshal(data, &workspaceData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal workspace data: %w", err)
	}

	return &workspaceData, nil
}

func (wm *WorkspaceManager) saveData(data *WorkspaceData) error {
	file, err := os.OpenFile(wm.filePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to open workspace file for writing: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(data); err != nil {
		return fmt.Errorf("failed to encode workspace data: %w", err)
	}

	return nil
}

func (wm *WorkspaceManager) validateWorkspaceName(name string) error {
	if name == "" {
		return fmt.Errorf("workspace name cannot be empty")
	}

	if strings.Contains(name, " ") {
		return fmt.Errorf("workspace name cannot contain spaces, use hyphens instead")
	}

	matched, err := regexp.MatchString("^[a-zA-Z0-9-_]+$", name)
	if err != nil {
		return fmt.Errorf("error validating workspace name: %w", err)
	}
	if !matched {
		return fmt.Errorf("workspace name can only contain letters, numbers, hyphens, and underscores")
	}

	return nil
}

func (wm *WorkspaceManager) ListWorkspaces() ([]Workspace, error) {
	data, err := wm.loadData()
	if err != nil {
		return nil, err
	}
	return data.Workspaces, nil
}

func (wm *WorkspaceManager) GetWorkspace(name string) (*Workspace, error) {
	data, err := wm.loadData()
	if err != nil {
		return nil, err
	}

	for _, workspace := range data.Workspaces {
		if workspace.Name == name {
			return &workspace, nil
		}
	}

	return nil, fmt.Errorf("workspace '%s' not found", name)
}

func (wm *WorkspaceManager) CreateWorkspace(workspace Workspace) error {
	if err := wm.validateWorkspaceName(workspace.Name); err != nil {
		return err
	}

	data, err := wm.loadData()
	if err != nil {
		return err
	}

	for _, existingWorkspace := range data.Workspaces {
		if existingWorkspace.Name == workspace.Name {
			return fmt.Errorf("workspace '%s' already exists", workspace.Name)
		}
	}

	if workspace.Clusters == nil {
		workspace.Clusters = []ClusterInfo{}
	}

	data.Workspaces = append(data.Workspaces, workspace)
	return wm.saveData(data)
}

func (wm *WorkspaceManager) UpdateWorkspace(name string, updatedWorkspace Workspace) error {
	if updatedWorkspace.Name != name {
		if err := wm.validateWorkspaceName(updatedWorkspace.Name); err != nil {
			return err
		}
	}

	data, err := wm.loadData()
	if err != nil {
		return err
	}

	workspaceIndex := -1
	for i, workspace := range data.Workspaces {
		if workspace.Name == name {
			workspaceIndex = i
			break
		}
	}

	if workspaceIndex == -1 {
		return fmt.Errorf("workspace '%s' not found", name)
	}

	if updatedWorkspace.Name != name {
		for i, workspace := range data.Workspaces {
			if workspace.Name == updatedWorkspace.Name && i != workspaceIndex {
				return fmt.Errorf("workspace '%s' already exists", updatedWorkspace.Name)
			}
		}
	}

	data.Workspaces[workspaceIndex] = updatedWorkspace
	return wm.saveData(data)
}

func (wm *WorkspaceManager) DeleteWorkspace(name string) error {
	data, err := wm.loadData()
	if err != nil {
		return err
	}

	workspaceIndex := -1
	for i, workspace := range data.Workspaces {
		if workspace.Name == name {
			workspaceIndex = i
			break
		}
	}

	if workspaceIndex == -1 {
		return fmt.Errorf("workspace '%s' not found", name)
	}

	data.Workspaces = append(data.Workspaces[:workspaceIndex], data.Workspaces[workspaceIndex+1:]...)
	return wm.saveData(data)
}

func (wm *WorkspaceManager) AddClusterToWorkspace(workspaceName string, cluster ClusterInfo) error {
	data, err := wm.loadData()
	if err != nil {
		return err
	}

	workspaceIndex := -1
	for i, workspace := range data.Workspaces {
		if workspace.Name == workspaceName {
			workspaceIndex = i
			break
		}
	}

	if workspaceIndex == -1 {
		return fmt.Errorf("workspace '%s' not found", workspaceName)
	}

	for _, existingCluster := range data.Workspaces[workspaceIndex].Clusters {
		if existingCluster.Name == cluster.Name {
			return fmt.Errorf("cluster '%s' already exists in workspace '%s'", cluster.Name, workspaceName)
		}
	}

	data.Workspaces[workspaceIndex].Clusters = append(data.Workspaces[workspaceIndex].Clusters, cluster)
	return wm.saveData(data)
}

func (wm *WorkspaceManager) RemoveClusterFromWorkspace(workspaceName, clusterName string) error {
	data, err := wm.loadData()
	if err != nil {
		return err
	}

	workspaceIndex := -1
	for i, workspace := range data.Workspaces {
		if workspace.Name == workspaceName {
			workspaceIndex = i
			break
		}
	}

	if workspaceIndex == -1 {
		return fmt.Errorf("workspace '%s' not found", workspaceName)
	}

	clusterIndex := -1
	for i, cluster := range data.Workspaces[workspaceIndex].Clusters {
		if cluster.Name == clusterName {
			clusterIndex = i
			break
		}
	}

	if clusterIndex == -1 {
		return fmt.Errorf("cluster '%s' not found in workspace '%s'", clusterName, workspaceName)
	}

	clusters := data.Workspaces[workspaceIndex].Clusters
	data.Workspaces[workspaceIndex].Clusters = append(clusters[:clusterIndex], clusters[clusterIndex+1:]...)
	return wm.saveData(data)
}