package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ============================================================
// KGR + LEP2 mock API (KGR.zip / hivatalos kliens útvonalai)
//
// KGR:
//   POST /edukaciozrt/oktatas/eszkozok/intezmenyi
//   GET  /edukaciozrt/oktatas/projektek/felhasznalo/{id}/osszes
//   PUT  /edukaciozrt/oktatas/projektek/felhasznalo/jelentkezes
//   POST /edukaciozrt/oktatas/apaczai/felvetel
//   POST /edukaciozrt/oktatas/apaczai/adategyeztetes
//   GET  /edukaciozrt/oktatas/apaczai
//   GET  /edukaciozrt/oktatas/apaczai/intezmeny/osszes
//   GET  /edukaciozrt/oktatas/apaczai/{tanev}
//   GET  /edukaciozrt/oktatas/apaczai/fajl/felhasznalo/osszes
//   POST /edukaciozrt/oktatas/apaczai/fajl/stream/feltoltes
//   GET  /edukaciozrt/oktatas/apaczai/fajl/letoltes
//   DELETE /edukaciozrt/oktatas/apaczai/fajl/torles
//   POST /edukaciozrt/oktatas/apaczai/visszavonas
//   POST /edukaciozrt/oktatas/apaczai/fellebbez
//   GET  /edukaciozrt/oktatas/apaczai/palyazattortenet
//   GET  /edukaciozrt/oktatas/apaczai/palyazhat
//   GET  /edukaciozrt/oktatas/beszerzes/tanev/osszes
//   GET  /edukaciozrt/oktatas/beszerzes/tanev/osszes/export
//   GET|POST /edukaciozrt/oktatas/beszerzes
//   GET  /edukaciozrt/oktatas/beszerzes/adatszotar/allapot
//   GET  /edukaciozrt/oktatas/beszerzes/adatszotar/targy
//   POST /edukaciozrt/oktatas/beszerzes/visszavonas
//
// LEP2:
//   POST /edukaciozrt/LERVIN/LEP2/eloadasidopontresztvevointezmeny/external/jelentkezes
//   POST /edukaciozrt/LERVIN/LEP2/eloadasidopontresztvevointezmeny/external/jelenlet
//   POST /edukaciozrt/LERVIN/LEP2/eloadasidopontresztvevointezmeny/external/get
// ============================================================

type kgrStore struct {
	mu        sync.Mutex
	projektek []map[string]any
	palyazatok []map[string]any
	beszerzes []map[string]any
	fajlok    []map[string]any
}

var globalKGR = &kgrStore{
	projektek: []map[string]any{
		{"id": 1, "nev": "Demo projekt", "statusz": "nyitott"},
	},
	palyazatok: []map[string]any{},
	beszerzes:  []map[string]any{},
	fajlok:     []map[string]any{},
}

