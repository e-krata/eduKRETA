package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"
)

// ============================================================
// Kapcsolódás / eAdmin / LEP / Covid / Faliújság bővítések
// ============================================================

type EmployeeDetails struct {
	Uid               string `json:"Uid"`
	Nev               string `json:"Nev"`
	Email             string `json:"Email,omitempty"`
	Telefonszam       string `json:"Telefonszam,omitempty"`
	Beosztas          string `json:"Beosztas,omitempty"`
	OsztalyCsoportUid string `json:"OsztalyCsoportUid,omitempty"`
	OsztalyCsoportNev string `json:"OsztalyCsoportNev,omitempty"`
}

type LEPEvent struct {
	Uid              string `json:"Uid"`
	Cim              string `json:"Cim"`
	Leiras           string `json:"Leiras,omitempty"`
	Kezdet           string `json:"Kezdet"`
	Vege             string `json:"Vege,omitempty"`
	Hely             string `json:"Hely,omitempty"`
	MaxLetszam       int    `json:"MaxLetszam,omitempty"`
	JelentkezokSzama int    `json:"JelentkezokSzama"`
	Statusz          string `json:"Statusz"`
	IntezmenyKod     string `json:"IntezmenyKod,omitempty"`
	PermissionOk     bool   `json:"PermissionOk"`
	Letrehozva       string `json:"Letrehozva"`
}

type CovidClosure struct {
	IntezmenyId string `json:"IntezmenyId"`
	Start       string `json:"Start,omitempty"`
	Vege        string `json:"Vege,omitempty"`
	Aktiv       bool   `json:"Aktiv"`
}

type covidFormRequest struct {
	IntezmenyId string         `json:"IntezmenyId"`
	Valaszok    map[string]any `json:"Valaszok"`
}

type lepEventRequest struct {
	Cim          string `json:"Cim"`
	Leiras       string `json:"Leiras"`
	Kezdet       string `json:"Kezdet"`
	Vege         string `json:"Vege"`
	Hely         string `json:"Hely"`
	MaxLetszam   int    `json:"MaxLetszam"`
	IntezmenyKod string `json:"IntezmenyKod"`
}

type faliujsagAddRequest struct {
	Cim                string `json:"Cim"`
	Tartalom           string `json:"Tartalom"`
	TartalomText       string `json:"TartalomText"`
	RogzitoNeve        string `json:"RogzitoNeve"`
	ErvenyessegKezdete string `json:"ErvenyessegKezdete"`
	ErvenyessegVege    string `json:"ErvenyessegVege"`
}

func (s *Store) GetLEPEvents() []LEPEvent {
	return getCollection[LEPEvent](contextBG(), s.db, "lep_events", "uid")
}

func (s *Store) SetLEPEvents(v []LEPEvent) {
	setCollection(s, "lep_events", v, func(item LEPEvent) string { return item.Uid })
}

func (s *Store) GetCovidClosures() []CovidClosure {
	ctx := contextBG()
	rows, err := s.db.Query(ctx, `SELECT data FROM covid_closures`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []CovidClosure
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		var item CovidClosure
		if json.Unmarshal(raw, &item) == nil {
			out = append(out, item)
		}
	}
	return out
}

func (s *Store) SetCovidClosures(v []CovidClosure) {
	ctx := contextBG()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `DELETE FROM covid_closures`)
	for _, item := range v {
		raw, err := json.Marshal(item)
		if err != nil || item.IntezmenyId == "" {
			continue
		}
		_, _ = tx.Exec(ctx,
			`INSERT INTO covid_closures (intezmeny_id, data) VALUES ($1, $2::jsonb)
			 ON CONFLICT (intezmeny_id) DO UPDATE SET data = EXCLUDED.data`,
			item.IntezmenyId, string(raw),
		)
	}
	_ = tx.Commit(ctx)
}

func (s *Store) GetEmployeesByRole(role string) []EmployeeDetails {
	ctx := contextBG()
	rows, err := s.db.Query(ctx, `
		SELECT id::text, username, COALESCE(role,''), COALESCE(student_uid,'')
		FROM users WHERE active = TRUE AND LOWER(role) = LOWER($1)
	`, role)
	if err != nil {
		return []EmployeeDetails{}
	}
	defer rows.Close()
	var out []EmployeeDetails
	for rows.Next() {
		var id, username, r, linked string
		if err := rows.Scan(&id, &username, &r, &linked); err != nil {
			continue
		}
		out = append(out, EmployeeDetails{
			Uid:      id,
			Nev:      username,
			Beosztas: r,
		})
	}
	return out
}

