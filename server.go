package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// ============================================================
// JSON HELPERS
// ============================================================

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(value)
}

func methodNotAllowed(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
		"error": "method_not_allowed",
	})
}

// ============================================================
// STUDENT API
// ============================================================

func (s *Server) handleGetStudent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetStudent())
}

// ============================================================
// CLASS GROUPS
// ============================================================

func (s *Server) handleGetClassGroups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetClassGroups())
}

// ============================================================
// NOTICE BOARD
// ============================================================

func (s *Server) handleGetNoticeBoard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetNotices())
}

// ============================================================
// INFO BOARD
// ============================================================

func (s *Server) handleGetInfoBoard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetInfoBoard())
}

// ============================================================
// GRADES
// ============================================================

func (s *Server) handleGetGrades(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetGrades())
}

// ============================================================
// CLASS GROUP AVERAGES
// ============================================================

func (s *Server) handleGetClassGroupAverages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetAverages())
}

// ============================================================
// TIMETABLE
// ============================================================

func (s *Server) handleGetTimeTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetLessons())
}

// ============================================================
// OMISSIONS
// ============================================================

func (s *Server) handleGetOmissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetOmissions())
}

// ============================================================
// HOMEWORK
// ============================================================

func (s *Server) handleGetHomework(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetHomework())
}

// ============================================================
// TESTS
// ============================================================

func (s *Server) handleGetTests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetTests())
}

// ============================================================
// DKT
// ============================================================

func (s *Server) handleGetDktSubjects(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, s.store.GetDktSubjects())
}

// ============================================================
// ADMIN AUTH MIDDLEWARE
// ============================================================

func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		adminUsername := strings.TrimSpace(
			os.Getenv("ADMIN_USERNAME"),
		)

		adminPassword := os.Getenv("ADMIN_PASSWORD")

		if adminUsername == "" || adminPassword == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{
				"error": "admin_disabled",
			})

			return
		}

		username, password, ok := r.BasicAuth()

		if !ok {
			w.Header().Set(
				"WWW-Authenticate",
				`Basic realm="admin"`,
			)

			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "admin_auth_required",
			})

			return
		}

		if username != adminUsername || password != adminPassword {
			w.Header().Set(
				"WWW-Authenticate",
				`Basic realm="admin"`,
			)

			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid_admin_credentials",
			})

			return
		}

		next(w, r)
	}
}

// ============================================================
// ADMIN ROUTES
// ============================================================

func (s *Server) registerAdminRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/admin", s.requireAdmin(s.handleAdminIndex))
	mux.HandleFunc("/admin/health", s.requireAdmin(s.handleAdminHealth))
	mux.HandleFunc("/admin/config", s.requireAdmin(s.handleAdminConfig))
	mux.HandleFunc("/admin/student", s.requireAdmin(s.handleAdminStudent))
	mux.HandleFunc("/admin/reset", s.requireAdmin(s.handleAdminReset))
	mux.HandleFunc("/admin/users", s.requireAdmin(s.handleAdminUsers))
	mux.HandleFunc("/admin/teacher", s.requireAdmin(s.handleAdminTeacher))
	mux.HandleFunc("/admin/students", s.requireAdmin(s.handleAdminStudents))
	mux.HandleFunc("/admin/classgroups", s.requireAdmin(s.handleAdminClassGroups))
	mux.HandleFunc("/admin/timetable-templates", s.requireAdmin(s.handleAdminTimetableTemplates))
}

// ============================================================
// ADMIN INDEX
// ============================================================

func (s *Server) handleAdminIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"name":    "mock-kreta-server admin API",
		"version": 2,
		"status":  "ok",
		"routes": []string{
			"/admin",
			"/admin/health",
			"/admin/config",
			"/admin/student",
			"/admin/students",
			"/admin/teacher",
			"/admin/reset",
			"/admin/users",
		},
		"methods": map[string]string{
			"/admin/students": "GET, POST, PUT, DELETE",
			"/admin/users":    "GET, POST, DELETE",
			"/admin/teacher":  "GET, PUT, POST, DELETE",
			"/admin/student":  "GET, PUT, POST",
			"/admin/config":   "GET, PUT, POST",
			"/admin/reset":    "POST",
		},
	})
}

// Osztályfix
func (s *Server) handleAdminClassGroups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetClassGroups())

	case http.MethodPut, http.MethodPost:
		var groups []ClassGroup
		if err := json.NewDecoder(r.Body).Decode(&groups); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
			return
		}
		s.store.SetClassGroups(groups)
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"count":   len(groups),
			"groups":  s.store.GetClassGroups(),
		})

	default:
		methodNotAllowed(w, "GET, PUT, POST")
	}
}

