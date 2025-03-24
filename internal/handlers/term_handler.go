package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sync"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/creack/pty"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var terminalUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// TerminalMessage represents a message sent over WebSocket
type TerminalMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

// ResizeData represents terminal dimensions
type ResizeData struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// TermHandler provides a terminal via WebSocket using PTY
func TermHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Upgrade connection to WebSocket
		ws, err := terminalUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "upgrading to websocket connection")
			return
		}
		defer ws.Close()

		// Create command for the shell
		cmd := exec.Command("/bin/bash")

		// Set environment variables
		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "~" // Fallback
		}

		cmd.Env = append(os.Environ(),
			"TERM=xterm-256color",
			fmt.Sprintf("HOME=%s", homeDir),
			"COLORTERM=truecolor",
			"LANG=en_US.UTF-8",
			"LC_ALL=en_US.UTF-8",
			"ZSH_NO_LINE_EDIT=1")

		// Set working directory to home directory
		cmd.Dir = homeDir

		// Start the command with a PTY
		ptmx, err := pty.Start(cmd)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "starting terminal with PTY")
			sendTermMessage(ws, "error", fmt.Sprintf("Error starting shell: %v", err))
			return
		}
		defer ptmx.Close()

		// Set an initial terminal size
		pty.Setsize(ptmx, &pty.Winsize{
			Rows: 24,
			Cols: 80,
			X:    0,
			Y:    0,
		})

		// Disable terminal echo
		disableEcho(ptmx)
		disableZshEcho(ptmx)

		// Create a mutex to protect WebSocket writes
		var wsMutex sync.Mutex

		// Create a wait group for goroutines
		var wg sync.WaitGroup
		wg.Add(1)

		// Terminal -> WebSocket: Read from PTY, write to WebSocket
		go func() {
			defer wg.Done()

			buf := make([]byte, 4096)
			for {
				n, err := ptmx.Read(buf)
				if err != nil {
					if err != io.EOF {
						logger.Log(logger.LevelError, nil, err, "reading from PTY")
						sendTermMessage(ws, "error", fmt.Sprintf("Error reading from terminal: %v", err))
					}
					break
				}

				if n > 0 {
					// Use proper string handling and JSON escaping by letting the JSON encoder handle it
					data := string(buf[:n])

					// Send the message with thread safety
					wsMutex.Lock()
					if err := sendTermMessage(ws, "stdout", data); err != nil {
						wsMutex.Unlock()
						logger.Log(logger.LevelError, nil, err, "writing to websocket")
						break
					}
					wsMutex.Unlock()
				}
			}
		}()

		// WebSocket -> Terminal: Read from WebSocket, write to PTY
		for {
			// Read message from WebSocket
			var msg TerminalMessage
			err := ws.ReadJSON(&msg)
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
					logger.Log(logger.LevelError, nil, err, "reading from websocket")
				}
				break
			}

			// Handle message based on type
			switch msg.Type {
			case "stdin":
				// Write to the PTY
				if _, err := ptmx.Write([]byte(msg.Data)); err != nil {
					logger.Log(logger.LevelError, nil, err, "writing to PTY")
					sendTermMessage(ws, "error", fmt.Sprintf("Error writing to terminal: %v", err))
				}

			case "resize":
				// Handle terminal resize
				var resizeData ResizeData
				if err := json.Unmarshal([]byte(msg.Data), &resizeData); err != nil {
					logger.Log(logger.LevelError, nil, err, "unmarshaling resize data")
					continue
				}

				// Set new terminal size
				pty.Setsize(ptmx, &pty.Winsize{
					Rows: uint16(resizeData.Height),
					Cols: uint16(resizeData.Width),
					X:    0,
					Y:    0,
				})

				logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("Terminal resize: %dx%d", resizeData.Width, resizeData.Height))

			case "ping":
				// Respond to ping with pong
				wsMutex.Lock()
				err := sendTermMessage(ws, "pong", "")
				wsMutex.Unlock()

				if err != nil {
					logger.Log(logger.LevelError, nil, err, "writing pong message")
				}
			}
		}

		// Wait for the read goroutine to finish
		wg.Wait()

		// Wait for the command to exit
		if err := cmd.Wait(); err != nil {
			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("Shell exited with: %v", err))
		}
	}
}

// disableEcho turns off terminal echo
func disableEcho(terminal *os.File) {
	// Run stty to disable echo
	cmd := exec.Command("stty", "-echo")
	cmd.Stdin = terminal
	cmd.Stdout = terminal
	cmd.Stderr = terminal

	if err := cmd.Run(); err != nil {
		logger.Log(logger.LevelWarn, nil, err, "Failed to disable terminal echo")
	}
}

func disableZshEcho(terminal *os.File) {
	// Try stty approach first
	sttyCmd := exec.Command("stty", "-echo", "-icanon", "min", "1", "time", "0")
	sttyCmd.Stdin = terminal
	sttyCmd.Stdout = terminal
	sttyCmd.Stderr = terminal

	if err := sttyCmd.Run(); err != nil {
		logger.Log(logger.LevelWarn, nil, err, "Failed to disable terminal echo with stty")
	}

	// Then try to write zsh-specific config to disable line editing
	_, err := terminal.Write([]byte("unsetopt ZLE\n"))
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "Failed to write zsh config to disable line editing")
	}

	// Disable line editing in zsh
	// _, err = terminal.Write([]byte("bindkey -r \"^[[A\"\n")) // Up arrow
	// if err == nil {}
}

// sendTermMessage sends a message with the specified type and data
func sendTermMessage(ws *websocket.Conn, msgType, data string) error {
	msg := TerminalMessage{
		Type: msgType,
		Data: data,
	}
	return ws.WriteJSON(msg)
}
