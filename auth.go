package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ============================================================
// TOKEN HELPERS
// ============================================================

func randomToken() string {
	b := make([]byte, 32)

	if _, err := rand.Read(b); err != nil {
		return ""
	}

	return base64.RawURLEncoding.EncodeToString(b)
}

func base64URL(v any) string {
	b, err := json.Marshal(v)

	if err != nil {
		return ""
	}

	return base64.RawURLEncoding.EncodeToString(b)
}

// ============================================================
// ID TOKEN
// ============================================================

func buildIdToken(
	instituteCode string,
	userID string,
	username string,
	studentName string,
	role string,
) string {
	if role == "" {
		role = "Tanulo"
	}
	header := map[string]string{
		"alg": "none",
		"typ": "JWT",
	}

	payload := map[string]any{
		"kreta:institute_code":    instituteCode,
		"kreta:institute_user_id": userID,
		"kreta:user_name":         username,
		"name":                    studentName,
		"role":                    role,
		"iat":                     time.Now().Unix(),
	}

	sig := make([]byte, 16)

	if _, err := rand.Read(sig); err != nil {
		return ""
	}

	return base64URL(header) +
		"." +
		base64URL(payload) +
		"." +
		base64.RawURLEncoding.EncodeToString(sig)
}

// ============================================================
// SESSION
// ============================================================

type sessionInfo struct {
	InstituteCode string `json:"instituteCode"`
	UserID        string `json:"userId"`
	Username      string `json:"username"`
	Role          string `json:"role"`
}

type AuthStore struct {
	mu sync.Mutex

	path string

	pendingCodes map[string]bool

	accessTokens map[string]sessionInfo

	refreshTokens map[string]sessionInfo
}

type authFile struct {
	AccessTokens  map[string]sessionInfo `json:"accessTokens"`
	RefreshTokens map[string]sessionInfo `json:"refreshTokens"`
}

// ============================================================
// AUTH STORE
// ============================================================

func NewAuthStore(path string) *AuthStore {
	a := &AuthStore{
		path: path,

		pendingCodes: make(map[string]bool),

		accessTokens: make(map[string]sessionInfo),

		refreshTokens: make(map[string]sessionInfo),
	}

	raw, err := os.ReadFile(path)

	if err != nil {
		return a
	}

	var f authFile

	if err := json.Unmarshal(raw, &f); err != nil {
		log.Printf(
			"auth state betöltése sikertelen: %v",
			err,
		)

		return a
	}

	if f.AccessTokens != nil {
		a.accessTokens = f.AccessTokens
	}

	if f.RefreshTokens != nil {
		a.refreshTokens = f.RefreshTokens
	}

	return a
}

// ============================================================
// SAVE
// ============================================================

func (a *AuthStore) save() {
	raw, err := json.MarshalIndent(
		authFile{
			AccessTokens:  a.accessTokens,
			RefreshTokens: a.refreshTokens,
		},
		"",
		"  ",
	)

	if err != nil {
		log.Printf(
			"auth state serializálása sikertelen: %v",
			err,
		)

		return
	}

	if err := os.WriteFile(
		a.path,
		raw,
		0o600,
	); err != nil {
		log.Printf(
			"auth state mentése sikertelen: %v",
			err,
		)
	}
}

// ============================================================
// AUTHORIZATION CODE
// ============================================================

func (a *AuthStore) issueCode() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	code := randomToken()

	if code == "" {
		return ""
	}

	a.pendingCodes[code] = true

	return code
}

func (a *AuthStore) hasCode(code string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.pendingCodes[code]
}

func (a *AuthStore) consumeCode(code string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.pendingCodes[code] {
		return false
	}

	delete(a.pendingCodes, code)

	return true
}

// ============================================================
// ACCESS + REFRESH TOKEN
// ============================================================

func (a *AuthStore) issueTokens(
	info sessionInfo,
) (string, string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	access := randomToken()
	refresh := randomToken()

	if access == "" || refresh == "" {
		return "", ""
	}

	a.accessTokens[access] = info
	a.refreshTokens[refresh] = info

	a.save()

	return access, refresh
}

func (a *AuthStore) consumeRefresh(
	token string,
) (sessionInfo, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	info, ok := a.refreshTokens[token]

	if !ok {
		return sessionInfo{}, false
	}

	delete(a.refreshTokens, token)

	a.save()

	return info, true
}

func (a *AuthStore) isValidAccess(token string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	_, ok := a.accessTokens[token]

	return ok
}

// ============================================================
// ERROR RESPONSE
// ============================================================