func (s *Server) registerKGRRoutes(mux *http.ServeMux) {
	// Eszközök / projektek
	mux.HandleFunc("/edukaciozrt/oktatas/eszkozok/intezmenyi", s.requireAuthSession(s.handleKGRJSONEmptyList))
	mux.HandleFunc("/edukaciozrt/oktatas/projektek/felhasznalo/jelentkezes", s.requireAuthSession(s.handleKGRProjektJelentkezes))
	mux.HandleFunc("/edukaciozrt/oktatas/projektek/felhasznalo/", s.requireAuthSession(s.handleKGRProjektPrefix))

	// Apáczai
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/felvetel", s.requireAuthSession(s.handleKGRApaczaiFelvetel))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/adategyeztetes", s.requireAuthSession(s.handleKGRApaczaiEcho))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/fajl/felhasznalo/osszes", s.requireAuthSession(s.handleKGRFajlLista))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/fajl/letoltes", s.requireAuthSession(s.handleKGROK))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/fajl/stream/feltoltes", s.requireAuthSession(s.handleKGRFajlFeltoltes))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/fajl/torles", s.requireAuthSession(s.handleKGROK))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/visszavonas", s.requireAuthSession(s.handleKGROK))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/fellebbez", s.requireAuthSession(s.handleKGROK))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/palyazattortenet", s.requireAuthSession(s.handleKGRPalyazatTortenet))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/palyazhat", s.requireAuthSession(s.handleKGRPalyazhat))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/intezmeny/osszes", s.requireAuthSession(s.handleKGRApaczaiIntezmeny))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai/", s.requireAuthSession(s.handleKGRApaczaiPrefix))
	mux.HandleFunc("/edukaciozrt/oktatas/apaczai", s.requireAuthSession(s.handleKGRApaczaiLista))

	// Beszerzés
	mux.HandleFunc("/edukaciozrt/oktatas/beszerzes/tanev/osszes/export", s.requireAuthSession(s.handleKGRBeszerzesLista))
	mux.HandleFunc("/edukaciozrt/oktatas/beszerzes/tanev/osszes", s.requireAuthSession(s.handleKGRBeszerzesLista))
	mux.HandleFunc("/edukaciozrt/oktatas/beszerzes/adatszotar/allapot", s.requireAuthSession(s.handleKGRBeszerzesAllapot))
	mux.HandleFunc("/edukaciozrt/oktatas/beszerzes/adatszotar/targy", s.requireAuthSession(s.handleKGRBeszerzesTargy))
	mux.HandleFunc("/edukaciozrt/oktatas/beszerzes/visszavonas", s.requireAuthSession(s.handleKGROK))
	mux.HandleFunc("/edukaciozrt/oktatas/beszerzes", s.requireAuthSession(s.handleKGRBeszerzes))

	// LEP2 external
	mux.HandleFunc("/edukaciozrt/LERVIN/LEP2/eloadasidopontresztvevointezmeny/external/jelentkezes", s.requireAuthSession(s.handleLEP2Jelentkezes))
	mux.HandleFunc("/edukaciozrt/LERVIN/LEP2/eloadasidopontresztvevointezmeny/external/jelenlet", s.requireAuthSession(s.handleLEP2Jelenlet))
	mux.HandleFunc("/edukaciozrt/LERVIN/LEP2/eloadasidopontresztvevointezmeny/external/get", s.requireAuthSession(s.handleLEP2Get))
}

func (s *Server) handleKGRJSONEmptyList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func (s *Server) handleKGROK(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "ok": true})
}

func (s *Server) handleKGRProjektPrefix(w http.ResponseWriter, r *http.Request) {
	// /edukaciozrt/oktatas/projektek/felhasznalo/{id}/osszes
	if strings.HasSuffix(r.URL.Path, "/osszes") || r.Method == http.MethodGet {
		globalKGR.mu.Lock()
		list := append([]map[string]any{}, globalKGR.projektek...)
		globalKGR.mu.Unlock()
		writeJSON(w, http.StatusOK, list)
		return
	}
	http.NotFound(w, r)
}

func (s *Server) handleKGRProjektJelentkezes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		methodNotAllowed(w, "PUT, POST")
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	body["id"] = time.Now().Unix()
	body["statusz"] = "jelentkezett"
	globalKGR.mu.Lock()
	globalKGR.projektek = append(globalKGR.projektek, body)
	globalKGR.mu.Unlock()
	writeJSON(w, http.StatusOK, []map[string]any{body})
}

func (s *Server) handleKGRApaczaiFelvetel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	body["id"] = randomID()
	body["statusz"] = "rogzitve"
	body["rogzitesIdeje"] = time.Now().UTC().Format(time.RFC3339)
	globalKGR.mu.Lock()
	globalKGR.palyazatok = append(globalKGR.palyazatok, body)
	globalKGR.mu.Unlock()
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) handleKGRApaczaiEcho(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body == nil {
		body = map[string]any{}
	}
	body["egyeztetve"] = true
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) handleKGRApaczaiLista(w http.ResponseWriter, r *http.Request) {
	globalKGR.mu.Lock()
	list := append([]map[string]any{}, globalKGR.palyazatok...)
	globalKGR.mu.Unlock()
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleKGRApaczaiIntezmeny(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{})
}

