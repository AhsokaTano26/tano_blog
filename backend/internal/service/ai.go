package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type AIService struct {
	db *gorm.DB
}

func NewAIService(db *gorm.DB) *AIService {
	return &AIService{db: db}
}

func (s *AIService) getConfigMap() map[string]string {
	var configs []model.SiteConfig
	s.db.Where("key IN ?", []string{
		"ai_enabled", "ai_api_url", "ai_api_key", "ai_model",
	}).Find(&configs)

	m := make(map[string]string, len(configs))
	for _, c := range configs {
		m[c.Key] = c.Value
	}
	return m
}

// GenerateExcerpt calls the OpenAI-compatible API to generate an excerpt for the given content.
func (s *AIService) GenerateExcerpt(content string) (string, error) {
	cfg := s.getConfigMap()

	if cfg["ai_enabled"] != "true" {
		return "", fmt.Errorf("AI 功能未启用")
	}

	apiURL := cfg["ai_api_url"]
	if apiURL == "" {
		apiURL = "https://api.openai.com/v1"
	}
	apiKey := cfg["ai_api_key"]
	if apiKey == "" {
		return "", fmt.Errorf("API Key 未配置")
	}
	model := cfg["ai_model"]
	if model == "" {
		model = "gpt-3.5-turbo"
	}

	// Truncate content to 3000 characters
	truncated := content
	if len(truncated) > 3000 {
		truncated = truncated[:3000]
	}

	// Strip Markdown for cleaner input
	truncated = stripMarkdown(truncated)

	systemPrompt := "你是一个博客文章摘要生成助手。请用50-200字的中文概括文章的核心内容，要求简洁、准确、有吸引力。不要包含Markdown标记，不要出现'本文'、'文章'等引导词，直接输出摘要内容。"

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": truncated},
		},
		"max_tokens":  300,
		"temperature": 0.7,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", strings.TrimRight(apiURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("API returned no choices")
	}

	excerpt := strings.TrimSpace(result.Choices[0].Message.Content)
	return excerpt, nil
}

// stripMarkdown removes common Markdown syntax from text.
func stripMarkdown(s string) string {
	s = strings.ReplaceAll(s, "#", "")
	s = strings.ReplaceAll(s, "*", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, "`", "")
	s = strings.ReplaceAll(s, "~", "")
	s = strings.ReplaceAll(s, ">", "")
	// Remove links: [text](url) -> text
	for {
		start := strings.Index(s, "[")
		if start == -1 {
			break
		}
		end := strings.Index(s[start:], "](")
		if end == -1 {
			break
		}
		end = start + end
		closeParen := strings.Index(s[end:], ")")
		if closeParen == -1 {
			break
		}
		linkText := s[start+1 : end]
		s = s[:start] + linkText + s[end+closeParen+1:]
	}
	// Remove images: ![alt](url)
	for {
		start := strings.Index(s, "![")
		if start == -1 {
			break
		}
		end := strings.Index(s[start:], ")")
		if end == -1 {
			break
		}
		s = s[:start] + s[start+end+1:]
	}
	return strings.TrimSpace(s)
}
