
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	_ "github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type UidRef struct {
	Uid string `json:"Uid"`
}

type NameUid struct {
	Uid string `json:"Uid"`
	Nev string `json:"Nev"`
}

type NameUidDesc struct {
	Uid    string `json:"Uid"`
	Nev    string `json:"Nev"`
	Leiras string `json:"Leiras"`
}

type Subject struct {
	Uid       string      `json:"Uid"`
	Nev       string      `json:"Nev"`
	Kategoria NameUidDesc `json:"Kategoria"`
	SortIndex int         `json:"SortIndex"`
}

type Guardian struct {
	Uid                  string `json:"Uid"`
	Nev                  string `json:"Nev"`
	EmailCim             string `json:"EmailCim,omitempty"`
	IsTorvenyesKepviselo bool   `json:"IsTorvenyesKepviselo"`
	Telefonszam          string `json:"Telefonszam,omitempty"`
}

type BankAccount struct {
	BankszamlaSzam              string `json:"BankszamlaSzam,omitempty"`
	IsReadOnly                  bool   `json:"IsReadOnly"`
	BankszamlaTulajdonosNeve    string `json:"BankszamlaTulajdonosNeve,omitempty"`
	BankszamlaTulajdonosTipusId int    `json:"BankszamlaTulajdonosTipusId"`
}

type SystemModule struct {
	IsAktiv bool   `json:"IsAktiv"`
	Tipus   string `json:"Tipus"`
	Url     string `json:"Url,omitempty"`
}

type CustomizationSettings struct {
	ErtekelesekMegjelenitesenekKesleltetesenekMerteke int    `json:"ErtekelesekMegjelenitesenekKesleltetesenekMerteke"`
	IsOsztalyAtlagMegjeleniteseEllenorzoben           bool   `json:"IsOsztalyAtlagMegjeleniteseEllenorzoben"`
	IsTanorakTemajaMegtekinthetoEllenorzoben          bool   `json:"IsTanorakTemajaMegtekinthetoEllenorzoben"`
	KovetkezoTelepitesDatuma                          string `json:"KovetkezoTelepitesDatuma"`
}

type Institution struct {
	Uid                     string                `json:"Uid"`
	RovidNev                string                `json:"RovidNev"`
	TestreszabasBeallitasok CustomizationSettings `json:"TestreszabasBeallitasok"`
	Rendszermodulok         []SystemModule        `json:"Rendszermodulok"`
}

type Student struct {
	Uid                string      `json:"Uid"`
	Nev                string      `json:"Nev"`
	Cimek              []string    `json:"Cimek"`
	Bankszamla         BankAccount `json:"Bankszamla"`
	SzuletesiEv        int         `json:"SzuletesiEv"`
	SzuletesiHonap     int         `json:"SzuletesiHonap"`
	SzuletesiNap       int         `json:"SzuletesiNap"`
	EmailCim           string      `json:"EmailCim,omitempty"`
	Telefonszam        string      `json:"Telefonszam,omitempty"`
	TanevUid           string      `json:"TanevUid"`
	Gondviselok        []Guardian  `json:"Gondviselok"`
	IntezmenyAzonosito string      `json:"IntezmenyAzonosito"`
	IntezmenyNev       string      `json:"IntezmenyNev"`
	Intezmeny          Institution `json:"Intezmeny"`
}

type ClassGroup struct {
	Uid                               string      `json:"Uid"`
	Nev                               string      `json:"Nev"`
	OsztalyFonok                      UidRef      `json:"OsztalyFonok"`
	OsztalyFonokHelyettes             UidRef      `json:"OsztalyFonokHelyettes"`
	OktatasNevelesiKategoria          NameUidDesc `json:"OktatasNevelesiKategoria"`
	OktatasNevelesiKategoriaSortIndex int         `json:"OktatasNevelesiKategoriaSortIndex"`
	OktatasNevelesiFeladat            NameUidDesc `json:"OktatasNevelesiFeladat"`
	IsAktiv                           bool        `json:"IsAktiv"`
	Tipus                             string      `json:"Tipus"`
}

