package entryanimation

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed player.html
var playerHTML string

//go:embed player.css
var playerCSS string

//go:embed player.js
var playerJS string

func Document(config Config, siteTitle, name, username string) string {
	payload, _ := json.Marshal(struct {
		Text   map[string]string `json:"text"`
		Icon   string            `json:"icon"`
		Stages []Stage           `json:"stages"`
	}{config.Resolve(siteTitle, name, username), config.IconDataURL, Stages})
	// JSON escapes <, > and &. Substitutions are simultaneous, so user text
	// cannot introduce a template marker or a closing script tag.
	return strings.NewReplacer("/*ENTRY_CSS*/", playerCSS, "/*ENTRY_JS*/", playerJS, "/*ENTRY_DATA*/", string(payload)).Replace(playerHTML)
}
