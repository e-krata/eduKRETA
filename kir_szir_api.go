package main

import (
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ============================================================
// KIR (SOAP-szerű mock) + SZIR (REST)
//
// KIR auth (form login, mint a hivatalos kliens):
//   GET|POST /kir/login
//   POST     /kir/token
//
// KIR kérelem (SOAP XML vagy JSON):
//   POST /kir/soap                  – generikus SOAP endpoint
//   POST /kir/kerelem/bekuldes      – KerelemBekuldes
//   POST /kir/kerelem/statusz       – KerelemStatuszLekerdezes
//
// SZIR (KSH 2535):
//   POST /szirstat/external/ksh2535/statusz
//   POST /szirstat/external/ksh2535/adatszolg
// ============================================================

type kirKerelemRec struct {
	ExternalID   string `json:"externalId"`
	KontenerID   string `json:"kontenerId"`
	IARAzonosito string `json:"iarAzonosito"`
	Statusz      string `json:"statusz"`
	Uzenet       string `json:"uzenet"`
	Bekuldve     string `json:"bekuldve"`
	KerelemXML   string `json:"kerelemXml,omitempty"`
}

type kirStore struct {
	mu      sync.Mutex
	kerelem map[string]kirKerelemRec
	tokens  map[string]string // token -> user
}

var globalKIR = &kirStore{
	kerelem: map[string]kirKerelemRec{},
	tokens:  map[string]string{},
}

func (s *Server) registerKIRSZIRRoutes(mux *http.ServeMux) {
	// KIR
	mux.HandleFunc("/kir/login", s.handleKIRLogin)
	mux.HandleFunc("/kir/token", s.handleKIRToken)
	mux.HandleFunc("/kir/soap", s.handleKIRSOAP)
	mux.HandleFunc("/kir/kerelem/bekuldes", s.handleKIRKerelemBekuldes)
	mux.HandleFunc("/kir/kerelem/statusz", s.handleKIRKerelemStatusz)

	// edukaciozrt alias
	mux.HandleFunc("/edukaciozrt/kir/login", s.handleKIRLogin)
	mux.HandleFunc("/edukaciozrt/kir/token", s.handleKIRToken)
	mux.HandleFunc("/edukaciozrt/kir/soap", s.handleKIRSOAP)
	mux.HandleFunc("/edukaciozrt/kir/kerelem/bekuldes", s.handleKIRKerelemBekuldes)
	mux.HandleFunc("/edukaciozrt/kir/kerelem/statusz", s.handleKIRKerelemStatusz)

	// SZIR
	mux.HandleFunc("/szirstat/external/ksh2535/statusz", s.handleSZIRStatusz)
	mux.HandleFunc("/szirstat/external/ksh2535/adatszolg", s.handleSZIRAdatszolg)
	mux.HandleFunc("/edukaciozrt/szirstat/external/ksh2535/statusz", s.handleSZIRStatusz)
	mux.HandleFunc("/edukaciozrt/szirstat/external/ksh2535/adatszolg", s.handleSZIRAdatszolg)
}

// ---------- KIR auth ----------

func (s *Server) handleKIRLogin(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Login page mock – RequestVerificationToken a formban
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!DOCTYPE html><html><body>
<form method="post" action="/kir/login">
<input name="__RequestVerificationToken" value="mock-rvt-token" />
<input name="IntezmenyAzonosito" />
<input name="FelhasznaloNev" />
<input name="Jelszo" type="password" />
<input name="ContinueUrl" />
<button type="submit">Bejelentkezés</button>
</form></body></html>`))
	case http.MethodPost:
		_ = r.ParseForm()
		user := r.FormValue("FelhasznaloNev")
		if user == "" {
			user = "kir-user"
		}
		tok := "kir-" + randomID()
		globalKIR.mu.Lock()
		globalKIR.tokens[tok] = user
		globalKIR.mu.Unlock()
		// A hivatalos kliens HTML-ből vágja ki a tokent – tegyük bele láthatóan
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!DOCTYPE html><html><body>
<div id="token">` + tok + `</div>
<script>window.kirToken="` + tok + `";</script>
<span class="access_token">` + tok + `</span>
</body></html>`))
	default:
		methodNotAllowed(w, "GET, POST")
	}
}

func (s *Server) handleKIRToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		methodNotAllowed(w, "GET, POST")
		return
	}
	tok := "kir-" + randomID()
	globalKIR.mu.Lock()
	globalKIR.tokens[tok] = "kir-user"
	globalKIR.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": tok,
		"token_type":   "Bearer",
		"expires_in":   3600,
	})
}

