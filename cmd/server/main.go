package main

import (
	"fmt"
	"log"
	"os"

	"github.com/agentkube/operator/internal/routes"
	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
)

func main() {
	// Parse config
	cfg, err := config.Parse(os.Args)
	if err != nil {
		log.Fatalf("Failed to parse config: %v", err)
	}

	// Initialize context store
	contextStore := kubeconfig.NewContextStore()

	// If a kubeconfig path is provided, load it
	if cfg.KubeConfigPath != "" {
		logger.Log(logger.LevelInfo, map[string]string{"kubeconfig": cfg.KubeConfigPath}, nil, "Loading kubeconfig")

		err := kubeconfig.LoadAndStoreKubeConfigs(contextStore, cfg.KubeConfigPath, kubeconfig.KubeConfig)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "loading kubeconfig")
		}

		// Start watching kubeconfig file for changes
		go kubeconfig.LoadAndWatchFiles(contextStore, cfg.KubeConfigPath, kubeconfig.KubeConfig)
	}

	// Initialize cache for portforward
	portforwardCache := cache.New[interface{}]()

	// Setup and start the server
	router := routes.SetupRouter(*cfg, contextStore, portforwardCache)

	// Determine address to listen on
	var serverAddr string
	if cfg.ListenAddr != "" {
		serverAddr = fmt.Sprintf("%s:%d", cfg.ListenAddr, cfg.Port)
	} else {
		serverAddr = fmt.Sprintf(":%d", cfg.Port)
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"address":    serverAddr,
		"in_cluster": fmt.Sprintf("%t", cfg.InCluster),
		"kubeconfig": cfg.KubeConfigPath,
	}, nil, "Server starting")

	if err := router.Run(serverAddr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
