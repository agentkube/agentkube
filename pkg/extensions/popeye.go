package extensions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
)

type PopeyeInstaller struct {
	kubeConfigStore kubeconfig.ContextStore
}

func NewPopeyeInstaller(kubeConfigStore kubeconfig.ContextStore) *PopeyeInstaller {
	return &PopeyeInstaller{
		kubeConfigStore: kubeConfigStore,
	}
}

type PopeyeReport struct {
	Popeye struct {
		ReportTime string    `json:"report_time"`
		Score      int       `json:"score"`
		Grade      string    `json:"grade"`
		Sections   []Section `json:"sections,omitempty"`
		Errors     []string  `json:"errors,omitempty"`
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

type InstallationStatus struct {
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Path      string `json:"path,omitempty"`
	Error     string `json:"error,omitempty"`
}

func (p *PopeyeInstaller) CheckInstallation() InstallationStatus {
	// Check if popeye is in PATH
	path, err := exec.LookPath("popeye")
	if err == nil {
		// Get version
		cmd := exec.Command("popeye", "version")
		output, err := cmd.Output()
		if err == nil {
			version := strings.TrimSpace(string(output))
			return InstallationStatus{
				Installed: true,
				Version:   version,
				Path:      path,
			}
		}
	}

	return InstallationStatus{
		Installed: false,
		Error:     "Popeye not found in PATH",
	}
}

func (p *PopeyeInstaller) InstallPopeye() error {
	switch runtime.GOOS {
	case "darwin":
		return p.installWithBrew()
	case "linux":
		return p.installFromGitHub()
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// installWithBrew installs Popeye using Homebrew (macOS)
func (p *PopeyeInstaller) installWithBrew() error {
	logger.Log(logger.LevelInfo, nil, nil, "Installing Popeye using Homebrew...")

	// Check if brew is available
	if _, err := exec.LookPath("brew"); err != nil {
		return fmt.Errorf("homebrew not found. Please install Homebrew first")
	}

	cmd := exec.Command("brew", "install", "derailed/popeye/popeye")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to install Popeye with brew: %v, output: %s", err, string(output))
	}

	logger.Log(logger.LevelInfo, nil, nil, "Popeye installed successfully with Homebrew")
	return nil
}

// installFromGitHub installs Popeye from GitHub releases (Linux)
func (p *PopeyeInstaller) installFromGitHub() error {
	logger.Log(logger.LevelInfo, nil, nil, "Installing Popeye from GitHub releases...")

	// Determine architecture
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x86_64"
	}

	version := "v0.21.1" // Latest stable version
	filename := fmt.Sprintf("popeye_Linux_%s.tar.gz", arch)
	downloadURL := fmt.Sprintf("https://github.com/derailed/popeye/releases/download/%s/%s", version, filename)

	// Create temp directory
	tempDir, err := os.MkdirTemp("", "popeye-install")
	if err != nil {
		return fmt.Errorf("failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Download the tarball
	tarPath := filepath.Join(tempDir, filename)
	cmd := exec.Command("curl", "-L", "-o", tarPath, downloadURL)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to download Popeye: %v", err)
	}

	// Extract tarball
	cmd = exec.Command("tar", "-xzf", tarPath, "-C", tempDir)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to extract Popeye: %v", err)
	}

	// Move binary to /usr/local/bin
	srcPath := filepath.Join(tempDir, "popeye")
	destPath := "/usr/local/bin/popeye"

	cmd = exec.Command("sudo", "mv", srcPath, destPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to move Popeye to /usr/local/bin: %v", err)
	}

	// Make executable
	cmd = exec.Command("sudo", "chmod", "+x", destPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to make Popeye executable: %v", err)
	}

	logger.Log(logger.LevelInfo, nil, nil, "Popeye installed successfully from GitHub")
	return nil
}

// GenerateClusterReport runs Popeye
func (p *PopeyeInstaller) GenerateClusterReport(clusterName string) (*PopeyeReport, error) {
	status := p.CheckInstallation()
	if !status.Installed {
		logger.Log(logger.LevelInfo, nil, nil, "Popeye not found, attempting to install...")
		if err := p.InstallPopeye(); err != nil {
			return nil, fmt.Errorf("failed to install Popeye: %v", err)
		}
	}
	cmd := exec.Command("popeye",
		"--all-namespaces",
		"--out", "json",
		"--context", clusterName,
		"--force-exit-zero",
		"--log-level", "0")

	logger.Log(logger.LevelInfo, map[string]string{"cluster": clusterName}, nil, "Running Popeye cluster scan...")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to run Popeye: %v, output: %s", err, string(output))
	}

	jsonOutput, err := extractJSONFromOutput(string(output))
	if err != nil {
		return nil, fmt.Errorf("failed to extract JSON from Popeye output: %v, raw output: %s", err, string(output))
	}

	// Parse JSON output - try different parsing approaches
	var report PopeyeReport

	// First, try parsing as our expected structure (with outer wrapper)
	if err := json.Unmarshal([]byte(jsonOutput), &report); err != nil {
		// If that fails, try parsing as just the inner Popeye structure
		var innerReport struct {
			ReportTime string    `json:"report_time"`
			Score      int       `json:"score"`
			Grade      string    `json:"grade"`
			Sections   []Section `json:"sections,omitempty"`
			Errors     []string  `json:"errors,omitempty"`
		}

		if innerErr := json.Unmarshal([]byte(jsonOutput), &innerReport); innerErr != nil {
			return nil, fmt.Errorf("failed to parse Popeye JSON output: %v, json: %s", err, jsonOutput)
		}

		// If inner parsing succeeded, wrap it in our report structure
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
		// If outer parsing succeeded, just add cluster info
		report.ClusterName = clusterName
		report.ContextName = clusterName
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster": clusterName,
		"score":   fmt.Sprintf("%d", report.Popeye.Score),
		"grade":   report.Popeye.Grade,
	}, nil, "Popeye scan completed")

	return &report, nil
}

func extractJSONFromOutput(output string) (string, error) {
	// Remove ANSI escape sequences from the entire output first
	cleanOutput := removeANSIEscapes(output)

	// Look for JSON object that starts with {"popeye":
	jsonStart := strings.Index(cleanOutput, `{"popeye":`)
	if jsonStart == -1 {
		// Fallback: look for any JSON object
		jsonStart = strings.Index(cleanOutput, `{`)
		if jsonStart == -1 {
			return "", fmt.Errorf("no JSON found in output")
		}
	}

	// Find the matching closing brace
	braceCount := 0
	var jsonEnd int

	for i := jsonStart; i < len(cleanOutput); i++ {
		switch cleanOutput[i] {
		case '{':
			braceCount++
		case '}':
			braceCount--
			if braceCount == 0 {
				jsonEnd = i + 1
			}
		}
	}

	if braceCount != 0 {
		return "", fmt.Errorf("unmatched braces in JSON output")
	}

	return cleanOutput[jsonStart:jsonEnd], nil
}

// helper function to remove ANSI escape sequences
func removeANSIEscapes(str string) string {
	var result bytes.Buffer
	inEscape := false

	for i := 0; i < len(str); i++ {
		if str[i] == '\x1b' && i+1 < len(str) && str[i+1] == '[' {
			inEscape = true
			i++ // skip the '['
			continue
		}

		if inEscape {
			if (str[i] >= 'A' && str[i] <= 'Z') || (str[i] >= 'a' && str[i] <= 'z') {
				inEscape = false
			}
			continue
		}

		result.WriteByte(str[i])
	}

	return result.String()
}
