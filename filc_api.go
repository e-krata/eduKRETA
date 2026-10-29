package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ============================================================
// reFilc-kompatibilis meta API (api.refilc.hu helyett)
//
// Public:
//   GET  /v1/public/school-list
//   GET  /v1/public/news
//   GET  /v1/public/supporters
// Private:
//   GET  /v1/private/ads
//   GET  /v1/private/config
//   POST /v1/private/crash-report
// Share:
//   POST /v2/shared/theme/add
//   GET  /v2/shared/theme/get/all
//   GET  /v2/shared/theme/get/{id}
//   POST /v2/shared/grade-colors/add
//   GET  /v2/shared/grade-colors/get/all
//   GET  /v2/shared/grade-colors/get/{id}
// ============================================================

type filcSchool struct {
	InstituteCode string `json:"instituteCode"`
	Name          string `json:"name"`
	City          string `json:"city"`
}

type filcNews struct {
	UID     string `json:"uid"`
	Title   string `json:"title"`
	Content string `json:"content"`
	Date    string `json:"date"`
	Link    string `json:"link,omitempty"`
	Image   string `json:"image,omitempty"`
}

type filcSupporters struct {
	Github []string `json:"github"`
	Patrons []string `json:"patrons"`
	Sponsors []string `json:"sponsors"`
	Translations []string `json:"translations"`
}

