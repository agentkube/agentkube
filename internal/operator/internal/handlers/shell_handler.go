package handlers

// TODO use creack/pty
import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var systemShellUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// ShellMessage represents a message sent over WebSocket
type ShellMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// ResizeData represents terminal dimensions
// type ResizeData struct {
// 	Width  int `json:"width"`
// 	Height int `json:"height"`
// }

// SystemShellHandler provides access to the user's system shell with kubectl context set
func SystemShellHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract the cluster name
		clusterName := c.Query("clusterName")
		if clusterName == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "clusterName is required",
			})
			return
		}

		// Upgrade connection to WebSocket
		ws, err := systemShellUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "upgrading to websocket connection")
			return
		}
		defer ws.Close()

		// Get context for the cluster to validate it exists
		_, err = kubeConfigStore.GetContext(clusterName)
		if err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error getting cluster context: %v", err))
			return
		}

		// Detect user's shell
		shell, err := detectUserShell()
		if err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error detecting shell: %v", err))
			return
		}

		// Create shell command with kubectl context set and proper initialization
		cmd := createImprovedShellCommand(shell, clusterName)

		// Create pipes for stdin, stdout, and stderr
		stdin, err := cmd.StdinPipe()
		if err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error creating stdin pipe: %v", err))
			return
		}

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error creating stdout pipe: %v", err))
			return
		}

		stderr, err := cmd.StderrPipe()
		if err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error creating stderr pipe: %v", err))
			return
		}

		// Set up the shell environment
		setupShellEnvironment(cmd)

		// Start the command
		if err := cmd.Start(); err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error starting shell: %v", err))
			return
		}

		// Create wait group to ensure we wait for all goroutines to finish
		var wg sync.WaitGroup
		wg.Add(3)

		// Handle stdout
		go func() {
			defer wg.Done()
			buf := make([]byte, 4096) // Increased buffer size
			for {
				n, err := stdout.Read(buf)
				if err != nil {
					if err != io.EOF {
						logger.Log(logger.LevelError, nil, err, "reading from stdout")
					}
					break
				}
				if n > 0 {
					// Send raw data to preserve control characters
					msg := ShellMessage{
						Type: "stdout",
						Data: json.RawMessage(fmt.Sprintf("%q", string(buf[:n]))),
					}
					sendMessage(ws, &msg)
				}
			}
		}()

		// Handle stderr
		go func() {
			defer wg.Done()
			buf := make([]byte, 4096) // Increased buffer size
			for {
				n, err := stderr.Read(buf)
				if err != nil {
					if err != io.EOF {
						logger.Log(logger.LevelError, nil, err, "reading from stderr")
					}
					break
				}
				if n > 0 {
					msg := ShellMessage{
						Type: "stderr",
						Data: json.RawMessage(fmt.Sprintf("%q", string(buf[:n]))),
					}
					sendMessage(ws, &msg)
				}
			}
		}()

		// Handle WebSocket messages from client
		go func() {
			defer wg.Done()
			for {
				var msg ShellMessage
				err := ws.ReadJSON(&msg)
				if err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
						logger.Log(logger.LevelError, nil, err, "reading websocket message")
					}
					break
				}

				switch msg.Type {
				case "stdin":
					var data string
					if err := json.Unmarshal(msg.Data, &data); err != nil {
						logger.Log(logger.LevelError, nil, err, "unmarshaling stdin data")
						continue
					}
					if _, err := stdin.Write([]byte(data)); err != nil {
						logger.Log(logger.LevelError, nil, err, "writing to stdin")
					}

				case "resize":
					var resizeData ResizeData
					if err := json.Unmarshal(msg.Data, &resizeData); err != nil {
						logger.Log(logger.LevelError, nil, err, "unmarshaling resize data")
						continue
					}

					// Set terminal size using stty if on Unix
					if isUnixSystem() {
						setTerminalSize(stdin, resizeData.Width, resizeData.Height)
					}

					logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("Terminal resize: %dx%d", resizeData.Width, resizeData.Height))

				case "ping":
					// Respond to ping with a pong
					pongMsg := ShellMessage{
						Type: "pong",
						Data: json.RawMessage(`""`),
					}
					sendMessage(ws, &pongMsg)
				}
			}
		}()

		// Wait for command to finish
		wg.Wait()
		cmd.Wait()
	}
}

// setupShellEnvironment sets up environment variables for the shell
func setupShellEnvironment(cmd *exec.Cmd) {
	// Get user's home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "~" // Fallback
	}

	// Set environment variables for a rich terminal experience
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		fmt.Sprintf("HOME=%s", homeDir),
		fmt.Sprintf("KUBECONFIG=%s", os.Getenv("KUBECONFIG")),
		"COLORTERM=truecolor",
		"LANG=en_US.UTF-8",
		"LC_ALL=en_US.UTF-8",
		// Force prompt to appear by ensuring PS1 is set
		"PROMPT_COMMAND=", // Prevent any custom prompt command that might interfere
		"FORCE_PROMPT=1")  // Custom var to ensure our prompt setup works

	// Set pwd to user's home directory
	cmd.Dir = homeDir
}

// setTerminalSize uses stty to set terminal size
func setTerminalSize(stdin io.Writer, width, height int) {
	sttyCmd := fmt.Sprintf("stty rows %d columns %d\n", height, width)
	stdin.Write([]byte(sttyCmd))
}

// isUnixSystem returns true if running on a Unix-like system
func isUnixSystem() bool {
	return os.PathSeparator == '/' && runtime.GOOS != "windows"
}

