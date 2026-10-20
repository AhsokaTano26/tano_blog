package entryanimation

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"strings"
	"testing"
)

func TestPrivateIconValidation(t *testing.T) {
	for _, size := range []int{16, 2049} {
		var output bytes.Buffer
		if err := png.Encode(&output, image.NewRGBA(image.Rect(0, 0, size, 1))); err != nil {
			t.Fatal(err)
		}
		config := Config{IconDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(output.Bytes())}
		err := config.Validate()
		if (err == nil) != (size == 16) {
			t.Fatalf("unexpected validation for %d px: %v", size, err)
		}
		if size == 16 {
			if !strings.Contains(Document(config, "", "", ""), config.IconDataURL) {
				t.Fatal("private document omitted valid icon")
			}
			config.IconDataURL = strings.Replace(config.IconDataURL, "image/png", "image/jpeg", 1)
			if config.Validate() == nil {
				t.Fatal("mismatched image MIME type accepted")
			}
		}
	}
}

func TestDefaultsOverridesAndSiteTitle(t *testing.T) {
	c := Config{Overrides: map[string]string{"welcome_title": "  ", "welcome_message": "你好 {name} / {username}"}}
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
	text := c.Resolve("测试站点", "小明", "admin")
	if text["welcome_title"] != "测试站点" || text["welcome_message"] != "你好 小明 / admin" {
		t.Fatalf("unexpected welcome: %q / %q", text["welcome_title"], text["welcome_message"])
	}
	if text["stage_access_title"] != "需要访问许可" {
		t.Fatal("missing defaults")
	}
	c.Overrides["welcome_title"] = "独立标题"
	if c.Resolve("更换站名", "", "")["welcome_title"] != "独立标题" {
		t.Fatal("override ignored")
	}
}

func TestRejectInvalidPrivateSettings(t *testing.T) {
	for _, c := range []Config{
		{Overrides: map[string]string{"unknown": "value"}},
		{Overrides: map[string]string{"welcome_title": strings.Repeat("字", 81)}},
		{IconDataURL: "https://example.com/public.png"},
		{IconDataURL: "data:image/svg+xml;base64,PHN2Zy8+"},
		{IconDataURL: "data:image/png;base64,ZmFrZQ=="},
	} {
		if c.Validate() == nil {
			t.Fatalf("accepted invalid settings: %+v", c)
		}
	}
}

func TestDocumentEscapesTextAndContainsPrivateAssets(t *testing.T) {
	c := Config{Overrides: map[string]string{"welcome_title": "</script><img src=x onerror=alert(1)>"}}
	html := Document(c, "站点", "小明", "admin")
	if strings.Contains(html, "</script><img src=x") {
		t.Fatal("text escaped the JSON payload")
	}
	for _, want := range []string{`\\u003c/script\\u003e`, "admin-entry-prologue", "--entry-hue", "entry:ready", "entry:finish"} {
		if want == `\\u003c/script\\u003e` {
			want = `\u003c/script\u003e`
		}
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q", want)
		}
	}
}
