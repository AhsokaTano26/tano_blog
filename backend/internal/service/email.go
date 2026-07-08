package service

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/utils"
)

// EmailProvider defines the interface for sending emails
type EmailProvider interface {
	Send(from, to, subject, html string) error
}

// --- Zeabur Email Provider ---

type ZeaburProvider struct {
	apiURL string
	apiKey string
}

func NewZeaburProvider(apiURL, apiKey string) *ZeaburProvider {
	if apiURL == "" {
		apiURL = "https://api.zeabur.com/api/v1/zsend/emails"
	}
	return &ZeaburProvider{apiURL: apiURL, apiKey: apiKey}
}

func (p *ZeaburProvider) Send(from, to, subject, html string) error {
	payload := map[string]interface{}{
		"from":    from,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", p.apiURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("zeabur API returned status %d", resp.StatusCode)
	}
	return nil
}

// --- SMTP Provider ---

type SMTPProvider struct {
	host     string
	port     string
	username string
	password string
}

func NewSMTPProvider(host, port, username, password string) *SMTPProvider {
	if port == "" {
		port = "587"
	}
	return &SMTPProvider{host: host, port: port, username: username, password: password}
}

func (p *SMTPProvider) Send(from, to, subject, html string) error {
	addr := net.JoinHostPort(p.host, p.port)
	auth := smtp.PlainAuth("", p.username, p.password, p.host)

	// Build MIME message
	msg := buildMIMEMessage(from, to, subject, html)

	// Port 465 = implicit TLS, others = STARTTLS
	if p.port == "465" {
		return p.sendTLS(addr, from, to, msg)
	}
	return p.sendSTARTTLS(addr, auth, from, to, msg)
}