func (s *Server) handleKGRApaczaiPrefix(w http.ResponseWriter, r *http.Request) {
	// /edukaciozrt/oktatas/apaczai/{tanevSorszam} – kifizetések
	path := strings.TrimPrefix(r.URL.Path, "/edukaciozrt/oktatas/apaczai/")
	if path != "" && !strings.Contains(path, "/") {
		writeJSON(w, http.StatusOK, []map[string]any{})
		return
	}
	http.NotFound(w, r)
}

func (s *Server) handleKGRFajlLista(w http.ResponseWriter, r *http.Request) {
	globalKGR.mu.Lock()
	list := append([]map[string]any{}, globalKGR.fajlok...)
	globalKGR.mu.Unlock()
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleKGRFajlFeltoltes(w http.ResponseWriter, r *http.Request) {
	id := randomID()
	item := map[string]any{
		"id":       id,
		"fileId":   id,
		"nev":      "feltoltott.bin",
		"feltoltve": time.Now().UTC().Format(time.RFC3339),
	}
	globalKGR.mu.Lock()
	globalKGR.fajlok = append(globalKGR.fajlok, item)
	globalKGR.mu.Unlock()
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleKGRPalyazatTortenet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{})
}

func (s *Server) handleKGRPalyazhat(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"palyazhat": true})
}

func (s *Server) handleKGRBeszerzesLista(w http.ResponseWriter, r *http.Request) {
	globalKGR.mu.Lock()
	list := append([]map[string]any{}, globalKGR.beszerzes...)
	globalKGR.mu.Unlock()
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleKGRBeszerzesAllapot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{
		{"id": 1, "nev": "Tervezett", "kod": "TERVEZETT"},
		{"id": 2, "nev": "Folyamatban", "kod": "FOLYAMATBAN"},
		{"id": 3, "nev": "Lezárt", "kod": "LEZART"},
	})
}

func (s *Server) handleKGRBeszerzesTargy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{
		{"id": 1, "nev": "Informatika"},
		{"id": 2, "nev": "Bútor"},
		{"id": 3, "nev": "Oktatási eszköz"},
	})
}

func (s *Server) handleKGRBeszerzes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleKGRBeszerzesLista(w, r)
	case http.MethodPost, http.MethodPut:
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body == nil {
			body = map[string]any{}
		}
		body["id"] = randomID()
		globalKGR.mu.Lock()
		globalKGR.beszerzes = append(globalKGR.beszerzes, body)
		globalKGR.mu.Unlock()
		writeJSON(w, http.StatusOK, body)
	default:
		methodNotAllowed(w, "GET, POST, PUT")
	}
}

// ---------- LEP2 ----------

func (s *Server) handleLEP2Jelentkezes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Jelentkezés rögzítve",
		"data":    body,
	})
}

func (s *Server) handleLEP2Jelenlet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Jelenlét rögzítve",
		"data":    body,
	})
}

func (s *Server) handleLEP2Get(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		methodNotAllowed(w, "POST, GET")
		return
	}
	// A meglévő LEP eseményekből adunk listát
	events := s.store.GetLEPEvents()
	out := make([]map[string]any, 0, len(events))
	for i, e := range events {
		out = append(out, map[string]any{
			"EloadasIdopont": i + 1,
			"Uid":            e.Uid,
			"Cim":            e.Cim,
			"Kezdet":         e.Kezdet,
			"Hely":           e.Hely,
			"MaxLetszam":     e.MaxLetszam,
			"Statusz":        e.Statusz,
		})
	}
	writeJSON(w, http.StatusOK, out)
}
