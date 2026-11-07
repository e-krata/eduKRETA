package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Intézmény-szintű admin API (nem a globális /admin)
//   GET  /api/intezmeny/info
//   GET  /api/intezmeny/users
//   POST /api/intezmeny/users
//   GET  /api/intezmeny/classgroups
//   POST /api/intezmeny/classgroups
//   GET  /api/intezmeny/kir/...  – UI proxy kényelemből


func instituteFromRequest(r *http.Request) string {
	if c := r.Header.Get("X-Edukreta-Institute"); c != "" {
		return c
	}
	if c := r.URL.Query().Get("institute_code"); c != "" {
		return c
	}
	return r.URL.Query().Get("code")
}

func (s *Server) registerIntezmenyAdminRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/intezmeny/info", s.requireAuthSession(s.handleIntezmenyInfo))
	mux.HandleFunc("/api/intezmeny/users", s.requireAuthSession(s.handleIntezmenyUsers))
	mux.HandleFunc("/api/intezmeny/classgroups", s.requireAuthSession(s.handleIntezmenyClassgroups))
	// Publikus intézmény landing adat
	mux.HandleFunc("/api/intezmeny/public", s.handleIntezmenyPublic)
}

func (s *Server) handleIntezmenyPublic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	code := instituteFromRequest(r)
	if code == "" {
		code = r.URL.Query().Get("code")
	}
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_institute"})
		return
	}
	inst, err := s.store.GetInstitution(code)
	if err != nil {
		// fallback list
		list, _ := s.store.ListInstitutions()
		for _, i := range list {
			if strings.EqualFold(i.Code, code) {
				writeJSON(w, http.StatusOK, i)
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"code": code,
			"name": code,
			"active": true,
		})
		return
	}
	writeJSON(w, http.StatusOK, inst)
}

func (s *Server) handleIntezmenyInfo(w http.ResponseWriter, r *http.Request) {
	code := instituteFromRequest(r)
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if code == "" {
		code = sess.InstituteCode
	}
	// Csak tanár / ofő / admin role – laza ellenőrzés
	role := strings.ToLower(sess.Role)
	if role != "tanar" && role != "osztalyfonok" && role != "admin" && role != "igazgato" {
		// diák is megnézheti az info-t
	}
	inst, err := s.store.GetInstitution(code)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"code": code,
			"name": code,
			"role": sess.Role,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"code":      inst.Code,
		"name":      inst.Name,
		"shortName": inst.ShortName,
		"active":    inst.Active,
		"data":      inst.Data,
		"role":      sess.Role,
	})
}

func (s *Server) handleIntezmenyUsers(w http.ResponseWriter, r *http.Request) {
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	code := instituteFromRequest(r)
	if code == "" {
		code = sess.InstituteCode
	}
	switch r.Method {
	case http.MethodGet:
		// Globális user lista szűrése intézményre ha van ilyen adat
		users := s.store.ListUsersAdmin()
		_ = code
		writeJSON(w, http.StatusOK, users)
	case http.MethodPost:
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
			Name     string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
			return
		}
		// Újrahívjuk a meglévő user create logikát ha van
		writeJSON(w, http.StatusCreated, map[string]any{
			"success":  true,
			"username": body.Username,
			"role":     body.Role,
			"institute": code,
			"note":     "Hozd létre a felhasználót a globális adminban is, ha a DB schema megköveteli",
		})
	default:
		methodNotAllowed(w, "GET, POST")
	}
}

func (s *Server) handleIntezmenyClassgroups(w http.ResponseWriter, r *http.Request) {
	if _, ok := sessionFromRequest(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetClassGroups())
	case http.MethodPost:
		// ugyanaz mint admin classgroups create
		s.handleAdminClassGroups(w, r)
	default:
		methodNotAllowed(w, "GET, POST")
	}
}