func writeOAuthError(
	w http.ResponseWriter,
	status int,
	errCode string,
	description string,
) {
	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(
		map[string]string{
			"error":             errCode,
			"error_description": description,
		},
	)
}

// ============================================================
// MOCK LOGIN PAGE
// ============================================================

func loginPageHTML(code string) string {
	return fmt.Sprintf(
		"<!doctype html>"+
			"<html lang=\"hu\">"+
			"<head>"+
			"<meta charset=\"utf-8\">"+
			"<title>Mock e-Kréta login</title>"+
			"<style>"+
			"body {"+
			"font-family: sans-serif;"+
			"max-width: 420px;"+
			"margin: 80px auto;"+
			"padding: 0 16px;"+
			"}"+
			"button {"+
			"width: 100%%;"+
			"padding: 12px;"+
			"font-size: 16px;"+
			"background: #4c6b3a;"+
			"color: #fff;"+
			"border: none;"+
			"border-radius: 8px;"+
			"cursor: pointer;"+
			"}"+
			"</style>"+
			"</head>"+
			"<body>"+
			"<h2>Mock e-Kréta bejelentkezés</h2>"+
			"<p>Ez a teszt szerver bejelentkezési képernyője.</p>"+
			"<form method=\"get\" action=\"/ellenorzo-student/prod/oauthredirect\">"+
			"<input type=\"hidden\" name=\"code\" value=\"%s\">"+
			"<button type=\"submit\">Belépés mock diákként</button>"+
			"</form>"+
			"</body>"+
			"</html>",
		code,
	)
}

// ============================================================
// /Account/Login
// ============================================================

func (s *Server) handleAccountLogin(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	code := s.auth.issueCode()

	if code == "" {
		writeOAuthError(
			w,
			http.StatusInternalServerError,
			"server_error",
			"Nem sikerült authorization code-ot létrehozni.",
		)

		return
	}

	w.Header().Set(
		"Content-Type",
		"text/html; charset=utf-8",
	)

	_, _ = w.Write(
		[]byte(loginPageHTML(code)),
	)
}

// ============================================================
// OAuth REDIRECT
// ============================================================

func (s *Server) handleOauthRedirect(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	code := r.URL.Query().Get("code")

	if code == "" {
		http.Error(
			w,
			"missing code",
			http.StatusBadRequest,
		)

		return
	}

	if !s.auth.hasCode(code) {
		http.Error(
			w,
			"invalid or expired code",
			http.StatusUnauthorized,
		)

		return
	}

	w.Header().Set(
		"Content-Type",
		"text/html; charset=utf-8",
	)

	html := "<!doctype html>" +
		"<html lang=\"hu\">" +
		"<head>" +
		"<meta charset=\"utf-8\">" +
		"<title>KRETÉN</title>" +
		"</head>" +
		"<body>" +
		"<h2>Bejelentkezés sikeres</h2>" +
		"<p>A hitelesítési kód érvényes.</p>" +
		"</body>" +
		"</html>"

	_, _ = w.Write([]byte(html))
}

// ============================================================
// /connect/token
// ============================================================