func (s *Server) registerKapcsolodasRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/kapcsolodas/eAdmin/{IntezmenyId}/alkalmazottak/Igazgatosag", s.requireAuthSession(s.handleGetDirectors))
	mux.HandleFunc("/kapcsolodas/eAdmin/{IntezmenyId}/alkalmazottak/Osztalyfonok", s.requireAuthSession(s.handleGetClassMasters))
	mux.HandleFunc("/kapcsolodas/eAdmin/{IntezmenyId}/alkalmazottak/Adminisztrator", s.requireAuthSession(s.handleGetAdministrators))

	mux.HandleFunc("/kapcsolodas/LEP/mobileAPI/Eloadasok", s.requireAuthSession(s.handleGetLEPEvents))
	mux.HandleFunc("/kapcsolodas/LEP/mobileAPI/Eloadasok/GondviseloEngedelyezes", s.requireAuthSession(s.handleUpdateLEPEventPermission))
	mux.HandleFunc("/kapcsolodas/edukreta/Covid/{IntezmenyId}/Bejelentes", s.requireAuthSession(s.handlePostCovidForm))

	mux.HandleFunc("/kapcsolodas/LEP/EventAdd", s.requireAuthSession(s.handleLEPEventAdd))
	mux.HandleFunc("/kapcsolodas/LEP/EventDelete", s.requireAuthSession(s.handleLEPEventDelete))
	mux.HandleFunc("/kapcsolodas/LEP/EventFinished", s.requireAuthSession(s.handleLEPEventFinished))
	mux.HandleFunc("/kapcsolodas/LEP/EventJoin", s.requireAuthSession(s.handleLEPEventJoin))

	mux.HandleFunc("/kapcsolodas/edukreta/Covid/{IntezmenyId}/IntezmenyLezaras/Start", s.requireAuthSession(s.handleCovidStart))
	mux.HandleFunc("/kapcsolodas/edukreta/Covid/{IntezmenyId}/IntezmenyLezaras/Vege", s.requireAuthSession(s.handleCovidVege))

	mux.HandleFunc("/kapcsolodas/{IntezmenyId}/Faliujsag/Add", s.requireAuthSession(s.handleFaliujsagAdd))
	mux.HandleFunc("/kapcsolodas/{IntezmenyId}/Faliujsag/Torles", s.requireAuthSession(s.handleFaliujsagTorles))
}

func pathIntezmeny(r *http.Request) string {
	return r.PathValue("IntezmenyId")
}

func (s *Server) handleGetDirectors(w http.ResponseWriter, r *http.Request) {
	_ = pathIntezmeny(r)
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	list := s.store.GetEmployeesByRole("Igazgato")
	if len(list) == 0 {
		list = s.store.GetEmployeesByRole("Admin")
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleGetClassMasters(w http.ResponseWriter, r *http.Request) {
	_ = pathIntezmeny(r)
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, s.store.GetEmployeesByRole("Osztalyfonok"))
}

func (s *Server) handleGetAdministrators(w http.ResponseWriter, r *http.Request) {
	_ = pathIntezmeny(r)
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, s.store.GetEmployeesByRole("Admin"))
}

func (s *Server) handleGetLEPEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, s.store.GetLEPEvents())
}

func (s *Server) handleUpdateLEPEventPermission(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		methodNotAllowed(w, "POST, PUT")
		return
	}
	var body struct {
		Uid          string `json:"Uid"`
		PermissionOk bool   `json:"PermissionOk"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	events := s.store.GetLEPEvents()
	found := false
	for i := range events {
		if events[i].Uid == body.Uid {
			events[i].PermissionOk = body.PermissionOk
			found = true
			break
		}
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	s.store.SetLEPEvents(events)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "Uid": body.Uid, "PermissionOk": body.PermissionOk})
}

func (s *Server) handlePostCovidForm(w http.ResponseWriter, r *http.Request) {
	intezmenyId := pathIntezmeny(r)
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var req covidFormRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if intezmenyId == "" {
		intezmenyId = req.IntezmenyId
	}
	if intezmenyId == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_intezmeny"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"IntezmenyId": intezmenyId,
		"Rogzitve":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleLEPEventAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var req lepEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Cim == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	ev := LEPEvent{
		Uid:          "LEP-" + newUID(),
		Cim:          req.Cim,
		Leiras:       req.Leiras,
		Kezdet:       req.Kezdet,
		Vege:         req.Vege,
		Hely:         req.Hely,
		MaxLetszam:   req.MaxLetszam,
		IntezmenyKod: req.IntezmenyKod,
		Statusz:      "tervezett",
		PermissionOk: true,
		Letrehozva:   time.Now().UTC().Format(time.RFC3339),
	}
	events := s.store.GetLEPEvents()
	events = append(events, ev)
	s.store.SetLEPEvents(events)
	writeJSON(w, http.StatusCreated, ev)
}

func (s *Server) handleLEPEventDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w, "POST, DELETE")
		return
	}
	uid := r.URL.Query().Get("uid")
	if uid == "" {
		var body struct {
			Uid string `json:"Uid"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		uid = body.Uid
	}
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_uid"})
		return
	}
	events := s.store.GetLEPEvents()
	out := make([]LEPEvent, 0, len(events))
	found := false
	for _, e := range events {
		if e.Uid == uid {
			found = true
			continue
		}
		out = append(out, e)
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	s.store.SetLEPEvents(out)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": uid})
}

