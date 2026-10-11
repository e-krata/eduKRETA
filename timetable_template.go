package main

import (
	"context"
	"fmt"
	"log"
	"time"
	"encoding/json"
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

// Set
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
		// csak uid + data – nincs created_at / updated_at
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
