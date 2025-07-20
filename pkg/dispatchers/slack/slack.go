package slack

import (
	"fmt"
	"os"

	"github.com/sirupsen/logrus"

	"github.com/slack-go/slack"

	config "github.com/agentkube/operator/config"
	event "github.com/agentkube/operator/pkg/event"
)

var slackColors = map[string]string{
	"Normal":  "good",
	"Warning": "warning",
	"Danger":  "danger",
}

var slackErrMsg = `
%s

You need to set both slack token and channel for slack notify,
using "--token/-t" and "--channel/-c", or using environment variables:

export SLACK_TOKEN=slack_token
export SLACK_CHANNEL=slack_channel

Command line flags will override environment variables

`

// Slack handler implements handler.Handler interface,
// Notify event to slack channel
type Slack struct {
	Token   string
	Channel string
	Title   string
}

// Init prepares slack configuration
func (s *Slack) Init(c *config.Config) error {
	token := c.Handler.Slack.Token
	channel := c.Handler.Slack.Channel
	title := c.Handler.Slack.Title

	if token == "" {
		token = os.Getenv("SLACK_TOKEN")
	}

	if channel == "" {
		channel = os.Getenv("SLACK_CHANNEL")
	}

	if title == "" {
		title = os.Getenv("SLACK_TITLE")
		if title == "" {
			title = "kubewatch"
		}
	}

	s.Token = token
	s.Channel = channel
	s.Title = title

	return checkMissingSlackVars(s)
}

// Handle handles the notification.
func (s *Slack) Handle(e event.Event) {
	api := slack.New(s.Token)
	attachment := prepareSlackAttachment(e, s)

	channelID, timestamp, err := api.PostMessage(s.Channel,
		slack.MsgOptionAttachments(attachment),
		slack.MsgOptionAsUser(true))
	if err != nil {
		logrus.Printf("%s\n", err)
		return
	}

	logrus.Printf("Message successfully sent to channel %s at %s", channelID, timestamp)
}

func checkMissingSlackVars(s *Slack) error {
	if s.Token == "" || s.Channel == "" {
		return fmt.Errorf(slackErrMsg, "Missing slack token or channel")
	}

	return nil
}

func prepareSlackAttachment(e event.Event, s *Slack) slack.Attachment {

	attachment := slack.Attachment{
		Fields: []slack.AttachmentField{
			{
				Title: s.Title,
				Value: e.Message(),
			},
		},
	}

	if color, ok := slackColors[e.Status]; ok {
		attachment.Color = color
	}

	attachment.MarkdownIn = []string{"fields"}

	return attachment
}
