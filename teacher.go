package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ============================================================
// TEACHER TYPES
// ============================================================

type Teacher struct {
	Uid                   string    `json:"Uid"`
	Nev                   string    `json:"Nev"`
	EmailCim              string    `json:"EmailCim,omitempty"`
	Telefonszam           string    `json:"Telefonszam,omitempty"`
	IntezmenyAzonosito    string    `json:"IntezmenyAzonosito"`
	IntezmenyNev          string    `json:"IntezmenyNev"`
	OsztalyFonokOsztalyok []NameUid `json:"OsztalyFonokOsztalyok"`
	Tantargyak            []Subject `json:"Tantargyak"`
}

type TeacherStudent struct {
	Uid            string  `json:"Uid"`
	Nev            string  `json:"Nev"`
	EmailCim       string  `json:"EmailCim,omitempty"`
	OsztalyCsoport NameUid `json:"OsztalyCsoport"`
}

// ============================================================
// CREATE REQUESTS
// ============================================================

type createGradeRequest struct {
	TantargyUid        string       `json:"TantargyUid"`
	Tema               string       `json:"Tema"`
	Megjegyzes         string       `json:"Megjegyzes,omitempty"`
	SzamErtek          int          `json:"SzamErtek"`
	SzovegesErtek      string       `json:"SzovegesErtek"`
	SulySzazalekErteke int          `json:"SulySzazalekErteke"`
	Tipus              *NameUidDesc `json:"Tipus"`
	OsztalyCsoportUid  string       `json:"OsztalyCsoportUid"`
	TanuloUid          string       `json:"TanuloUid"`
}

type createHomeworkRequest struct {
	TantargyUid       string `json:"TantargyUid"`
	Szoveg            string `json:"Szoveg"`
	Hatarido          string `json:"Hatarido"`
	OsztalyCsoportUid string `json:"OsztalyCsoportUid"`
}

type createOmissionRequest struct {
	TanuloUid         string       `json:"TanuloUid"`
	Datum             string       `json:"Datum"`
	Tipus             *NameUidDesc `json:"Tipus"`
	KesesPercben      int          `json:"KesesPercben"`
	OsztalyCsoportUid string       `json:"OsztalyCsoportUid"`
}

type createTestRequest struct {
	TantargyUid       string       `json:"TantargyUid"`
	Datum             string       `json:"Datum"`
	Modja             *NameUidDesc `json:"Modja"`
	OsztalyCsoportUid string       `json:"OsztalyCsoportUid"`
}

// ============================================================
// TEACHER ROUTES
// ============================================================

func (s *Server) registerTeacherRoutes(mux *http.ServeMux) {
	mux.HandleFunc(
		"/naplo/v3/sajat/TanarAdatlap",
		s.requireAuth(s.handleGetTeacher),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/OsztalyCsoportok",
		s.requireTeacher(s.handleTeacherClassGroups),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/Tanulok",
		s.requireTeacher(s.handleTeacherStudents),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/OrarendElemek",
		s.requireTeacher(s.handleTeacherTimetable),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/Orarend/OraNaplozas",
		s.requireTeacher(s.handleOraNaplozas),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/Orarend/OraNaplozasTorles",
		s.requireTeacher(s.handleOraNaplozasTorles),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/Ertekelesek",
		s.requireTeacher(s.handleTeacherGrades),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/HaziFeladatok",
		s.requireTeacher(s.handleTeacherHomework),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/Mulasztasok",
		s.requireTeacher(s.handleTeacherOmissions),
	)
	mux.HandleFunc(
		"/naplo/v3/sajat/BejelentettSzamonkeresek",
		s.requireTeacher(s.handleTeacherTests),
	)
}

// ============================================================
// GET HANDLERS
// ============================================================

func (s *Server) handleGetTeacher(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetTeacher())
}

func (s *Server) handleTeacherClassGroups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetClassGroups())
}

func (s *Server) handleTeacherStudents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetTeacherStudents())
}

