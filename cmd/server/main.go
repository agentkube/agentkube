package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/agentkube/operator/config"
	"github.com/agentkube/operator/internal/handlers"
	"github.com/agentkube/operator/internal/routes"
	"github.com/agentkube/operator/pkg/cache"
	internalconfig "github.com/agentkube/operator/pkg/config"
	"github.com/agentkube/operator/pkg/controller"
	"github.com/agentkube/operator/pkg/dispatchers"
	"github.com/agentkube/operator/pkg/dispatchers/webhook"
	"github.com/agentkube/operator/pkg/kubeconfig"
	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/vul"
)

type Settings struct {
	Kubeconfig struct {
		ExternalPaths []string `json:"externalPaths"`
	} `json:"kubeconfig"`
	ImageScans vul.ImageScans `json:"imageScans"`
}

func main() {
	cfg, err := internalconfig.Parse(os.Args)
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

	// Load external paths from settings and initialize vulnerability scanner
	homeDir, err := os.UserHomeDir()
	if err == nil {
		settingsPath := filepath.Join(homeDir, ".agentkube", "settings.json")
		if data, err := os.ReadFile(settingsPath); err == nil {
			var settings Settings
			if json.Unmarshal(data, &settings) == nil {
				for _, externalPath := range settings.Kubeconfig.ExternalPaths {
					logger.Log(logger.LevelInfo, map[string]string{"external_path": externalPath}, nil, "Loading external kubeconfig")

					err := kubeconfig.LoadAndStoreKubeConfigs(contextStore, externalPath, kubeconfig.DynamicCluster)
					if err != nil {
						logger.Log(logger.LevelError, map[string]string{"external_path": externalPath}, err, "loading external kubeconfig")
					}

					go kubeconfig.LoadAndWatchFiles(contextStore, externalPath, kubeconfig.DynamicCluster)
				}

				// Initialize vulnerability scanner if enabled
				if settings.ImageScans.Enable {
					logger.Log(logger.LevelInfo, nil, nil, "Initializing vulnerability scanner")
					vul.ImgScanner = vul.NewImageScanner(settings.ImageScans, slog.Default())
					go func() {
						vul.ImgScanner.Init("agentkube", "1.0.0")
					}()
				}
			}
		}
	}

	// Load uploaded/dynamic kubeconfigs from persistent storage
	err = handlers.LoadUploadedKubeconfigs(contextStore)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading uploaded kubeconfigs on startup")
	}

	// Track if watcher was started
	var watcherStarted bool

	// Load watcher configuration
	watcherConfig, err := config.New()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading watcher config from current directory")
	} else {
		logger.Log(logger.LevelInfo, map[string]string{"config_file": config.GetWatcherConfigFile()}, nil, "Watcher configuration loaded successfully")
		if !watcherConfig.Enabled {
			logger.Log(logger.LevelInfo, nil, nil, "Watcher is disabled in configuration")
		} else {
			var eventHandler dispatchers.Dispatcher = &dispatchers.Default{}

			if watcherConfig.Handler.Webhook.Url == "" {
				watcherConfig.Handler.Webhook.Url = internalconfig.OperatorWebhook
			}
			webhookHandler := &webhook.Webhook{}
			err := webhookHandler.Init(watcherConfig)
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "initializing webhook handler")
				// Fall back to default handler if webhook fails
				eventHandler = &dispatchers.Default{}
			} else {
				eventHandler = webhookHandler
				logger.Log(logger.LevelInfo, map[string]string{"webhook_url": watcherConfig.Handler.Webhook.Url}, nil, "Webhook handler initialized")
			}

			if len(watcherConfig.SkipClusters) > 0 {
				logger.Log(logger.LevelInfo, map[string]string{"skipped_clusters": fmt.Sprintf("%v", watcherConfig.SkipClusters)}, nil, "Clusters to skip")
			}
			if len(watcherConfig.IncludeClusters) > 0 {
				logger.Log(logger.LevelInfo, map[string]string{"included_clusters": fmt.Sprintf("%v", watcherConfig.IncludeClusters)}, nil, "Only watching these clusters")
			}

			go controller.Start(watcherConfig, eventHandler, contextStore)
			watcherStarted = true
			logger.Log(logger.LevelInfo, nil, nil, "Watcher started for filtered clusters")
		}
	}

	portforwardCache := cache.New[interface{}]()

	// router
	router := routes.SetupRouter(*cfg, contextStore, portforwardCache)

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

	srv := &http.Server{
		Addr:    serverAddr,
		Handler: router,
	}

	// Start server in goroutine
	serverErr := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// Setup graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// Wait for interrupt signal or server error
	select {
	case err := <-serverErr:
		log.Fatalf("Server error: %v", err)
	case <-stop:
		logger.Log(logger.LevelInfo, nil, nil, "Shutting down server...")
	}

	// Drain any additional signals (e.g., multiple Ctrl+C presses)
	for len(stop) > 0 {
		<-stop
	}

	// Stop controllers only if started (prevents blockage when watcher is disabled)
	if watcherStarted {
		controller.Stop()
	}

	// Shutdown HTTP server with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Log(logger.LevelError, nil, err, "Server forced to shutdown")
	} else {
		logger.Log(logger.LevelInfo, nil, nil, "Server gracefully stopped")
	}
}
