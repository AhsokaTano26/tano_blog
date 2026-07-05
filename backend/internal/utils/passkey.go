package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
)

var (
	webAuthn          *webauthn.WebAuthn
	webAuthnOnce      sync.Once
	sessionDataStore  sync.Map
)

func getWebAuthn() *webauthn.WebAuthn {
	webAuthnOnce.Do(func() {
		rpID := os.Getenv("WEBAUTHN_RP_ID")
		rpOrigin := os.Getenv("WEBAUTHN_ORIGIN")
		rpDisplayName := os.Getenv("WEBAUTHN_DISPLAY_NAME")

		// Derive from SITE_URL if not explicitly set
		if rpID == "" || rpOrigin == "" {
			if siteURL := os.Getenv("SITE_URL"); siteURL != "" {
				if u, err := url.Parse(siteURL); err == nil {
					if rpID == "" {
						rpID = u.Hostname()
					}
					if rpOrigin == "" {
						rpOrigin = fmt.Sprintf("%s://%s", u.Scheme, u.Host)
					}
				}
			}
		}

		if rpID == "" {
			rpID = "localhost"
		}
		if rpOrigin == "" {
			rpOrigin = "http://localhost:3000"
		}
		if rpDisplayName == "" {
			rpDisplayName = "TanoBlog"
		}

		wconfig := &webauthn.Config{
			RPDisplayName: rpDisplayName,
			RPID:          rpID,
			RPOrigins:     []string{rpOrigin},
		}
		wa, err := webauthn.New(wconfig)
		if err != nil {
			panic(fmt.Errorf("failed to initialize WebAuthn: %w", err))
		}
		webAuthn = wa
	})
	return webAuthn
}

// webauthnUser implements the webauthn.User interface
type webauthnUser struct {
	id          []byte
	name        string
	displayName string
	credentials []webauthn.Credential
}

func (u *webauthnUser) WebAuthnID() []byte                        { return u.id }
func (u *webauthnUser) WebAuthnName() string                      { return u.name }
func (u *webauthnUser) WebAuthnDisplayName() string               { return u.displayName }
func (u *webauthnUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }
func (u *webauthnUser) WebAuthnCredentialDescriptions() []protocol.CredentialDescriptor {
	descs := make([]protocol.CredentialDescriptor, len(u.credentials))
	for i, c := range u.credentials {
		descs[i] = c.Descriptor()
	}
	return descs
}

func loadCredentials(db *gorm.DB, userID uuid.UUID) []webauthn.Credential {
	var passkeys []model.Passkey
	db.Where("user_id = ?", userID).Find(&passkeys)

	creds := make([]webauthn.Credential, 0, len(passkeys))
	for _, pk := range passkeys {
		if pk.CredentialData == "" {
			continue
		}
		var c webauthn.Credential
		if err := json.Unmarshal([]byte(pk.CredentialData), &c); err != nil {
			continue
		}
		creds = append(creds, c)
	}
	return creds
}

func makeWebAuthnUser(user model.User, credentials []webauthn.Credential) *webauthnUser {
	uid := user.ID[:]
	return &webauthnUser{
		id:          uid,
		name:        user.Username,
		displayName: user.DisplayName,
		credentials: credentials,
	}
}

// BeginPasskeyRegistration starts the WebAuthn credential registration ceremony
func BeginPasskeyRegistration(db *gorm.DB, userID uuid.UUID) (*protocol.CredentialCreation, error) {
	wa := getWebAuthn()

	var user model.User
	if err := db.First(&user, userID).Error; err != nil {
		return nil, err
	}

	wu := makeWebAuthnUser(user, loadCredentials(db, userID))

	options, session, err := wa.BeginRegistration(wu)
	if err != nil {
		return nil, fmt.Errorf("begin registration: %w", err)
	}

	// Store session data temporarily in memory
	sessionDataStore.Store(userID.String(), session)

	return options, nil
}

