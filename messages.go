package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// ============================================================
// E-ügyintézés üzenetek (KRÉTA mobil API formátum)
//
// GET  /integration-kretamobile-api/v1/kommunikacio/postaladaelemek/sajat
// GET  /integration-kretamobile-api/v1/kommunikacio/postaladaelemek/{id}
// POST /integration-kretamobile-api/v1/kommunikacio/uzenetek/olvasott
// POST /integration-kretamobile-api/v1/kommunikacio/uzenetek  (küldés – mock extra)
//
// main.go-ban: server.registerMessageRoutes(mux)
// ============================================================

type uzenetTipus struct {
	Azonosito int    `json:"azonosito"`
	Kod       string `json:"kod"`
	RovidNev  string `json:"rovidNev"`
	Nev       string `json:"nev"`
	Leiras    string `json:"leiras"`
}

type cimzettTipus struct {
	Azonosito int    `json:"azonosito"`
	Kod       string `json:"kod"`
	RovidNev  string `json:"rovidNev"`
	Nev       string `json:"nev"`
	Leiras    string `json:"leiras"`
}

type cimzett struct {
	Azonosito     int          `json:"azonosito"`
	KretaAzonosito int         `json:"kretaAzonosito"`
	Nev           string       `json:"nev"`
	Tipus         cimzettTipus `json:"tipus"`
}

type csatolmany struct {
	Azonosito int    `json:"azonosito"`
	FajlNev   string `json:"fajlNev"`
}

type uzenetBody struct {
	Azonosito     int          `json:"azonosito"`
	KuldesDatum   string       `json:"kuldesDatum"`
	FeladoNev     string       `json:"feladoNev"`
	FeladoTitulus string       `json:"feladoTitulus"`
	Szoveg        string       `json:"szoveg"`
	Targy         string       `json:"targy"`
	CimzettLista  []cimzett    `json:"cimzettLista"`
	Csatolmanyok  []csatolmany `json:"csatolmanyok"`
}

type postaladaElem struct {
	Azonosito    int         `json:"azonosito"`
	IsElolvasva  bool        `json:"isElolvasva"`
	IsToroltElem bool        `json:"isToroltElem"`
	Tipus        uzenetTipus `json:"tipus"`
	Uzenet       uzenetBody  `json:"uzenet"`
	// belső: kié a postafiók (UserID / student uid)
	OwnerUID string `json:"-"`
}

type messageStore struct {
	mu      sync.Mutex
	nextID  int
	items   []postaladaElem
}

var globalMessages = &messageStore{nextID: 1000, items: nil}

