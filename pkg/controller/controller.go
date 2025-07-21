package controller

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"reflect"
	"strings"
	"sync"
	"syscall"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"

	config "github.com/agentkube/operator/config"
	"github.com/agentkube/operator/pkg/dispatchers"
	event "github.com/agentkube/operator/pkg/event"
	"github.com/agentkube/operator/pkg/kubeconfig"
	utils "github.com/agentkube/operator/pkg/utils"
	"github.com/sirupsen/logrus"

	apps_v1 "k8s.io/api/apps/v1"
	autoscaling_v1 "k8s.io/api/autoscaling/v1"
	batch_v1 "k8s.io/api/batch/v1"
	api_v1 "k8s.io/api/core/v1"
	events_v1 "k8s.io/api/events/v1"
	networking_v1 "k8s.io/api/networking/v1"
	rbac_v1 "k8s.io/api/rbac/v1"
	meta_v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const maxRetries = 5
const V1 = "v1"
const AUTOSCALING_V1 = "autoscaling/v1"
const APPS_V1 = "apps/v1"
const BATCH_V1 = "batch/v1"
const RBAC_V1 = "rbac.authorization.k8s.io/v1"
const NETWORKING_V1 = "networking.k8s.io/v1"
const EVENTS_V1 = "events.k8s.io/v1"

// Cache sync timeout
// const cacheSyncTimeout = 30 * time.Second

var serverStartTime time.Time

// Global manager for shutdown coordination
var globalManager *WatcherManager

// Event indicate the informerEvent
type Event struct {
	key          string
	eventType    string
	namespace    string
	resourceType string
	apiVersion   string
	obj          runtime.Object
	oldObj       runtime.Object
}

// Controller object
type Controller struct {
	logger       *logrus.Entry
	clientset    kubernetes.Interface
	queue        workqueue.RateLimitingInterface
	informer     cache.SharedIndexInformer
	eventHandler dispatchers.Dispatcher
	clusterName  string
	stopCh       chan struct{}
	mutex        sync.RWMutex
	stopped      bool
}

// WatcherManager coordinates shutdown of all watchers
type WatcherManager struct {
	watchers []ShutdownHandler
	mutex    sync.RWMutex
	stopCh   chan struct{}
	done     chan struct{}
}

// ShutdownHandler interface for graceful shutdown
type ShutdownHandler interface {
	Stop()
	WaitForShutdown(timeout time.Duration) bool
}

// ClusterWatcher manages all controllers for a single cluster
type ClusterWatcher struct {
	clusterName string
	controllers []*Controller
	stopCh      chan struct{}
	mutex       sync.RWMutex
	stopped     bool
}

func objName(obj interface{}) string {
	return reflect.TypeOf(obj).Name()
}

// Initialize the global manager
func init() {
	globalManager = &WatcherManager{
		watchers: make([]ShutdownHandler, 0),
		stopCh:   make(chan struct{}),
		done:     make(chan struct{}),
	}
}

