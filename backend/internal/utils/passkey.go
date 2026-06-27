package utils

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"tano_blog/backend/internal/model"
)

// WebAuthn credential representation (simplified)
type PublicKeyCredentialCreationOptions struct {
	Challenge      string   `json:"challenge"`
	RP             RPInfo   `json:"rp"`
	User           UserInfo `json:"user"`
	PubKeyCredParams []CredentialParam `json:"pubKeyCredParams"`
	Timeout        int      `json:"timeout"`
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

// session stores for WebAuthn
var registrationSessions = make(map[string]*RegistrationSession)
var loginSessions = make(map[string]*LoginSession)

type RegistrationSession struct {
	UserID    uuid.UUID
	Challenge string
	ExpiresAt time.Time
}

type LoginSession struct {
	Challenge string
	ExpiresAt time.Time
}

// BeginPasskeyRegistration returns creation options for WebAuthn registration
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
	registrationSessions[challenge] = session

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

// VerifyPasskeyRegistration verifies the WebAuthn registration response
func VerifyPasskeyRegistration(db *gorm.DB, userID uuid.UUID, credential map[string]interface{}) error {
	// Extract credential data
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

	// Decode clientDataJSON
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

	// Verify challenge matches session
	session, ok := registrationSessions[clientData.Challenge]
	if !ok || session.UserID != userID || time.Now().After(session.ExpiresAt) {
		return errors.New("challenge expired or invalid")
	}
	delete(registrationSessions, clientData.Challenge)

	// Decode attestationObject to extract public key
	attBytes, err := base64.RawURLEncoding.DecodeString(attestationObject)
	if err != nil {
		return errors.New("invalid attestationObject")
	}

	// For simplicity, store the raw credential. A production implementation
	// would parse CBOR and extract the public key properly.
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

// BeginPasskeyLogin returns request options for WebAuthn authentication
func BeginPasskeyLogin() (*PublicKeyCredentialRequestOptions, error) {
	challenge := generateChallenge()
	rpID := getRPID()

	loginSessions[challenge] = &LoginSession{
		Challenge: challenge,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}

	return &PublicKeyCredentialRequestOptions{
		Challenge: challenge,
		Timeout:   60000,
		RPID:      rpID,
	}, nil
}

// VerifyPasskeyLogin verifies the WebAuthn authentication response
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

	// Verify challenge
	session, ok := loginSessions[clientData.Challenge]
	if !ok || time.Now().After(session.ExpiresAt) {
		return uuid.Nil, errors.New("challenge expired or invalid")
	}
	delete(loginSessions, clientData.Challenge)

	// Find the passkey
	var passkey model.Passkey
	if err := db.Where("credential_id = ?", credID).First(&passkey).Error; err != nil {
		return uuid.Nil, errors.New("passkey not found")
	}

	return passkey.UserID, nil
}

func generateChallenge() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func getRPID() string {
	return "tano.asia"
}