func (ms *messageStore) ensureSeed(s *Store) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	if len(ms.items) > 0 {
		return
	}

	st := s.GetStudent()
	teacher := s.GetTeacher()
	owner := st.Uid
	if owner == "" {
		owner = "100"
	}
	felado := teacher.Nev
	if felado == "" {
		felado = "Kovács Béla"
	}

	longText := "Kedves Szülő / Gondviselő! Tájékoztatjuk, hogy a következő szülői értekezlet időpontja: jövő hét szerda 17:00. Kérjük, pontos megjelenésüket. További részletek a naplóban és az e-ügyintézésben."

	ms.items = []postaladaElem{
		{
			Azonosito:    1001,
			IsElolvasva:  false,
			IsToroltElem: false,
			OwnerUID:     owner,
			Tipus: uzenetTipus{
				Azonosito: 1, Kod: "BEERKEZETT",
				RovidNev: "Beérkezett üzenet", Nev: "Beérkezett üzenet", Leiras: "Beérkezett üzenet",
			},
			Uzenet: uzenetBody{
				Azonosito:     50001,
				KuldesDatum:   time.Now().Add(-48 * time.Hour).Format("2006-01-02T15:04:05"),
				FeladoNev:     felado,
				FeladoTitulus: "tanár",
				Szoveg:        longText,
				Targy:         "Szülői értekezlet",
				CimzettLista: []cimzett{{
					Azonosito: 70001, KretaAzonosito: atoiSafe(owner),
					Nev: st.Nev,
					Tipus: cimzettTipus{
						Azonosito: 4, Kod: "OSZTALY_TANULO",
						RovidNev: "Osztály - Tanuló", Nev: "Osztály - Tanuló", Leiras: "Osztály - Tanuló",
					},
				}},
				Csatolmanyok: []csatolmany{},
			},
		},
		{
			Azonosito:    1002,
			IsElolvasva:  true,
			IsToroltElem: false,
			OwnerUID:     owner,
			Tipus: uzenetTipus{
				Azonosito: 1, Kod: "BEERKEZETT",
				RovidNev: "Beérkezett üzenet", Nev: "Beérkezett üzenet", Leiras: "Beérkezett üzenet",
			},
			Uzenet: uzenetBody{
				Azonosito:     50002,
				KuldesDatum:   time.Now().Add(-120 * time.Hour).Format("2006-01-02T15:04:05"),
				FeladoNev:     felado,
				FeladoTitulus: "tanár",
				Szoveg:        "A holnapi matek dolgozat anyaga: másodfokú egyenletek.",
				Targy:         "Dolgozat emlékeztető",
				CimzettLista: []cimzett{{
					Azonosito: 70002, KretaAzonosito: atoiSafe(owner),
					Nev: st.Nev,
					Tipus: cimzettTipus{
						Azonosito: 4, Kod: "OSZTALY_TANULO",
						RovidNev: "Osztály - Tanuló", Nev: "Osztály - Tanuló", Leiras: "Osztály - Tanuló",
					},
				}},
				Csatolmanyok: []csatolmany{
					{Azonosito: 90001, FajlNev: "tematika.pdf"},
				},
			},
		},
	}
	ms.nextID = 1003
	log.Println("messages: seed üzenetek betöltve")
}

func atoiSafe(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max])
}

func (ms *messageStore) listForOwner(ownerUID string, truncate bool) []postaladaElem {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	out := make([]postaladaElem, 0)
	for _, it := range ms.items {
		if it.IsToroltElem {
			continue
		}
		// Üres OwnerUID = mindenki látja (broadcast seed)
		if it.OwnerUID != "" && ownerUID != "" && it.OwnerUID != ownerUID {
			// tanár is lássa a saját küldötteket / összeset egyszerűsítve: ha nem egyezik, skip
			// Diák session UserID = student uid
			continue
		}
		cp := it
		if truncate {
			cp.Uzenet.Szoveg = truncateRunes(cp.Uzenet.Szoveg, 100)
		}
		out = append(out, cp)
	}
	return out
}

func (ms *messageStore) getByID(id int, ownerUID string) (postaladaElem, bool) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	for _, it := range ms.items {
		if it.Azonosito == id && !it.IsToroltElem {
			if it.OwnerUID != "" && ownerUID != "" && it.OwnerUID != ownerUID {
				return postaladaElem{}, false
			}
			return it, true
		}
	}
	return postaladaElem{}, false
}

func (ms *messageStore) markRead(ids []int, ownerUID string) {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	set := map[int]bool{}
	for _, id := range ids {
		set[id] = true
	}
	for i := range ms.items {
		if !set[ms.items[i].Azonosito] {
			continue
		}
		if ms.items[i].OwnerUID != "" && ownerUID != "" && ms.items[i].OwnerUID != ownerUID {
			continue
		}
		ms.items[i].IsElolvasva = true
	}
}

type sendMessageRequest struct {
	Targy        string `json:"targy"`
	Szoveg       string `json:"szoveg"`
	CimzettUID   string `json:"cimzettUid"`
	CimzettNev   string `json:"cimzettNev"`
	FeladoNev    string `json:"feladoNev"`
	FeladoTitulus string `json:"feladoTitulus"`
}

