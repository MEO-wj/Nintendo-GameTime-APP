package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
)

// EncryptAES256GCM encrypts plaintext with AES-256-GCM. Returns "iv.encrypted.tag" (base64url).
func EncryptAES256GCM(keyHex string, plaintext string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", fmt.Errorf("invalid hex key: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	// ciphertext = encrypted + tag
	tagStart := len(ciphertext) - gcm.Overhead()
	encrypted := ciphertext[:tagStart]
	tag := ciphertext[tagStart:]

	b64 := base64.RawURLEncoding
	return b64.EncodeToString(nonce) + "." + b64.EncodeToString(encrypted) + "." + b64.EncodeToString(tag), nil
}

// DecryptAES256GCM decrypts "iv.encrypted.tag" (base64url) with AES-256-GCM.
func DecryptAES256GCM(keyHex string, encoded string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", fmt.Errorf("invalid hex key: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}

	b64 := base64.RawURLEncoding
	parts := splitDot(encoded)
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid encrypted format: expected 3 parts")
	}

	nonce, err := b64.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode nonce: %w", err)
	}
	encrypted, err := b64.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode encrypted: %w", err)
	}
	tag, err := b64.DecodeString(parts[2])
	if err != nil {
		return "", fmt.Errorf("decode tag: %w", err)
	}

	ciphertext := append(encrypted, tag...)
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plaintext), nil
}

func splitDot(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
