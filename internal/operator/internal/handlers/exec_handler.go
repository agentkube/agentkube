package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"sync"

	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var shellUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// ShellMessage represents a message sent over the WebSocket
// type ShellMessage struct {
// 	Type string          `json:"type"`
// 	Data json.RawMessage `json:"data"`
// }

// // ResizeData represents the data for a resize event
// type ResizeData struct {
// 	Width  int `json:"width"`
// 	Height int `json:"height"`
// }

// TerminalHandler provides a shell terminal via WebSocket
func TerminalHandler(kubeConfigStore kubeconfig.ContextStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract parameters
		namespace := c.Query("namespace")
		podName := c.Query("podName")
		containerName := c.Query("container")
		clusterName := c.Query("clusterName")

		if namespace == "" || podName == "" || containerName == "" || clusterName == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "namespace, podName, container, and clusterName are required",
			})
			return
		}

		// Upgrade connection to WebSocket
		ws, err := shellUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "upgrading to websocket connection")
			return
		}
		defer ws.Close()

		// Get context for the cluster
		_, err = kubeConfigStore.GetContext(clusterName)
		if err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error getting cluster context: %v", err))
			return
		}

		// Set kubectl context for the command
		if err := exec.Command("kubectl", "config", "use-context", clusterName).Run(); err != nil {
			logger.Log(logger.LevelWarn, nil, err, "setting kubectl context")
			// Continue anyway, it might still work with the current context
		}

		// Build kubectl command with improved shell detection and initialization
		// Use a more sophisticated approach to get a better shell experience
		cmd := exec.Command(
			"kubectl", "exec", "-i", "-t",
			"-n", namespace,
			podName,
			"-c", containerName,
			"--",
			"sh", "-c",
			// The following script tries to detect and use the best available shell
			// It also sets up proper environment variables for a better terminal experience
			`
TERM=xterm-256color
export TERM
export COLORTERM=truecolor
export LC_ALL=en_US.UTF-8 2>/dev/null || true
export LANG=en_US.UTF-8 2>/dev/null || true

# Try to find the best shell available
if command -v bash >/dev/null 2>&1; then
  # If bash is available, use it and try to make it look nice
  export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
  exec bash --login
elif command -v zsh >/dev/null 2>&1; then
  # If zsh is available, use it with some basic initialization
  export ZDOTDIR=$HOME
  exec zsh -i
else
  # Fallback to basic sh with a simple prompt
  export PS1='$ '
  exec sh
fi
			`,
		)

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

		// Start the command
		if err := cmd.Start(); err != nil {
			sendErrorMessage(ws, fmt.Sprintf("Error starting command: %v", err))
			return
		}

		// Create wait group to ensure we wait for all goroutines to finish
		var wg sync.WaitGroup
		wg.Add(3)

		// Handle stdout
		go func() {
			defer wg.Done()
			buf := make([]byte, 4096) // Larger buffer for better performance
			for {
				n, err := stdout.Read(buf)
				if err != nil {
					if err != io.EOF {
						logger.Log(logger.LevelError, nil, err, "reading from stdout")
					}
					break
				}
				if n > 0 {
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
			buf := make([]byte, 4096) // Larger buffer
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
						// Don't break here, allow retrying for transient errors
					}

				case "resize":
					var resizeData ResizeData
					if err := json.Unmarshal(msg.Data, &resizeData); err != nil {
						logger.Log(logger.LevelError, nil, err, "unmarshaling resize data")
						continue
					}

					// Apply stty resize command via stdin
					if resizeData.Width > 0 && resizeData.Height > 0 {
						// Send stty command to resize terminal
						sttyCmd := fmt.Sprintf("stty rows %d columns %d\n", resizeData.Height, resizeData.Width)
						stdin.Write([]byte(sttyCmd))
						logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("Terminal resize: %dx%d", resizeData.Width, resizeData.Height))
					}

				case "ping":
					// Respond to ping with a pong for keepalive
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

// func sendMessage(ws *websocket.Conn, msg *ShellMessage) {
// 	if err := ws.WriteJSON(msg); err != nil {
// 		logger.Log(logger.LevelError, nil, err, "writing message to websocket")
// 	}
// }

// func sendErrorMessage(ws *websocket.Conn, errorMsg string) {
// 	msg := ShellMessage{
// 		Type: "error",
// 		Data: json.RawMessage(fmt.Sprintf("%q", errorMsg)),
// 	}
// 	sendMessage(ws, &msg)
// }