type Grade struct {
	Uid                       string       `json:"Uid"`
	RogzitesDatuma            string       `json:"RogzitesDatuma"`
	KeszitesDatuma            string       `json:"KeszitesDatuma"`
	LattamozasDatuma          string       `json:"LattamozasDatuma,omitempty"`
	Tantargy                  Subject      `json:"Tantargy"`
	Tema                      string       `json:"Tema,omitempty"`
	Megjegyzes                string       `json:"Megjegyzes,omitempty"`
	Tipus                     NameUidDesc  `json:"Tipus"`
	Mod                       *NameUidDesc `json:"Mod,omitempty"`
	ErtekFajta                NameUidDesc  `json:"ErtekFajta"`
	ErtekeloTanarNeve         string       `json:"ErtekeloTanarNeve"`
	Jelleg                    string       `json:"Jelleg,omitempty"`
	SzamErtek                 int          `json:"SzamErtek,omitempty"`
	SzovegesErtek              string       `json:"SzovegesErtek"`
	SulySzazalekErteke        int          `json:"SulySzazalekErteke,omitempty"`
	SzovegesErtekelesRovidNev string       `json:"SzovegesErtekelesRovidNev,omitempty"`
	OsztalyCsoport            UidRef       `json:"OsztalyCsoport"`
	SortIndex                 int          `json:"SortIndex"`
	TanuloUid                 string       `json:"TanuloUid,omitempty"`
}

type Homework struct {
	Uid                    string  `json:"Uid"`
	Tantargy               Subject `json:"Tantargy"`
	TantargyNeve           string  `json:"TantargyNeve"`
	RogzitoTanarNeve       string  `json:"RogzitoTanarNeve"`
	Szoveg                 string  `json:"Szoveg"`
	FeladasDatuma          string  `json:"FeladasDatuma"`
	HataridoDatuma         string  `json:"HataridoDatuma"`
	RogzitesIdopontja      string  `json:"RogzitesIdopontja"`
	IsTanarRogzitette      bool    `json:"IsTanarRogzitette"`
	IsMegoldva             bool    `json:"IsMegoldva"`
	IsBeadhato             bool    `json:"IsBeadhato"`
	OsztalyCsoport         UidRef  `json:"OsztalyCsoport"`
	IsCsatolasEngedelyezes bool    `json:"IsCsatolasEngedelyezes"`
}

type Test struct {
	Uid                 string      `json:"Uid"`
	Datum               string      `json:"Datum"`
	BejelentesDatuma    string      `json:"BejelentesDatuma"`
	RogzitoTanarNeve    string      `json:"RogzitoTanarNeve"`
	OrarendiOraOraszama int         `json:"OrarendiOraOraszama"`
	Tantargy            Subject     `json:"Tantargy"`
	TantargyNeve        string      `json:"TantargyNeve"`
	Temaja              string      `json:"Temaja,omitempty"`
	Modja               NameUidDesc `json:"Modja"`
	OsztalyCsoport      UidRef      `json:"OsztalyCsoport"`
}

type OmittedLesson struct {
	KezdoDatum string `json:"KezdoDatum"`
	VegDatum   string `json:"VegDatum"`
	Oraszam    int    `json:"Oraszam,omitempty"`
}

type Omission struct {
	Uid              string         `json:"Uid"`
	Tantargy         Subject        `json:"Tantargy"`
	Ora              *OmittedLesson `json:"Ora,omitempty"`
	Datum            string         `json:"Datum"`
	RogzitoTanarNeve string         `json:"RogzitoTanarNeve"`
	Tipus            NameUidDesc    `json:"Tipus"`
	Mod              NameUidDesc    `json:"Mod"`
	KesesPercben     int            `json:"KesesPercben,omitempty"`
	KeszitesDatuma   string         `json:"KeszitesDatuma"`
	IgazolasAllapota string         `json:"IgazolasAllapota"`
	IgazolasTipusa   NameUidDesc    `json:"IgazolasTipusa"`
	OsztalyCsoport   UidRef         `json:"OsztalyCsoport"`
	TanuloUid        string         `json:"TanuloUid,omitempty"`
}

