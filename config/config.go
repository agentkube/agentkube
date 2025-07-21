//go:generate bash -c "go install ../tools/yannotated && yannotated -o sample.go -format go -package config -type Config"

package config

import (
	"io"
	"os"
	"path/filepath"
	"runtime"

	"gopkg.in/yaml.v3"
)

var (
	// ConfigFileName stores file of config
	ConfigFileName = "watcher.yaml"

	// ConfigSample is a sample configuration file.
	ConfigSample = yannotated
)

// Handler contains handler configuration
type Handler struct {
	Slack        Slack        `json:"slack,omitempty" yaml:"slack,omitempty"`
	SlackWebhook SlackWebhook `json:"slackwebhook,omitempty" yaml:"slackwebhook,omitempty"`
	Hipchat      Hipchat      `json:"hipchat,omitempty" yaml:"hipchat,omitempty"`
	Mattermost   Mattermost   `json:"mattermost,omitempty" yaml:"mattermost,omitempty"`
	Flock        Flock        `json:"flock,omitempty" yaml:"flock,omitempty"`
	Webhook      Webhook      `json:"webhook" yaml:"webhook"`
	CloudEvent   CloudEvent   `json:"cloudevent,omitempty" yaml:"cloudevent,omitempty"`
	MSTeams      MSTeams      `json:"msteams,omitempty" yaml:"msteams,omitempty"`
	SMTP         SMTP         `json:"smtp,omitempty" yaml:"smtp,omitempty"`
	Lark         Lark         `json:"lark,omitempty" yaml:"lark,omitempty"`
}

// Resource contains resource configuration
type Resource struct {
	Deployment            bool `json:"deployment" yaml:"deployment"`
	ReplicationController bool `json:"replicationcontroller,omitempty" yaml:"replicationcontroller,omitempty"`
	ReplicaSet            bool `json:"replicaset,omitempty" yaml:"replicaset,omitempty"`
	DaemonSet             bool `json:"daemonset,omitempty" yaml:"daemonset,omitempty"`
	StatefulSet           bool `json:"statefulset,omitempty" yaml:"statefulset,omitempty"`
	Services              bool `json:"services" yaml:"services"`
	Pod                   bool `json:"pod" yaml:"pod"`
	Job                   bool `json:"job,omitempty" yaml:"job,omitempty"`
	Node                  bool `json:"node,omitempty" yaml:"node,omitempty"`
	ClusterRole           bool `json:"clusterrole,omitempty" yaml:"clusterrole,omitempty"`
	ClusterRoleBinding    bool `json:"clusterrolebinding,omitempty" yaml:"clusterrolebinding,omitempty"`
	ServiceAccount        bool `json:"serviceaccount,omitempty" yaml:"serviceaccount,omitempty"`
	PersistentVolume      bool `json:"persistentvolume,omitempty" yaml:"persistentvolume,omitempty"`
	Namespace             bool `json:"namespace" yaml:"namespace"`
	Secret                bool `json:"secret,omitempty" yaml:"secret,omitempty"`
	ConfigMap             bool `json:"configmap,omitempty" yaml:"configmap,omitempty"`
	Ingress               bool `json:"ingress,omitempty" yaml:"ingress,omitempty"`
	HPA                   bool `json:"hpa,omitempty" yaml:"hpa,omitempty"`
	Event                 bool `json:"event,omitempty" yaml:"event,omitempty"`
	CoreEvent             bool `json:"coreevent,omitempty" yaml:"coreevent,omitempty"`
}

type CRD struct {
	Group    string `json:"group"`
	Version  string `json:"version"`
	Resource string `json:"resource"`
}

type Config struct {
	// Handlers know how to send notifications to specific services.
	Handler Handler `json:"handler"`

	//Reason   []string `json:"reason"`

	// Resources to watch.
	Resource Resource `json:"resource"`

	// CustomResources to Watch
	CustomResources []CRD `json:"customresources"`

	// For watching specific namespace, leave it empty for watching all.
	// this config is ignored when watching namespaces
	Namespace string `json:"namespace,omitempty"`

	// Enable/disable the entire watcher
	Enabled bool `json:"enabled" yaml:"enabled"`

	// Clusters to skip (exclude from watching)
	SkipClusters []string `json:"skipClusters,omitempty" yaml:"skipClusters,omitempty"`

	// Clusters to include (if specified, only watch these clusters)
	IncludeClusters []string `json:"includeClusters,omitempty" yaml:"includeClusters,omitempty"`
}

// Slack contains slack configuration
type Slack struct {
	// Slack "legacy" API token.
	Token string `json:"token"`
	// Slack channel.
	Channel string `json:"channel"`
	// Title of the message.
	Title string `json:"title"`
}

