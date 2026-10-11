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
	if err := replaceCollection(
		s.db,
		"timetable_templates",
		v,
		func(x TimetableTemplate) string { return x.Uid },
	); err != nil {
		log.Printf("SetTimetableTemplates: %v", err)
	}
}

func (s *Store) ExpandTemplates(from, to time.Time) []Lesson {
	templates := s.GetTimetableTemplates()
	teacher := s.GetTeacher()
	out := make([]Lesson, 0)

	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		wd := int(d.Weekday()) // 0=vasárnap … 6=szombat
		if wd == 0 {
			wd = 7
		}
		dateStr := d.Format("2006-01-02")

		for _, t := range templates {
			if t.Nap != wd {
				continue
			}
			kezdet := t.KezdetIdo
			veg := t.VegIdo
			if len(kezdet) == 5 {
				kezdet = kezdet + ":00"
			}
			if len(veg) == 5 {
				veg = veg + ":00"
			}
			uid := fmt.Sprintf("TPL-%s-%d-%s", dateStr, t.Oraszam, t.OsztalyCsoportUid)
			out = append(out, Lesson{
				Uid:            uid,
				Datum:          dateStr,
				KezdetIdopont:  dateStr + "T" + kezdet,
				VegIdopont:     dateStr + "T" + veg,
				Nev:            firstNonEmpty(t.Nev, t.TantargyNev),
				Oraszam:        t.Oraszam,
				OsztalyCsoport: NameUid{Uid: t.OsztalyCsoportUid, Nev: t.OsztalyCsoportNev},
				TanarNeve:      teacher.Nev,
				Tantargy:       Subject{Uid: t.TantargyUid, Nev: t.TantargyNev},
				TeremNeve:      t.TeremNeve,
				Tipus:          NameUidDesc{Uid: "1", Nev: "Óra", Leiras: "Tanóra"},
				Allapot:        NameUidDesc{Uid: "1", Nev: "Tervezett", Leiras: "Tervezett óra"},
			})
		}
	}
	return out
}