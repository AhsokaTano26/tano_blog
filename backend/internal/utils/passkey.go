package utils

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

type PublicKeyCredentialCreationOptions struct {
	Challenge      string           `json:"challenge"`
	RP             RPInfo           `json:"rp"`
	User           UserInfo         `json:"user"`
	PubKeyCredParams []CredentialParam `json:"pubKeyCredParams"`
	Timeout        int              `json:"timeout"`
}

type RPInfo struct {
	Name string `json:"name"`
	ID   string `json:"id"`
}

type UserInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type CredentialParam struct {
	Type string `json:"type"`
	Alg  int    `json:"alg"`
}

type PublicKeyCredentialRequestOptions struct {
	Challenge string `json:"challenge"`
	Timeout   int    `json:"timeout"`
	RPID      string `json:"rpId"`
}

type RegistrationSession struct {
	UserID    uuid.UUID
	Challenge string
	ExpiresAt time.Time
}

type LoginSession struct {
	Challenge string
	ExpiresAt time.Time
}

var (
	registrationMu       sync.RWMutex
	registrationSessions = make(map[string]*RegistrationSession)
	loginMu              sync.RWMutex
	loginSessions        = make(map[string]*LoginSession)
)

func cleanupSessions() {
	now := time.Now()
	registrationMu.Lock()
	for k, v := range registrationSessions {
		if now.After(v.ExpiresAt) {
			delete(registrationSessions, k)
		}
	}
	registrationMu.Unlock()

	loginMu.Lock()
	for k, v := range loginSessions {
		if now.After(v.ExpiresAt) {
			delete(loginSessions, k)
		}
	}
	loginMu.Unlock()
}

func init() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cleanupSessions()
		}
	}()
}

func getOrigin() string {
	if o := os.Getenv("WEBAUTHN_ORIGIN"); o != "" {
		return o
	}
	return "https://tano.asia"
}

func BeginPasskeyRegistration(db *gorm.DB, userID uuid.UUID) (*PublicKeyCredentialCreationOptions, error) {
	var user model.User
	if err := db.First(&user, userID).Error; err != nil {
		return nil, err
	}

	challenge := generateChallenge()
	rpID := getRPID()

	session := &RegistrationSession{
		UserID:    userID,
		Challenge: challenge,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}

	registrationMu.Lock()
	registrationSessions[challenge] = session
	registrationMu.Unlock()

	userIDBytes := user.ID[:]
	return &PublicKeyCredentialCreationOptions{
		Challenge: challenge,
		RP: RPInfo{
			Name: "TanoBlog",
			ID:   rpID,
		},
		User: UserInfo{
			ID:          base64.RawURLEncoding.EncodeToString(userIDBytes),
			Name:        user.Username,
			DisplayName: user.DisplayName,
		},
		PubKeyCredParams: []CredentialParam{
			{Type: "public-key", Alg: -7},   // ES256
			{Type: "public-key", Alg: -257}, // RS256
		},
		Timeout: 60000,
	}, nil
}

func VerifyPasskeyRegistration(db *gorm.DB, userID uuid.UUID, credential map[string]interface{}) error {
	credID, ok := credential["id"].(string)
	if !ok {
		return errors.New("invalid credential ID")
	}

	response, ok := credential["response"].(map[string]interface{})
	if !ok {
		return errors.New("invalid credential response")
	}

	clientDataJSON, _ := response["clientDataJSON"].(string)
	attestationObject, _ := response["attestationObject"].(string)

	clientDataBytes, err := base64.RawURLEncoding.DecodeString(clientDataJSON)
	if err != nil {
		return errors.New("invalid clientDataJSON")
	}

	var clientData struct {
		Challenge string `json:"challenge"`
		Origin    string `json:"origin"`
		Type      string `json:"type"`
	}
	if err := json.Unmarshal(clientDataBytes, &clientData); err != nil {
		return errors.New("invalid clientDataJSON")
	}

	if clientData.Type != "webauthn.create" {
		return errors.New("invalid credential type")
	}

	if clientData.Origin != getOrigin() {
		return errors.New("invalid origin")
	}

	registrationMu.Lock()
	session, ok := registrationSessions[clientData.Challenge]
	if ok {
		delete(registrationSessions, clientData.Challenge)
	}
	registrationMu.Unlock()

	if !ok || session.UserID != userID || time.Now().After(session.ExpiresAt) {
		return errors.New("challenge expired or invalid")
	}

	attBytes, err := base64.RawURLEncoding.DecodeString(attestationObject)
	if err != nil {
		return errors.New("invalid attestationObject")
	}

	publicKey := attBytes

	passkey := &model.Passkey{
		UserID:       userID,
		CredentialID: credID,
		PublicKey:    publicKey,
		SignCount:    0,
		AAGUID:       "",
		Nickname:     fmt.Sprintf("设备 %s", time.Now().Format("2006-01-02 15:04")),
	}

	return db.Create(passkey).Error
}

func BeginPasskeyLogin() (*PublicKeyCredentialRequestOptions, error) {
	challenge := generateChallenge()
	rpID := getRPID()

	loginMu.Lock()
	loginSessions[challenge] = &LoginSession{
		Challenge: challenge,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	loginMu.Unlock()

	return &PublicKeyCredentialRequestOptions{
		Challenge: challenge,
		Timeout:   60000,
		RPID:      rpID,
	}, nil
}

func VerifyPasskeyLogin(db *gorm.DB, credential map[string]interface{}) (uuid.UUID, error) {
	credID, ok := credential["id"].(string)
	if !ok {
		return uuid.Nil, errors.New("invalid credential ID")
	}

	response, ok := credential["response"].(map[string]interface{})
	if !ok {
		return uuid.Nil, errors.New("invalid credential response")
	}

	clientDataJSON, _ := response["clientDataJSON"].(string)
	authenticatorData, _ := response["authenticatorData"].(string)
	signature, _ := response["signature"].(string)

	clientDataBytes, err := base64.RawURLEncoding.DecodeString(clientDataJSON)
	if err != nil {
		return uuid.Nil, errors.New("invalid clientDataJSON")
	}

	var clientData struct {
		Challenge string `json:"challenge"`
		Origin    string `json:"origin"`
		Type      string `json:"type"`
	}
	if err := json.Unmarshal(clientDataBytes, &clientData); err != nil {
		return uuid.Nil, errors.New("invalid clientDataJSON")
	}

	if clientData.Type != "webauthn.get" {
		return uuid.Nil, errors.New("invalid credential type")
	}

	if clientData.Origin != getOrigin() {
		return uuid.Nil, errors.New("invalid origin")
	}

	loginMu.Lock()
	session, ok := loginSessions[clientData.Challenge]
	if ok {
		delete(loginSessions, clientData.Challenge)
	}
	loginMu.Unlock()

	if !ok || time.Now().After(session.ExpiresAt) {
		return uuid.Nil, errors.New("challenge expired or invalid")
	}

	var passkey model.Passkey
	if err := db.Where("credential_id = ?", credID).First(&passkey).Error; err != nil {
		return uuid.Nil, errors.New("passkey not found")
	}

	// Verify that authenticatorData and signature are present
	if authenticatorData == "" || signature == "" {
		return uuid.Nil, errors.New("missing authenticator data or signature")
	}

	// Update sign count
	db.Model(&passkey).Update("sign_count", passkey.SignCount+1)

	return passkey.UserID, nil
}

func generateChallenge() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func getRPID() string {
	if id := os.Getenv("WEBAUTHN_RP_ID"); id != "" {
		return id
	}
	return "tano.asia"
}
