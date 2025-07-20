package smtp

import (
	"fmt"
	"time"

	config "github.com/agentkube/operator/config"
	event "github.com/agentkube/operator/pkg/event"
	"github.com/sirupsen/logrus"
)

const (
	defaultSubject = "Kubewatch notification"

	// ConfigExample is an example configuration.
	ConfigExample = `handler:
  smtp:
    to: "myteam@mycompany.com"
    from: "kubewatch@mycluster.com"
    smarthost: smtp.mycompany.com:2525
    subject: Test notification
    auth:
      username: myusername
      password: mypassword
    requireTLS: true
`
)

// SMTP handler implements handler.Handler interface,
// Notify event via email.
type SMTP struct {
	cfg config.SMTP
}

// Init prepares Webhook configuration
func (s *SMTP) Init(c *config.Config) error {
	s.cfg = c.Handler.SMTP

	if s.cfg.To == "" {
		return fmt.Errorf("smtp `to` conf field is required")
	}
	if s.cfg.From == "" {
		return fmt.Errorf("smtp `from` conf field is required")
	}
	if s.cfg.Smarthost == "" {
		return fmt.Errorf("smtp `smarthost` conf field is required")
	}
	return nil
}

// Handle handles the notification.
func (s *SMTP) Handle(e event.Event) {
	send(s.cfg, e.Message())
	logrus.Printf("Message successfully sent to %s at %s ", s.cfg.To, time.Now())
}

func FormatEmail(e event.Event) (string, error) {
	return e.Message(), nil
}

func send(conf config.SMTP, msg string) {
	if err := sendEmail(conf, msg); err != nil {
		logrus.Error(err)
	}
}
