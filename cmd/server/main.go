package main

import (
	"flag"
	"fmt"
	"log"
	"myproject/internal/routes"
	"myproject/pkg/config"
)

func main() {
	// Parse command line flags
	port := flag.Int("port", 4688, "Port to run the server on")
	flag.Parse()

	// Initialize configuration
	cfg := config.Config{
		Port: *port,
	}

	// Setup and start the server
	router := routes.SetupRouter(cfg)

	serverAddr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("Server starting on port %d", cfg.Port)

	if err := router.Run(serverAddr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