func (ms *messageStore) send(req sendMessageRequest, ownerUID string) postaladaElem {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	id := ms.nextID
	ms.nextID++
	elem := postaladaElem{
		Azonosito:    id,
		IsElolvasva:  false,
		IsToroltElem: false,
		OwnerUID:     ownerUID,
		Tipus: uzenetTipus{
			Azonosito: 1, Kod: "BEERKEZETT",
			RovidNev: "Beérkezett üzenet", Nev: "Beérkezett üzenet", Leiras: "Beérkezett üzenet",
		},
		Uzenet: uzenetBody{
			Azonosito:     50000 + id,
			KuldesDatum:   time.Now().Format("2006-01-02T15:04:05"),
			FeladoNev:     req.FeladoNev,
			FeladoTitulus: req.FeladoTitulus,
			Szoveg:        req.Szoveg,
			Targy:         req.Targy,
			CimzettLista: []cimzett{{
				Azonosito: 70000 + id, KretaAzonosito: atoiSafe(req.CimzettUID),
				Nev: req.CimzettNev,
				Tipus: cimzettTipus{
					Azonosito: 4, Kod: "OSZTALY_TANULO",
					RovidNev: "Osztály - Tanuló", Nev: "Osztály - Tanuló", Leiras: "Osztály - Tanuló",
				},
			}},
			Csatolmanyok: []csatolmany{},
		},
	}
	ms.items = append([]postaladaElem{elem}, ms.items...)
	return elem
}