type Lesson struct {
	Uid                              string      `json:"Uid"`
	Datum                            string      `json:"Datum"`
	KezdetIdopont                    string      `json:"KezdetIdopont"`
	VegIdopont                       string      `json:"VegIdopont"`
	Nev                              string      `json:"Nev"`
	Oraszam                          int         `json:"Oraszam,omitempty"`
	OraEvesSorszama                  int         `json:"OraEvesSorszama,omitempty"`
	OsztalyCsoport                   NameUid     `json:"OsztalyCsoport"`
	TanarNeve                        string      `json:"TanarNeve,omitempty"`
	Tantargy                         Subject     `json:"Tantargy"`
	Tema                             string      `json:"Tema,omitempty"`
	TeremNeve                        string      `json:"TeremNeve,omitempty"`
	Tipus                            NameUidDesc `json:"Tipus"`
	TanuloJelenlet                   NameUidDesc `json:"TanuloJelenlet"`
	Allapot                          NameUidDesc `json:"Allapot"`
	HelyettesTanarNeve               string      `json:"HelyettesTanarNeve,omitempty"`
	HaziFeladatUid                   string      `json:"HaziFeladatUid,omitempty"`
	FeladatGroupUid                  string      `json:"FeladatGroupUid,omitempty"`
	NyelviFeladatGroupUid            string      `json:"NyelviFeladatGroupUid,omitempty"`
	BejelentettSzamonkeresUid        string      `json:"BejelentettSzamonkeresUid,omitempty"`
	IsTanuloHaziFeladatEnabled       bool        `json:"IsTanuloHaziFeladatEnabled"`
	IsHaziFeladatMegoldva            bool        `json:"IsHaziFeladatMegoldva"`
	Csatolmanyok                     []NameUid   `json:"Csatolmanyok"`
	IsDigitalisOra                   bool        `json:"IsDigitalisOra"`
	DigitalisEszkozTipus             string      `json:"DigitalisEszkozTipus,omitempty"`
	DigitalisPlatformTipus           string      `json:"DigitalisPlatformTipus,omitempty"`
	DigitalisTamogatoEszkozTipusList []string    `json:"DigitalisTamogatoEszkozTipusList"`
	Letrehozas                       string      `json:"Letrehozas"`
	UtolsoModositas                  string      `json:"UtolsoModositas"`
}

type NoticeBoardItem struct {
	Uid                string `json:"Uid"`
	RogzitoNeve        string `json:"RogzitoNeve"`
	ErvenyessegKezdete string `json:"ErvenyessegKezdete"`
	ErvenyessegVege    string `json:"ErvenyessegVege"`
	Cim                string `json:"Cim"`
	Tartalom           string `json:"Tartalom"`
	TartalomText       string `json:"TartalomText"`
}

type InfoBoardItem struct {
	Uid               string      `json:"Uid"`
	Cim               string      `json:"Cim"`
	Datum             string      `json:"Datum"`
	KeszitoTanarNeve  string      `json:"KeszitoTanarNeve"`
	KeszitesDatuma    string      `json:"KeszitesDatuma"`
	Tartalom          string      `json:"Tartalom"`
	TartalomFormazott string      `json:"TartalomFormazott"`
	Tipus             NameUidDesc `json:"Tipus"`
}

type DktSubject struct {
	TantargyId        int    `json:"tantargyId"`
	TantargyNev       string `json:"tantargyNev"`
	AlkalmazottNev    string `json:"alkalmazottNev"`
	CsoportId         int    `json:"csoportId,omitempty"`
	OsztalyCsoportNev string `json:"osztalyCsoportNev"`
	TipusId            int    `json:"tipusId"`
	NyelvId            string `json:"nyelvId,omitempty"`
}

type ClassGroupSubjectAverage struct {
	Uid                 string  `json:"Uid"`
	Tantargy            Subject `json:"Tantargy"`
	TanuloAtlag         float64 `json:"TanuloAtlag,omitempty"`
	OsztalyCsoportAtlag float64 `json:"OsztalyCsoportAtlag,omitempty"`
}

type ServerConfig struct {
	InstituteCode         string `json:"instituteCode"`
	Username              string `json:"username"`
	Password              string `json:"password"`
	AccessTokenTTLSeconds int    `json:"accessTokenTtlSeconds"`
}

/*
	User

	A felhasználói hitelesítéshez használt rekord.

	A PasswordHash soha nem kerül vissza az API válaszába.
*/
type User struct {
	ID            string    `json:"id"`
	Username      string    `json:"username"`
	PasswordHash  string    `json:"-"`
	StudentUID    string    `json:"studentUid"`
	Role          string    `json:"role"`
	InstituteCode string    `json:"instituteCode,omitempty"`
	Active        bool      `json:"active"`
	CreatedAt     time.Time `json:"createdAt"`
}