// ---------- KIR kérelem ----------

func (s *Server) handleKIRKerelemBekuldes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	ct := r.Header.Get("Content-Type")
	body, _ := io.ReadAll(r.Body)

	if strings.Contains(ct, "xml") || strings.Contains(string(body), "Envelope") {
		s.respondKIRSOAPBekuldes(w, body)
		return
	}

	var req struct {
		ExternalID     string `json:"externalId"`
		KontenerID     string `json:"kontenerId"`
		IARAzonosito   string `json:"iarAzonosito"`
		CelSzolgaltatas string `json:"celSzolgaltatas"`
		KerelemXML     string `json:"kerelemXml"`
		Alairva        bool   `json:"alairva"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if req.ExternalID == "" {
		req.ExternalID = randomID()
	}
	if req.KontenerID == "" {
		req.KontenerID = "K-" + randomID()
	}
	rec := kirKerelemRec{
		ExternalID:   req.ExternalID,
		KontenerID:   req.KontenerID,
		IARAzonosito: req.IARAzonosito,
		Statusz:      "BEKULDVE",
		Uzenet:       "A kérelem sikeresen beküldve (mock).",
		Bekuldve:     time.Now().UTC().Format(time.RFC3339),
		KerelemXML:   req.KerelemXML,
	}
	globalKIR.mu.Lock()
	globalKIR.kerelem[req.ExternalID] = rec
	globalKIR.kerelem[req.KontenerID] = rec
	globalKIR.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"externalId":   rec.ExternalID,
		"kontenerId":   rec.KontenerID,
		"statusz":      rec.Statusz,
		"uzenet":       rec.Uzenet,
		"hibakod":      0,
	})
}

func (s *Server) handleKIRKerelemStatusz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		methodNotAllowed(w, "GET, POST")
		return
	}
	ct := r.Header.Get("Content-Type")
	body, _ := io.ReadAll(r.Body)
	if strings.Contains(ct, "xml") || strings.Contains(string(body), "Envelope") {
		s.respondKIRSOAPStatusz(w, body)
		return
	}

	var req struct {
		ExternalID   string `json:"externalId"`
		KontenerID   string `json:"kontenerId"`
		IARAzonosito string `json:"iarAzonosito"`
	}
	if r.Method == http.MethodGet {
		req.ExternalID = r.URL.Query().Get("externalId")
		req.KontenerID = r.URL.Query().Get("kontenerId")
	} else {
		_ = json.Unmarshal(body, &req)
	}

	globalKIR.mu.Lock()
	rec, ok := globalKIR.kerelem[req.ExternalID]
	if !ok {
		rec, ok = globalKIR.kerelem[req.KontenerID]
	}
	globalKIR.mu.Unlock()
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"success":  true,
			"statusz":  "NINCS_TALALAT",
			"uzenet":   "Nincs ilyen kérelem",
			"hibakod":  0,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":    true,
		"externalId": rec.ExternalID,
		"kontenerId": rec.KontenerID,
		"statusz":    rec.Statusz,
		"uzenet":     rec.Uzenet,
		"bekuldve":   rec.Bekuldve,
		"hibakod":    0,
	})
}

func (s *Server) handleKIRSOAP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	body, _ := io.ReadAll(r.Body)
	txt := string(body)
	switch {
	case strings.Contains(txt, "KerelemBekuldes") || strings.Contains(txt, "KerelemBekuldese"):
		s.respondKIRSOAPBekuldes(w, body)
	case strings.Contains(txt, "KerelemStatusz") || strings.Contains(txt, "StatuszLekerdezes"):
		s.respondKIRSOAPStatusz(w, body)
	default:
		// generikus siker
		w.Header().Set("Content-Type", "text/xml; charset=utf-8")
		_, _ = w.Write([]byte(soapEnvelope(`<KirGenericResponse><Success>true</Success><Message>OK</Message></KirGenericResponse>`)))
	}
}

func (s *Server) respondKIRSOAPBekuldes(w http.ResponseWriter, body []byte) {
	ext := extractXMLTag(string(body), "externalId")
	if ext == "" {
		ext = randomID()
	}
	kont := extractXMLTag(string(body), "KontenerID")
	if kont == "" {
		kont = "K-" + randomID()
	}
	rec := kirKerelemRec{
		ExternalID: ext,
		KontenerID: kont,
		Statusz:    "BEKULDVE",
		Uzenet:     "A kérelem sikeresen beküldve (mock SOAP).",
		Bekuldve:   time.Now().UTC().Format(time.RFC3339),
	}
	globalKIR.mu.Lock()
	globalKIR.kerelem[ext] = rec
	globalKIR.kerelem[kont] = rec
	globalKIR.mu.Unlock()

	inner := `<KerelemBekuldesResponse>
  <externalId>` + xmlEscape(ext) + `</externalId>
  <KontenerID>` + xmlEscape(kont) + `</KontenerID>
  <Statusz>BEKULDVE</Statusz>
  <Uzenet>A kérelem sikeresen beküldve (mock SOAP).</Uzenet>
  <Hibakod>0</Hibakod>
</KerelemBekuldesResponse>`
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	_, _ = w.Write([]byte(soapEnvelope(inner)))
}

func (s *Server) respondKIRSOAPStatusz(w http.ResponseWriter, body []byte) {
	ext := extractXMLTag(string(body), "externalId")
	kont := extractXMLTag(string(body), "KontenerID")
	globalKIR.mu.Lock()
	rec, ok := globalKIR.kerelem[ext]
	if !ok {
		rec, ok = globalKIR.kerelem[kont]
	}
	globalKIR.mu.Unlock()
	statusz, uzenet := "NINCS_TALALAT", "Nincs ilyen kérelem"
	if ok {
		statusz, uzenet = rec.Statusz, rec.Uzenet
		if ext == "" {
			ext = rec.ExternalID
		}
		if kont == "" {
			kont = rec.KontenerID
		}
	}
	inner := `<KerelemStatuszLekerdezesResponse>
  <externalId>` + xmlEscape(ext) + `</externalId>
  <KontenerID>` + xmlEscape(kont) + `</KontenerID>
  <Statusz>` + xmlEscape(statusz) + `</Statusz>
  <Uzenet>` + xmlEscape(uzenet) + `</Uzenet>
  <Hibakod>0</Hibakod>
</KerelemStatuszLekerdezesResponse>`
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	_, _ = w.Write([]byte(soapEnvelope(inner)))
}

func soapEnvelope(inner string) string {
	return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
` + inner + `
  </soap:Body>
</soap:Envelope>`
}