// Órarend sablon
func (s *Server) handleAdminTimetableTemplates(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.GetTimetableTemplates())

	case http.MethodPut, http.MethodPost:
		var list []TimetableTemplate
		if err := json.NewDecoder(r.Body).Decode(&list); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
			return
		}
		s.store.SetTimetableTemplates(list)
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"count":   len(list),
			"items":   s.store.GetTimetableTemplates(),
		})

	default:
		methodNotAllowed(w, "GET, PUT, POST")
	}
}

// ============================================================
// ADMIN HEALTH
// ============================================================

func (s *Server) handleAdminHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
	})
}

// ============================================================
// ADMIN CONFIG
// ============================================================

func (s *Server) handleAdminConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(
			w,
			http.StatusOK,
			s.store.GetConfig(),
		)

	case http.MethodPut, http.MethodPost:
		var config ServerConfig

		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})

			return
		}

		s.store.SetConfig(config)

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"config":  s.store.GetConfig(),
		})

	default:
		methodNotAllowed(w, "GET, PUT, POST")
	}
}

// ============================================================
// ADMIN STUDENT (singleton – backward compat)
// ============================================================

func (s *Server) handleAdminStudent(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(
			w,
			http.StatusOK,
			s.store.GetStudent(),
		)

	case http.MethodPut, http.MethodPost:
		var student Student

		if err := json.NewDecoder(r.Body).Decode(&student); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})

			return
		}

		s.store.SetStudent(student)

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"student": s.store.GetStudent(),
		})

	default:
		methodNotAllowed(w, "GET, PUT, POST")
	}
}

// ============================================================
// ADMIN STUDENTS (multi) – GET / POST / PUT / DELETE
// ============================================================

func (s *Server) handleAdminStudents(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.ListStudents())

	case http.MethodPost, http.MethodPut:
		var body struct {
			Student       Student `json:"student"`
			ClassGroupUID string  `json:"classGroupUid"`
			Username      string  `json:"username"`
			Password      string  `json:"password"`
		}

		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		if body.Student.Uid == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "student.uid_required",
			})
			return
		}

		if err := s.store.UpsertStudent(body.Student, body.ClassGroupUID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": err.Error(),
			})
			return
		}

		if body.Username != "" && body.Password != "" {
			if _, err := s.store.UpsertUserWithRole(
				body.Username,
				body.Password,
				body.Student.Uid,
				"Tanulo",
			); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"error": "user_create: " + err.Error(),
				})
				return
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"student": body.Student,
		})

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
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "uid_required",
			})
			return
		}

		// Végleges törlés – soft után hard, hogy újra létrehozható legyen
		_ = s.store.SoftDeleteStudent(uid)
		if err := s.store.HardDeleteStudent(uid); err != nil {
			// ha HardDeleteStudent még nincs a store-ban, soft elég
			_ = err
		}
		_ = s.store.SoftDeleteUsersByLinkedUID(uid)
		_ = s.store.HardDeleteUserByLinkedUID(uid)

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"deleted": uid,
		})

	default:
		methodNotAllowed(w, "GET, POST, PUT, DELETE")
	}
}

// ============================================================
// ADMIN RESET
// ============================================================

func (s *Server) handleAdminReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}

	s.store.Reset()

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "A mock adatok vissza lettek állítva.",
	})
}

// ============================================================
// ADMIN USERS – GET lista / POST létrehozás / DELETE
// ============================================================

type createUserRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	StudentUID string `json:"studentUid"`
	Role       string `json:"role"`
}