// VerifyPasskeyRegistration completes the WebAuthn credential registration ceremony
func VerifyPasskeyRegistration(db *gorm.DB, userID uuid.UUID, rawBody []byte) error {
	wa := getWebAuthn()

	var user model.User
	if err := db.First(&user, userID).Error; err != nil {
		return err
	}

	// Retrieve stored session data
	sessionRaw, ok := sessionDataStore.Load(userID.String())
	if !ok {
		return fmt.Errorf("registration session not found, please try again")
	}
	sessionDataStore.Delete(userID.String())
	session := sessionRaw.(*webauthn.SessionData)

	wu := makeWebAuthnUser(user, loadCredentials(db, userID))

	// Parse the credential creation response
	pcc, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(rawBody))
	if err != nil {
		return fmt.Errorf("parse credential: %w", err)
	}

	cred, err := wa.CreateCredential(wu, *session, pcc)
	if err != nil {
		return fmt.Errorf("create credential: %w", err)
	}

	// Serialize credential for storage
	credJSON, err := json.Marshal(cred)
	if err != nil {
		return fmt.Errorf("marshal credential: %w", err)
	}

	// Store the credential in the database
	passkey := &model.Passkey{
		UserID:         userID,
		CredentialID:   string(cred.ID),
		PublicKey:      cred.PublicKey,
		CredentialData: string(credJSON),
		SignCount:      int64(cred.Authenticator.SignCount),
		AAGUID:         fmt.Sprintf("%x", cred.Authenticator.AAGUID),
		Nickname:       fmt.Sprintf("密钥 %s", time.Now().Format("2006-01-02 15:04")),
	}

	return db.Create(passkey).Error
}

// BeginPasskeyLogin starts the WebAuthn assertion ceremony
func BeginPasskeyLogin(db *gorm.DB) (*protocol.CredentialAssertion, error) {
	wa := getWebAuthn()

	options, session, err := wa.BeginDiscoverableLogin()
	if err != nil {
		return nil, fmt.Errorf("begin login: %w", err)
	}

	// Store session data (keyed by challenge)
	sessionDataStore.Store(string(session.Challenge), session)

	return options, nil
}

// VerifyPasskeyLogin completes the WebAuthn assertion ceremony
func VerifyPasskeyLogin(db *gorm.DB, rawBody []byte) (uuid.UUID, error) {
	wa := getWebAuthn()

	// Parse the assertion response first to get the credential ID
	parsed, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(rawBody))
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse assertion: %w", err)
	}

	// Find the corresponding passkey by credential ID
	credID := string(parsed.RawID)
	var passkey model.Passkey
	if err := db.Where("credential_id = ?", credID).First(&passkey).Error; err != nil {
		return uuid.Nil, fmt.Errorf("passkey not found")
	}

	var cred webauthn.Credential
	if err := json.Unmarshal([]byte(passkey.CredentialData), &cred); err != nil {
		return uuid.Nil, fmt.Errorf("invalid stored credential")
	}

	// Retrieve session data by challenge
	sessionRaw, ok := sessionDataStore.Load(string(parsed.Response.CollectedClientData.Challenge))
	if ok {
		sessionDataStore.Delete(string(parsed.Response.CollectedClientData.Challenge))
	}

	if !ok {
		return uuid.Nil, fmt.Errorf("login session expired, please try again")
	}
	session := sessionRaw.(*webauthn.SessionData)

	// Get the user
	var user model.User
	if err := db.First(&user, passkey.UserID).Error; err != nil {
		return uuid.Nil, fmt.Errorf("user not found")
	}

	wu := makeWebAuthnUser(user, []webauthn.Credential{cred})

	// Verify the assertion
	_, err = wa.ValidateLogin(wu, *session, parsed)
	if err != nil {
		return uuid.Nil, fmt.Errorf("validate login: %w", err)
	}

	// Update sign count
	db.Model(&passkey).Update("sign_count", cred.Authenticator.SignCount)

	return passkey.UserID, nil
}