type filcAd struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Author   string `json:"author,omitempty"`
	Description string `json:"description,omitempty"`
	Footer   string `json:"footer,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
	LogoURL  string `json:"logo_url,omitempty"`
	Expire   string `json:"expire,omitempty"`
}

type sharedTheme struct {
	ID               string `json:"id"`
	IsPublic         string `json:"is_public"`
	BackgroundColor  string `json:"background_color"`
	PanelsColor      string `json:"panels_color"`
	AccentColor      string `json:"accent_color"`
	IconColor        string `json:"icon_color"`
	ShadowEffect     string `json:"shadow_effect"`
	GradeColorsID    string `json:"grade_colors_id"`
	CreatedAt        string `json:"created_at"`
}

type sharedGradeColors struct {
	ID        string `json:"id"`
	IsPublic  string `json:"is_public"`
	FiveColor string `json:"five_color"`
	FourColor string `json:"four_color"`
	ThreeColor string `json:"three_color"`
	TwoColor  string `json:"two_color"`
	OneColor  string `json:"one_color"`
	CreatedAt string `json:"created_at"`
}

type filcShareStore struct {
	mu          sync.RWMutex
	themes      map[string]sharedTheme
	gradeColors map[string]sharedGradeColors
	reports     []map[string]string
}

var globalFilcShare = &filcShareStore{
	themes:      map[string]sharedTheme{},
	gradeColors: map[string]sharedGradeColors{},
}

func randomID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) registerFilcAPIRoutes(mux *http.ServeMux) {
	// Public
	mux.HandleFunc("filc/pub/v2/school-list", s.handleFilcSchoolList)
	mux.HandleFunc("filc/pub/v2/news", s.handleFilcNews)
	mux.HandleFunc("filc/pub/v2/supporters", s.handleFilcSupporters)

	// Private
	mux.HandleFunc("/filc/private/v2/ads", s.handleFilcAds)
	mux.HandleFunc("/filc/private/v2/config", s.handleFilcConfig)
	mux.HandleFunc("/filc/private/v2/crash-report", s.handleFilcCrashReport)

	// Share – specifikusabb route-ok előbb
	mux.HandleFunc("/filc/share/v3/theme/add", s.handleFilcThemeAdd)
	mux.HandleFunc("/filc/share/v3/get/all", s.handleFilcThemeGetAll)
	mux.HandleFunc("/filc/share/v3/get/", s.handleFilcThemeGetByID)

	mux.HandleFunc("/filc/share/v3/grade-colors/add", s.handleFilcGradeColorsAdd)
	mux.HandleFunc("/filc/share/v3/grade-colors/get/all", s.handleFilcGradeColorsGetAll)
	mux.HandleFunc("/filc/share/v3/grade-colors/get/", s.handleFilcGradeColorsGetByID)
}

// ---------- Public ----------

func (s *Server) handleFilcSchoolList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	list, err := s.store.ListInstitutions()
	out := make([]filcSchool, 0)
	if err == nil {
		for _, inst := range list {
			out = append(out, filcSchool{
				InstituteCode: inst.Code,
				Name:          inst.Name,
				City:          inst.ShortName, // shortName-t city-ként is adhatjuk ha nincs külön
			})
		}
	}
	// Ha üres, adj egy demo iskolát hogy a kliens ne essen el
	if len(out) == 0 {
		out = append(out, filcSchool{
			InstituteCode: "demo",
			Name:          "eduKRÉTA Demo Iskola",
			City:          "Budapest",
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleFilcNews(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, []filcNews{
		{
			UID:     "news-1",
			Title:   "Üdvözöl az eduKRÉTA",
			Content: "A napló mostantól a saját szerveredre csatlakozik.",
			Date:    time.Now().UTC().Format(time.RFC3339),
			Link:    "https://github.com/e-krata/eduKRETA",
		},
	})
}

func (s *Server) handleFilcSupporters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, filcSupporters{
		Github:       []string{"e-krata"},
		Patrons:      []string{},
		Sponsors:     []string{},
		Translations: []string{},
	})
}

// ---------- Private ----------

func (s *Server) handleFilcAds(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	// Üres lista = nincs hirdetés
	writeJSON(w, http.StatusOK, []filcAd{})
}

func (s *Server) handleFilcConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	// Minimális config amit a Filc Config.fromJson el tud fogadni
	// (mezők app-verzió függőek – bővíthető)
	writeJSON(w, http.StatusOK, map[string]any{
		"userAgent":      "eduKRÉTA",
		"config": map[string]any{
			"userAgent": "eduKRÉTA",
		},
		"messages":     []any{},
		"ad_enabled":   false,
		"news_enabled": true,
		"maintenance":  false,
		"min_build":    0,
	})
}

func (s *Server) handleFilcCrashReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	// form-urlencoded vagy JSON
	report := map[string]string{}
	ct := r.Header.Get("Content-Type")
	if strings.Contains(ct, "application/json") {
		_ = json.NewDecoder(r.Body).Decode(&report)
	} else {
		_ = r.ParseForm()
		for k, v := range r.Form {
			if len(v) > 0 {
				report[k] = v[0]
			}
		}
	}
	globalFilcShare.mu.Lock()
	if len(globalFilcShare.reports) > 200 {
		globalFilcShare.reports = globalFilcShare.reports[len(globalFilcShare.reports)-100:]
	}
	globalFilcShare.reports = append(globalFilcShare.reports, report)
	globalFilcShare.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- Share: themes ----------

func (s *Server) handleFilcThemeAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	fields := parseFormOrJSON(r)
	id := fields["id"]
	if id == "" {
		id = randomID()
	}
	t := sharedTheme{
		ID:              id,
		IsPublic:        fields["is_public"],
		BackgroundColor: fields["background_color"],
		PanelsColor:     fields["panels_color"],
		AccentColor:     fields["accent_color"],
		IconColor:       fields["icon_color"],
		ShadowEffect:    fields["shadow_effect"],
		GradeColorsID:   fields["grade_colors_id"],
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	globalFilcShare.mu.Lock()
	globalFilcShare.themes[id] = t
	globalFilcShare.mu.Unlock()
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"id": id, "ok": true})
}

func (s *Server) handleFilcThemeGetAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	globalFilcShare.mu.RLock()
	defer globalFilcShare.mu.RUnlock()
	out := make([]sharedTheme, 0, len(globalFilcShare.themes))
	for _, t := range globalFilcShare.themes {
		if t.IsPublic == "true" || t.IsPublic == "1" {
			out = append(out, t)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleFilcThemeGetByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v2/shared/theme/get/")
	id = strings.Trim(id, "/")
	if id == "" || id == "all" {
		s.handleFilcThemeGetAll(w, r)
		return
	}
	globalFilcShare.mu.RLock()
	t, ok := globalFilcShare.themes[id]
	globalFilcShare.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// ---------- Share: grade colors ----------

func (s *Server) handleFilcGradeColorsAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	fields := parseFormOrJSON(r)
	id := fields["id"]
	if id == "" {
		id = randomID()
	}
	g := sharedGradeColors{
		ID:         id,
		IsPublic:   fields["is_public"],
		FiveColor:  fields["five_color"],
		FourColor:  fields["four_color"],
		ThreeColor: fields["three_color"],
		TwoColor:   fields["two_color"],
		OneColor:   fields["one_color"],
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	globalFilcShare.mu.Lock()
	globalFilcShare.gradeColors[id] = g
	globalFilcShare.mu.Unlock()
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"id": id, "ok": true})
}

func (s *Server) handleFilcGradeColorsGetAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	globalFilcShare.mu.RLock()
	defer globalFilcShare.mu.RUnlock()
	out := make([]sharedGradeColors, 0, len(globalFilcShare.gradeColors))
	for _, g := range globalFilcShare.gradeColors {
		if g.IsPublic == "true" || g.IsPublic == "1" {
			out = append(out, g)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleFilcGradeColorsGetByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v2/shared/grade-colors/get/")
	id = strings.Trim(id, "/")
	if id == "" || id == "all" {
		s.handleFilcGradeColorsGetAll(w, r)
		return
	}
	globalFilcShare.mu.RLock()
	g, ok := globalFilcShare.gradeColors[id]
	globalFilcShare.mu.RUnlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func parseFormOrJSON(r *http.Request) map[string]string {
	out := map[string]string{}
	ct := r.Header.Get("Content-Type")
	if strings.Contains(ct, "application/json") {
		var m map[string]any
		body, _ := io.ReadAll(r.Body)
		if json.Unmarshal(body, &m) == nil {
			for k, v := range m {
				out[k] = stringifyAny(v)
			}
		}
		return out
	}
	_ = r.ParseForm()
	for k, v := range r.Form {
		if len(v) > 0 {
			out[k] = v[0]
		}
	}
	return out
}

func stringifyAny(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		// Color.value gyakran int stringként megy
		return strings.TrimSuffix(strings.TrimSuffix(
			strings.Replace(jsonNumber(t), ".0", "", 1), ".0"), ".0")
	case bool:
		if t {
			return "true"
		}
		return "false"
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func jsonNumber(f float64) string {
	b, _ := json.Marshal(f)
	return string(b)
}
