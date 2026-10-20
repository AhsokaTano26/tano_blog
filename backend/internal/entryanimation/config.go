// Package entryanimation owns private animation content. Never copy its assets
// or defaults into a public frontend bundle or uploads directory.
package entryanimation

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"strings"
	"unicode"
	"unicode/utf8"

	_ "golang.org/x/image/webp"
)

const ConfigKey = "admin_entry_animation"
const DurationMS = 12200
const MaxIconBytes = 512 * 1024

type Config struct {
	Overrides   map[string]string `json:"overrides"`
	IconDataURL string            `json:"icon_data_url"`
}

type Field struct {
	Key       string `json:"key"`
	Group     string `json:"group"`
	Label     string `json:"label"`
	Default   string `json:"default"`
	MaxLength int    `json:"max_length"`
	Multiline bool   `json:"multiline,omitempty"`
}

// All visible copy, including defaults, is delivered only by the admin API.
var fields = []Field{
	{"opening_title", "开场", "主标题", "TANO ARCHIVE", 80, false},
	{"opening_subtitle", "开场", "副标题", "记录 · 整理 · 再发现", 100, false},
	{"opening_caption", "开场", "底部说明", "PERSONAL INFORMATION SYSTEM", 120, false},
	{"brand_title", "终端标识", "主标识", "TANO ARCHIVE", 80, false},
	{"brand_subtitle", "终端标识", "副标识", "SYNTHESIZE INFORMATION", 100, false},
	{"brand_system", "终端标识", "系统名称", "ANALYSIS", 40, false},
	{"brand_suffix", "终端标识", "系统后缀", "OS", 16, false},
	{"brand_caption", "终端标识", "系统说明", "CONTENT SYSTEM", 80, false},
	{"brand_version", "终端标识", "版本标识", "VER. 01", 32, false},
	{"identity_name_label", "身份卡片", "姓名标签", "身份名称", 32, false},
	{"identity_name", "身份卡片", "姓名内容", "{name}", 80, false},
	{"identity_account_label", "身份卡片", "账户标签", "登录账户", 32, false},
	{"identity_account", "身份卡片", "账户内容", "@{username}", 80, false},
	{"identity_status_label", "身份卡片", "状态标签", "访问状态", 32, false},
	{"identity_status", "身份卡片", "状态内容", "已验证 / AUTHENTICATED", 100, false},
	{"identity_confirmed", "身份卡片", "右侧确认文字", "· ID CONFIRMED : {name}", 120, false},
	{"emblem_caption", "终端标识", "标记说明", "TANO · ARCHIVE", 80, false},
	{"data_stream", "数据与页脚", "数据流（每行一条）", "00A1  4A 4C 20 01  54 41 4E 4F\n00A2  ARCHIVE INDEX / CONNECTED\n00A3  00 01 FF 0A  10 20 30 40\n00A4  CONTENT CHANNEL / OPEN\n00A5  50 45 52 4D  49 54 54 45\n00A6  OPERATOR RECORD / VERIFIED\n00A7  41 43 43 45  53 53 00 01\n00A8  WORKSPACE / READY", 800, true},
	{"ready_label", "数据与页脚", "完成阶段标签", "READY", 40, false},
	{"ready_log", "数据与页脚", "完成提示", "身份验证完成，会话已建立", 120, false},
	{"ready_log_en", "数据与页脚", "完成副提示", "IDENTITY VERIFIED · SESSION ESTABLISHED", 160, false},
	{"powered_label", "数据与页脚", "署名前缀", "POWERED BY", 40, false},
	{"powered_name", "数据与页脚", "署名", "TANO", 40, false},
	{"welcome_prefix", "欢迎页", "欢迎前缀", "WELCOME TO", 80, false},
	{"welcome_title", "欢迎页", "欢迎标题（留空使用站点标题）", "", 80, false},
	{"welcome_caption", "欢迎页", "图标下方文字", "TANO · ARCHIVE", 80, false},
	{"welcome_message", "欢迎页", "欢迎语", "欢迎 {name} 访问", 120, false},
	{"skip_label", "辅助文字", "跳过按钮", "跳过动画", 32, false},
	{"accessible_message", "辅助文字", "读屏提示", "欢迎 {name} 进入管理后台，动画即将结束。可按 Esc 跳过。", 200, false},
}

type Stage struct {
	Key, Phase, Position string
	Start, End           int
}

