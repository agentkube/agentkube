package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/creack/pty"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

// TerminalSession represents an active terminal session
type TerminalSession struct {
	ID         string
	ShellToken string
	PTY        *os.File
	Cmd        *exec.Cmd
	LastUsed   time.Time
	WSMutex    sync.Mutex
	WS         *websocket.Conn
	IsActive   bool
}

// TerminalManager handles multiple terminal sessions
type TerminalManager struct {
	Sessions       map[string]*TerminalSession
	TokenToSession map[string]string
	Mutex          sync.RWMutex
}

// Global terminal manager
var termManager = &TerminalManager{
	Sessions:       make(map[string]*TerminalSession),
	TokenToSession: make(map[string]string),
}

// generateShellToken creates a secure token for shell access
func generateShellToken() (string, error) {
	tokenBytes := make([]byte, 32)
	_, err := rand.Read(tokenBytes)
	if err != nil {
		return "", err
	}

	// Create a hash of the random bytes
	hash := sha256.Sum256(tokenBytes)

	// Encode with base64 to make it URL safe
	token := base64.URLEncoding.EncodeToString(hash[:])
	return token, nil
}

// TermHandler provides a terminal via WebSocket using PTY with single endpoint design
func TermHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract session ID and token from query parameters
		sessionID := c.Query("id")
		shellToken := c.Query("shellToken")

		var session *TerminalSession
		var exists bool

		// First check if this is a connection to an existing session
		if sessionID != "" && shellToken != "" {
			termManager.Mutex.RLock()
			// Verify the token matches the session
			if tokenSessionID, tokenExists := termManager.TokenToSession[shellToken]; tokenExists && tokenSessionID == sessionID {
				session, exists = termManager.Sessions[sessionID]
			}
			termManager.Mutex.RUnlock()

			if !exists {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid session ID or shell token",
				})
				return
			}
		} else {
			// Create a new session
			session, shellToken, err := createNewTerminalSession()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("Failed to create terminal session: %v", err),
				})
				return
			}

			// For a new session, if this is not a WebSocket upgrade request,
			// return the session details as JSON
			if !websocket.IsWebSocketUpgrade(c.Request) {
				c.JSON(http.StatusOK, gin.H{
					"id":         session.ID,
					"shellToken": shellToken,
				})
				return
			}

			// Otherwise continue with WebSocket upgrade
			sessionID = session.ID
		}

		// Upgrade connection to WebSocket
		ws, err := terminalUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "upgrading to websocket connection")
			return
		}
		defer ws.Close()

		// Set the WebSocket connection for the session
		session.WS = ws
		session.LastUsed = time.Now()

		// Create a wait group for goroutines
		var wg sync.WaitGroup
		wg.Add(1)

		// Terminal -> WebSocket: Read from PTY, write to WebSocket
		go func() {
			defer wg.Done()

			buf := make([]byte, 4096)
			for {
				n, err := session.PTY.Read(buf)
				if err != nil {
					if err != io.EOF {
						logger.Log(logger.LevelError, nil, err, "reading from PTY")
						sendTermMessage(ws, "error", fmt.Sprintf("Error reading from terminal: %v", err))
					}
					break
				}

				if n > 0 {
					data := string(buf[:n])

					// Send the message with thread safety
					session.WSMutex.Lock()
					if err := sendTermMessage(ws, "stdout", data); err != nil {
						session.WSMutex.Unlock()
						logger.Log(logger.LevelError, nil, err, "writing to websocket")
						break
					}
					session.WSMutex.Unlock()
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

			// Update last used time
			session.LastUsed = time.Now()

			// Handle message based on type
			switch msg.Type {
			case "stdin":
				// Write to the PTY
				if _, err := session.PTY.Write([]byte(msg.Data)); err != nil {
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
				pty.Setsize(session.PTY, &pty.Winsize{
					Rows: uint16(resizeData.Height),
					Cols: uint16(resizeData.Width),
					X:    0,
					Y:    0,
				})

				logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("Terminal resize: %dx%d", resizeData.Width, resizeData.Height))

			case "ping":
				// Respond to ping with pong
				session.WSMutex.Lock()
				err := sendTermMessage(ws, "pong", "")
				session.WSMutex.Unlock()

				if err != nil {
					logger.Log(logger.LevelError, nil, err, "writing pong message")
				}

			case "close":
				// Close the session
				closeTerminalSession(session.ID)
				return
			}
		}

		// Wait for the read goroutine to finish
		wg.Wait()

		// When WebSocket connection closes, mark the session for cleanup
		// but keep it alive for potential reconnection
		session.WS = nil

		// Start a cleanup goroutine to terminate idle sessions
		go func() {
			// Wait for some time to allow reconnection
			time.Sleep(5 * time.Minute)

			termManager.Mutex.RLock()
			sess, exists := termManager.Sessions[sessionID]
			termManager.Mutex.RUnlock()

			// Check if the session still exists and is still disconnected
			if exists && sess.WS == nil {
				closeTerminalSession(sessionID)
			}
		}()
	}
}