type storeData struct {
	Config      ServerConfig               `json:"config"`
	Student     Student                    `json:"student"`
	ClassGroups []ClassGroup               `json:"classGroups"`
	Grades      []Grade                    `json:"grades"`
	Homework    []Homework                 `json:"homework"`
	Tests       []Test                     `json:"tests"`
	Omissions   []Omission                 `json:"omissions"`
	Lessons     []Lesson                   `json:"lessons"`
	Notices     []NoticeBoardItem          `json:"notices"`
	InfoBoard   []InfoBoardItem            `json:"infoBoard"`
	DktSubjects []DktSubject               `json:"dktSubjects"`
	Averages    []ClassGroupSubjectAverage `json:"averages"`
}

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	s := &Store{
		db: db,
	}

	if err := s.ensureSeeded(); err != nil {
		log.Printf("adatbázis seed sikertelen: %v", err)
	}

	return s
}

func (s *Store) ensureSeeded() error {
	ctx := context.Background()

	var exists bool

	err := s.db.QueryRow(
		ctx,
		`SELECT EXISTS(
			SELECT 1
			FROM kreta_store
			WHERE id = 1
		)`,
	).Scan(&exists)

	if err != nil {
		return err
	}

	if exists {
		return nil
	}

	data := seedData()

	s.SetConfig(data.Config)
	s.SetStudent(data.Student)
	s.SetClassGroups(data.ClassGroups)
	s.SetGrades(data.Grades)
	s.SetHomework(data.Homework)
	s.SetTests(data.Tests)
	s.SetOmissions(data.Omissions)
	s.SetLessons(data.Lessons)
	s.SetNotices(data.Notices)
	s.SetInfoBoard(data.InfoBoard)
	s.SetDktSubjects(data.DktSubjects)
	s.SetAverages(data.Averages)

	return nil
}

func (s *Store) GetConfig() ServerConfig {
	ctx := context.Background()

	var raw []byte

	err := s.db.QueryRow(
		ctx,
		`SELECT config FROM kreta_store WHERE id = 1`,
	).Scan(&raw)

	if err != nil {
		log.Printf("GetConfig: %v", err)
		return ServerConfig{}
	}

	var result ServerConfig

	if err := json.Unmarshal(raw, &result); err != nil {
		log.Printf("GetConfig JSON: %v", err)
		return ServerConfig{}
	}

	return result
}

func (s *Store) SetConfig(v ServerConfig) {
	raw, err := json.Marshal(v)
	if err != nil {
		log.Printf("SetConfig JSON: %v", err)
		return
	}

	_, err = s.db.Exec(
		context.Background(),
		`
		INSERT INTO kreta_store (
			id,
			config
		)
		VALUES (
			1,
			$1
		)
		ON CONFLICT (id)
		DO UPDATE SET
			config = EXCLUDED.config,
			updated_at = NOW()
		`,
		raw,
	)

	if err != nil {
		log.Printf("SetConfig: %v", err)
	}
}

func (s *Store) GetStudent() Student {
	ctx := context.Background()

	var raw []byte

	err := s.db.QueryRow(
		ctx,
		`SELECT student FROM kreta_store WHERE id = 1`,
	).Scan(&raw)

	if err != nil {
		log.Printf("GetStudent: %v", err)
		return Student{}
	}

	var result Student

	if err := json.Unmarshal(raw, &result); err != nil {
		log.Printf("GetStudent JSON: %v", err)
		return Student{}
	}

	return result
}

func (s *Store) SetStudent(v Student) {
	raw, err := json.Marshal(v)
	if err != nil {
		log.Printf("SetStudent JSON: %v", err)
		return
	}

	_, err = s.db.Exec(
		context.Background(),
		`
		INSERT INTO kreta_store (
			id,
			student
		)
		VALUES (
			1,
			$1
		)
		ON CONFLICT (id)
		DO UPDATE SET
			student = EXCLUDED.student,
			updated_at = NOW()
		`,
		raw,
	)

	if err != nil {
		log.Printf("SetStudent: %v", err)
	}
}

// ============================================================
// USER AUTHENTICATION
// ============================================================

// CheckPassword ellenőrzi a felhasználó jelszavát.
func (s *Store) CheckPassword(
	user User,
	password string,
) bool {

	if !user.Active {
		return false
	}

	err := bcrypt.CompareHashAndPassword(
		[]byte(user.PasswordHash),
		[]byte(password),
	)

	return err == nil
}