func (s *Server) handleLEPEventFinished(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		methodNotAllowed(w, "POST, PUT")
		return
	}
	uid := r.URL.Query().Get("uid")
	if uid == "" {
		var body struct {
			Uid string `json:"Uid"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		uid = body.Uid
	}
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_uid"})
		return
	}
	events := s.store.GetLEPEvents()
	found := false
	for i := range events {
		if events[i].Uid == uid {
			events[i].Statusz = "befejezett"
			events[i].Vege = time.Now().UTC().Format(time.RFC3339)
			found = true
			break
		}
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	s.store.SetLEPEvents(events)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "Uid": uid, "Statusz": "befejezett"})
}

func (s *Server) handleLEPEventJoin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var body struct {
		Uid string `json:"Uid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Uid == "" {
		body.Uid = r.URL.Query().Get("uid")
	}
	if body.Uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_uid"})
		return
	}
	events := s.store.GetLEPEvents()
	found := false
	for i := range events {
		if events[i].Uid == body.Uid {
			if events[i].MaxLetszam > 0 && events[i].JelentkezokSzama >= events[i].MaxLetszam {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "full"})
				return
			}
			events[i].JelentkezokSzama++
			found = true
			break
		}
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	s.store.SetLEPEvents(events)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "Uid": body.Uid})
}

func (s *Server) handleCovidStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		methodNotAllowed(w, "POST, PUT")
		return
	}
	intezmenyId := pathIntezmeny(r)
	if intezmenyId == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_intezmeny"})
		return
	}
	closures := s.store.GetCovidClosures()
	now := time.Now().UTC().Format(time.RFC3339)
	c := CovidClosure{IntezmenyId: intezmenyId, Start: now, Aktiv: true}
	found := false
	for i := range closures {
		if closures[i].IntezmenyId == intezmenyId {
			closures[i] = c
			found = true
			break
		}
	}
	if !found {
		closures = append(closures, c)
	}
	s.store.SetCovidClosures(closures)
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleCovidVege(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		methodNotAllowed(w, "POST, PUT")
		return
	}
	intezmenyId := pathIntezmeny(r)
	closures := s.store.GetCovidClosures()
	idx := -1
	for i := range closures {
		if closures[i].IntezmenyId == intezmenyId {
			idx = i
			break
		}
	}
	if idx < 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_active"})
		return
	}
	closures[idx].Vege = time.Now().UTC().Format(time.RFC3339)
	closures[idx].Aktiv = false
	s.store.SetCovidClosures(closures)
	writeJSON(w, http.StatusOK, closures[idx])
}

func (s *Server) handleFaliujsagAdd(w http.ResponseWriter, r *http.Request) {
	_ = pathIntezmeny(r)
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var req faliujsagAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Cim == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	item := NoticeBoardItem{
		Uid:                "N-" + newUID(),
		RogzitoNeve:        req.RogzitoNeve,
		ErvenyessegKezdete: req.ErvenyessegKezdete,
		ErvenyessegVege:    req.ErvenyessegVege,
		Cim:                req.Cim,
		Tartalom:           req.Tartalom,
		TartalomText:       req.TartalomText,
	}
	if item.TartalomText == "" {
		item.TartalomText = item.Tartalom
	}
	notices := s.store.GetNotices()
	notices = append(notices, item)
	s.store.SetNotices(notices)
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleFaliujsagTorles(w http.ResponseWriter, r *http.Request) {
	_ = pathIntezmeny(r)
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w, "POST, DELETE")
		return
	}
	uid := r.URL.Query().Get("uid")
	if uid == "" {
		var body struct {
			Uid string `json:"Uid"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		uid = body.Uid
	}
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_uid"})
		return
	}
	notices := s.store.GetNotices()
	out := make([]NoticeBoardItem, 0, len(notices))
	found := false
	for _, n := range notices {
		if n.Uid == uid {
			found = true
			continue
		}
		out = append(out, n)
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	s.store.SetNotices(out)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": uid})
}

func contextBG() context.Context {
	return context.Background()
}

func newUID() string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 12)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return fmt.Sprintf("%d%s", time.Now().UnixMilli(), string(b))
}

func setCollection[T any](s *Store, table string, items []T, uidFn func(T) string) {
	ctx := context.Background()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "DELETE FROM "+table); err != nil {
		return
	}
	for _, item := range items {
		uid := uidFn(item)
		if uid == "" {
			continue
		}
		raw, err := json.Marshal(item)
		if err != nil {
			continue
		}
		_, _ = tx.Exec(ctx,
			`INSERT INTO `+table+` (uid, data) VALUES ($1, $2::jsonb)
			 ON CONFLICT (uid) DO UPDATE SET data = EXCLUDED.data`,
			uid, string(raw),
		)
	}
	_ = tx.Commit(ctx)
}
