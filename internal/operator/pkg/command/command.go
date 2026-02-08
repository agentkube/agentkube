package command

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
)

// CommandExecutor handles executing kubectl commands
type CommandExecutor struct {
	kubeConfigStore kubeconfig.ContextStore
}

// CommandResult represents the result of a command execution
type CommandResult struct {
	Success    bool   `json:"success"`
	Output     string `json:"output"` // Added output field for stdout
	Error      string `json:"error,omitempty"`
	Command    string `json:"command"`
	ExecTimeMs int64  `json:"execTimeMs"`
}

// CommandRequest represents a command execution request
type CommandRequest struct {
	Context string   `json:"context"`
	Command []string `json:"command"`
	Timeout int      `json:"timeout,omitempty"` // timeout in seconds
}

// NewCommandExecutor creates a new command executor
func NewCommandExecutor(kubeConfigStore kubeconfig.ContextStore) *CommandExecutor {
	return &CommandExecutor{
		kubeConfigStore: kubeConfigStore,
	}
}

// ExecuteKubectlCommand executes a kubectl command for a specific context
func (e *CommandExecutor) ExecuteKubectlCommand(req CommandRequest) (*CommandResult, error) {
	// Validate request
	if len(req.Command) == 0 {
		return nil, fmt.Errorf("command cannot be empty")
	}

	// Ensure the first command is kubectl
	if req.Command[0] != "kubectl" {
		return nil, fmt.Errorf("command must start with 'kubectl'")
	}

	// Set default timeout if not provided
	timeout := 60 // Default 60 seconds
	if req.Timeout > 0 {
		timeout = req.Timeout
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	// Build command with context flag
	cmdStr := strings.Join(req.Command, " ")
	logger.Log(logger.LevelInfo, map[string]string{
		"context": req.Context,
		"command": cmdStr,
	}, nil, "executing kubectl command")

	// Insert the --context flag right after kubectl
	modifiedCommand := []string{req.Command[0], "--context", req.Context}
	modifiedCommand = append(modifiedCommand, req.Command[1:]...)

	// Prepare command with context
	cmd := exec.CommandContext(ctx, modifiedCommand[0], modifiedCommand[1:]...)

	// Use OS environment variables
	cmd.Env = os.Environ()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Execute the command
	startTime := time.Now()
	err := cmd.Run()
	execTime := time.Since(startTime).Milliseconds()

	// Create result
	result := &CommandResult{
		Success:    err == nil,
		Output:     stdout.String(), // Set output to stdout
		Command:    cmdStr,
		ExecTimeMs: execTime,
	}

	if err != nil {
		result.Error = err.Error()
		logger.Log(logger.LevelError, map[string]string{
			"context": req.Context,
			"command": cmdStr,
		}, err, "kubectl command failed")
	}

	return result, nil
}
