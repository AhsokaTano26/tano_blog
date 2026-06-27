package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Username     string    `gorm:"uniqueIndex;size:50;not null" json:"username"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	DisplayName  string    `gorm:"size:100" json:"display_name"`
	AvatarURL    string    `gorm:"size:500" json:"avatar_url"`
	Bio          string    `gorm:"type:text" json:"bio"`
	TOTPSecret   string    `gorm:"size:100" json:"-"`
	TOTPEnabled  bool      `gorm:"default:false" json:"totp_enabled"`
	Role         string    `gorm:"size:20;default:admin" json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Passkey struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	CredentialID string    `gorm:"uniqueIndex;size:500;not null" json:"credential_id"`
	PublicKey    []byte    `gorm:"type:bytea;not null" json:"-"`
	SignCount    int64     `gorm:"default:0" json:"sign_count"`
	AAGUID       string    `gorm:"size:100" json:"aaguid"`
	Nickname     string    `gorm:"size:100" json:"nickname"`
	CreatedAt    time.Time `json:"created_at"`
	User         User      `gorm:"foreignKey:UserID" json:"-"`
}

type Category struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"uniqueIndex;size:100;not null" json:"name"`
	Slug        string    `gorm:"uniqueIndex;size:100;not null" json:"slug"`
	Description string    `gorm:"type:text" json:"description"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Posts       []Post    `gorm:"foreignKey:CategoryID" json:"-"`
}

type Tag struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string    `gorm:"uniqueIndex;size:100;not null" json:"name"`
	Slug      string    `gorm:"uniqueIndex;size:100;not null" json:"slug"`
	CreatedAt time.Time `json:"created_at"`
	Posts     []Post    `gorm:"many2many:post_tags;" json:"-"`
}

type Post struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Title        string     `gorm:"size:500;not null" json:"title"`
	Slug         string     `gorm:"uniqueIndex;size:500;not null" json:"slug"`
	Content      string     `gorm:"type:text;not null" json:"content"`
	Excerpt      string     `gorm:"size:1000" json:"excerpt"`
	CoverImage   string     `gorm:"size:500" json:"cover_image"`
	Status       string     `gorm:"size:20;default:draft;index" json:"status"`
	IsTop        bool       `gorm:"default:false" json:"is_top"`
	AllowComment bool       `gorm:"default:true" json:"allow_comment"`
	ViewCount    int64      `gorm:"default:0" json:"view_count"`
	CategoryID   *uuid.UUID `gorm:"type:uuid;index" json:"category_id"`
	AuthorID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"author_id"`
	PublishedAt  *time.Time `json:"published_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	Category     *Category  `gorm:"foreignKey:CategoryID" json:"category"`
	Author       User       `gorm:"foreignKey:AuthorID" json:"author"`
	Tags         []Tag      `gorm:"many2many:post_tags;" json:"tags"`
	Comments     []Comment  `gorm:"foreignKey:PostID" json:"-"`
}

type PostTag struct {
	PostID uuid.UUID `gorm:"type:uuid;primaryKey" json:"post_id"`
	TagID  uuid.UUID `gorm:"type:uuid;primaryKey" json:"tag_id"`
}

func (PostTag) TableName() string {
	return "post_tags"
}

type Comment struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	PostID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"post_id"`
	ParentID    *uuid.UUID `gorm:"type:uuid;index" json:"parent_id"`
	Nickname    string     `gorm:"size:100;not null" json:"nickname"`
	Email       string     `gorm:"size:255" json:"email"`
	Website     string     `gorm:"size:500" json:"website"`
	Content     string     `gorm:"type:text;not null" json:"content"`
	Status      string     `gorm:"size:20;default:pending;index" json:"status"`
	IPAddress   string     `gorm:"size:45" json:"-"`
	UserAgent   string     `gorm:"size:1000" json:"-"`
	Fingerprint string     `gorm:"size:255" json:"-"`
	Country     string     `gorm:"size:100" json:"country"`
	City        string     `gorm:"size:100" json:"city"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Post        Post       `gorm:"foreignKey:PostID" json:"-"`
	Children    []Comment  `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

type Media struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Filename     string    `gorm:"size:500;not null" json:"filename"`
	OriginalName string    `gorm:"size:500" json:"original_name"`
	MimeType     string    `gorm:"size:100" json:"mime_type"`
	Size         int64     `json:"size"`
	URL          string    `gorm:"size:1000;not null" json:"url"`
	AltText      string    `gorm:"size:500" json:"alt_text"`
	UploadedBy   uuid.UUID `gorm:"type:uuid;index" json:"uploaded_by"`
	CreatedAt    time.Time `json:"created_at"`
	Uploader     User      `gorm:"foreignKey:UploadedBy" json:"-"`
}

type SiteConfig struct {
	ID    uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Key   string    `gorm:"uniqueIndex;size:100;not null" json:"key"`
	Value string    `gorm:"type:text" json:"value"`
	Type  string    `gorm:"size:20;default:string" json:"type"`
}

type AccessLog struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	IPAddress    string     `gorm:"size:45;not null;index" json:"ip_address"`
	UserAgent    string     `gorm:"size:1000" json:"user_agent"`
	Method       string     `gorm:"size:10;not null" json:"method"`
	Path         string     `gorm:"size:1000;not null;index" json:"path"`
	QueryParams  string     `gorm:"type:text" json:"query_params"`
	StatusCode   int        `json:"status_code"`
	ResponseTime int        `json:"response_time"`
	Referer      string     `gorm:"size:1000" json:"referer"`
	Country      string     `gorm:"size:100" json:"country"`
	City         string     `gorm:"size:100" json:"city"`
	DeviceType   string     `gorm:"size:50" json:"device_type"`
	Browser      string     `gorm:"size:100" json:"browser"`
	OS           string     `gorm:"size:100" json:"os"`
	UserID       *uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	SessionID    string     `gorm:"size:255" json:"session_id"`
	CreatedAt    time.Time  `gorm:"not null;index" json:"created_at"`
	User         User       `gorm:"foreignKey:UserID" json:"-"`
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&Passkey{},
		&Category{},
		&Tag{},
		&Post{},
		&PostTag{},
		&Comment{},
		&Media{},
		&SiteConfig{},
		&AccessLog{},
	)
}