func (s *Server) handleTeacherTimetable(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		now := time.Now()
		offset := int(now.Weekday())
		if offset == 0 {
			offset = 7
		}
		from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).
			AddDate(0, 0, -(offset-1))
		to := from.AddDate(0, 0, 6)

		if f := r.URL.Query().Get("from"); f != "" {
			if t, err := time.Parse("2006-01-02", f); err == nil {
				from = t
			}
		}
		if tStr := r.URL.Query().Get("to"); tStr != "" {
			if t, err := time.Parse("2006-01-02", tStr); err == nil {
				to = t
			}
		}

		generated := s.store.ExpandTemplates(from, to)
		manual := s.store.GetLessons()

		byKey := map[string]Lesson{}
		for _, l := range generated {
			key := l.Datum + "|" + strconv.Itoa(l.Oraszam) + "|" + l.OsztalyCsoport.Uid
			byKey[key] = l
		}
		for _, l := range manual {
			if l.Datum < from.Format("2006-01-02") || l.Datum > to.Format("2006-01-02") {
				continue
			}
			key := l.Datum + "|" + strconv.Itoa(l.Oraszam) + "|" + l.OsztalyCsoport.Uid
			byKey[key] = l
		}
		out := make([]Lesson, 0, len(byKey))
		for _, l := range byKey {
			out = append(out, l)
		}
		writeJSON(w, http.StatusOK, out)

	case http.MethodPost:
		var req createLessonRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
			return
		}
		lesson, err := s.store.AddLesson(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, lesson)

	case http.MethodPut:
		var req createLessonRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
			return
		}
		lesson, err := s.store.UpdateLesson(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, lesson)

	case http.MethodDelete:
		uid := strings.TrimSpace(r.URL.Query().Get("uid"))
		if uid == "" {
			var body struct {
				Uid string `json:"uid"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			uid = strings.TrimSpace(body.Uid)
		}
		if uid == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "uid_required"})
			return
		}
		if err := s.store.DeleteLesson(uid); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": uid})

	default:
		methodNotAllowed(w, "GET, POST, PUT, DELETE")
	}
}
type createLessonRequest struct {
	Uid               string `json:"Uid"`
	Datum             string `json:"Datum"`
	Oraszam           int    `json:"Oraszam"`
	KezdetIdopont     string `json:"KezdetIdopont"`
	VegIdopont        string `json:"VegIdopont"`
	TantargyUid       string `json:"TantargyUid"`
	TantargyNev       string `json:"TantargyNev"`
	OsztalyCsoportUid string `json:"OsztalyCsoportUid"`
	OsztalyCsoportNev string `json:"OsztalyCsoportNev"`
	TeremNeve         string `json:"TeremNeve"`
	Tema              string `json:"Tema"`
	Nev               string `json:"Nev"`
}

// ============================================================
// GRADES (GET + POST)
// ============================================================

func (s *Server) handleTeacherGrades(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetGrades())

	case http.MethodPost:
		var req createGradeRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		grade, err := s.store.AddGrade(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "grade_create_failed",
				"message": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusCreated, grade)

	case http.MethodDelete:
		uid := strings.TrimSpace(r.URL.Query().Get("uid"))
		if uid == "" {
			var body struct {
				Uid string `json:"uid"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			uid = strings.TrimSpace(body.Uid)
		}
		if uid == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "uid_required"})
			return
		}
		if err := s.store.DeleteGrade(uid); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": uid})

	default:
		methodNotAllowed(w, "GET, POST, DELETE")
	}
}

// ============================================================
// HOMEWORK (GET + POST)
// ============================================================

func (s *Server) handleTeacherHomework(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetHomework())

	case http.MethodPost:
		var req createHomeworkRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		hw, err := s.store.AddHomework(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "homework_create_failed",
				"message": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusCreated, hw)

	default:
		methodNotAllowed(w, "GET, POST")
	}
}

// ============================================================
// OMISSIONS (GET + POST)
// ============================================================

