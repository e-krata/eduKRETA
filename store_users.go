package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// Role konstansok
const (
	RoleStudent = "Tanulo"
	RoleTeacher = "Tanar"
)

// GetUserByUsername – role oszloppal (a régi store.go változatot TÖRÖLD).
func (s *Store) GetUserByUsername(username string) (User, error) {
	ctx := context.Background()

	var user User
	var role *string

	err := s.db.QueryRow(
		ctx,
		`
		SELECT
			id::text,
			username,
			password_hash,
			student_uid,
			role,
			active,
			created_at
		FROM users
		WHERE username = $1
		LIMIT 1
		`,
		username,
	).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.StudentUID,
		&role,
		&user.Active,
		&user.CreatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return User{}, pgx.ErrNoRows
		}
		return User{}, err
	}

	if role != nil && *role != "" {
		user.Role = *role
	} else {
		user.Role = RoleStudent
	}

	return user, nil
}

// CreateUser – alapból Tanulo role (kompatibilis a régi hívásokkal).
func (s *Store) CreateUser(username, password, studentUID string) (User, error) {
	return s.CreateUserWithRole(username, password, studentUID, RoleStudent)
}

// CreateUserWithRole új user role-lal.
func (s *Store) CreateUserWithRole(
	username, password, linkedUID, role string,
) (User, error) {
	if username == "" {
		return User{}, fmt.Errorf("username nem lehet üres")
	}
	if password == "" {
		return User{}, fmt.Errorf("password nem lehet üres")
	}
	if role == "" {
		role = RoleStudent
	}
	// Tanulo | Tanar | Osztalyfonok
	if role != RoleStudent && role != RoleTeacher && role != "Osztalyfonok" {
		return User{}, fmt.Errorf("role csak Tanulo, Tanar vagy Osztalyfonok lehet")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}

	ctx := context.Background()

	var user User
	var roleOut string

	err = s.db.QueryRow(
		ctx,
		`
		INSERT INTO users (username, password_hash, student_uid, role, active)
		VALUES ($1, $2, $3, $4, TRUE)
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
	if err != nil {
		return User{}, err
	}

	user.Role = roleOut
	return user, nil
}

// ============================================================
// Intézmények
// ============================================================

type InstitutionRow struct {
	Code      string         `json:"code"`
	Name      string         `json:"name"`
	ShortName string         `json:"shortName,omitempty"`
	Active    bool           `json:"active"`
	Data      map[string]any `json:"data,omitempty"`
}

// IntezmenyLetrehozo Excel / form mezők
type IntezmenyLetrehozoRequest struct {
	OMKod              string `json:"omKod"`
	IntezmenyNev       string `json:"intezmenyNev"`
	IntezmenyVezeto    string `json:"intezmenyVezeto"`
	EmailCim           string `json:"emailCim"`
	Tagintezmenykod    string `json:"tagintezmenykod"`
	Megye              string `json:"megye"`
	Iranyitoszam       string `json:"iranyitoszam"`
	Telepules          string `json:"telepules"`
	Kozterulet         string `json:"kozterulet"`
	KozteruletJellege  string `json:"kozteruletJellege"`
	Hazszam            string `json:"hazszam"`
	FenntartoAzonosito string `json:"fenntartoAzonosito"`
	IntezmenyKod       string `json:"intezmenyKod"`
	AktivTanev         string `json:"aktivTanev"`
	KovetkezoTanev     string `json:"kovetkezoTanev"`
	AdminJelszo        string `json:"adminJelszo,omitempty"`
	ShortName          string `json:"shortName,omitempty"`
}

func (s *Store) ListInstitutions() ([]InstitutionRow, error) {
	ctx := context.Background()
	rows, err := s.db.Query(ctx, `
		SELECT code, name, COALESCE(short_name, ''), active
		FROM institutions
		WHERE active = TRUE
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []InstitutionRow
	for rows.Next() {
		var r InstitutionRow
		if err := rows.Scan(&r.Code, &r.Name, &r.ShortName, &r.Active); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) GetInstitution(code string) (InstitutionRow, error) {
	ctx := context.Background()
	var r InstitutionRow
	err := s.db.QueryRow(ctx, `
		SELECT code, name, COALESCE(short_name, ''), active
		FROM institutions
		WHERE code = $1 AND active = TRUE
	`, code).Scan(&r.Code, &r.Name, &r.ShortName, &r.Active)
	if err != nil {
		return InstitutionRow{}, err
	}
	return r, nil
}

func (s *Store) CreateInstitution(code, name, shortName string, active bool) error {
	return s.CreateInstitutionWithData(code, name, shortName, active, nil)
}

func (s *Store) CreateInstitutionWithData(code, name, shortName string, active bool, data map[string]any) error {
	ctx := context.Background()
	if code == "" || name == "" {
		return fmt.Errorf("code and name required")
	}
	if data == nil {
		data = map[string]any{}
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	// data oszlop opcionális – ha nincs migrálva, próbáljuk alap INSERT-tel
	_, err = s.db.Exec(ctx, `
		INSERT INTO institutions (code, name, short_name, active, data)
		VALUES ($1, $2, $3, $4, $5::jsonb)
		ON CONFLICT (code) DO UPDATE SET
			name = EXCLUDED.name,
			short_name = EXCLUDED.short_name,
			active = EXCLUDED.active,
			data = EXCLUDED.data
	`, code, name, shortName, active, string(raw))
	if err != nil {
		// fallback ha nincs data oszlop
		_, err2 := s.db.Exec(ctx, `
			INSERT INTO institutions (code, name, short_name, active)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (code) DO UPDATE SET
				name = EXCLUDED.name,
				short_name = EXCLUDED.short_name,
				active = EXCLUDED.active
		`, code, name, shortName, active)
		return err2
	}
	return nil
}

func (s *Store) CreateInstitutionFromLetrehozo(req IntezmenyLetrehozoRequest) error {
	code := strings.TrimSpace(req.IntezmenyKod)
	name := strings.TrimSpace(req.IntezmenyNev)
	if code == "" || name == "" {
		return fmt.Errorf("intezmenyKod and intezmenyNev required")
	}
	short := strings.TrimSpace(req.ShortName)
	if short == "" {
		short = strings.TrimSpace(req.Telepules)
	}
	data := map[string]any{
		"omKod":              req.OMKod,
		"intezmenyVezeto":    req.IntezmenyVezeto,
		"emailCim":           req.EmailCim,
		"tagintezmenykod":    req.Tagintezmenykod,
		"megye":              req.Megye,
		"iranyitoszam":       req.Iranyitoszam,
		"telepules":          req.Telepules,
		"kozterulet":         req.Kozterulet,
		"kozteruletJellege":  req.KozteruletJellege,
		"hazszam":            req.Hazszam,
		"fenntartoAzonosito": req.FenntartoAzonosito,
		"aktivTanev":         req.AktivTanev,
		"kovetkezoTanev":     req.KovetkezoTanev,
	}
	return s.CreateInstitutionWithData(code, name, short, true, data)
}


func (s *Store) ListInstitutionsAll() ([]InstitutionRow, error) {
	ctx := context.Background()
	rows, err := s.db.Query(ctx, `
		SELECT code, name, COALESCE(short_name, ''), active
		FROM institutions
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InstitutionRow
	for rows.Next() {
		var r InstitutionRow
		if err := rows.Scan(&r.Code, &r.Name, &r.ShortName, &r.Active); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}


// GetUserByUsernameAndInstitute – ha van institute_code a user-nél, szűr.
func (s *Store) GetUserByUsernameAndInstitute(username, instituteCode string) (User, error) {
	ctx := context.Background()

	var user User
	var role *string
	var inst *string

	err := s.db.QueryRow(ctx, `
		SELECT
			id::text,
			username,
			password_hash,
			student_uid,
			role,
			active,
			created_at,
			institute_code
		FROM users
		WHERE username = $1
		  AND (institute_code IS NULL OR institute_code = '' OR institute_code = $2)
		LIMIT 1
	`, username, instituteCode).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.StudentUID,
		&role,
		&user.Active,
		&user.CreatedAt,
		&inst,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return User{}, pgx.ErrNoRows
		}
		return User{}, err
	}
	if role != nil && *role != "" {
		user.Role = *role
	} else {
		user.Role = RoleStudent
	}
	return user, nil
}