// Start prepares watchers and run their controllers for all clusters, then waits for process termination signals
func Start(conf *config.Config, eventHandler dispatchers.Dispatcher, contextStore kubeconfig.ContextStore) {
	// Check if watcher is enabled
	if !conf.Enabled {
		logrus.Info("Watcher is disabled in configuration")
		return
	}

	kubewatchEventsMetrics := promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agentkube_events_total",
			Help: "The total number of Kubernetes events observed by Agentkube, labeled by resource and event type",
		},
		[]string{"resourceType", "eventType", "clusterName"},
	)

	serverStartTime = time.Now().Local()

	// Get all available contexts from the store
	contexts, err := contextStore.GetContexts()
	if err != nil {
		logrus.Errorf("Failed to get contexts from store: %v", err)
		return
	}

	logrus.Infof("Found %d clusters, filtering based on configuration", len(contexts))

	// Start watchers for each cluster context
	globalManager.mutex.Lock()
	watchedCount := 0
	for _, ctx := range contexts {
		if ctx.Internal {
			continue // Skip internal/temporary contexts
		}

		// ADD THIS CHECK:
		if !shouldWatchCluster(ctx.Name, conf) {
			logrus.Infof("Skipping cluster '%s' due to configuration", ctx.Name)
			continue
		}

		watcher := startClusterWatcher(ctx, conf, eventHandler, kubewatchEventsMetrics)
		if watcher != nil {
			globalManager.watchers = append(globalManager.watchers, watcher)
			watchedCount++
		}
	}
	globalManager.mutex.Unlock()

	logrus.Infof("Started watchers for %d clusters (filtered from %d total)", watchedCount, len(contexts))

	// Handle graceful shutdown
	sigterm := make(chan os.Signal, 1)
	signal.Notify(sigterm, syscall.SIGTERM)
	signal.Notify(sigterm, syscall.SIGINT)

	select {
	case <-sigterm:
		logrus.Info("Received shutdown signal, gracefully shutting down watcher controllers...")
		gracefulShutdown()
	case <-globalManager.stopCh:
		logrus.Info("Received internal stop signal, shutting down watcher controllers...")
		gracefulShutdown()
	}
}

// gracefulShutdown performs coordinated shutdown of all watchers
func gracefulShutdown() {
	globalManager.mutex.Lock()
	defer globalManager.mutex.Unlock()

	if len(globalManager.watchers) == 0 {
		logrus.Info("No watchers to shutdown")
		close(globalManager.done)
		return
	}

	logrus.Infof("Shutting down %d cluster watchers...", len(globalManager.watchers))

	// Create a wait group to coordinate shutdown
	var wg sync.WaitGroup
	shutdownTimeout := 15 * time.Second

	for i, watcher := range globalManager.watchers {
		wg.Add(1)
		go func(idx int, w ShutdownHandler) {
			defer wg.Done()

			logrus.Infof("Stopping watcher %d...", idx+1)
			w.Stop()

			if !w.WaitForShutdown(shutdownTimeout) {
				logrus.Warnf("Watcher %d did not shutdown gracefully within timeout", idx+1)
			} else {
				logrus.Infof("Watcher %d shutdown successfully", idx+1)
			}
		}(i, watcher)
	}

	// Wait for all watchers to shutdown
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		logrus.Info("All watcher controllers shutdown successfully")
	case <-time.After(30 * time.Second):
		logrus.Warn("Timeout waiting for all controllers to shutdown")
	}

	close(globalManager.done)
}

// Stop stops the global watcher manager
func Stop() {
	close(globalManager.stopCh)
	<-globalManager.done
}

func startClusterWatcher(ctx *kubeconfig.Context, conf *config.Config, eventHandler dispatchers.Dispatcher, kubewatchEventsMetrics *prometheus.CounterVec) *ClusterWatcher {
	logrus.Infof("Starting watcher for cluster: %s", ctx.Name)

	// Get REST config for this context
	restConfig, err := ctx.RESTConfig()
	if err != nil {
		logrus.Errorf("Failed to get REST config for cluster %s: %v", ctx.Name, err)
		return nil
	}

	// Create kubernetes client for this cluster
	kubeClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		logrus.Errorf("Failed to create kubernetes client for cluster %s: %v", ctx.Name, err)
		return nil
	}

	// Create dynamic client for this cluster
	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		logrus.Errorf("Failed to create dynamic client for cluster %s: %v", ctx.Name, err)
		return nil
	}

	// Create cluster watcher
	clusterWatcher := &ClusterWatcher{
		clusterName: ctx.Name,
		stopCh:      make(chan struct{}),
		stopped:     false,
	}

	// Start resource watchers for this cluster
	controllers := startResourceWatchers(ctx.Name, kubeClient, dynamicClient, conf, eventHandler, kubewatchEventsMetrics, clusterWatcher.stopCh)
	clusterWatcher.controllers = controllers

	return clusterWatcher
}

