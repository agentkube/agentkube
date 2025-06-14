package handlers

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/agentkube/operator/internal/multiplexer"
	"github.com/agentkube/operator/internal/stateless"
	"github.com/agentkube/operator/pkg/command"
	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
	"k8s.io/client-go/tools/clientcmd"
)

// WebSocketHandler is the shared multiplexer instance
var wsMultiplexer *multiplexer.Multiplexer

// ClusterManager is the shared cluster manager instance
var clusterManager *stateless.ClusterManager

// Command executor instance
var cmdExecutor *command.CommandExecutor

// InitializeWebSocketHandler initializes the WebSocket handler with the given kubeconfig store
func InitializeWebSocketHandler(kubeConfigStore kubeconfig.ContextStore, cfg config.Config) {
	wsMultiplexer = multiplexer.NewMultiplexer(kubeConfigStore)
	clusterManager = stateless.NewClusterManager(kubeConfigStore, cfg.EnableDynamicClusters)
}

// InitializeCommandExecutor initializes the command executor with the given kubeconfig store
func InitializeCommandExecutor(kubeConfigStore kubeconfig.ContextStore) {
	cmdExecutor = command.NewCommandExecutor(kubeConfigStore)
	logger.Log(logger.LevelInfo, nil, nil, "Command executor initialized")
}

// WebSocketHandler handles WebSocket connections
func WebSocketHandler(c *gin.Context) {
	if wsMultiplexer == nil {
		logger.Log(logger.LevelError, nil, nil, "WebSocket multiplexer not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Handle the WebSocket connection
	wsMultiplexer.HandleClientWebSocket(c.Writer, c.Request)
}

// PingHandler handles the ping endpoint
func PingHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "pong",
	})
}

// HomeHandler handles the root endpoint
func HomeHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "Welcome to the API server",
	})
}

// ParseKubeConfigHandler handles requests to parse kubeconfig
func ParseKubeConfigHandler(c *gin.Context) {
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	clusterManager.ParseKubeConfig(c)
}

// ProxyHandler handles proxy requests to Kubernetes API
func ProxyHandler(c *gin.Context) {
	if clusterManager == nil {
		logger.Log(logger.LevelError, nil, nil, "Cluster manager not initialized")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	contextKey, err := clusterManager.GetContextKeyFromRequest(c)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting context key")
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the context from the store
	context, err := clusterManager.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "getting context")
		c.JSON(http.StatusNotFound, gin.H{"error": "Context not found"})
		return
	}

	// Extract only the path part that should be forwarded to the Kubernetes API
	path := c.Param("path")

	// Log the path for debugging
	logger.Log(logger.LevelInfo, map[string]string{
		"contextKey": contextKey,
		"path":       path,
		"fullPath":   c.Request.URL.Path,
	}, nil, "proxying request")

	// Modify the request path to only include the part after /clusters/{clusterName}
	c.Request.URL.Path = path

	// Proxy the request to the Kubernetes API
	if err := context.ProxyRequest(c.Writer, c.Request); err != nil {
		logger.Log(logger.LevelError, map[string]string{"contextKey": contextKey}, err, "proxying request")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to proxy request"})
		return
	}
}