// detectUserShell determines the user's default shell
func detectUserShell() (string, error) {
	// First try to get from SHELL environment variable
	shell := os.Getenv("SHELL")
	if shell != "" {
		return shell, nil
	}

	// Check based on platform
	if isUnixSystem() {
		// If on Unix-like system, check /etc/passwd
		if _, err := os.Stat("/etc/passwd"); err == nil {
			// Get current user
			username := os.Getenv("USER")
			if username != "" {
				// Read /etc/passwd and find the user's shell
				passwdFile, err := os.ReadFile("/etc/passwd")
				if err == nil {
					lines := strings.Split(string(passwdFile), "\n")
					for _, line := range lines {
						if strings.HasPrefix(line, username+":") {
							parts := strings.Split(line, ":")
							if len(parts) >= 7 {
								return parts[6], nil
							}
						}
					}
				}
			}
		}

		// Default to bash or sh depending on what's available
		if _, err := exec.LookPath("bash"); err == nil {
			return "/bin/bash", nil
		}
		return "/bin/sh", nil
	} else {
		// On Windows, check for PowerShell Core first, then regular PowerShell, then CMD
		if _, err := exec.LookPath("pwsh.exe"); err == nil {
			return "pwsh.exe", nil
		}
		if _, err := exec.LookPath("powershell.exe"); err == nil {
			return "powershell.exe", nil
		}
		return "cmd.exe", nil
	}
}

// createImprovedShellCommand creates the shell command with kubectl context set and proper prompt setup
func createImprovedShellCommand(shell string, clusterName string) *exec.Cmd {
	var cmd *exec.Cmd

	if isUnixSystem() {
		// For Unix-like systems, we use a more sophisticated approach to ensure proper prompt
		var shellScript string

		// Common shell initialization for all Unix shells
		initScript := `
# Change kubectl context if specified
kubectl config use-context %s 2>/dev/null || true

# Make sure we have proper terminal settings
stty sane 2>/dev/null || true

# Initialize different shells with proper prompts
`

		if strings.Contains(shell, "bash") {
			// For bash, we ensure prompt shows full details and colors
			bashPrompt := `
# Configure fancy bash prompt with colors
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
else
  # Set a nice default prompt if no bashrc
  export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
fi

# Start login shell
exec bash -l
`
			shellScript = fmt.Sprintf(initScript, clusterName) + bashPrompt
			cmd = exec.Command("bash", "-c", shellScript)

		} else if strings.Contains(shell, "zsh") {
			// For zsh, load zshrc and set a nice prompt if needed
			zshPrompt := `
# Load zsh configuration if exists
if [ -f ~/.zshrc ]; then
  source ~/.zshrc
else
  # Set a nice default prompt if no zshrc
  export PROMPT="%%F{green}%%n@%%m%%f:%%F{blue}%%~%%f$ "
fi

# Start login zsh
exec zsh -l
`
			shellScript = fmt.Sprintf(initScript, clusterName) + zshPrompt
			cmd = exec.Command("zsh", "-c", shellScript)

		} else if strings.Contains(shell, "fish") {
			// For fish shell
			fishPrompt := `
# Ensure fish initializes properly
if test -f ~/.config/fish/config.fish
  source ~/.config/fish/config.fish
end

# Start fish shell
exec fish -l
`
			shellScript = fmt.Sprintf(initScript, clusterName) + fishPrompt
			cmd = exec.Command("fish", "-c", shellScript)

		} else {
			// Generic shell - set a basic prompt
			shellPrompt := `
# Set basic prompt for generic shell
export PS1='$ '

# Execute shell
exec %s
`
			shellScript = fmt.Sprintf(initScript, clusterName) + fmt.Sprintf(shellPrompt, shell)
			cmd = exec.Command("sh", "-c", shellScript)
		}

	} else {
		// Windows shells
		if strings.Contains(strings.ToLower(shell), "powershell") {
			// For PowerShell, set a nice prompt function
			psPrompt := `
# Set kubectl context
kubectl config use-context %s

# Customize the PowerShell prompt
function prompt {
  $ESC = [char]27
  "$ESC[32m$env:USERNAME@$env:COMPUTERNAME$ESC[0m:$ESC[34m$(Get-Location)$ESC[0m> "
}
`
			shellScript := fmt.Sprintf(psPrompt, clusterName)
			cmd = exec.Command(shell, "-NoExit", "-Command", shellScript)

		} else {
			// For CMD, set a colorful prompt
			cmdPrompt := `
@echo off
kubectl config use-context %s
prompt $E[32m$P$E[0m$G
`
			// Create a temporary batch file
			tempFile, err := os.CreateTemp("", "cmdprompt-*.bat")
			if err == nil {
				tempFile.WriteString(fmt.Sprintf(cmdPrompt, clusterName))
				tempFile.Close()
				cmd = exec.Command(shell, "/k", tempFile.Name())
				// Clean up the temp file when done
				go func() {
					time.Sleep(5 * time.Second)
					os.Remove(tempFile.Name())
				}()
			} else {
				// Fallback if we can't create a temp file
				cmd = exec.Command(shell, "/k", fmt.Sprintf("kubectl config use-context %s", clusterName))
			}
		}
	}

	return cmd
}

// sendMessage sends a message over the WebSocket
func sendMessage(ws *websocket.Conn, msg *ShellMessage) {
	if err := ws.WriteJSON(msg); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing message to websocket")
	}
}

// sendErrorMessage sends an error message over the WebSocket
func sendErrorMessage(ws *websocket.Conn, message string) {
	msg := ShellMessage{
		Type: "error",
		Data: json.RawMessage(fmt.Sprintf("%q", message)),
	}
	if err := ws.WriteJSON(msg); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing error message to websocket")
	}
}