func (s *Server) handleTeacherOmissions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetOmissions())

	case http.MethodPost:
		var req createOmissionRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		om, err := s.store.AddOmission(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "omission_create_failed",
				"message": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusCreated, om)

	case http.MethodDelete:
		uid := strings.TrimSpace(r.URL.Query().Get("uid"))
		if uid == "" {
			var body struct {
				Uid string `json:"uid"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			uid = strings.TrimSpace(body.Uid)
		}
		if uid == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "uid_required"})
			return
		}
		if err := s.store.DeleteOmission(uid); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": uid})

	default:
		methodNotAllowed(w, "GET, POST, DELETE")
	}
}


// ============================================================
// ÓRA NAPLÓZÁS – /naplo/v3/sajat/Orarend/OraNaplozas
// ============================================================

type oraNaploJelenlet struct {
	TanuloUid    string `json:"TanuloUid"`
	Tipus        string `json:"Tipus"` // jelen | hianyzas | keses
	KesesPercben int    `json:"KesesPercben"`
}

type oraNaplozasRequest struct {
	OrarendElemUid    string             `json:"OrarendElemUid"`
	Datum             string             `json:"Datum"`
	Tema              string             `json:"Tema"`
	OsztalyCsoportUid string             `json:"OsztalyCsoportUid"`
	Jelenletek        []oraNaploJelenlet `json:"Jelenletek"`
}

func (s *Server) handleOraNaplozas(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	var req oraNaplozasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	// 1) óra téma frissítése az órarendi elemen
	if req.OrarendElemUid != "" && req.Tema != "" {
		_, _ = s.store.UpdateLesson(createLessonRequest{
			Uid:  req.OrarendElemUid,
			Tema: req.Tema,
		})
	}

	// 2) hiányzások / késések rögzítése
	created := make([]Omission, 0)
	for _, j := range req.Jelenletek {
		tipus := strings.ToLower(strings.TrimSpace(j.Tipus))
		if tipus == "" || tipus == "jelen" {
			continue
		}
		omReq := createOmissionRequest{
			TanuloUid:         j.TanuloUid,
			Datum:             req.Datum,
			KesesPercben:      j.KesesPercben,
			OsztalyCsoportUid: req.OsztalyCsoportUid,
		}
		if tipus == "keses" {
			omReq.Tipus = &NameUidDesc{Uid: "2", Nev: "Késés", Leiras: "Késés"}
			if omReq.KesesPercben == 0 {
				omReq.KesesPercben = 5
			}
		} else {
			omReq.Tipus = &NameUidDesc{Uid: "1", Nev: "Hiányzás", Leiras: "Hiányzás"}
		}
		om, err := s.store.AddOmission(omReq)
		if err != nil {
			continue
		}
		created = append(created, om)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"orarendElemUid":  req.OrarendElemUid,
		"tema":            req.Tema,
		"mulasztasok":     created,
		"mulasztasDb":     len(created),
	})
}

func (s *Server) handleOraNaplozasTorles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w, "POST, DELETE")
		return
	}
	uid := strings.TrimSpace(r.URL.Query().Get("uid"))
	if uid == "" {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body != nil {
			if v, ok := body["Uid"].(string); ok && v != "" {
				uid = v
			} else if v, ok := body["uid"].(string); ok && v != "" {
				uid = v
			}
		}
	}
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "uid_required"})
		return
	}
	// Mulasztás törlése (napló bejegyzés = mulasztás rekord)
	if err := s.store.DeleteOmission(uid); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": uid})
}


// ============================================================
// TESTS (GET + POST)
// ============================================================

func (s *Server) handleTeacherTests(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetTests())

	case http.MethodPost:
		var req createTestRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		test, err := s.store.AddTest(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "test_create_failed",
				"message": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusCreated, test)

	default:
		methodNotAllowed(w, "GET, POST")
	}
}

// ============================================================
// ADMIN TEACHER
// ============================================================

func (s *Server) handleAdminTeacher(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetTeacher())

	case http.MethodPut, http.MethodPost:
		var teacher Teacher

		if err := json.NewDecoder(r.Body).Decode(&teacher); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		s.store.SetTeacher(teacher)

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"teacher": s.store.GetTeacher(),
		})

	case http.MethodDelete:
		uid := strings.TrimSpace(r.URL.Query().Get("uid"))
		t := s.store.GetTeacher()

		if uid != "" && t.Uid != "" && t.Uid != uid {
			_ = s.store.SoftDeleteUsersByLinkedUID(uid)
			writeJSON(w, http.StatusOK, map[string]any{
				"success": true,
				"message": "linked users deactivated; server teacher profile is singleton",
				"uid":     uid,
			})
			return
		}

		s.store.SetTeacher(Teacher{})
		if uid != "" {
			_ = s.store.SoftDeleteUsersByLinkedUID(uid)
		} else if t.Uid != "" {
			_ = s.store.SoftDeleteUsersByLinkedUID(t.Uid)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"deleted": uid,
		})

	default:
		methodNotAllowed(w, "GET, PUT, POST, DELETE")
	}
}


// ============================================================
// HELPERS
// ============================================================

func nextUID(prefix string, existing int) string {
	return prefix + strconv.FormatInt(time.Now().UnixNano()%1_000_000_000, 10) + strconv.Itoa(existing)
}