func getCollection[T any](
	ctx context.Context,
	db *pgxpool.Pool,
	table string,
	orderBy string,
) []T {

	query := fmt.Sprintf(
		`SELECT data FROM %s ORDER BY %s`,
		table,
		orderBy,
	)

	rows, err := db.Query(
		ctx,
		query,
	)

	if err != nil {
		log.Printf(
			"getCollection(%s): %v",
			table,
			err,
		)

		return []T{}
	}

	defer rows.Close()

	result := make([]T, 0)

	for rows.Next() {

		var raw []byte

		if err := rows.Scan(&raw); err != nil {

			log.Printf(
				"getCollection(%s) scan: %v",
				table,
				err,
			)

			return []T{}
		}

		var item T

		if err := json.Unmarshal(
			raw,
			&item,
		); err != nil {

			log.Printf(
				"getCollection(%s) JSON: %v",
				table,
				err,
			)

			return []T{}
		}

		result = append(
			result,
			item,
		)
	}

	if err := rows.Err(); err != nil {

		log.Printf(
			"getCollection(%s): %v",
			table,
			err,
		)

		return []T{}
	}

	return result
}

func replaceCollection[T any](
	db *pgxpool.Pool,
	table string,
	items []T,
	getUID func(T) string,
) error {

	ctx := context.Background()

	tx, err := db.Begin(ctx)

	if err != nil {
		return err
	}

	defer tx.Rollback(ctx)

	deleteQuery := fmt.Sprintf(
		`DELETE FROM %s`,
		table,
	)

	if _, err := tx.Exec(
		ctx,
		deleteQuery,
	); err != nil {
		return err
	}

	insertQuery := fmt.Sprintf(
		`
		INSERT INTO %s (
			uid,
			data,
			created_at,
			updated_at
		)
		VALUES (
			$1,
			$2,
			NOW(),
			NOW()
		)
		`,
		table,
	)

	for _, item := range items {

		raw, err := json.Marshal(item)

		if err != nil {
			return err
		}

		uid := getUID(item)

		if uid == "" {
			continue
		}

		if _, err := tx.Exec(
			ctx,
			insertQuery,
			uid,
			raw,
		); err != nil {

			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *Store) GetClassGroups() []ClassGroup {
	return getCollection[ClassGroup](
		context.Background(),
		s.db,
		"class_groups",
		"uid",
	)
}

func (s *Store) SetClassGroups(v []ClassGroup) {
	if err := replaceCollection(
		s.db,
		"class_groups",
		v,
		func(x ClassGroup) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetClassGroups: %v",
			err,
		)
	}
}

func (s *Store) GetGrades() []Grade {
	return getCollection[Grade](
		context.Background(),
		s.db,
		"grades",
		"uid",
	)
}

func (s *Store) SetGrades(v []Grade) {
	if err := replaceCollection(
		s.db,
		"grades",
		v,
		func(x Grade) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetGrades: %v",
			err,
		)
	}
}

func (s *Store) GetHomework() []Homework {
	return getCollection[Homework](
		context.Background(),
		s.db,
		"homework",
		"uid",
	)
}

func (s *Store) SetHomework(v []Homework) {
	if err := replaceCollection(
		s.db,
		"homework",
		v,
		func(x Homework) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetHomework: %v",
			err,
		)
	}
}

func (s *Store) GetTests() []Test {
	return getCollection[Test](
		context.Background(),
		s.db,
		"tests",
		"uid",
	)
}

func (s *Store) SetTests(v []Test) {
	if err := replaceCollection(
		s.db,
		"tests",
		v,
		func(x Test) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetTests: %v",
			err,
		)
	}
}

func (s *Store) GetOmissions() []Omission {
	return getCollection[Omission](
		context.Background(),
		s.db,
		"omissions",
		"uid",
	)
}

func (s *Store) SetOmissions(v []Omission) {
	if err := replaceCollection(
		s.db,
		"omissions",
		v,
		func(x Omission) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetOmissions: %v",
			err,
		)
	}
}

func (s *Store) GetLessons() []Lesson {
	return getCollection[Lesson](
		context.Background(),
		s.db,
		"lessons",
		"uid",
	)
}

func (s *Store) SetLessons(v []Lesson) {
	if err := replaceCollection(
		s.db,
		"lessons",
		v,
		func(x Lesson) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetLessons: %v",
			err,
		)
	}
}

func (s *Store) GetNotices() []NoticeBoardItem {
	return getCollection[NoticeBoardItem](
		context.Background(),
		s.db,
		"notices",
		"uid",
	)
}

