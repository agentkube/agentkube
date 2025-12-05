package extensions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	popeyepkg "github.com/derailed/popeye/pkg"
	"github.com/derailed/popeye/pkg/config"
	"github.com/rs/zerolog"
)

type PopeyeScanner struct {
	kubeConfigStore kubeconfig.ContextStore
	mu              sync.Mutex // Protects concurrent Popeye scans
}

func NewPopeyeScanner(kubeConfigStore kubeconfig.ContextStore) *PopeyeScanner {
	return &PopeyeScanner{
		kubeConfigStore: kubeConfigStore,
	}
}

type PopeyeReport struct {
	Popeye struct {
		ReportTime string                 `json:"report_time"`
		Score      int                    `json:"score"`
		Grade      string                 `json:"grade"`
		Sections   []Section              `json:"sections,omitempty"`
		Errors     map[string]interface{} `json:"errors,omitempty"`
	} `json:"popeye"`
	ClusterName string `json:"ClusterName,omitempty"`
	ContextName string `json:"ContextName,omitempty"`
}

type Section struct {
	Linter string             `json:"linter"`
	GVR    string             `json:"gvr"`
	Tally  *Tally             `json:"tally"`
	Issues map[string][]Issue `json:"issues,omitempty"`
}

type Tally struct {
	OK      int `json:"ok"`
	Info    int `json:"info"`
	Warning int `json:"warning"`
	Error   int `json:"error"`
	Score   int `json:"score"`
}

type Issue struct {
	Group   string `json:"group"`
	GVR     string `json:"gvr"`
	Level   int    `json:"level"`
	Message string `json:"message"`
}

type ScannerStatus struct {
	Available bool   `json:"available"`
	Version   string `json:"version,omitempty"`
	Method    string `json:"method"`
	Error     string `json:"error,omitempty"`
}

// CheckAvailability returns the status of Popeye integration
func (p *PopeyeScanner) CheckAvailability() ScannerStatus {
	return ScannerStatus{
		Available: true,
		Version:   "v0.21.x",
		Method:    "library",
	}
}

