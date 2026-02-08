package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"strings"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
)

// ExternalURLHandler handles opening URLs in the system's default browser
func ExternalURLHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get URL from query parameter
		urlParam := c.Query("url")
		if urlParam == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing 'url' query parameter"})
			return
		}

		// Validate URL
		_, err := url.ParseRequestURI(urlParam)
		if err != nil {
			// If URL doesn't have a scheme, try adding https://
			if !strings.HasPrefix(urlParam, "http://") && !strings.HasPrefix(urlParam, "https://") {
				urlParam = "https://" + urlParam
				// Validate again
				_, err = url.ParseRequestURI(urlParam)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid URL format"})
					return
				}
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid URL format"})
				return
			}
		}

		// Open the URL in the default browser
		err = openBrowser(urlParam)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "opening browser")
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to open browser: %v", err)})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Opened %s in default browser", urlParam)})
	}
}

// openBrowser opens the specified URL in the default browser
func openBrowser(urlToOpen string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin": // macOS
		cmd = exec.Command("open", urlToOpen)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", urlToOpen)
	default: // Linux and others
		// Try common browsers in order
		browsers := []string{"xdg-open", "google-chrome", "firefox", "chromium-browser", "brave-browser"}

		for _, browser := range browsers {
			if _, err := exec.LookPath(browser); err == nil {
				cmd = exec.Command(browser, urlToOpen)
				break
			}
		}

		if cmd == nil {
			return fmt.Errorf("no browser found on the system")
		}
	}

	return cmd.Start()
}

// ExternalShellHandler handles running commands in external terminal with kubernetes context
func ExternalShellHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get cluster name from path parameter
		clusterName := c.Param("clusterName")
		if clusterName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing cluster name"})
			return
		}

		// Get command from request body
		var requestData struct {
			Command string `json:"command" binding:"required"`
		}

		if err := c.ShouldBindJSON(&requestData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request: %v", err)})
			return
		}

		if requestData.Command == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Command cannot be empty"})
			return
		}

		// Get context for the cluster to prepare kubectl commands
		_, err := kubeConfigStore.GetContext(clusterName)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "getting context for external shell")
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Context not found: %v", err)})
			return
		}

		// Prepare the command with the correct kubectl context
		kubeCommand := fmt.Sprintf("kubectl config use-context %s && %s", clusterName, requestData.Command)

		// Open terminal and run the command
		err = openTerminalWithCommand(kubeCommand)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"command": kubeCommand,
				"os":      runtime.GOOS,
			}, err, "opening terminal")
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to open terminal: %v", err)})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Command executed in external terminal",
			"cluster": clusterName,
			"command": requestData.Command,
		})
	}
}

// openTerminalWithCommand opens a terminal and runs the specified command
func openTerminalWithCommand(command string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin": // macOS
		// For macOS, we use AppleScript to open Terminal and run the command
		script := fmt.Sprintf("tell application \"Terminal\" to do script \"%s\"", command)
		cmd = exec.Command("osascript", "-e", script)

	case "linux":
		// For Linux, try to detect the terminal emulator
		terminals := []string{"gnome-terminal", "konsole", "xterm", "terminator", "xfce4-terminal"}

		var found bool
		for _, term := range terminals {
			if _, err := exec.LookPath(term); err == nil {
				// Create the appropriate command based on the terminal
				switch term {
				case "gnome-terminal":
					escapedCommand := strings.ReplaceAll(command, "\"", "\\\"")
					cmd = exec.Command("gnome-terminal", "--", "bash", "-c", escapedCommand+"; exec bash")
				case "konsole":
					cmd = exec.Command("konsole", "-e", "bash", "-c", command+"; exec bash")
				case "xterm", "terminator", "xfce4-terminal":
					cmd = exec.Command(term, "-e", "bash -c '"+command+"; exec bash'")
				}
				found = true
				break
			}
		}

		if !found {
			return fmt.Errorf("no supported terminal emulator found")
		}

	case "windows":
		// For Windows, use cmd.exe
		cmd = exec.Command("cmd.exe", "/C", "start", "cmd.exe", "/K", command)

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	// Run the command
	return cmd.Run()
}
