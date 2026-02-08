package auth

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/agentkube/operator/pkg/logger"
)

const (
	// TokenCookiePrefix is the prefix for token cookies
	TokenCookiePrefix = "agentkube_token_"
	// AuthorizationHeader is the name of the authorization header
	AuthorizationHeader = "Authorization"
	// BearerPrefix is the prefix for bearer tokens
	BearerPrefix = "Bearer "
)

// GetTokenFromCookie extracts the authentication token from cookies for a specific cluster
func GetTokenFromCookie(r *http.Request, clusterID string) (string, error) {
	// Try to get token from cookie first
	cookieName := TokenCookiePrefix + clusterID
	cookie, err := r.Cookie(cookieName)
	if err == nil && cookie.Value != "" {
		logger.Log(logger.LevelInfo, map[string]string{"cluster": clusterID}, nil, "token found in cookie")
		return cookie.Value, nil
	}

	// Fallback to Authorization header
	authHeader := r.Header.Get(AuthorizationHeader)
	if authHeader != "" {
		if strings.HasPrefix(authHeader, BearerPrefix) {
			token := strings.TrimPrefix(authHeader, BearerPrefix)
			logger.Log(logger.LevelInfo, map[string]string{"cluster": clusterID}, nil, "token found in authorization header")
			return token, nil
		}
	}

	// Try X-Auth-Token header as fallback
	xAuthToken := r.Header.Get("X-Auth-Token")
	if xAuthToken != "" {
		logger.Log(logger.LevelInfo, map[string]string{"cluster": clusterID}, nil, "token found in X-Auth-Token header")
		return xAuthToken, nil
	}

	return "", fmt.Errorf("no authentication token found for cluster %s", clusterID)
}

// GetTokenFromHeaders extracts token from various header sources
func GetTokenFromHeaders(r *http.Request) (string, error) {
	// Try Authorization header first
	authHeader := r.Header.Get(AuthorizationHeader)
	if authHeader != "" {
		if strings.HasPrefix(authHeader, BearerPrefix) {
			token := strings.TrimPrefix(authHeader, BearerPrefix)
			return token, nil
		}
	}

	// Try X-Auth-Token header
	xAuthToken := r.Header.Get("X-Auth-Token")
	if xAuthToken != "" {
		return xAuthToken, nil
	}

	return "", fmt.Errorf("no authentication token found in headers")
}

// SetTokenCookie sets an authentication token cookie for a specific cluster
func SetTokenCookie(w http.ResponseWriter, clusterID, token string, maxAge int) {
	cookieName := TokenCookiePrefix + clusterID
	cookie := &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// ClearTokenCookie removes the authentication token cookie for a specific cluster
func ClearTokenCookie(w http.ResponseWriter, clusterID string) {
	cookieName := TokenCookiePrefix + clusterID
	cookie := &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	}
	http.SetCookie(w, cookie)
}