// Stop gracefully stops all controllers for this cluster
func (cw *ClusterWatcher) Stop() {
	cw.mutex.Lock()
	defer cw.mutex.Unlock()

	if cw.stopped {
		return
	}

	logrus.Infof("Stopping watchers for cluster: %s", cw.clusterName)
	cw.stopped = true
	close(cw.stopCh)
}

// WaitForShutdown waits for all controllers to shutdown within the timeout
func (cw *ClusterWatcher) WaitForShutdown(timeout time.Duration) bool {
	if len(cw.controllers) == 0 {
		return true
	}

	done := make(chan struct{})
	go func() {
		var wg sync.WaitGroup
		for _, controller := range cw.controllers {
			wg.Add(1)
			go func(c *Controller) {
				defer wg.Done()
				c.waitForShutdown()
			}(controller)
		}
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

func startResourceWatchers(clusterName string, kubeClient kubernetes.Interface, dynamicClient dynamic.Interface, conf *config.Config, eventHandler dispatchers.Dispatcher, kubewatchEventsMetrics *prometheus.CounterVec, stopCh chan struct{}) []*Controller {
	var controllers []*Controller

	// Core Events
	if conf.Resource.CoreEvent {
		allCoreEventsInformer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					options.FieldSelector = ""
					return kubeClient.CoreV1().Events(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					options.FieldSelector = ""
					return kubeClient.CoreV1().Events(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.Event{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, allCoreEventsInformer, objName(api_v1.Event{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Events
	if conf.Resource.Event {
		allEventsInformer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					options.FieldSelector = ""
					return kubeClient.EventsV1().Events(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					options.FieldSelector = ""
					return kubeClient.EventsV1().Events(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&events_v1.Event{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, allEventsInformer, objName(events_v1.Event{}), EVENTS_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Pods
	if conf.Resource.Pod {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().Pods(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().Pods(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.Pod{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.Pod{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// HPA
	if conf.Resource.HPA {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.AutoscalingV1().HorizontalPodAutoscalers(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.AutoscalingV1().HorizontalPodAutoscalers(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&autoscaling_v1.HorizontalPodAutoscaler{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(autoscaling_v1.HorizontalPodAutoscaler{}), AUTOSCALING_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// DaemonSets
	if conf.Resource.DaemonSet {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.AppsV1().DaemonSets(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.AppsV1().DaemonSets(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&apps_v1.DaemonSet{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(apps_v1.DaemonSet{}), APPS_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// StatefulSets
	if conf.Resource.StatefulSet {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.AppsV1().StatefulSets(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.AppsV1().StatefulSets(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&apps_v1.StatefulSet{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(apps_v1.StatefulSet{}), APPS_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// ReplicaSets
	if conf.Resource.ReplicaSet {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.AppsV1().ReplicaSets(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.AppsV1().ReplicaSets(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&apps_v1.ReplicaSet{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(apps_v1.ReplicaSet{}), APPS_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Services
	if conf.Resource.Services {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().Services(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().Services(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.Service{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.Service{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Deployments
	if conf.Resource.Deployment {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.AppsV1().Deployments(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.AppsV1().Deployments(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&apps_v1.Deployment{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(apps_v1.Deployment{}), APPS_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Namespaces
	if conf.Resource.Namespace {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().Namespaces().List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().Namespaces().Watch(context.Background(), options)
				},
			},
			&api_v1.Namespace{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.Namespace{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// ReplicationControllers
	if conf.Resource.ReplicationController {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().ReplicationControllers(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().ReplicationControllers(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.ReplicationController{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.ReplicationController{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Jobs
	if conf.Resource.Job {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.BatchV1().Jobs(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.BatchV1().Jobs(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&batch_v1.Job{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(batch_v1.Job{}), BATCH_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Nodes
	if conf.Resource.Node {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().Nodes().List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().Nodes().Watch(context.Background(), options)
				},
			},
			&api_v1.Node{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.Node{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// ServiceAccounts
	if conf.Resource.ServiceAccount {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().ServiceAccounts(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().ServiceAccounts(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.ServiceAccount{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.ServiceAccount{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// ClusterRoles
	if conf.Resource.ClusterRole {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.RbacV1().ClusterRoles().List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.RbacV1().ClusterRoles().Watch(context.Background(), options)
				},
			},
			&rbac_v1.ClusterRole{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(rbac_v1.ClusterRole{}), RBAC_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// ClusterRoleBindings
	if conf.Resource.ClusterRoleBinding {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.RbacV1().ClusterRoleBindings().List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.RbacV1().ClusterRoleBindings().Watch(context.Background(), options)
				},
			},
			&rbac_v1.ClusterRoleBinding{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(rbac_v1.ClusterRoleBinding{}), RBAC_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// PersistentVolumes
	if conf.Resource.PersistentVolume {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().PersistentVolumes().List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().PersistentVolumes().Watch(context.Background(), options)
				},
			},
			&api_v1.PersistentVolume{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.PersistentVolume{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Secrets
	if conf.Resource.Secret {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().Secrets(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().Secrets(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.Secret{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.Secret{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// ConfigMaps
	if conf.Resource.ConfigMap {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.CoreV1().ConfigMaps(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.CoreV1().ConfigMaps(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&api_v1.ConfigMap{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(api_v1.ConfigMap{}), V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Ingresses
	if conf.Resource.Ingress {
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return kubeClient.NetworkingV1().Ingresses(conf.Namespace).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return kubeClient.NetworkingV1().Ingresses(conf.Namespace).Watch(context.Background(), options)
				},
			},
			&networking_v1.Ingress{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, objName(networking_v1.Ingress{}), NETWORKING_V1, kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	// Custom Resources
	for _, curRes := range conf.CustomResources {
		crd := curRes
		informer := cache.NewSharedIndexInformer(
			&cache.ListWatch{
				ListFunc: func(options meta_v1.ListOptions) (runtime.Object, error) {
					return dynamicClient.Resource(schema.GroupVersionResource{
						Group:    crd.Group,
						Version:  crd.Version,
						Resource: crd.Resource,
					}).List(context.Background(), options)
				},
				WatchFunc: func(options meta_v1.ListOptions) (watch.Interface, error) {
					return dynamicClient.Resource(schema.GroupVersionResource{
						Group:    crd.Group,
						Version:  crd.Version,
						Resource: crd.Resource,
					}).Watch(context.Background(), options)
				},
			},
			&unstructured.Unstructured{},
			0,
			cache.Indexers{},
		)

		controller := newResourceController(clusterName, kubeClient, eventHandler, informer, crd.Resource, fmt.Sprintf("%s/%s", crd.Group, crd.Version), kubewatchEventsMetrics, stopCh)
		controllers = append(controllers, controller)
		go controller.Run()
	}

	return controllers
}

func newResourceController(clusterName string, client kubernetes.Interface, eventHandler dispatchers.Dispatcher, informer cache.SharedIndexInformer, resourceType string, apiVersion string, kubewatchEventsMetrics *prometheus.CounterVec, stopCh chan struct{}) *Controller {
	queue := workqueue.NewRateLimitingQueue(workqueue.DefaultControllerRateLimiter())
	var newEvent Event
	var err error

	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			var ok bool
			newEvent.namespace = ""
			newEvent.key, err = cache.MetaNamespaceKeyFunc(obj)
			newEvent.eventType = "create"
			newEvent.resourceType = resourceType
			newEvent.apiVersion = apiVersion
			newEvent.obj, ok = obj.(runtime.Object)
			if !ok {
				logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Errorf("cannot convert to runtime.Object for add on %v", obj)
			}
			logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Infof("Processing add to %v: %s", resourceType, newEvent.key)
			if err == nil {
				queue.Add(newEvent)
			}

			kubewatchEventsMetrics.WithLabelValues(resourceType, "create", clusterName).Inc()
		},
		UpdateFunc: func(old, new interface{}) {
			var ok bool
			newEvent.namespace = ""
			newEvent.key, err = cache.MetaNamespaceKeyFunc(old)
			newEvent.eventType = "update"
			newEvent.resourceType = resourceType
			newEvent.apiVersion = apiVersion
			newEvent.obj, ok = new.(runtime.Object)
			if !ok {
				logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Errorf("cannot convert to runtime.Object for update on %v", new)
			}
			newEvent.oldObj, ok = old.(runtime.Object)
			if !ok {
				logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Errorf("cannot convert old to runtime.Object for update on %v", old)
			}
			logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Infof("Processing update to %v: %s", resourceType, newEvent.key)
			if err == nil {
				queue.Add(newEvent)
			}

			kubewatchEventsMetrics.WithLabelValues(resourceType, "update", clusterName).Inc()
		},
		DeleteFunc: func(obj interface{}) {
			var ok bool
			newEvent.namespace = ""
			newEvent.key, err = cache.DeletionHandlingMetaNamespaceKeyFunc(obj)
			newEvent.eventType = "delete"
			newEvent.resourceType = resourceType
			newEvent.apiVersion = apiVersion
			newEvent.obj, ok = obj.(runtime.Object)
			if !ok {
				logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Errorf("cannot convert to runtime.Object for delete on %v", obj)
			}
			logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName).Infof("Processing delete to %v: %s", resourceType, newEvent.key)
			if err == nil {
				queue.Add(newEvent)
			}

			kubewatchEventsMetrics.WithLabelValues(resourceType, "delete", clusterName).Inc()
		},
	})

	return &Controller{
		logger:       logrus.WithField("pkg", "watcher-"+resourceType).WithField("cluster", clusterName),
		clientset:    client,
		informer:     informer,
		queue:        queue,
		eventHandler: eventHandler,
		clusterName:  clusterName,
		stopCh:       stopCh,
		stopped:      false,
	}
}

// Run starts the watcher controller
func (c *Controller) Run() {
	defer utilruntime.HandleCrash()
	defer c.queue.ShutDown()

	c.logger.Info("Starting watcher controller")

	go c.informer.Run(c.stopCh)

	// Wait for cache sync with timeout
	syncCtx, syncCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer syncCancel()

	syncDone := make(chan bool, 1)
	go func() {
		syncDone <- cache.WaitForCacheSync(c.stopCh, c.HasSynced)
	}()

	select {
	case synced := <-syncDone:
		if !synced {
			c.logger.Error("Failed to sync cache")
			return
		}
	case <-syncCtx.Done():
		c.logger.Warn("Cache sync timeout, continuing anyway")
		// Continue anyway - some controllers might still work
	case <-c.stopCh:
		c.logger.Info("Controller stopped during cache sync")
		return
	}

	c.logger.Info("Watcher controller synced and ready")

	// Use a context that can be cancelled when stop is requested
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-c.stopCh
		cancel()
	}()

	wait.UntilWithContext(ctx, c.runWorker, time.Second)
	c.logger.Info("Controller stopped")
}

// waitForShutdown waits for the controller to shutdown gracefully
func (c *Controller) waitForShutdown() {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	if c.stopped {
		return
	}

	c.stopped = true
	c.logger.Info("Controller shutdown complete")
}

// HasSynced is required for the cache.Controller interface.
func (c *Controller) HasSynced() bool {
	return c.informer.HasSynced()
}

// LastSyncResourceVersion is required for the cache.Controller interface.
func (c *Controller) LastSyncResourceVersion() string {
	return c.informer.LastSyncResourceVersion()
}

func (c *Controller) runWorker(ctx context.Context) {
	for c.processNextItem(ctx) {
		// continue looping
	}
}

func (c *Controller) processNextItem(ctx context.Context) bool {
	select {
	case <-ctx.Done():
		return false
	default:
	}

	newEvent, quit := c.queue.Get()

	if quit {
		return false
	}
	defer c.queue.Done(newEvent)

	err := c.processItem(newEvent.(Event))
	if err == nil {
		// No error, reset the ratelimit counters
		c.queue.Forget(newEvent)
	} else if c.queue.NumRequeues(newEvent) < maxRetries {
		c.logger.Errorf("Error processing %s (will retry): %v", newEvent.(Event).key, err)
		c.queue.AddRateLimited(newEvent)
	} else {
		// err != nil and too many retries
		c.logger.Errorf("Error processing %s (giving up): %v", newEvent.(Event).key, err)
		c.queue.Forget(newEvent)
		utilruntime.HandleError(err)
	}

	return true
}

func (c *Controller) processItem(newEvent Event) error {
	// NOTE that obj will be nil on deletes!
	obj, _, err := c.informer.GetIndexer().GetByKey(newEvent.key)

	if err != nil {
		return fmt.Errorf("error fetching object with key %s from store: %v", newEvent.key, err)
	}
	// get object's metedata
	objectMeta := utils.GetObjectMetaData(obj)

	// hold status type for default critical alerts
	var status string

	// namespace retrived from event key incase namespace value is empty
	if newEvent.namespace == "" && strings.Contains(newEvent.key, "/") {
		substring := strings.Split(newEvent.key, "/")
		newEvent.namespace = substring[0]
		newEvent.key = substring[1]
	} else {
		newEvent.namespace = objectMeta.Namespace
	}

	// process events based on its type
	switch newEvent.eventType {
	case "create":
		// compare CreationTimestamp and serverStartTime and alert only on latest events
		// Could be Replaced by using Delta or DeltaFIFO
		if objectMeta.CreationTimestamp.Sub(serverStartTime).Seconds() > 0 {
			switch newEvent.resourceType {
			case "NodeNotReady":
				status = "Danger"
			case "NodeReady":
				status = "Normal"
			case "NodeRebooted":
				status = "Danger"
			case "Backoff":
				status = "Danger"
			default:
				status = "Normal"
			}
			kubeEvent := event.Event{
				Name:       newEvent.key,
				Namespace:  newEvent.namespace,
				Kind:       newEvent.resourceType,
				ApiVersion: newEvent.apiVersion,
				Status:     status,
				Reason:     "Created",
				Obj:        newEvent.obj,
				Component:  c.clusterName,
				Host:       c.clusterName,
			}
			c.eventHandler.Handle(kubeEvent)
			return nil
		}
	case "update":
		/* TODOs
		- enhance update event processing in such a way that, it send alerts about what got changed.
		*/
		switch newEvent.resourceType {
		case "Backoff":
			status = "Danger"
		default:
			status = "Warning"
		}
		kubeEvent := event.Event{
			Name:       newEvent.key,
			Namespace:  newEvent.namespace,
			Kind:       newEvent.resourceType,
			ApiVersion: newEvent.apiVersion,
			Status:     status,
			Reason:     "Updated",
			Obj:        newEvent.obj,
			OldObj:     newEvent.oldObj,
			Component:  c.clusterName,
			Host:       c.clusterName,
		}
		c.eventHandler.Handle(kubeEvent)
		return nil
	case "delete":
		kubeEvent := event.Event{
			Name:       newEvent.key,
			Namespace:  newEvent.namespace,
			Kind:       newEvent.resourceType,
			ApiVersion: newEvent.apiVersion,
			Status:     "Danger",
			Reason:     "Deleted",
			Obj:        newEvent.obj,
			Component:  c.clusterName,
			Host:       c.clusterName,
		}
		c.eventHandler.Handle(kubeEvent)
		return nil
	}
	return nil
}

// shouldWatchCluster determines if a cluster should be watched based on config
func shouldWatchCluster(clusterName string, conf *config.Config) bool {
	// If include list is specified, only watch clusters in the list
	if len(conf.IncludeClusters) > 0 {
		for _, included := range conf.IncludeClusters {
			if included == clusterName {
				return true
			}
		}
		return false
	}

	// If skip list is specified, don't watch clusters in the list
	if len(conf.SkipClusters) > 0 {
		for _, skipped := range conf.SkipClusters {
			if skipped == clusterName {
				return false
			}
		}
	}

	return true
}