var Stages = []Stage{
	{"access", "AUTHORIZATION", "46%", 2600, 3900},
	{"identity", "IDENTITY", "38%", 3900, 5500},
	{"request", "REQUEST", "39%", 5500, 6650},
	{"read", "READ", "39%", 6650, 7900},
	{"verify", "VERIFY", "45%", 7900, 9400},
}

func init() {
	copy := [][5]string{
		{"需要访问许可", "ACCESS PERMISSION REQUIRED", "AUTHORIZATION", "正在建立访问通道", "ESTABLISHING ACCESS CHANNEL"},
		{"身份资料确认", "IDENTITY VERIFICATION", "IDENTITY", "核对身份资料", "MATCHING OPERATOR RECORD"},
		{"接收访问需求", "ACCESS REQUEST RECEIVED", "REQUEST", "接收访问需求，会话通道已建立", "HANDSHAKE ESTABLISHED"},
		{"开始读取权限", "PERMISSION READ STARTED", "READ", "读取权限，连接内容工作区", "READING PERMISSION SET"},
		{"读取完毕 · 核验通过", "READ COMPLETE · VERIFIED", "VERIFY", "核验通过，访问权限已授予", "PERMISSION AUTHORIZED"},
	}
	keys := []string{"title", "subtitle", "label", "log", "log_en"}
	labels := []string{"标题", "副标题", "阶段标签", "底部提示", "底部副提示"}
	for i, stage := range Stages {
		for j, key := range keys {
			limit := 120
			if key == "title" {
				limit = 40
			}
			if key == "label" {
				limit = 40
			}
			fields = append(fields, Field{"stage_" + stage.Key + "_" + key, fmt.Sprintf("阶段 %d", i+1), labels[j], copy[i][j], limit, false})
		}
	}
}

func Fields(siteTitle string) []Field {
	result := append([]Field(nil), fields...)
	for i := range result {
		if result[i].Key == "welcome_title" {
			result[i].Default = fallbackTitle(siteTitle)
		}
	}
	return result
}

func fallbackTitle(title string) string {
	if strings.TrimSpace(title) == "" {
		return "我的博客"
	}
	return title
}

func (c *Config) Validate() error {
	known := make(map[string]Field, len(fields))
	for _, field := range fields {
		known[field.Key] = field
	}
	if c.Overrides == nil {
		c.Overrides = map[string]string{}
	}
	for key, text := range c.Overrides {
		field, ok := known[key]
		if !ok {
			return errors.New("包含未知的动画文字设置")
		}
		if !utf8.ValidString(text) || utf8.RuneCountInString(text) > field.MaxLength {
			return fmt.Errorf("%s：最多 %d 个字符", field.Label, field.MaxLength)
		}
		for _, r := range text {
			if unicode.IsControl(r) && !(field.Multiline && (r == '\n' || r == '\t' || r == '\r')) {
				return fmt.Errorf("%s：包含不支持的控制字符", field.Label)
			}
		}
		c.Overrides[key] = strings.TrimSpace(text)
		if c.Overrides[key] == "" {
			delete(c.Overrides, key)
		}
	}
	if c.IconDataURL == "" {
		return nil
	}
	if len(c.IconDataURL) > base64.StdEncoding.EncodedLen(MaxIconBytes)+40 {
		return errors.New("图标不能超过 512 KiB")
	}
	header, encoded, ok := strings.Cut(c.IconDataURL, ",")
	format, allowed := map[string]string{
		"data:image/png;base64": "png", "data:image/jpeg;base64": "jpeg",
		"data:image/gif;base64": "gif", "data:image/webp;base64": "webp",
	}[header]
	if !ok || !allowed {
		return errors.New("图标须为 PNG、JPEG、WebP 或 GIF 图片")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(data) > MaxIconBytes {
		return errors.New("图标数据无效或超过 512 KiB")
	}
	dimensions, actual, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || actual != format || dimensions.Width < 1 || dimensions.Height < 1 || dimensions.Width > 2048 || dimensions.Height > 2048 {
		return errors.New("图标无效，尺寸上限为 2048×2048")
	}
	// Full decode verifies a truncated/corrupted image before storing it.
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		return errors.New("图标文件损坏")
	}
	return nil
}

func (c Config) Resolve(siteTitle, name, username string) map[string]string {
	result := make(map[string]string, len(fields))
	replacer := strings.NewReplacer("{name}", name, "{username}", username)
	for _, field := range Fields(siteTitle) {
		text := strings.TrimSpace(c.Overrides[field.Key])
		if text == "" {
			text = field.Default
		}
		result[field.Key] = replacer.Replace(text)
	}
	return result
}
