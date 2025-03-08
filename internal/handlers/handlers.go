package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow connections from any origin
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
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

// WebSocketHandler handles WebSocket connections
func WebSocketHandler(c *gin.Context) {
	// Upgrade HTTP connection to WebSocket
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}
	defer ws.Close()

	// Register client, manage connections etc.
	// This is just a simple example - you may want to implement a more robust solution

	// Simple echo websocket handler
	for {
		messageType, message, err := ws.ReadMessage()
		if err != nil {
			log.Printf("Error reading WebSocket message: %v", err)
			break
		}

		log.Printf("Received WebSocket message: %s", message)

		// Echo the message back
		if err := ws.WriteMessage(messageType, message); err != nil {
			log.Printf("Error writing WebSocket message: %v", err)
			break
		}
	}
}
