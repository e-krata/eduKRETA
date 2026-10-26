## Intézmények

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET | `/api/intezmenyek` | Aktív intézmények listája (auth nélkül, login oldalhoz) |

Login: a `POST /connect/token` body-ban opcionálisan `institute_code` (vagy `instituteCode`) is küldhető.


## eAdmin / Kapcsolódás / LEP / Covid

| Metódus | Útvonal | Auth | Leírás |
|--------|---------|------|--------|
| GET | `/kreta-api/eadminapi/getdirectors` | Bearer | Igazgatók listája |
| GET | `/kreta-api/eadminapi/getclassmasters` | Bearer | Osztályfőnökök |
| GET | `/kreta-api/eadminapi/getadministrators` | Bearer | Adminisztrátorok |
| GET | `/kreta-api/mobileapi/getlepevents` | Bearer | LEP események |
| POST | `/kreta-api/mobileapi/updatelepeventpermission` | Bearer | LEP engedély (`Uid`, `PermissionOk`) |
| POST | `/kreta-api/mobileapi/postcovidform` | Bearer | Covid kérdőív beküldés |
| POST | `/kapcsolodas/LEP/EventAdd` | Bearer | LEP esemény létrehozás |
| POST/DELETE | `/kapcsolodas/LEP/EventDelete` | Bearer | LEP esemény törlés (`uid` / body `Uid`) |
| POST | `/kapcsolodas/LEP/EventFinished` | Bearer | LEP esemény befejezése |
| POST | `/kapcsolodas/LEP/EventJoin` | Bearer | Jelentkezés LEP eseményre |
| POST | `/kapcsolodas/edukreta/Covid/{IntezmenyId}/IntezmenyLezaras/Start` | Bearer | Intézménylezárás indítás |
| POST | `/kapcsolodas/edukreta/Covid/{IntezmenyId}/IntezmenyLezaras/Vege` | Bearer | Intézménylezárás vége |
| POST | `/kapcsolodas/{IntezmenyId}/Faliujsag/Add` | Bearer | Faliújság bejegyzés |
| POST/DELETE | `/kapcsolodas/{IntezmenyId}/Faliujsag/Torles` | Bearer | Faliújság törlés (`uid`) |


# KRÁTA / ujkreta – API dokumentáció

**Base URL:** `https://ujkreta.onrender.com`  
**Auth:** `Authorization: Bearer <access_token>`  
Token: `POST /connect/token` (OAuth2 password / refresh)

---

## Auth

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| POST | `/connect/token` | Access token (username, password, grant_type) |
| POST | `/connect/mfa/verify` | MFA kód ellenőrzés |
| GET | `/ellenorzo/v3/sajat/Mfa/Status` | MFA státusz |
| POST | `/ellenorzo/v3/sajat/Mfa/Setup` | MFA setup |
| POST | `/ellenorzo/v3/sajat/Mfa/Enable` | MFA bekapcsolás |
| POST | `/ellenorzo/v3/sajat/Mfa/Disable` | MFA kikapcsolás |

---

## Diák (`/ellenorzo/v3/sajat/…`)

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET | `/TanuloAdatlap` | Diák profil |
| GET | `/OsztalyCsoportok` | Osztályok |
| GET | `/Ertekelesek` | Jegyek |
| GET | `/Ertekelesek/Atlagok/OsztalyAtlagok` | Átlagok |
| GET | `/OrarendElemek` | Órarend (olvasás) |
| GET | `/Mulasztasok` | Mulasztások |
| GET | `/HaziFeladatok` | Házi feladatok |
| GET | `/BejelentettSzamonkeresek` | Dolgozatok |
| GET | `/Feljegyzesek` | Feljegyzések |
| GET | `/FaliujsagElemek` | Faliújság |
| GET | `/dktapi/intezmenyek/munkaterek/tanulok` | DKT munkaterek |

---

## Tanár / OF (`/naplo/v3/sajat/…`)

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET | `/TanarAdatlap` | Tanár profil |
| GET | `/OsztalyCsoportok` | Osztálycsoportok |
| GET | `/Tanulok` | Tanulók listája |
| GET | `/Ertekelesek` | Beírt jegyek |
| **POST** | `/Ertekelesek` | Jegy beírása |
| **DELETE** | `/Ertekelesek?uid=` | Jegy törlése |
| GET | `/OrarendElemek` | Órarend lista |
| **POST** | `/OrarendElemek` | Új órarendi elem |
| **PUT** | `/OrarendElemek` | Órarendi elem módosítása |
| **DELETE** | `/OrarendElemek?uid=` | Órarendi elem törlése |
| GET | `/HaziFeladatok` | Házik |
| POST | `/HaziFeladatok` | Házi felvitel |
| DELETE | `/HaziFeladatok?uid=` | Házi törlés |
| GET | `/Mulasztasok` | Mulasztások |
| POST | `/Mulasztasok` | Mulasztás rögzítés |
| DELETE | `/Mulasztasok?uid=` | Mulasztás törlés |
| GET | `/BejelentettSzamonkeresek` | Dolgozatok |

### Osztályfőnök

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET/POST | `/Of/Diakok` | OF diáklista / új diák |
| GET/POST | `/Of/Users` | Diák login user |

---

### POST `/naplo/v3/sajat/Ertekelesek` – jegy