type adminUserView struct {
	ID         string `json:"id"`
	Username   string `json:"username"`
	StudentUID string `json:"studentUid"`
	Role       string `json:"role"`
	Active     bool   `json:"active"`
	CreatedAt  string `json:"createdAt,omitempty"`
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.ListUsersAdmin())

	case http.MethodPost:
		var req createUserRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid_json",
			})
			return
		}

		studentUID := strings.TrimSpace(req.StudentUID)
		if studentUID == "" {
			studentUID = s.store.GetStudent().Uid
		}

		role := req.Role
		if role == "" {
			role = "Tanulo"
		}

		user, err := s.store.UpsertUserWithRole(
			req.Username,
			req.Password,
			studentUID,
			role,
		)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "user_creation_failed",
				"message": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusCreated, user)

	case http.MethodDelete:
		username := strings.TrimSpace(r.URL.Query().Get("username"))
		if username == "" {
			var body struct {
				Username string `json:"username"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			username = strings.TrimSpace(body.Username)
		}
		if username == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "username_required",
			})
			return
		}

		_ = s.store.SoftDeleteUserByUsername(username)
		if err := s.store.HardDeleteUserByUsername(username); err != nil {
			// SoftDeleteUserByUsername már DELETE-re eshet vissza
			if err2 := s.store.SoftDeleteUserByUsername(username); err2 != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"deleted": username,
		})

	default:
		methodNotAllowed(w, "GET, POST, DELETE")
	}
}


// ============================================================
// STORE HELPERS – soft delete + user lista
// (ha ezek máshol is definiálva vannak, töröld a másik példányt)
// ============================================================


// UpsertUserWithRole – ha a username már létezik: jelszó/role/uid frissítés + active=true.
// Új user esetén CreateUserWithRole.
func (s *Store) UpsertUserWithRole(username, password, linkedUID, role string) (User, error) {
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)
	linkedUID = strings.TrimSpace(linkedUID)
	if username == "" {
		return User{}, fmt.Errorf("username nem lehet üres")
	}
	if password == "" {
		return User{}, fmt.Errorf("password nem lehet üres")
	}
	if role == "" {
		role = RoleStudent
	}
	if role != RoleStudent && role != RoleTeacher && role != "Osztalyfonok" {
		return User{}, fmt.Errorf("role csak Tanulo, Tanar vagy Osztalyfonok lehet")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	ctx := context.Background()

	// 1) próbáljuk frissíteni (ha létezik)
	var user User
	var roleOut string
	err = s.db.QueryRow(
		ctx,
		`
		UPDATE users
		SET password_hash = $2,
		    student_uid = COALESCE(NULLIF($3, ''), student_uid),
		    role = $4,
		    active = TRUE
		WHERE username = $1
		RETURNING id::text, username, password_hash, student_uid, role, active, created_at
		`,
		username,
		string(hash),
		linkedUID,
		role,
	).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.StudentUID,
		&roleOut,
		&user.Active,
		&user.CreatedAt,
	)
	if err == nil {
		user.Role = roleOut
		return user, nil
	}

	// 2) nincs ilyen sor → insert
	user, err = s.CreateUserWithRole(username, password, linkedUID, role)
	if err != nil {
		// 3) race / unique: még egyszer update
		err2 := s.db.QueryRow(
			ctx,
			`
			UPDATE users
			SET password_hash = $2,
			    student_uid = COALESCE(NULLIF($3, ''), student_uid),
			    role = $4,
			    active = TRUE
			WHERE username = $1
			RETURNING id::text, username, password_hash, student_uid, role, active, created_at
			`,
			username,
			string(hash),
			linkedUID,
			role,
		).Scan(
			&user.ID,
			&user.Username,
			&user.PasswordHash,
			&user.StudentUID,
			&roleOut,
			&user.Active,
			&user.CreatedAt,
		)
		if err2 != nil {
			return User{}, fmt.Errorf("user mentés sikertelen: %v", err)
		}
		user.Role = roleOut
		return user, nil
	}
	return user, nil
}


func (s *Store) SoftDeleteStudent(uid string) error {
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return fmt.Errorf("uid_required")
	}

	ctx := context.Background()
	_, err := s.db.Exec(
		ctx,
		`UPDATE students SET active = FALSE, updated_at = NOW() WHERE uid = $1`,
		uid,
	)
	return err
}

func (s *Store) SoftDeleteUserByUsername(username string) error {
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("username_required")
	}
	// Végleges törlés – így újra létrehozható ugyanaz a username
	ctx := context.Background()
	_, err := s.db.Exec(ctx, `DELETE FROM users WHERE username = $1`, username)
	return err
}

func (s *Store) HardDeleteUserByUsername(username string) error {
	return s.SoftDeleteUserByUsername(username)
}

func (s *Store) HardDeleteStudent(uid string) error {
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return fmt.Errorf("uid_required")
	}
	ctx := context.Background()
	_, err := s.db.Exec(ctx, `DELETE FROM students WHERE uid = $1`, uid)
	if err != nil {
		return err
	}
	_, _ = s.db.Exec(ctx, `DELETE FROM users WHERE student_uid = $1`, uid)
	return nil
}

func (s *Store) HardDeleteUserByLinkedUID(uid string) error {
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return nil
	}
	ctx := context.Background()
	_, err := s.db.Exec(ctx, `DELETE FROM users WHERE student_uid = $1`, uid)
	return err
}

func (s *Store) SoftDeleteUsersByLinkedUID(uid string) error {
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return nil
	}

	ctx := context.Background()
	_, err := s.db.Exec(
		ctx,
		`UPDATE users SET active = FALSE WHERE student_uid = $1`,
		uid,
	)
	return err
}

func (s *Store) ListUsersAdmin() []adminUserView {
	ctx := context.Background()

	rows, err := s.db.Query(
		ctx,
		`
		SELECT
			id::text,
			username,
			COALESCE(student_uid, ''),
			COALESCE(role, 'Tanulo'),
			active,
			COALESCE(to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')
		FROM users
		ORDER BY username
		`,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	out := make([]adminUserView, 0)

	for rows.Next() {
		var u adminUserView
		if err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.StudentUID,
			&u.Role,
			&u.Active,
			&u.CreatedAt,
		); err != nil {
			continue
		}
		out = append(out, u)
	}

	return out
}
