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
	ResetToken   string    `gorm:"size:500" json:"-"`
	TokenVersion int       `gorm:"default:0" json:"-"`
	Role                string    `gorm:"size:20;default:user" json:"role"`
	MustChangePassword  bool      `gorm:"default:false" json:"-"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type Passkey struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID         uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	CredentialID   string    `gorm:"uniqueIndex;size:500;not null" json:"credential_id"`
	PublicKey      []byte    `gorm:"type:bytea;not null" json:"-"`
	CredentialData string    `gorm:"type:text" json:"-"`
	SignCount      int64     `gorm:"default:0" json:"sign_count"`
	AAGUID         string    `gorm:"size:100" json:"aaguid"`
	Nickname       string    `gorm:"size:100" json:"nickname"`
	CreatedAt      time.Time `json:"created_at"`
	User           User      `gorm:"foreignKey:UserID" json:"-"`
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
	AuthorID     *uuid.UUID `gorm:"type:uuid;index" json:"author_id"`
	AuthorName   string     `gorm:"size:100" json:"author_name"`
	EditorID     *uuid.UUID `gorm:"type:uuid;index" json:"editor_id"`
	PreviewToken string     `gorm:"size:64;index" json:"-"`
	PasswordHash string     `gorm:"size:255" json:"-"`
	PasswordHint string     `gorm:"size:200" json:"password_hint,omitempty"`
	PublishedAt  *time.Time `json:"published_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	Category     *Category  `gorm:"foreignKey:CategoryID" json:"category"`
	Author       *User      `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
	Editor       *User      `gorm:"foreignKey:EditorID" json:"editor,omitempty"`
	Tags         []Tag      `gorm:"many2many:post_tags;" json:"tags"`
	Series       []Series   `gorm:"many2many:post_series;" json:"series,omitempty"`
	Comments     []Comment  `gorm:"foreignKey:PostID" json:"-"`
	CommentCount int64      `gorm:"-" json:"comment_count"`
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
	IPAddress   string     `gorm:"size:45" json:"ip_address,omitempty"`
	UserAgent   string     `gorm:"size:1000" json:"user_agent,omitempty"`
	Fingerprint string     `gorm:"size:255" json:"-"`
	Country     string     `gorm:"size:100" json:"country"`
	City        string     `gorm:"size:100" json:"city"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	EditedCount int        `gorm:"default:0" json:"edited_count,omitempty"`
	EditedAt    *time.Time `json:"edited_at,omitempty"`
	Post        Post       `gorm:"foreignKey:PostID" json:"-"`
	Children    []Comment  `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

type CommentRevision struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CommentID uuid.UUID `gorm:"type:uuid;index;not null" json:"comment_id"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	EditedAt  time.Time `json:"edited_at"`
}

type MediaTag struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string    `gorm:"uniqueIndex;size:100;not null" json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type Media struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Filename     string     `gorm:"size:500;not null" json:"filename"`
	OriginalName string     `gorm:"size:500" json:"original_name"`
	MimeType     string     `gorm:"size:100" json:"mime_type"`
	Size         int64      `json:"size"`
	URL          string     `gorm:"size:1000;not null" json:"url"`
	ThumbnailURL string     `gorm:"size:1000" json:"thumbnail_url"`
	AltText      string     `gorm:"size:500" json:"alt_text"`
	Title        string     `gorm:"size:500" json:"title"`
	Artist       string     `gorm:"size:500" json:"artist"`
	Album        string     `gorm:"size:500" json:"album"`
	Description  string     `gorm:"size:2000" json:"description"`
	UploadedBy   uuid.UUID  `gorm:"type:uuid;index" json:"uploaded_by"`
	CreatedAt    time.Time  `json:"created_at"`
	Uploader     User       `gorm:"foreignKey:UploadedBy" json:"-"`
	Tags         []MediaTag `gorm:"many2many:media_tag_links;" json:"tags"`
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

type PostRevision struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	PostID    uuid.UUID `gorm:"type:uuid;index;not null" json:"post_id"`
	Title     string    `gorm:"size:500;not null" json:"title"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Excerpt   string    `gorm:"size:1000" json:"excerpt"`
	EditorID  *uuid.UUID `gorm:"type:uuid" json:"editor_id"`
	CreatedAt time.Time  `json:"created_at"`
	Editor    *User      `gorm:"foreignKey:EditorID" json:"editor,omitempty"`
}

type Series struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string     `gorm:"size:200;not null" json:"name"`
	Slug        string     `gorm:"uniqueIndex;size:200;not null" json:"slug"`
	Description string     `gorm:"type:text" json:"description"`
	CoverImage  string     `gorm:"size:500" json:"cover_image"`
	SortOrder   int        `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Posts       []Post     `gorm:"many2many:post_series;" json:"posts,omitempty"`
}

type PostSeries struct {
	SeriesID  uuid.UUID `gorm:"type:uuid;primaryKey" json:"series_id"`
	PostID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"post_id"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
}

func (PostSeries) TableName() string {
	return "post_series"
}

type CommentReaction struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CommentID uuid.UUID `gorm:"type:uuid;index:idx_comment_reaction,unique;not null" json:"comment_id"`
	Emoji     string    `gorm:"size:10;index:idx_comment_reaction,unique;not null" json:"emoji"`
	IPAddress string    `gorm:"size:45;index:idx_comment_reaction,unique;not null" json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
}

type PostReaction struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	PostID    uuid.UUID `gorm:"type:uuid;index:idx_post_reaction,unique;not null" json:"post_id"`
	Emoji     string    `gorm:"size:20;index:idx_post_reaction,unique;not null" json:"emoji"`
	IPAddress string    `gorm:"size:45;index:idx_post_reaction,unique;not null" json:"ip_address"`
	CreatedAt time.Time `json:"created_at"`
}

type NavLink struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Title     string    `gorm:"size:100;not null" json:"title"`
	URL       string    `gorm:"size:500;not null" json:"url"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type IPBan struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email     string     `gorm:"size:255;index:idx_ip_bans_email" json:"email,omitempty"`
	IPAddress string     `gorm:"size:45;index:idx_ip_bans_ip" json:"ip_address,omitempty"`
	Scope     string     `gorm:"size:100;default:'comment'" json:"scope"`
	Reason    string     `gorm:"size:500" json:"reason"`
	AutoBan   bool       `gorm:"default:false" json:"auto_ban"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type Notification struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	Type      string    `gorm:"size:50;not null;index" json:"type"`
	Title     string    `gorm:"size:500;not null" json:"title"`
	Content   string    `gorm:"type:text" json:"content"`
	Link      string    `gorm:"size:1000" json:"link"`
	IsRead    bool      `gorm:"default:false;index" json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

type FriendLink struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"size:100;not null" json:"name"`
	URL         string    `gorm:"size:500;not null" json:"url"`
	Description string    `gorm:"size:500" json:"description"`
	Avatar      string    `gorm:"size:500" json:"avatar"`
	Email       string    `gorm:"size:255" json:"email"`
	Status      string    `gorm:"size:20;default:pending;index" json:"status"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
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
		&MediaTag{},
		&SiteConfig{},
		&AccessLog{},
		&PostRevision{},
		&Series{},
		&PostSeries{},
		&CommentReaction{},
		&CommentRevision{},
		&PostReaction{},
		&FriendLink{},
		&NavLink{},
		&IPBan{},
		&Notification{},
		&GalleryImage{},
	)
}