func (p *SMTPProvider) sendTLS(addr, from, to string, msg []byte) error {
	tlsConfig := &tls.Config{ServerName: p.host}
	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("TLS dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, p.host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	auth := smtp.PlainAuth("", p.username, p.password, p.host)
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("auth: %w", err)
	}
	if err = client.Mail(from); err != nil {
		return fmt.Errorf("mail: %w", err)
	}
	if err = client.Rcpt(to); err != nil {
		return fmt.Errorf("rcpt: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return w.Close()
}

func (p *SMTPProvider) sendSTARTTLS(addr string, auth smtp.Auth, from, to string, msg []byte) error {
	return smtp.SendMail(addr, auth, from, []string{to}, msg)
}

func buildMIMEMessage(from, to, subject, html string) []byte {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "From: %s\r\n", from)
	fmt.Fprintf(&buf, "To: %s\r\n", to)
	// Sanitize subject to prevent header injection
	subject = strings.ReplaceAll(strings.ReplaceAll(subject, "\r", ""), "\n", "")
	fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Content-Type: text/html; charset=UTF-8\r\n")
	fmt.Fprintf(&buf, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	fmt.Fprintf(&buf, "\r\n")
	buf.WriteString(html)
	return buf.Bytes()
}

// --- Email Service ---

type EmailService struct {
	db *gorm.DB
}

func NewEmailService(db *gorm.DB) *EmailService {
	return &EmailService{db: db}
}

func (s *EmailService) getConfigMap() map[string]string {
	var configs []model.SiteConfig
	s.db.Where("key IN ?", []string{
		"email_enabled", "email_provider", "email_from",
		"email_zeabur_api_key", "email_zeabur_api_url",
		"email_smtp_host", "email_smtp_port", "email_smtp_username", "email_smtp_password",
		"site_title", "site_url",
	}).Find(&configs)

	m := make(map[string]string, len(configs))
	for _, c := range configs {
		m[c.Key] = c.Value
	}
	return m
}

func (s *EmailService) getProvider(cfg map[string]string) (EmailProvider, error) {
	provider := cfg["email_provider"]
	switch provider {
	case "zeabur":
		apiKey := cfg["email_zeabur_api_key"]
		if apiKey == "" {
			return nil, fmt.Errorf("zeabur API key not configured")
		}
		return NewZeaburProvider(cfg["email_zeabur_api_url"], apiKey), nil
	case "smtp":
		host := cfg["email_smtp_host"]
		if host == "" {
			return nil, fmt.Errorf("SMTP host not configured")
		}
		return NewSMTPProvider(
			host,
			cfg["email_smtp_port"],
			cfg["email_smtp_username"],
			cfg["email_smtp_password"],
		), nil
	default:
		return nil, fmt.Errorf("unknown email provider: %s", provider)
	}
}

func (s *EmailService) Send(to, subject, html string) error {
	cfg := s.getConfigMap()

	if cfg["email_enabled"] != "true" {
		return nil // email disabled
	}

	from := cfg["email_from"]
	if from == "" {
		return fmt.Errorf("email_from not configured")
	}

	provider, err := s.getProvider(cfg)
	if err != nil {
		return err
	}

	return provider.Send(from, to, subject, html)
}

// SendTestEmail sends a test email regardless of email_enabled flag
func (s *EmailService) SendTestEmail(to string) error {
	cfg := s.getConfigMap()

	from := cfg["email_from"]
	if from == "" {
		return fmt.Errorf("请先填写发件人地址")
	}

	provider, err := s.getProvider(cfg)
	if err != nil {
		return err
	}

	siteTitle := cfg["site_title"]
	if siteTitle == "" {
		siteTitle = "Blog"
	}

	subject := fmt.Sprintf("[%s] 邮件配置测试", siteTitle)
	html := renderTestEmail(siteTitle)

	return provider.Send(from, to, subject, html)
}

func (s *EmailService) SendNewCommentNotify(nickname, content, postTitle, postSlug string) {
	cfg := s.getConfigMap()
	if cfg["email_enabled"] != "true" {
		return
	}

	siteTitle := cfg["site_title"]
	if siteTitle == "" {
		siteTitle = "Blog"
	}
	siteURL := cfg["site_url"]

	// Find admin email
	var admin model.User
	if err := s.db.Where("role = ?", "admin").First(&admin).Error; err != nil || admin.Email == "" {
		return // no admin email, skip
	}

	subject := fmt.Sprintf("[%s] 新评论: %s", siteTitle, postTitle)
	html := renderNewCommentEmail(siteTitle, nickname, content, postTitle, postSlug, siteURL)

	if err := s.Send(admin.Email, subject, html); err != nil {
		utils.LogError("Failed to send new comment notification", "error", err)
	}
}

func (s *EmailService) SendCommentApprovedNotify(toEmail, nickname, postTitle, postSlug string) {
	if toEmail == "" {
		return
	}

	cfg := s.getConfigMap()
	if cfg["email_enabled"] != "true" {
		return
	}

	siteTitle := cfg["site_title"]
	if siteTitle == "" {
		siteTitle = "Blog"
	}
	siteURL := cfg["site_url"]

	subject := fmt.Sprintf("[%s] 您的评论已通过审核", siteTitle)
	html := renderCommentApprovedEmail(siteTitle, nickname, postTitle, postSlug, siteURL)

	if err := s.Send(toEmail, subject, html); err != nil {
		utils.LogError("Failed to send comment approved notification", "error", err)
	}
}

// SendReplyNotify notifies the parent commenter when someone replies to their comment
func (s *EmailService) SendReplyNotify(parentEmail, parentNickname, replyNickname, replyContent, postTitle, postSlug string) {
	if parentEmail == "" {
		return
	}

	cfg := s.getConfigMap()
	if cfg["email_enabled"] != "true" {
		return
	}

	siteTitle := cfg["site_title"]
	if siteTitle == "" {
		siteTitle = "Blog"
	}
	siteURL := cfg["site_url"]

	subject := fmt.Sprintf("[%s] %s 回复了您的评论", siteTitle, replyNickname)
	html := renderReplyEmail(siteTitle, parentNickname, replyNickname, replyContent, postTitle, postSlug, siteURL)

	if err := s.Send(parentEmail, subject, html); err != nil {
		utils.LogError("Failed to send reply notification", "error", err)
	}
}

// SendPasswordResetEmail sends a password reset link to the user
func (s *EmailService) SendPasswordResetEmail(toEmail, resetLink string) error {
	if toEmail == "" {
		return fmt.Errorf("empty recipient email")
	}

	cfg := s.getConfigMap()

	siteTitle := cfg["site_title"]
	if siteTitle == "" {
		siteTitle = "Blog"
	}

	subject := fmt.Sprintf("[%s] 密码重置", siteTitle)
	html := renderPasswordResetEmail(siteTitle, resetLink)

	// Send direct (bypass email_enabled check so forgot password always works)
	return s.sendDirect(toEmail, subject, html)
}

// sendDirect sends email bypassing the email_enabled flag
func (s *EmailService) sendDirect(to, subject, html string) error {
	cfg := s.getConfigMap()

	from := cfg["email_from"]
	if from == "" {
		return fmt.Errorf("email_from not configured")
	}

	provider, err := s.getProvider(cfg)
	if err != nil {
		return err
	}

	return provider.Send(from, to, subject, html)
}

// SendLoginNotifyEmail notifies the user of a new login
func (s *EmailService) SendLoginNotifyEmail(toEmail, username, ip, loginTime string) {
	if toEmail == "" {
		return
	}

	cfg := s.getConfigMap()
	if cfg["email_enabled"] != "true" {
		return
	}

	siteTitle := cfg["site_title"]
	if siteTitle == "" {
		siteTitle = "Blog"
	}

	subject := fmt.Sprintf("[%s] 新登录提醒", siteTitle)
	html := renderLoginAlertEmail(siteTitle, username, ip, loginTime)

	if err := s.Send(toEmail, subject, html); err != nil {
		utils.LogError("Failed to send login notification", "error", err)
	}
}

// GetSiteConfigString is a helper to get a single config value
func getSiteConfigValue(db *gorm.DB, key string) string {
	var c model.SiteConfig
	if err := db.Where("key = ?", key).First(&c).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}