// GenerateClusterReport runs Popeye scan using the library directly
func (p *PopeyeScanner) GenerateClusterReport(clusterName string) (*PopeyeReport, error) {
	// Lock to prevent concurrent Popeye scans (Popeye library has race conditions)
	p.mu.Lock()
	defer p.mu.Unlock()

	// Get the context to determine kubeconfig path
	ctx, err := p.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		return nil, fmt.Errorf("context '%s' not found: %v", clusterName, err)
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
		"source":  fmt.Sprintf("%d", ctx.Source),
	}, nil, "Starting Popeye cluster scan using library...")

	// Determine kubeconfig path
	kubeconfigPath, err := p.getKubeconfigPath(ctx, clusterName)
	if err != nil {
		return nil, fmt.Errorf("failed to determine kubeconfig path: %v", err)
	}

	// Create Popeye flags configuration with JSON output to stdout
	flags := p.createPopeyeFlags(kubeconfigPath, clusterName)
	*flags.Output = "json"
	// Don't set Save or OutputFile - we'll capture stdout instead

	// Capture stdout BEFORE creating Popeye instance (so it uses our redirected stdout)
	oldStdout := os.Stdout
	oldStderr := os.Stderr
	r, w, _ := os.Pipe()
	os.Stdout = w
	os.Stderr = w

	// Read output in a goroutine
	var jsonBuf bytes.Buffer
	readDone := make(chan bool)
	go func() {
		jsonBuf.ReadFrom(r)
		readDone <- true
	}()

	// Set up zerolog logger for Popeye - suppress all output
	var logBuf bytes.Buffer
	popeyeLogger := zerolog.New(&logBuf).Level(zerolog.Disabled)

	// Create Popeye instance (will use our redirected stdout)
	popeye, err := popeyepkg.NewPopeye(flags, &popeyeLogger)
	if err != nil {
		os.Stdout = oldStdout
		os.Stderr = oldStderr
		w.Close()
		<-readDone
		return nil, fmt.Errorf("failed to create Popeye instance: %v", err)
	}

	// Initialize Popeye
	if err := popeye.Init(); err != nil {
		os.Stdout = oldStdout
		os.Stderr = oldStderr
		w.Close()
		<-readDone
		return nil, fmt.Errorf("failed to initialize Popeye: %v", err)
	}

	// Run the scan
	errCount, score, scanErr := popeye.Lint()

	// Close the writer and wait for reader to finish
	w.Close()
	<-readDone

	// Restore stdout/stderr
	os.Stdout = oldStdout
	os.Stderr = oldStderr

	if scanErr != nil {
		return nil, fmt.Errorf("failed to run Popeye scan: %v", scanErr)
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":  clusterName,
		"score":    fmt.Sprintf("%d", score),
		"errCount": fmt.Sprintf("%d", errCount),
	}, nil, "Popeye scan completed")

	output := jsonBuf.String()

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"output_size": fmt.Sprintf("%d", len(output)),
	}, nil, "Captured Popeye output")

	if len(output) == 0 {
		return nil, fmt.Errorf("Popeye output is empty")
	}

	// Extract JSON from output (skip debug logs)
	// Look for the start of JSON object
	jsonStart := bytes.IndexByte([]byte(output), '{')
	if jsonStart == -1 {
		return nil, fmt.Errorf("no JSON found in Popeye output")
	}
	jsonData := []byte(output[jsonStart:])

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":   clusterName,
		"json_size": fmt.Sprintf("%d", len(jsonData)),
	}, nil, "Extracted JSON from output")

	// Parse the JSON output
	var report PopeyeReport
	if err := json.Unmarshal(jsonData, &report); err != nil {
		// Try parsing as just the inner structure
		var innerReport struct {
			ReportTime string                 `json:"report_time"`
			Score      int                    `json:"score"`
			Grade      string                 `json:"grade"`
			Sections   []Section              `json:"sections,omitempty"`
			Errors     map[string]interface{} `json:"errors,omitempty"`
		}

		if innerErr := json.Unmarshal(jsonData, &innerReport); innerErr != nil {
			return nil, fmt.Errorf("failed to parse Popeye JSON output: %v", err)
		}

		// Wrap it in our report structure
		report = PopeyeReport{
			ClusterName: clusterName,
			ContextName: clusterName,
		}
		report.Popeye.ReportTime = innerReport.ReportTime
		report.Popeye.Score = innerReport.Score
		report.Popeye.Grade = innerReport.Grade
		report.Popeye.Sections = innerReport.Sections
		report.Popeye.Errors = innerReport.Errors
	} else {
		// Add cluster info if not present
		report.ClusterName = clusterName
		report.ContextName = clusterName
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
		"score":   fmt.Sprintf("%d", report.Popeye.Score),
		"grade":   report.Popeye.Grade,
	}, nil, "Popeye scan report generated successfully")

	return &report, nil
}

// createPopeyeFlags creates the configuration flags for Popeye
func (p *PopeyeScanner) createPopeyeFlags(kubeconfigPath, contextName string) *config.Flags {
	// Use config.NewFlags() to properly initialize all pointer fields
	flags := config.NewFlags()

	// Override the fields we need
	flags.ConfigFlags.KubeConfig = &kubeconfigPath
	flags.ConfigFlags.Context = &contextName

	// Set specific options
	allNamespaces := true
	flags.AllNamespaces = &allNamespaces

	forceExitZero := true
	flags.ForceExitZero = &forceExitZero

	logLevel := 0
	flags.LogLevel = &logLevel

	flags.StandAlone = true

	return flags
}

// getKubeconfigPath determines the kubeconfig path based on context source
func (p *PopeyeScanner) getKubeconfigPath(ctx *kubeconfig.Context, clusterName string) (string, error) {
	if ctx.Source == kubeconfig.DynamicCluster {
		// For dynamic clusters, use the agentkube kubeconfig
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get user home directory: %v", err)
		}

		kubeconfigPath := filepath.Join(homeDir, ".agentkube", "kubeconfig", "config")

		// Check if file exists
		if _, err := os.Stat(kubeconfigPath); os.IsNotExist(err) {
			return "", fmt.Errorf("agentkube kubeconfig not found at %s", kubeconfigPath)
		}

		return kubeconfigPath, nil
	}

	// For system clusters, use the default kubeconfig or the one from the context

	// Default to ~/.kube/config
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %v", err)
	}

	return filepath.Join(homeDir, ".kube", "config"), nil
}

// Helper function to create bool pointer
func ptrBool(b bool) *bool {
	return &b
}
