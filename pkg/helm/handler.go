package helm

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/agentkube/operator/pkg/cache"
	"github.com/agentkube/operator/pkg/logger"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	// Status constants
	Success    = "success"
	Failed     = "failed"
	Processing = "processing"

	// Cache timeout for status
	statusCacheTimeout = 20 * time.Minute
)

var (
	_        genericclioptions.RESTClientGetter = &restConfigGetter{}
	settings                                    = cli.New()
)

type Handler struct {
	*action.Configuration
	*cli.EnvSettings
	Cache cache.Cache[interface{}]
}

type Stat struct {
	Status string
	Err    *string
}

func NewActionConfig(clientConfig clientcmd.ClientConfig, namespace string) (*action.Configuration, error) {
	actionConfig := new(action.Configuration)
	restConfGetter := &restConfigGetter{
		clientConfig: clientConfig,
		namespace:    namespace,
	}
	logger := func(format string, a ...interface{}) {
		logger.Log(logger.LevelInfo, map[string]string{"namespace": namespace},
			nil, format+"\n"+fmt.Sprintf("%v", a))
	}

	err := actionConfig.Init(restConfGetter, namespace, "secret", logger)
	if err != nil {
		return nil, err
	}

	return actionConfig, nil
}

func NewHandler(clientConfig clientcmd.ClientConfig,
	cache cache.Cache[interface{}], namespace string,
) (*Handler, error) {
	return NewHandlerWithSettings(clientConfig, cache, namespace, settings)
}

func NewHandlerWithSettings(clientConfig clientcmd.ClientConfig,
	cache cache.Cache[interface{}],
	namespace string, settings *cli.EnvSettings,
) (*Handler, error) {
	actionConfig, err := NewActionConfig(clientConfig, namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"namespace": namespace},
			err, "unable to create action config")

		return nil, err
	}

	return &Handler{
		Configuration: actionConfig,
		EnvSettings:   settings,
		Cache:         cache,
	}, nil
}

// https://github.com/helm/helm/issues/6910#issuecomment-601277026
type restConfigGetter struct {
	clientConfig clientcmd.ClientConfig
	namespace    string
}

func (r *restConfigGetter) ToRESTConfig() (*rest.Config, error) {
	config, err := r.clientConfig.ClientConfig()
	if err != nil {
		return nil, err
	}
	
	// Configure timeouts to prevent premature failures
	config.Timeout = 5 * time.Minute         // Overall timeout for requests
	config.QPS = 50                          // Increase queries per second
	config.Burst = 100                       // Increase burst capacity
	
	return config, nil
}

func (r *restConfigGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return r.clientConfig
}

func (r *restConfigGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	config, err := r.ToRESTConfig()
	if err != nil {
		return nil, err
	}

	// The more groups you have, the more discovery requests you need to make.
	// given 25 groups (our groups + a few custom conf) with one-ish version each, discovery needs to make 50 requests
	// Increase limits significantly to handle complex charts like Trivy with many CRDs
	config.Burst = 200
	config.QPS = 100
	config.Timeout = 2 * time.Minute  // Discovery timeout

	discoveryClient, _ := discovery.NewDiscoveryClientForConfig(config)

	return memory.NewMemCacheClient(discoveryClient), nil
}

func (r *restConfigGetter) ToRESTMapper() (meta.RESTMapper, error) {
	discoveryClient, err := r.ToDiscoveryClient()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "unable to create discovery client")

		return nil, err
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(discoveryClient)
	expander := restmapper.NewShortcutExpander(mapper, discoveryClient, nil)

	return expander, nil
}

// GetReleaseStatus returns the status of the release.
func (h *Handler) GetReleaseStatus(actionName, releaseName string) (*Stat, error) {
	key := "helm_" + actionName + "_" + releaseName

	value, err := h.Cache.Get(context.Background(), key)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key},
			err, "unable to get cache value")

		return nil, err
	}

	valueBytes, err := json.Marshal(value)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key},
			err, "unable to marshal cache value")

		return nil, err
	}

	var stat Stat

	err = json.Unmarshal(valueBytes, &stat)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key},
			err, "unable to unmarshal cache value")

		return nil, err
	}

	return &stat, nil
}

// SetReleaseStatus sets the status of the release
// Key of the object is action_name + "_" + release_name
// action_name is the name of the action, e.g. install, upgrade, delete
// status is one of the following: processing, success, failed.
func (h *Handler) SetReleaseStatus(actionName, releaseName, status string, err error) error {
	key := "helm_" + actionName + "_" + releaseName

	stat := Stat{
		Status: status,
	}

	if err != nil {
		errString := err.Error()
		stat.Err = &errString
	}

	cacheErr := h.Cache.SetWithTTL(context.Background(), key, stat, statusCacheTimeout)
	if cacheErr != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key, "status": status},
			cacheErr, "unable to set cache value")

		return cacheErr
	}

	return nil
}

func (h *Handler) SetReleaseStatusSilent(actionName, releaseName, status string, err error) {
	cacheErr := h.SetReleaseStatus(actionName, releaseName, status, err)
	if cacheErr != nil {
		logger.Log(logger.LevelError, map[string]string{"releaseName": releaseName, "status": status},
			cacheErr, "unable to set status")
	}
}
