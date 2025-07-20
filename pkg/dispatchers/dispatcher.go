package dispatchers

import (
	config "github.com/agentkube/operator/config"
	msteam "github.com/agentkube/operator/pkg/dispatchers/msteam"
	slack "github.com/agentkube/operator/pkg/dispatchers/slack"
	smtp "github.com/agentkube/operator/pkg/dispatchers/smtp"
	webhook "github.com/agentkube/operator/pkg/dispatchers/webhook"
	event "github.com/agentkube/operator/pkg/event"
)

type Dispatcher interface {
	Init(c *config.Config) error
	Handle(e event.Event)
}

// Map associates dispatcher names with their corresponding dispatcher implementations for easy lookup
var Map = map[string]interface{}{
	"default":      &Default{},
	"slack":        &slack.Slack{},
	"slackwebhook": &slack.SlackWebhook{},
	"webhook":      &webhook.Webhook{},
	"ms-teams":     &msteam.MSTeams{},
	"smtp":         &smtp.SMTP{},
}

// Default handler is a no-op fallback handler
type Default struct{}

// Init initializes handler configuration
// Do nothing for default handler
func (d *Default) Init(c *config.Config) error {
	return nil
}

// Handle handles an event.
func (d *Default) Handle(e event.Event) {}