// Persist optional JSON in DB (best-effort)
func (s *Store) ensureMessagesTable() {
	ctx := context.Background()
	_, _ = s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS messages (
			id INT PRIMARY KEY,
			owner_uid TEXT NOT NULL DEFAULT '',
			data JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
}

func (s *Server) registerMessageRoutes(mux *http.ServeMux) {
	s.store.ensureMessagesTable()
	globalMessages.ensureSeed(s.store)

	const base = "/integration-kretamobile-api/v1/kommunikacio"
	mux.HandleFunc(base+"/postaladaelemek/sajat", s.requireAuthSession(s.handlePostaladaSajat))
	mux.HandleFunc(base+"/postaladaelemek/", s.requireAuthSession(s.handlePostaladaByID))
	mux.HandleFunc(base+"/uzenetek/olvasott", s.requireAuthSession(s.handleUzenetOlvasott))
	mux.HandleFunc(base+"/uzenetek", s.requireAuthSession(s.handleUzenetKuldes))
	mux.HandleFunc(base+"/postaladaelemek/kuka", s.requireAuthSession(s.handleUzenetKuka))
    mux.HandleFunc(base+"/postaladaelemek/torles", s.requireAuthSession(s.handleUzenetTorles))
    mux.HandleFunc(base+"/cimezhetotipusok", s.requireAuthSession(s.handleCimezhetoTipusok))
    mux.HandleFunc("/integration-kretamobile-api/v1/adatszotarak/cimzetttipusok", s.requireAuthSession(s.handleCimzettTipusok))
}

func (s *Server) handlePostaladaSajat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	list := globalMessages.listForOwner(sess.UserID, true)
	// Hivatalos app: üresnél néha 500 – nálunk tiszta üres tömb
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handlePostaladaByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// path: .../postaladaelemek/1001
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	idStr := parts[len(parts)-1]
	if idStr == "sajat" {
		s.handlePostaladaSajat(w, r)
		return
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	elem, found := globalMessages.getByID(id, sess.UserID)
	if !found {
		// kompatibilitás: 500 + szöveg, mint a valós üres / hiány
		http.Error(w, "An error has occured!", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, elem)
}

func (s *Server) handleUzenetOlvasott(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var body struct {
		IsOlvasott           bool  `json:"isOlvasott"`
		UzenetAzonositoLista []int `json:"uzenetAzonositoLista"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.IsOlvasott {
		globalMessages.markRead(body.UzenetAzonositoLista, sess.UserID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (s *Server) handleUzenetKuldes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if strings.TrimSpace(req.Szoveg) == "" || strings.TrimSpace(req.Targy) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "targy_and_szoveg_required"})
		return
	}
	if req.FeladoNev == "" {
		req.FeladoNev = sess.Username
	}
	if req.FeladoTitulus == "" {
		if sess.Role == "Tanar" || sess.Role == "Osztalyfonok" {
			req.FeladoTitulus = "tanár"
		} else {
			req.FeladoTitulus = "tanuló"
		}
	}
	// Címzett postafiókja = cimzettUid (diák kapja)
	owner := req.CimzettUID
	if owner == "" {
		owner = sess.UserID
	}
	elem := globalMessages.send(req, owner)
	writeJSON(w, http.StatusCreated, elem)
}
// ---------- store ----------

func (ms *messageStore) trash(ids []int, ownerUID string) int {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	n := 0
	for i := range ms.items {
		if ms.items[i].OwnerUID != ownerUID {
			continue
		}
		for _, id := range ids {
			if ms.items[i].Azonosito == id {
				ms.items[i].IsToroltElem = true
				n++
				break
			}
		}
	}
	return n
}

func (ms *messageStore) deletePermanent(ids []int, ownerUID string) int {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	out := make([]postaladaElem, 0, len(ms.items))
	n := 0
	for _, it := range ms.items {
		drop := false
		if it.OwnerUID == ownerUID {
			for _, id := range ids {
				if it.Azonosito == id {
					drop = true
					n++
					break
				}
			}
		}
		if !drop {
			out = append(out, it)
		}
	}
	ms.items = out
	return n
}

// ---------- handlerek ----------

// POST /integration-kretamobile-api/v1/kommunikacio/postaladaelemek/kuka
// body: { "uzenetAzonositoLista": [1001] }
func (s *Server) handleUzenetKuka(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		methodNotAllowed(w, "POST, PUT")
		return
	}
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var body struct {
		UzenetAzonositoLista []int `json:"uzenetAzonositoLista"`
		AzonositoLista       []int `json:"azonositoLista"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	ids := body.UzenetAzonositoLista
	if len(ids) == 0 {
		ids = body.AzonositoLista
	}
	n := globalMessages.trash(ids, sess.UserID)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "count": n})
}

// POST /integration-kretamobile-api/v1/kommunikacio/postaladaelemek/torles
// body: { "uzenetAzonositoLista": [1001] }
func (s *Server) handleUzenetTorles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w, "POST, DELETE")
		return
	}
	sess, ok := sessionFromRequest(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var body struct {
		UzenetAzonositoLista []int `json:"uzenetAzonositoLista"`
		AzonositoLista       []int `json:"azonositoLista"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	ids := body.UzenetAzonositoLista
	if len(ids) == 0 {
		ids = body.AzonositoLista
	}
	n := globalMessages.deletePermanent(ids, sess.UserID)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "count": n})
}

// GET /integration-kretamobile-api/v1/adatszotarak/cimzetttipusok
func (s *Server) handleCimzettTipusok(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, []cimzettTipus{
		{Azonosito: 1, Kod: "TANULO", RovidNev: "Tanuló", Nev: "Tanuló", Leiras: "Egy diák"},
		{Azonosito: 2, Kod: "OSZTALY", RovidNev: "Osztály", Nev: "Osztály", Leiras: "Osztálycsoport"},
		{Azonosito: 3, Kod: "TANAR", RovidNev: "Tanár", Nev: "Tanár", Leiras: "Pedagógus"},
		{Azonosito: 4, Kod: "SZULO", RovidNev: "Szülő", Nev: "Gondviselő", Leiras: "Szülő / gondviselő"},
		{Azonosito: 5, Kod: "IGAZGATOSAG", RovidNev: "Igazgatóság", Nev: "Igazgatóság", Leiras: "Igazgatóság"},
		{Azonosito: 6, Kod: "ADMIN", RovidNev: "Admin", Nev: "Adminisztrátor", Leiras: "Intézményi adminisztrátor"},
	})
}

// GET /integration-kretamobile-api/v1/kommunikacio/cimezhetotipusok
func (s *Server) handleCimezhetoTipusok(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, []map[string]any{
		{"azonosito": 1, "kod": "TANULO", "nev": "Tanuló", "cimezheto": true},
		{"azonosito": 2, "kod": "OSZTALY", "nev": "Osztály", "cimezheto": true},
		{"azonosito": 3, "kod": "TANAR", "nev": "Tanár", "cimezheto": true},
		{"azonosito": 4, "kod": "SZULO", "nev": "Gondviselő", "cimezheto": true},
		{"azonosito": 5, "kod": "IGAZGATOSAG", "nev": "Igazgatóság", "cimezheto": true},
	})
}

// silence unused if fmt needed later
var _ = fmt.Sprintf