// SlackWebhook contains slack configuration
type SlackWebhook struct {
	// Slack channel.
	Channel string `json:"channel"`
	// Slack Username.
	Username string `json:"username"`
	// Slack Emoji.
	Emoji string `json:"emoji"`
	// Slack Webhook Url.
	Slackwebhookurl string `json:"slackwebhookurl"`
}

// Hipchat contains hipchat configuration
type Hipchat struct {
	// Hipchat token.
	Token string `json:"token"`
	// Room name.
	Room string `json:"room"`
	// URL of the hipchat server.
	Url string `json:"url"`
}

// Mattermost contains mattermost configuration
type Mattermost struct {
	Channel  string `json:"room"`
	Url      string `json:"url"`
	Username string `json:"username"`
}

// Flock contains flock configuration
type Flock struct {
	// URL of the flock API.
	Url string `json:"url"`
}

// Webhook contains webhook configuration
type Webhook struct {
	// Webhook URL.
	Url     string `json:"url"`
	Cert    string `json:"cert"`
	TlsSkip bool   `json:"tlsskip"`
}

// Lark contains lark configuration
type Lark struct {
	// Webhook URL.
	WebhookURL string `json:"webhookurl"`
}

// CloudEvent contains CloudEvent configuration
type CloudEvent struct {
	Url string `json:"url"`
}

// MSTeams contains MSTeams configuration
type MSTeams struct {
	// MSTeams API Webhook URL.
	WebhookURL string `json:"webhookurl"`
}

// SMTP contains SMTP configuration.
type SMTP struct {
	// Destination e-mail address.
	To string `json:"to" yaml:"to,omitempty"`
	// Sender e-mail address .
	From string `json:"from" yaml:"from,omitempty"`
	// Smarthost, aka "SMTP server"; address of server used to send email.
	Smarthost string `json:"smarthost" yaml:"smarthost,omitempty"`
	// Subject of the outgoing emails.
	Subject string `json:"subject" yaml:"subject,omitempty"`
	// Extra e-mail headers to be added to all outgoing messages.
	Headers map[string]string `json:"headers" yaml:"headers,omitempty"`
	// Authentication parameters.
	Auth SMTPAuth `json:"auth" yaml:"auth,omitempty"`
	// If "true" forces secure SMTP protocol (AKA StartTLS).
	RequireTLS bool `json:"requireTLS" yaml:"requireTLS"`
	// SMTP hello field (optional)
	Hello string `json:"hello" yaml:"hello,omitempty"`
}

type SMTPAuth struct {
	// Username for PLAN and LOGIN auth mechanisms.
	Username string `json:"username" yaml:"username,omitempty"`
	// Password for PLAIN and LOGIN auth mechanisms.
	Password string `json:"password" yaml:"password,omitempty"`
	// Identity for PLAIN auth mechanism
	Identity string `json:"identity" yaml:"identity,omitempty"`
	// Secret for CRAM-MD5 auth mechanism
	Secret string `json:"secret" yaml:"secret,omitempty"`
}

// New creates new config object
func New() (*Config, error) {
	c := &Config{}
	if err := c.Load(); err != nil {
		return c, err
	}

	return c, nil
}

func createIfNotExist() error {
	// create file if not exist
	configFile := getConfigFile()
	_, err := os.Stat(configFile)
	if err != nil {
		if os.IsNotExist(err) {
			file, err := os.Create(configFile)
			if err != nil {
				return err
			}
			file.Close()
		} else {
			return err
		}
	}
	return nil
}

// Load loads configuration from config file
func (c *Config) Load() error {
	err := createIfNotExist()
	if err != nil {
		return err
	}

	file, err := os.Open(getConfigFile())
	if err != nil {
		return err
	}

	b, err := io.ReadAll(file)
	if err != nil {
		return err
	}

	if len(b) != 0 {
		return yaml.Unmarshal(b, c)
	}

	return nil
}

func (c *Config) Write() error {
	f, err := os.OpenFile(getConfigFile(), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	enc := yaml.NewEncoder(f)
	enc.SetIndent(2) // compat with old versions of watcher
	return enc.Encode(c)
}

func getConfigFile() string {
	// Use ~/.agentkube/watcher.yaml path
	return filepath.Join(configDir(), ConfigFileName)
}

func configDir() string {
	if configDir := os.Getenv("CONFIG"); configDir != "" {
		return configDir
	}

	var home string
	if runtime.GOOS == "windows" {
		home = os.Getenv("USERPROFILE")
	} else {
		home = os.Getenv("HOME")
	}

	agentKubeDir := filepath.Join(home, ".agentkube")
	// Create directory if it doesn't exist
	if _, err := os.Stat(agentKubeDir); os.IsNotExist(err) {
		os.MkdirAll(agentKubeDir, 0755)
	}
	return agentKubeDir
}