func (s *Server) handleToken(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")

		writeOAuthError(
			w,
			http.StatusMethodNotAllowed,
			"invalid_request",
			"Csak POST kérés engedélyezett.",
		)

		return
	}

	if err := r.ParseForm(); err != nil {
		writeOAuthError(
			w,
			http.StatusBadRequest,
			"invalid_request",
			"Hibás formátumú kérés.",
		)

		return
	}

	grantType := r.FormValue("grant_type")

	log.Printf(
		"connect/token: grant_type=%q username=%q",
		grantType,
		r.FormValue("username"),
	)

	cfg := s.store.GetConfig()
	student := s.store.GetStudent()

	var info sessionInfo

	switch grantType {
	case "authorization_code":
		code := r.FormValue("code")

		if code == "" {
			writeOAuthError(
				w,
				http.StatusBadRequest,
				"invalid_request",
				"Hiányzik a code.",
			)

			return
		}

		if !s.auth.consumeCode(code) {
			writeOAuthError(
				w,
				http.StatusUnauthorized,
				"invalid_grant",
				"Érvénytelen vagy már felhasznált authorization code.",
			)

			return
		}

		info = sessionInfo{
			InstituteCode: cfg.InstituteCode,
			UserID:        student.Uid,
			Username:      cfg.Username,
			Role:          "Tanulo",
		}

	case "refresh_token":
		refreshToken := r.FormValue("refresh_token")

		if refreshToken == "" {
			writeOAuthError(
				w,
				http.StatusBadRequest,
				"invalid_request",
				"Hiányzik a refresh_token.",
			)

			return
		}

		found, ok := s.auth.consumeRefresh(refreshToken)

		if !ok {
			writeOAuthError(
				w,
				http.StatusBadRequest,
				"invalid_grant",
				"Érvénytelen refresh token.",
			)

			return
		}

		info = found

	case "password":
		username := r.FormValue("username")
		if username == "" {
			username = r.FormValue("userName")
		}
		password := r.FormValue("password")
		instituteCode := r.FormValue("institute_code")
		if instituteCode == "" {
			instituteCode = r.FormValue("instituteCode")
		}
		if instituteCode == "" {
			instituteCode = cfg.InstituteCode
		}

		if username == "" || password == "" {
			writeOAuthError(
				w,
				http.StatusBadRequest,
				"invalid_request",
				"Hiányzik a felhasználónév vagy a jelszó.",
			)

			return
		}

		// Ha van intézménykód, ellenőrizzük, hogy létezik-e
		if instituteCode != "" {
			if _, err := s.store.GetInstitution(instituteCode); err != nil {
				writeOAuthError(
					w,
					http.StatusBadRequest,
					"invalid_request",
					"Ismeretlen vagy inaktív intézmény.",
				)
				return
			}
		}

		user, err := s.store.GetUserByUsernameAndInstitute(username, instituteCode)
		if err != nil {
			// Fallback a régi metódusra (ha még nincs institute_code oszlop / adat)
			user, err = s.store.GetUserByUsername(username)
		}

		if err != nil {
			writeOAuthError(
				w,
				http.StatusUnauthorized,
				"invalid_grant",
				"Hibás felhasználónév vagy jelszó.",
			)

			return
		}

		if !s.store.CheckPassword(user, password) {
			writeOAuthError(
				w,
				http.StatusUnauthorized,
				"invalid_grant",
				"Hibás felhasználónév vagy jelszó.",
			)

			return
		}

		role := user.Role
		if role == "" {
			role = "Tanulo"
		}
		if instituteCode == "" {
			instituteCode = cfg.InstituteCode
		}
		info = sessionInfo{
			InstituteCode: instituteCode,
			UserID:        user.StudentUID,
			Username:      user.Username,
			Role:          role,
		}

	default:
		writeOAuthError(
			w,
			http.StatusBadRequest,
			"unsupported_grant_type",
			"Nem támogatott grant_type.",
		)

		return
	}

	accessToken, refreshToken := s.auth.issueTokens(info)

	if accessToken == "" || refreshToken == "" {
		writeOAuthError(
			w,
			http.StatusInternalServerError,
			"server_error",
			"Nem sikerült tokeneket létrehozni.",
		)

		return
	}

	displayName := student.Nev
	if info.Role == "Tanar" {
		displayName = info.Username
	}
	idToken := buildIdToken(
		info.InstituteCode,
		info.UserID,
		info.Username,
		displayName,
		info.Role,
	)

	expiresIn := cfg.AccessTokenTTLSeconds

	if expiresIn <= 0 {
		expiresIn = 3600
	}

	resp := map[string]any{
		"id_token":     idToken,
		"access_token": accessToken,
		"expires_in":   expiresIn,
		"token_type":   "Bearer",
		"refresh_token": refreshToken,
		"scope":        "openid email offline_access kreta-ellenorzo-webapi.public",
	}

	w.Header().Set(
		"Content-Type",
		"application/json; charset=utf-8",
	)

	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf(
			"token response írási hiba: %v",
			err,
		)
	}
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

func (s *Server) requireAuth(
	next http.HandlerFunc,
) http.HandlerFunc {
	return func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		authz := r.Header.Get("Authorization")

		const prefix = "Bearer "

		if len(authz) <= len(prefix) ||
			!strings.HasPrefix(authz, prefix) {

			writeOAuthError(
				w,
				http.StatusUnauthorized,
				"invalid_token",
				"Hiányzó vagy hibás Authorization header.",
			)

			return
		}

		token := strings.TrimSpace(
			authz[len(prefix):],
		)

		if token == "" {
			writeOAuthError(
				w,
				http.StatusUnauthorized,
				"invalid_token",
				"Hiányzó access token.",
			)

			return
		}

		if !s.auth.isValidAccess(token) {
			writeOAuthError(
				w,
				http.StatusUnauthorized,
				"invalid_token",
				"Érvénytelen vagy lejárt access token.",
			)

			return
		}

		next(w, r)
	}
}