package main

import (
	"context"
	"fmt"

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
	Code      string `json:"code"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
	Active    bool   `json:"active"`
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
