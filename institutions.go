package main

import (
	"encoding/json"
	"net/http"
)

// handleListInstitutions – publikus endpoint a login oldal intézményválasztójához.
// GET /connect/edukreta/publikus/intezmenyek
func (s *Server) handleListInstitutions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	list, err := s.store.ListInstitutions()
	if err != nil {
		// Ha a tábla még nincs migrálva, üres listát adunk vissza
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode([]InstitutionRow{})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_ = json.NewEncoder(w).Encode(list)
}
