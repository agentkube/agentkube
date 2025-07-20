package client

import (
	config "github.com/agentkube/operator/config"
	dispatchers "github.com/agentkube/operator/pkg/dispatchers"
	msteam "github.com/agentkube/operator/pkg/dispatchers/msteam"
	slack "github.com/agentkube/operator/pkg/dispatchers/slack"
	smtp "github.com/agentkube/operator/pkg/dispatchers/smtp"
	webhook "github.com/agentkube/operator/pkg/dispatchers/webhook"

	"github.com/sirupsen/logrus"
)

func ParseEventHandler(conf *config.Config) dispatchers.Dispatcher {

	var eventHandler dispatchers.Dispatcher
	switch {
	case len(conf.Handler.Slack.Channel) > 0 || len(conf.Handler.Slack.Token) > 0:
		eventHandler = new(slack.Slack)
	case len(conf.Handler.SlackWebhook.Channel) > 0 || len(conf.Handler.SlackWebhook.Username) > 0 || len(conf.Handler.SlackWebhook.Slackwebhookurl) > 0:
		eventHandler = new(slack.SlackWebhook)
	case len(conf.Handler.Webhook.Url) > 0:
		eventHandler = new(webhook.Webhook)
	case len(conf.Handler.MSTeams.WebhookURL) > 0:
		eventHandler = new(msteam.MSTeams)
	case len(conf.Handler.SMTP.Smarthost) > 0 || len(conf.Handler.SMTP.To) > 0:
		eventHandler = new(smtp.SMTP)
	default:
		eventHandler = new(dispatchers.Default)
	}

	if err := eventHandler.Init(conf); err != nil {
		logrus.Fatal(err)
	}
	return eventHandler
}