```json
{
  "TantargyUid": "string",
  "Tema": "Írásbeli témazáró",
  "Megjegyzes": "Opcionális megjegyzés",
  "SzamErtek": 5,
  "SzovegesErtek": "Jeles",
  "SulySzazalekErteke": 100,
  "Tipus": { "Uid": "1", "Nev": "Írásbeli", "Leiras": "Írásbeli felelet" },
  "OsztalyCsoportUid": "string",
  "TanuloUid": "string"
}
```

### POST/PUT `/naplo/v3/sajat/OrarendElemek` – órarend

```json
{
  "Uid": "csak PUT-nál kötelező",
  "Datum": "2026-10-10",
  "Oraszam": 1,
  "KezdetIdopont": "08:00",
  "VegIdopont": "08:45",
  "TantargyUid": "string",
  "TantargyNev": "Matematika",
  "OsztalyCsoportUid": "string",
  "OsztalyCsoportNev": "9.A",
  "TeremNeve": "12.",
  "Tema": "Másodfokú egyenletek",
  "Nev": "Matematika"
}
```


### POST `/naplo/v3/sajat/Orarend/OraNaplozas` – óra naplózás

```json
{
  "OrarendElemUid": "L-…",
  "Datum": "2026-10-10",
  "Tema": "Másodfokú egyenletek",
  "OsztalyCsoportUid": "…",
  "Jelenletek": [
    { "TanuloUid": "…", "Tipus": "jelen", "KesesPercben": 0 },
    { "TanuloUid": "…", "Tipus": "hianyzas", "KesesPercben": 0 },
    { "TanuloUid": "…", "Tipus": "keses", "KesesPercben": 10 }
  ]
}
```

Válasz: `{ ok, orarendElemUid, tema, mulasztasok, mulasztasDb }`

### POST/DELETE `/naplo/v3/sajat/Orarend/OraNaplozasTorles` – napló/mulasztás törlés

Query: `?uid=` vagy body `{ "Uid": "…" }`

### POST `/naplo/v3/sajat/Mulasztasok` – mulasztás (közvetlen)

```json
{
  "TanuloUid": "string",
  "Datum": "2026-10-10",
  "KesesPercben": 0,
  "Tipus": { "Uid": "1", "Nev": "Hiányzás", "Leiras": "Hiányzás" },
  "OsztalyCsoportUid": "string"
}
```

---

## Digitális dokumentumok

Env / secrets: `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_DIR`

| Metódus | Útvonal | Ki | Leírás |
|--------|---------|-----|--------|
| GET | `/api/digidocs` | bejelentkezett | Lista |
| POST | `/api/digidocs` | tanár/OF | Feltöltés (`multipart`: `file`, `name?`, `note?`) max ~10 MB |
| GET | `/api/digidocs/{név}` | bejelentkezett | Letöltés |
| DELETE | `/api/digidocs/{név}` | tanár/OF | Törlés |

---

## Kérdőívek

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET | `/api/surveys` | Lista |
| GET | `/api/surveys/{id}` | Egy kérdőív |
| GET | `/integration-kretamobile-api/v1/kerdoivek` | Ugyanaz (mobil path) |
| GET | `/integration-kretamobile-api/v1/kerdoivek/{id}` | Ugyanaz |

Auth: `requireAuthSession` – érvényes Bearer token kell.

---

## e-Ügyintézés

Base: `/integration-kretamobile-api/v1/kommunikacio`

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET | `…/postaladaelemek/sajat` |(Több) Üzenet lekérés |
| GET | `…/postaladaelemek/{id}` |(Egy) Üzenet lekérés |
| POST | `…/uzenetek/olvasott` | Olvasottnak jelöl |
| POST | `…/uzenetek` | Üzenet küldés |

---

## DKT

Base: `/dktapi`

| Metódus | Útvonal | Leírás |
|---------|---------|--------|
| GET | /intezmenyek/munkaterek/tanulok | Tanulók lekérése(?) (Fogalmam nincs hogy mit csinál de azért van) |
| GET | /orak/oraifeladat | Órai feladatok lekérése |
| POST | /orak/hazifeladat/megoldasok/{haziFeladatId}/bekuldes | Házi feladat megoldásának beküldése |
| DELETE | /orak/hazifeladat/megoldasok/{haziFeladatId}/torles | Házi feladat megoldásának törlése |
| POST | /intezmenyek/munkaterek/tanulok/orak/tananyagok | Órai tananyagok lekérése |

## Egyéb

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| GET | `/health` | Healthcheck |
| POST | `/Account/Login` | Login helper |
| GET | `/admin/…` | Admin (külön auth) |

---

## Hibák

| Kód | Jelentés |
|-----|----------|
| 401 | Nincs / lejárt token |
| 403 | Nincs jogosultság (pl. digidoc feltöltés csak tanár) |
| 404 | Nincs ilyen erőforrás |
| 400 | Hibás body / hiányzó mező |
| 502/503 | FTP vagy külső szolgáltatás hiba |

---

## Frontend szerepkörök

| UI mappa | Tipikus API prefix |
|----------|-------------------|
| `diak/` | `/ellenorzo/v3/sajat/…` |
| `tanar/` | `/naplo/v3/sajat/…` |
| `osztalyfonok/` | `/naplo/…` + `/Of/…` |
| `eugyintezes/` | kommunikáció API |
| `dkt/` | DKT + local UI |

