package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
)

const syncSecretAAD = "tano-blog-sync-ssh-key:v1"

// EncryptSyncSecret encrypts a sync credential using a base64 encoded 32-byte
// deployment key. The key stays in the environment and is never stored in the
// database or returned by an API.
func EncryptSyncSecret(key, plaintext string) (string, error) {
	block, err := syncSecretBlock(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), []byte(syncSecretAAD))
	return base64.StdEncoding.EncodeToString(append(nonce, ciphertext...)), nil
}

func DecryptSyncSecret(key, encoded string) (string, error) {
	block, err := syncSecretBlock(key)
	if err != nil {
		return "", err
	}
	payload, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("同步私钥密文无效: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(payload) < gcm.NonceSize() {
		return "", fmt.Errorf("同步私钥密文无效")
	}
	plaintext, err := gcm.Open(nil, payload[:gcm.NonceSize()], payload[gcm.NonceSize():], []byte(syncSecretAAD))
	if err != nil {
		return "", fmt.Errorf("无法解密同步私钥: %w", err)
	}
	return string(plaintext), nil
}

func syncSecretBlock(key string) (cipher.Block, error) {
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(decoded) != 32 {
		return nil, fmt.Errorf("SYNC_KEY_ENCRYPTION_KEY 必须是 base64 编码的 32 字节密钥")
	}
	return aes.NewCipher(decoded)
}