// KubectlHandler handles requests to execute kubectl commands in a specific cluster
func KubectlHandler(c *gin.Context) {

	// if cmdExecutor == nil {
	// 	logger.Log(logger.LevelError, nil, nil, "Command executor not initialized")
	// 	c.JSON(http.StatusInternalServerError, gin.H{"error": "Command executor not initialized"})
	// 	return
	// }

	// Get cluster name directly from the URL path parameter
	clusterName := c.Param("clusterName")
	if clusterName == "" {
		logger.Log(logger.LevelError, nil, nil, "missing cluster name")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing cluster name"})
		return
	}

	// Parse the command from request body
	var req struct {
		Command []string `json:"command"`
		Timeout int      `json:"timeout,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Log(logger.LevelError, nil, err, "binding request")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format: " + err.Error()})
		return
	}

	// Create command request with the cluster context name
	cmdReq := command.CommandRequest{
		Context: clusterName,
		Command: req.Command,
		Timeout: req.Timeout,
	}

	// Execute the command
	result, err := cmdExecutor.ExecuteKubectlCommand(cmdReq)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName}, err, "executing command")
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Return the result directly (no need to wrap it again)
	c.JSON(http.StatusOK, result)
}

type KubeconfigUploadRequest struct {
	Content    string `json:"content" form:"content"`
	SourceName string `json:"sourceName" form:"sourceName"`
	TTL        int    `json:"ttl" form:"ttl"` // TTL in hours, 0 means no expiry
}

// KubeconfigUploadResponse represents the response for kubeconfig operations
type KubeconfigUploadResponse struct {
	Success       bool     `json:"success"`
	Message       string   `json:"message"`
	ContextsAdded []string `json:"contextsAdded,omitempty"`
	Errors        []string `json:"errors,omitempty"`
	FilePath      string   `json:"filePath,omitempty"`
}

// UploadKubeconfigFileHandler handles file upload for kubeconfig
func UploadKubeconfigFileHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Parse multipart form
		err := c.Request.ParseMultipartForm(32 << 20) // 32 MB max
		if err != nil {
			c.JSON(http.StatusBadRequest, KubeconfigUploadResponse{
				Success: false,
				Message: "Failed to parse multipart form",
			})
			return
		}

		// Get the file from form
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, KubeconfigUploadResponse{
				Success: false,
				Message: "No file uploaded or invalid file",
			})
			return
		}
		defer file.Close()

		// Validate file extension
		ext := strings.ToLower(filepath.Ext(header.Filename))
		isValidExtension := ext == ".yaml" || ext == ".yml" || ext == ".json" || ext == ""
		isKubeconfigFile := strings.Contains(strings.ToLower(header.Filename), "config") ||
			strings.Contains(strings.ToLower(header.Filename), "kubeconfig")

		if !isValidExtension && !isKubeconfigFile {
			c.JSON(http.StatusBadRequest, KubeconfigUploadResponse{
				Success: false,
				Message: "Invalid file format. Please upload kubeconfig files (.yaml, .yml, .json) or files without extensions",
			})
			return
		}

		// Read file content
		content, err := readFileContent(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, KubeconfigUploadResponse{
				Success: false,
				Message: "Failed to read file content",
			})
			return
		}

		// Get optional parameters
		sourceName := c.PostForm("sourceName")
		if sourceName == "" {
			sourceName = strings.TrimSuffix(header.Filename, ext)
		}

		ttlStr := c.PostForm("ttl")
		ttlHours := 0
		if ttlStr != "" {
			fmt.Sscanf(ttlStr, "%d", &ttlHours)
		}

		// Process the kubeconfig content
		response := processKubeconfigContent(content, sourceName, ttlHours, kubeConfigStore)

		if response.Success {
			c.JSON(http.StatusOK, response)
		} else {
			c.JSON(http.StatusBadRequest, response)
		}
	}
}

// UploadKubeconfigContentHandler handles direct kubeconfig content upload
func UploadKubeconfigContentHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req KubeconfigUploadRequest

		// Try to bind JSON first, then form data
		if err := c.ShouldBindJSON(&req); err != nil {
			if err := c.ShouldBind(&req); err != nil {
				c.JSON(http.StatusBadRequest, KubeconfigUploadResponse{
					Success: false,
					Message: "Invalid request format",
				})
				return
			}
		}

		if req.Content == "" {
			c.JSON(http.StatusBadRequest, KubeconfigUploadResponse{
				Success: false,
				Message: "Kubeconfig content is required",
			})
			return
		}

		if req.SourceName == "" {
			req.SourceName = fmt.Sprintf("uploaded-%d", time.Now().Unix())
		}

		// Process the kubeconfig content
		response := processKubeconfigContent(req.Content, req.SourceName, req.TTL, kubeConfigStore)

		if response.Success {
			c.JSON(http.StatusOK, response)
		} else {
			c.JSON(http.StatusBadRequest, response)
		}
	}
}

// ListUploadedContextsHandler lists all contexts from uploaded kubeconfigs
func ListUploadedContextsHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		contexts, err := kubeConfigStore.GetContexts()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to retrieve contexts",
			})
			return
		}

		// Filter only uploaded/dynamic contexts
		var uploadedContexts []*kubeconfig.Context
		for _, ctx := range contexts {
			if ctx.Source == kubeconfig.DynamicCluster {
				uploadedContexts = append(uploadedContexts, ctx)
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"contexts": uploadedContexts,
			"count":    len(uploadedContexts),
		})
	}
}

// DeleteUploadedContextHandler deletes a specific uploaded context
func DeleteUploadedContextHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		contextName := c.Param("name")
		if contextName == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Context name is required",
			})
			return
		}

		// Check if context exists and is deletable
		ctx, err := kubeConfigStore.GetContext(contextName)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Context not found",
			})
			return
		}

		// Only allow deletion of uploaded/dynamic contexts
		if ctx.Source != kubeconfig.DynamicCluster {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Cannot delete non-uploaded context",
			})
			return
		}

		// Use the enhanced removal function that handles both memory and file cleanup
		err = RemoveUploadedContext(contextName, kubeConfigStore)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to delete context",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("Context '%s' deleted successfully", contextName),
		})
	}
}

// Helper functions

func readFileContent(file multipart.File) (string, error) {
	content, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func processKubeconfigContent(content, sourceName string, ttlHours int, kubeConfigStore kubeconfig.ContextStore) KubeconfigUploadResponse {
	// Save the kubeconfig file using existing infrastructure
	savedFilePath, err := saveKubeconfigUsingExistingInfra(content, sourceName)
	if err != nil {
		return KubeconfigUploadResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to save kubeconfig file: %v", err),
		}
	}

	// Load contexts from the saved file using existing infrastructure
	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(
		savedFilePath,
		kubeconfig.DynamicCluster,
	)

	if err != nil {
		// Clean up the saved file if loading fails
		os.Remove(savedFilePath)
		return KubeconfigUploadResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to load contexts from kubeconfig: %v", err),
		}
	}

	var successfulContexts []string
	var errors []string

	// Add contexts to store
	for _, ctx := range contexts {
		// Prefix context name with source name to avoid conflicts
		originalName := ctx.Name
		ctx.Name = fmt.Sprintf("%s-%s", sourceName, ctx.Name)

		var addErr error
		if ttlHours > 0 {
			ttl := time.Duration(ttlHours) * time.Hour
			addErr = kubeConfigStore.AddContextWithKeyAndTTL(&ctx, ctx.Name, ttl)
		} else {
			addErr = kubeConfigStore.AddContext(&ctx)
		}

		if addErr != nil {
			errors = append(errors, fmt.Sprintf("Failed to add context '%s': %v", originalName, addErr))
		} else {
			successfulContexts = append(successfulContexts, ctx.Name)
		}
	}

	// Add context errors to the error list
	for _, contextErr := range contextErrors {
		errors = append(errors, fmt.Sprintf("Context '%s': %v", contextErr.ContextName, contextErr.Error))
	}

	success := len(successfulContexts) > 0
	message := fmt.Sprintf("Added %d context(s), saved to %s", len(successfulContexts), savedFilePath)

	if len(errors) > 0 {
		if success {
			message += fmt.Sprintf(" with %d error(s)", len(errors))
		} else {
			message = "Failed to add any contexts"
			// Clean up the saved file if no contexts were added
			os.Remove(savedFilePath)
		}
	}

	return KubeconfigUploadResponse{
		Success:       success,
		Message:       message,
		ContextsAdded: successfulContexts,
		Errors:        errors,
		FilePath:      savedFilePath,
	}
}

func getAgentKubeConfigDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %v", err)
	}

	kubeconfigDir := filepath.Join(homeDir, ".agentkube", "kubeconfig")

	// Create directory with proper permissions if it doesn't exist
	err = os.MkdirAll(kubeconfigDir, 0700)
	if err != nil {
		return "", fmt.Errorf("failed to create kubeconfig directory: %v", err)
	}

	return kubeconfigDir, nil
}

func saveKubeconfigUsingExistingInfra(content, sourceName string) (string, error) {
	kubeconfigDir, err := getAgentKubeConfigDir()
	if err != nil {
		return "", err
	}

	// Parse the kubeconfig content to get clientcmdapi.Config
	config, err := clientcmd.Load([]byte(content))
	if err != nil {
		return "", fmt.Errorf("failed to parse kubeconfig: %v", err)
	}

	// Create a subdirectory for this specific source
	timestamp := time.Now().Format("20060102_150405")
	sourceDirName := fmt.Sprintf("config_%s_%s", cleanFileName(sourceName), timestamp)
	sourceDir := filepath.Join(kubeconfigDir, sourceDirName)

	err = os.MkdirAll(sourceDir, 0700)
	if err != nil {
		return "", fmt.Errorf("failed to create source directory: %v", err)
	}

	// Use your existing WriteToFile function
	err = kubeconfig.WriteToFile(*config, sourceDir)
	if err != nil {
		// Clean up the directory if write fails
		os.RemoveAll(sourceDir)
		return "", fmt.Errorf("failed to write kubeconfig file: %v", err)
	}

	// Also save to main persistence file for compatibility
	persistenceFile, err := defaultKubeConfigPersistenceFile()
	if err == nil {
		persistenceDir := filepath.Dir(persistenceFile)
		err = kubeconfig.WriteToFile(*config, persistenceDir)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to save to main persistence file")
		}
	}

	// Return the path to the written config file
	configPath := filepath.Join(sourceDir, "config")
	return configPath, nil
}

// cleanFileName removes invalid characters from filename
func cleanFileName(name string) string {
	name = strings.ReplaceAll(name, " ", "_")
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	name = strings.ReplaceAll(name, ":", "_")
	name = strings.ReplaceAll(name, "*", "_")
	name = strings.ReplaceAll(name, "?", "_")
	name = strings.ReplaceAll(name, "\"", "_")
	name = strings.ReplaceAll(name, "<", "_")
	name = strings.ReplaceAll(name, ">", "_")
	name = strings.ReplaceAll(name, "|", "_")
	return name
}

// RemoveUploadedContext removes a context and cleans up the file if needed
func RemoveUploadedContext(contextName string, kubeConfigStore kubeconfig.ContextStore) error {
	// Remove from in-memory store first
	err := kubeConfigStore.RemoveContext(contextName)
	if err != nil {
		return fmt.Errorf("failed to remove context from store: %v", err)
	}

	// Find and clean up the file from .agentkube directory
	kubeconfigDir, err := getAgentKubeConfigDir()
	if err != nil {
		return err
	}

	// Look for config files in subdirectories that contain this context
	entries, err := os.ReadDir(kubeconfigDir)
	if err != nil {
		return fmt.Errorf("failed to read kubeconfig directory: %v", err)
	}

	var removedFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			configPath := filepath.Join(kubeconfigDir, entry.Name(), "config")
			if _, err := os.Stat(configPath); err == nil {
				// Check if this config file contains the context
				if contextExistsInFile(configPath, contextName) {
					// Try to remove the context from this file
					err = kubeconfig.RemoveContextFromFile(contextName, configPath)
					if err == nil {
						// Check if file is now empty of contexts, if so remove the entire directory
						if isEmpty, _ := isConfigFileEmpty(configPath); isEmpty {
							err = os.RemoveAll(filepath.Dir(configPath))
							if err == nil {
								_ = append(removedFiles, filepath.Dir(configPath))
								logger.Log(logger.LevelInfo,
									map[string]string{"directory": filepath.Dir(configPath)},
									nil, "Removed empty kubeconfig directory")
							}
						}
						break
					}
				}
			}
		}
	}

	return nil
}

// Helper function to check if context exists in file
func contextExistsInFile(configPath, contextName string) bool {
	config, err := clientcmd.LoadFromFile(configPath)
	if err != nil {
		return false
	}

	_, exists := config.Contexts[contextName]
	return exists
}

// Helper function to check if config file is empty of contexts
func isConfigFileEmpty(configPath string) (bool, error) {
	config, err := clientcmd.LoadFromFile(configPath)
	if err != nil {
		return false, err
	}

	return len(config.Contexts) == 0, nil
}

// ListUploadedKubeconfigs lists all saved kubeconfig directories
func ListUploadedKubeconfigs() ([]string, error) {
	kubeconfigDir, err := getAgentKubeConfigDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(kubeconfigDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read kubeconfig directory: %v", err)
	}

	var configs []string
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "config_") {
			configPath := filepath.Join(kubeconfigDir, entry.Name(), "config")
			if _, err := os.Stat(configPath); err == nil {
				configs = append(configs, configPath)
			}
		}
	}

	return configs, nil
}

func defaultKubeConfigPersistenceFile() (string, error) {
	kubeConfigDir, err := getAgentKubeConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(kubeConfigDir, "config"), nil
}

func LoadUploadedKubeconfigs(kubeConfigStore kubeconfig.ContextStore) error {
	// Load from main persistence file
	persistenceFile, err := defaultKubeConfigPersistenceFile()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting default kubeconfig persistence file")
	} else {
		// Only load if file exists
		if _, err := os.Stat(persistenceFile); err == nil {
			err = kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, persistenceFile, kubeconfig.DynamicCluster)
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "loading dynamic kubeconfig from persistence file")
			}
		}
	}

	// Load from individual uploaded configs
	configs, err := ListUploadedKubeconfigs()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "listing uploaded kubeconfigs")
		return err
	}

	for _, configPath := range configs {
		err = kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, configPath, kubeconfig.DynamicCluster)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"configPath": configPath}, err, "loading uploaded kubeconfig")
		}
	}

	return nil
}

func AddKubeconfigPathHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Path string `json:"path" form:"path"`
		}

		if err := c.ShouldBind(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request format",
			})
			return
		}

		if req.Path == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Path is required",
			})
			return
		}

		// Validate the path exists
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Path does not exist",
			})
			return
		}

		// Try to load contexts from the path to validate it's a valid kubeconfig
		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(req.Path, kubeconfig.KubeConfig)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Invalid kubeconfig file: %v", err),
			})
			return
		}

		if len(contexts) == 0 && len(contextErrors) > 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "No valid contexts found in kubeconfig",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"message":      "Valid kubeconfig path",
			"contextCount": len(contexts),
			"path":         req.Path,
		})
	}
}

// AddKubeconfigFolderHandler validates and processes a folder containing kubeconfig files
func AddKubeconfigFolderHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			FolderPath string `json:"folderPath" form:"folderPath"`
		}

		if err := c.ShouldBind(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request format",
			})
			return
		}

		if req.FolderPath == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Folder path is required",
			})
			return
		}

		// Check if folder exists
		info, err := os.Stat(req.FolderPath)
		if os.IsNotExist(err) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Folder does not exist",
			})
			return
		}

		if !info.IsDir() {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Path is not a directory",
			})
			return
		}

		// Scan folder for kubeconfig files
		validFiles, totalContexts, errors := scanFolderForKubeconfigs(req.FolderPath)

		if len(validFiles) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "No valid kubeconfig files found in folder",
				"details": errors,
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"message":      fmt.Sprintf("Found %d valid kubeconfig files", len(validFiles)),
			"validFiles":   validFiles,
			"contextCount": totalContexts,
			"errors":       errors,
		})
	}
}

// Helper function to scan folder for kubeconfigs
func scanFolderForKubeconfigs(folderPath string) ([]string, int, []string) {
	var validFiles []string
	var errors []string
	totalContexts := 0

	entries, err := os.ReadDir(folderPath)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Failed to read directory: %v", err))
		return validFiles, totalContexts, errors
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filePath := filepath.Join(folderPath, entry.Name())

		// load as kubeconfig
		contexts, _, err := kubeconfig.LoadContextsFromFile(filePath, kubeconfig.KubeConfig)
		if err != nil {
			// Skip files that aren't valid kubeconfigs
			continue
		}

		if len(contexts) > 0 {
			validFiles = append(validFiles, filePath)
			totalContexts += len(contexts)
		}
	}

	return validFiles, totalContexts, errors
}