func (s *Store) SetNotices(v []NoticeBoardItem) {
	if err := replaceCollection(
		s.db,
		"notices",
		v,
		func(x NoticeBoardItem) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetNotices: %v",
			err,
		)
	}
}

func (s *Store) GetInfoBoard() []InfoBoardItem {
	return getCollection[InfoBoardItem](
		context.Background(),
		s.db,
		"info_board",
		"uid",
	)
}

func (s *Store) SetInfoBoard(v []InfoBoardItem) {
	if err := replaceCollection(
		s.db,
		"info_board",
		v,
		func(x InfoBoardItem) string {
			return x.Uid
		},
	); err != nil {
		log.Printf(
			"SetInfoBoard: %v",
			err,
		)
	}
}

func (s *Store) GetDktSubjects() []DktSubject {

	ctx := context.Background()

	rows, err := s.db.Query(
		ctx,
		`SELECT data FROM dkt_subjects ORDER BY id`,
	)

	if err != nil {
		log.Printf(
			"GetDktSubjects: %v",
			err,
		)

		return []DktSubject{}
	}

	defer rows.Close()

	result := make([]DktSubject, 0)

	for rows.Next() {

		var raw []byte

		if err := rows.Scan(&raw); err != nil {

			log.Printf(
				"GetDktSubjects scan: %v",
				err,
			)

			return []DktSubject{}
		}

		var item DktSubject

		if err := json.Unmarshal(
			raw,
			&item,
		); err != nil {

			log.Printf(
				"GetDktSubjects JSON: %v",
				err,
			)

			return []DktSubject{}
		}

		result = append(
			result,
			item,
		)
	}

	if err := rows.Err(); err != nil {

		log.Printf(
			"GetDktSubjects rows: %v",
			err,
		)

		return []DktSubject{}
	}

	return result
}

func (s *Store) SetDktSubjects(
	v []DktSubject,
) {

	ctx := context.Background()

	tx, err := s.db.Begin(ctx)

	if err != nil {
		log.Printf(
			"SetDktSubjects begin: %v",
			err,
		)

		return
	}

	defer tx.Rollback(ctx)

	if _, err := tx.Exec(
		ctx,
		`DELETE FROM dkt_subjects`,
	); err != nil {

		log.Printf(
			"SetDktSubjects delete: %v",
			err,
		)

		return
	}

	for _, item := range v {

		raw, err := json.Marshal(item)

		if err != nil {

			log.Printf(
				"SetDktSubjects JSON: %v",
				err,
			)

			return
		}

		id := strconv.Itoa(
			item.TantargyId,
		)

		if _, err := tx.Exec(
			ctx,
			`
			INSERT INTO dkt_subjects (
				id,
				data,
				created_at,
				updated_at
			)
			VALUES (
				$1,
				$2,
				NOW(),
				NOW()
			)
			ON CONFLICT (id)
			DO UPDATE SET
				data = EXCLUDED.data,
				updated_at = NOW()
			`,
			id,
			raw,
		); err != nil {

			log.Printf(
				"SetDktSubjects insert: %v",
				err,
			)

			return
		}
	}

	if err := tx.Commit(ctx); err != nil {

		log.Printf(
			"SetDktSubjects commit: %v",
			err,
		)
	}
}

func (s *Store) GetAverages() []ClassGroupSubjectAverage {
	return getCollection[ClassGroupSubjectAverage](
		context.Background(),
		s.db,
		"averages",
		"uid",
	)
}

func (s *Store) SetAverages(
	v []ClassGroupSubjectAverage,
) {

	if err := replaceCollection(
		s.db,
		"averages",
		v,
		func(x ClassGroupSubjectAverage) string {
			return x.Uid
		},
	); err != nil {

		log.Printf(
			"SetAverages: %v",
			err,
		)
	}
}

func (s *Store) Reset() {

	data := seedData()

	s.SetConfig(data.Config)
	s.SetStudent(data.Student)
	s.SetClassGroups(data.ClassGroups)
	s.SetGrades(data.Grades)
	s.SetHomework(data.Homework)
	s.SetTests(data.Tests)
	s.SetOmissions(data.Omissions)
	s.SetLessons(data.Lessons)
	s.SetNotices(data.Notices)
	s.SetInfoBoard(data.InfoBoard)
	s.SetDktSubjects(data.DktSubjects)
	s.SetAverages(data.Averages)
}

