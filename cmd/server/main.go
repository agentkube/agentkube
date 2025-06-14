package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/agentkube/operator/internal/handlers"
	"github.com/agentkube/operator/internal/routes"
	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
)

type Settings struct {
	Kubeconfig struct {
		ExternalPaths []string `json:"externalPaths"`
	} `json:"kubeconfig"`
}

func main() {
	cfg, err := config.Parse(os.Args)
	if err != nil {
		log.Fatalf("Failed to parse config: %v", err)
	}

	// Initialize context store
	contextStore := kubeconfig.NewContextStore()

	// Load .agentkube kubeconfig
	if cfg.KubeConfigPath != "" {
		logger.Log(logger.LevelInfo, map[string]string{"kubeconfig": cfg.KubeConfigPath}, nil, "Loading kubeconfig")

		err := kubeconfig.LoadAndStoreKubeConfigs(contextStore, cfg.KubeConfigPath, kubeconfig.KubeConfig)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "loading kubeconfig")
		}

		go kubeconfig.LoadAndWatchFiles(contextStore, cfg.KubeConfigPath, kubeconfig.KubeConfig)
	}

	// Load external paths from settings
	homeDir, err := os.UserHomeDir()
	if err == nil {
		settingsPath := filepath.Join(homeDir, ".agentkube", "settings.json")
		if data, err := os.ReadFile(settingsPath); err == nil {
			var settings Settings
			if json.Unmarshal(data, &settings) == nil {
				for _, externalPath := range settings.Kubeconfig.ExternalPaths {
					logger.Log(logger.LevelInfo, map[string]string{"external_path": externalPath}, nil, "Loading external kubeconfig")

					err := kubeconfig.LoadAndStoreKubeConfigs(contextStore, externalPath, kubeconfig.KubeConfig)
					if err != nil {
						logger.Log(logger.LevelError, map[string]string{"external_path": externalPath}, err, "loading external kubeconfig")
					}

					go kubeconfig.LoadAndWatchFiles(contextStore, externalPath, kubeconfig.KubeConfig)
				}
			}
		}
	}

	// Load uploaded/dynamic kubeconfigs from persistent storage
	err = handlers.LoadUploadedKubeconfigs(contextStore)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading uploaded kubeconfigs on startup")
	}

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