func extractXMLTag(s, tag string) string {
	// egyszerű kinyerés: <tag>value</tag> vagy <tag>value</tag> case-insensitive
	low := strings.ToLower(s)
	t := strings.ToLower(tag)
	start := strings.Index(low, "<"+t+">")
	if start < 0 {
		start = strings.Index(low, "<"+t+" ")
		if start < 0 {
			return ""
		}
		// skip to >
		gt := strings.Index(s[start:], ">")
		if gt < 0 {
			return ""
		}
		start = start + gt + 1
	} else {
		start = start + len(tag) + 2
	}
	endRel := strings.Index(low[start:], "</"+t+">")
	if endRel < 0 {
		return ""
	}
	return strings.TrimSpace(s[start : start+endRel])
}

func xmlEscape(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// ---------- SZIR ----------

func (s *Server) handleSZIRStatusz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var req struct {
		IntezmenyAzonosito string `json:"IntezmenyAzonosito"`
		TanevId            int    `json:"TanevId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.IntezmenyAzonosito == "" {
		req.IntezmenyAzonosito = "demo"
	}
	if req.TanevId == 0 {
		req.TanevId = 2025
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"Technikai": map[string]any{
			"Verzio":         "1.0",
			"Forras":         "eduKRÉTA-mock",
			"ForrasUrl":      "",
			"Azonosito":      randomID(),
			"EllenorzoKod":   "OK",
			"Idopont":        time.Now().UTC().Format(time.RFC3339),
			"KeresAzonosito": randomID(),
		},
		"Adat": []map[string]any{
			{
				"IntezmenyAzonosito": req.IntezmenyAzonosito,
				"TanevId":            req.TanevId,
				"Zarolt":             false,
				"StatuszKod":         1,
				"StatuszNev":         "Nyitott",
				"StatuszSzoveg":      "Az adatszolgáltatás nyitott (mock).",
			},
		},
	})
}

func (s *Server) handleSZIRAdatszolg(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var req map[string]any
	_ = json.NewDecoder(r.Body).Decode(&req)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Adatszolgáltatás rögzítve (mock).",
		"technikai": map[string]any{
			"Azonosito":      randomID(),
			"Idopont":        time.Now().UTC().Format(time.RFC3339),
			"KeresAzonosito": randomID(),
			"EllenorzoKod":   "OK",
		},
		"requestEcho": req,
	})
}