// createNewTerminalSession creates a new terminal session
func createNewTerminalSession() (*TerminalSession, string, error) {
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
		return nil, "", fmt.Errorf("starting terminal with PTY: %w", err)
	}

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

	// Generate session ID
	sessionID := uuid.New().String()

	// Generate shell token
	shellToken, err := generateShellToken()
	if err != nil {
		ptmx.Close()
		return nil, "", fmt.Errorf("generating shell token: %w", err)
	}

	// Create a new session
	session := &TerminalSession{
		ID:         sessionID,
		ShellToken: shellToken,
		PTY:        ptmx,
		Cmd:        cmd,
		LastUsed:   time.Now(),
		IsActive:   true,
	}

	// Add to sessions map
	termManager.Mutex.Lock()
	termManager.Sessions[session.ID] = session
	termManager.TokenToSession[shellToken] = session.ID
	termManager.Mutex.Unlock()

	return session, shellToken, nil
}

// closeTerminalSession closes a session and removes it from the manager
func closeTerminalSession(id string) {
	termManager.Mutex.Lock()
	defer termManager.Mutex.Unlock()

	session, exists := termManager.Sessions[id]
	if !exists {
		return
	}

	session.IsActive = false

	// Close the PTY
	if session.PTY != nil {
		session.PTY.Close()
	}

	// Send termination message to client if websocket is still open
	if session.WS != nil {
		sendTermMessage(session.WS, "terminated", "Terminal session closed")
		session.WS.Close()
	}

	// Remove the token to session mapping
	delete(termManager.TokenToSession, session.ShellToken)
	// Remove the session
	delete(termManager.Sessions, id)

	// Wait for the command to exit
	if session.Cmd != nil {
		session.Cmd.Wait()
	}
}

// StartTerminalCleanupTask starts a periodic task to clean up inactive terminal sessions
func StartTerminalCleanupTask() {
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			cleanupInactiveSessions()
		}
	}()
}

// cleanupInactiveSessions closes sessions that have been inactive for more than 2 hours
func cleanupInactiveSessions() {
	termManager.Mutex.Lock()
	defer termManager.Mutex.Unlock()

	cutoff := time.Now().Add(-2 * time.Hour)
	for id, session := range termManager.Sessions {
		if session.LastUsed.Before(cutoff) {
			// Close the PTY
			if session.PTY != nil {
				session.PTY.Close()
			}

			// Remove the token to session mapping
			delete(termManager.TokenToSession, session.ShellToken)
			// Remove the session
			delete(termManager.Sessions, id)

			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("Cleaned up inactive terminal session: %s", id))
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

// disableZshEcho turns off zsh echo settings
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
}

// sendTermMessage sends a message with the specified type and data
func sendTermMessage(ws *websocket.Conn, msgType, data string) error {
	msg := TerminalMessage{
		Type: msgType,
		Data: data,
	}
	return ws.WriteJSON(msg)
}
