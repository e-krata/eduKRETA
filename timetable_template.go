package main

import (
	"context"
	"encoding/json"
	"log"
	"time"
)

// Órarend sablon
type TimetableTemplate struct {
	Uid               string `json:"Uid"`
	Nap               int    `json:"Nap"` // 1=hétfő … 5=péntek
	Oraszam           int    `json:"Oraszam"`
	KezdetIdo         string `json:"KezdetIdo"` // "08:00"
	VegIdo            string `json:"VegIdo"`    // "08:45"
	TantargyUid       string `json:"TantargyUid"`
	TantargyNev       string `json:"TantargyNev"`
	OsztalyCsoportUid string `json:"OsztalyCsoportUid"`
	OsztalyCsoportNev string `json:"OsztalyCsoportNev"`
	TeremNeve         string `json:"TeremNeve"`
	Nev               string `json:"Nev"`
}

func (s *Store) GetTimetableTemplates() []TimetableTemplate {
	return getCollection[TimetableTemplate](
		context.Background(),
		s.db,
		"timetable_templates",
		"uid",
	)
}

func (s *Store) SetTimetableTemplates(v []TimetableTemplate) {
	ctx := context.Background()

	tx, err := s.db.Begin(ctx)
	if err != nil {
		log.Printf("SetTimetableTemplates begin: %v", err)
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM timetable_templates`); err != nil {
		log.Printf("SetTimetableTemplates delete: %v", err)
		return
	}

	for _, item := range v {
		raw, err := json.Marshal(item)
		if err != nil {
			log.Printf("SetTimetableTemplates json: %v", err)
			return
		}
		uid := item.Uid
		if uid == "" {
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO timetable_templates (uid, data) VALUES ($1, $2::jsonb)
			 ON CONFLICT (uid) DO UPDATE SET data = EXCLUDED.data`,
			uid, string(raw),
		); err != nil {
			log.Printf("SetTimetableTemplates insert: %v", err)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("SetTimetableTemplates commit: %v", err)
	}
}

// ExpandTemplates sablonokból generál konkrét Lesson listát a [from, to] tartományra.
func (s *Store) ExpandTemplates(from, to time.Time) []Lesson {
	templates := s.GetTimetableTemplates()
	if len(templates) == 0 {
		return nil
	}

	var out []Lesson
	// normalize to date-only
	from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, from.Location())
	to = time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, to.Location())

	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		// Go Weekday: Sunday=0 … Saturday=6 → KRÉTA: Hétfő=1 … Péntek=5
		wd := int(d.Weekday())
		if wd == 0 {
			continue // vasárnap
		}
		if wd == 6 {
			continue // szombat
		}
		// 1=Mon … 5=Fri
		for _, t := range templates {
			if t.Nap != wd {
				continue
			}
			datum := d.Format("2006-01-02")
			uid := "TPL-" + t.Uid + "-" + datum
			lesson := Lesson{
				Uid:           uid,
				Datum:         datum,
				KezdetIdopont: datum + "T" + t.KezdetIdo + ":00",
				VegIdopont:    datum + "T" + t.VegIdo + ":00",
				Nev:           t.Nev,
				Oraszam:       t.Oraszam,
				OsztalyCsoport: NameUid{
					Uid: t.OsztalyCsoportUid,
					Nev: t.OsztalyCsoportNev,
				},
				Tantargy: Subject{
					Uid: t.TantargyUid,
					Nev: t.TantargyNev,
				},
				TeremNeve: t.TeremNeve,
				Tipus: NameUidDesc{
					Uid: "1", Nev: "OrarendiOra", Leiras: "Órarendi óra",
				},
				Allapot: NameUidDesc{
					Uid: "1", Nev: "Tervezett", Leiras: "Tervezett",
				},
				TanuloJelenlet: NameUidDesc{},
				Csatolmanyok:   []NameUid{},
			}
			out = append(out, lesson)
		}
	}
	return out
}
