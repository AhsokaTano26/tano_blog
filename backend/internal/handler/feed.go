package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type FeedHandler struct {
	db *gorm.DB
}

func NewFeedHandler(db *gorm.DB) *FeedHandler {
	return &FeedHandler{db: db}
}

func (h *FeedHandler) getSiteConfig() (title, desc, siteURL string) {
	title = "朝花夕拾录"
	desc = "A BanG Dreamer!"
	siteURL = "https://tano.asia"

	var configs []model.SiteConfig
	h.db.Where("key IN ?", []string{"site_title", "site_description", "site_url"}).Find(&configs)
	for _, c := range configs {
		switch c.Key {
		case "site_title":
			if c.Value != "" {
				title = c.Value
			}
		case "site_description":
			if c.Value != "" {
				desc = c.Value
			}
		case "site_url":
			if c.Value != "" {
				siteURL = c.Value
			}
		}
	}
	return
}

func (h *FeedHandler) RSS(c *gin.Context) {
	var posts []model.Post
	h.db.Where("status = ?", "published").
		Preload("Category").Preload("Tags").
		Order("published_at DESC").
		Limit(50).
		Find(&posts)

	title, desc, siteURL := h.getSiteConfig()
	now := time.Now().Format(http.TimeFormat)

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	sb.WriteString(`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">`)
	sb.WriteString("<channel>")
	sb.WriteString("<title>" + escapeXML(title) + "</title>")
	sb.WriteString("<link>" + siteURL + "</link>")
	sb.WriteString("<description>" + escapeXML(desc) + "</description>")
	sb.WriteString("<language>zh-CN</language>")
	sb.WriteString("<lastBuildDate>" + now + "</lastBuildDate>")
	sb.WriteString(fmt.Sprintf(`<atom:link href="%s/rss.xml" rel="self" type="application/rss+xml"/>`, siteURL))

	for _, post := range posts {
		postURL := siteURL + "/posts/" + post.Slug
		pubDate := ""
		if post.PublishedAt != nil {
			pubDate = post.PublishedAt.Format(http.TimeFormat)
		}

		var tags []string
		for _, t := range post.Tags {
			tags = append(tags, escapeXML(t.Name))
		}

		sb.WriteString("<item>")
		sb.WriteString("<title><![CDATA[" + post.Title + "]]></title>")
		sb.WriteString("<link>" + postURL + "</link>")
		sb.WriteString("<guid isPermaLink=\"true\">" + postURL + "</guid>")
		if pubDate != "" {
			sb.WriteString("<pubDate>" + pubDate + "</pubDate>")
		}
		if post.Excerpt != "" {
			sb.WriteString("<description><![CDATA[" + post.Excerpt + "]]></description>")
		}

		sb.WriteString("<content:encoded><![CDATA[")
		content := post.Content
		if post.CoverImage != "" {
			content = fmt.Sprintf(`<img src="%s" alt="%s"/><br/>`, post.CoverImage, escapeXML(post.Title)) + content
		}
		content = strings.ReplaceAll(content, "]]>", "]]]]><![CDATA[>")
		sb.WriteString(content)
		sb.WriteString("]]></content:encoded>")

		for _, tag := range tags {
			sb.WriteString("<category>" + escapeXML(tag) + "</category>")
		}

		sb.WriteString("</item>")
	}

	sb.WriteString("</channel>")
	sb.WriteString("</rss>")

	c.Header("Content-Type", "application/rss+xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600")
	c.String(http.StatusOK, sb.String())
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}

func (h *FeedHandler) Sitemap(c *gin.Context) {
	var posts []model.Post
	h.db.Where("status = ?", "published").
		Select("slug, updated_at").
		Order("updated_at DESC").
		Find(&posts)

	var categories []model.Category
	h.db.Select("slug, updated_at").Find(&categories)

	var tags []model.Tag
	h.db.Select("slug, created_at").Find(&tags)

	_, _, siteURL := h.getSiteConfig()

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	sb.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)

	staticPages := []struct {
		path       string
		priority   string
		changefreq string
	}{
		{"/", "1.0", "daily"},
		{"/archive", "0.8", "weekly"},
		{"/about", "0.5", "monthly"},
	}

	for _, p := range staticPages {
		sb.WriteString("<url>")
		sb.WriteString("<loc>" + siteURL + p.path + "</loc>")
		sb.WriteString("<priority>" + p.priority + "</priority>")
		sb.WriteString("<changefreq>" + p.changefreq + "</changefreq>")
		sb.WriteString("</url>")
	}

	for _, post := range posts {
		lastMod := post.UpdatedAt.Format("2006-01-02")
		sb.WriteString("<url>")
		sb.WriteString("<loc>" + siteURL + "/posts/" + post.Slug + "</loc>")
		sb.WriteString("<lastmod>" + lastMod + "</lastmod>")
		sb.WriteString("<priority>0.9</priority>")
		sb.WriteString("<changefreq>weekly</changefreq>")
		sb.WriteString("</url>")
	}

	for _, cat := range categories {
		lastMod := cat.UpdatedAt.Format("2006-01-02")
		sb.WriteString("<url>")
		sb.WriteString("<loc>" + siteURL + "/categories/" + cat.Slug + "</loc>")
		sb.WriteString("<lastmod>" + lastMod + "</lastmod>")
		sb.WriteString("<priority>0.6</priority>")
		sb.WriteString("</url>")
	}

	for _, tag := range tags {
		lastMod := tag.CreatedAt.Format("2006-01-02")
		sb.WriteString("<url>")
		sb.WriteString("<loc>" + siteURL + "/tags/" + tag.Slug + "</loc>")
		sb.WriteString("<lastmod>" + lastMod + "</lastmod>")
		sb.WriteString("<priority>0.5</priority>")
		sb.WriteString("</url>")
	}

	sb.WriteString("</urlset>")

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600")
	c.String(http.StatusOK, sb.String())
}
