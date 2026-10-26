# ÚjKréta szerver bővítés – telepítés a GitHub repóba

Repo: https://github.com/puspus-dev/ujkreta

## 1. Másold a gyökérbe (package main mellett)

```
context.go
auth_patch.go
multiuser_store.go
student_api.go
teacher.go
teacher_store.go
seed_teacher.go
types_patch.go          ← emlékeztető, nem muszáj fordítani
schema_multiuser.sql
schema_teacher.sql
```

## 2. Static

```
static/admin/index.html   → új admin UI
static/tanar/index.html   → tanár UI
```

## 3. schema.sql végére told be

A `schema_multiuser.sql` **és** `schema_teacher.sql` tartalmát  
(vagy futtasd mindkettőt migrációként).

Fontos oszlopok / táblák:
- `users.role`
- `students`, `teachers`
- `grades.student_uid`, `omissions.student_uid`
- `kreta_store.teacher`

## 4. store.go – struct mezők

```go
// User
Role string `json:"role"`

// Grade
TanuloUid string `json:"TanuloUid,omitempty"`

// Omission
TanuloUid string `json:"TanuloUid,omitempty"`
```

A meglévő `GetUserByUsername`-t **cseréld** a `multiuser_store.go` változatra  
(vagy nevezd át az egyiket, hogy ne legyen duplicate symbol).

Ha fordítási ütközés van:
- töröld a régi `GetUserByUsername` + `CreateUser` body role nélkül,  
  vagy nevezd a multiuserest másképp és hívd azt.

## 5. auth.go

```go
type sessionInfo struct {
	InstituteCode string `json:"instituteCode"`
	UserID        string `json:"userId"`
	Username      string `json:"username"`
	Role          string `json:"role"` // ÚJ
}
```

- Add hozzá a `getSession` metódust (`auth_patch.go`).
- Password grant: töltsd a `Role`-t a userből.
- `buildIdToken`: role paraméter (`buildIdTokenWithRole`).

## 6. main.go – route-ok

Diák API (scoped):

```go
mux.HandleFunc("/ellenorzo/v3/sajat/TanuloAdatlap",
	server.requireAuthSession(server.handleGetStudentScoped))
mux.HandleFunc("/ellenorzo/v3/sajat/Ertekelesek",
	server.requireAuthSession(server.handleGetGradesScoped))
mux.HandleFunc("/ellenorzo/v3/sajat/Mulasztasok",
	server.requireAuthSession(server.handleGetOmissionsScoped))
mux.HandleFunc("/ellenorzo/v3/sajat/HaziFeladatok",
	server.requireAuthSession(server.handleGetHomeworkScoped))
mux.HandleFunc("/ellenorzo/v3/sajat/OrarendElemek",
	server.requireAuthSession(server.handleGetTimeTableScoped))
mux.HandleFunc("/ellenorzo/v3/sajat/BejelentettSzamonkeresek",
	server.requireAuthSession(server.handleGetTestsScoped))
mux.HandleFunc("/ellenorzo/v3/sajat/OsztalyCsoportok",
	server.requireAuthSession(server.handleGetClassGroupsScoped))
```

Tanár:

```go
server.registerTeacherRoutes(mux)
```

Admin (registerAdminRoutes-ban):

```go
mux.HandleFunc("/admin/teacher", s.requireAdmin(s.handleAdminTeacher))
```

## 7. seed.go / ensureSeeded végén

```go
// minden Grade/Omission: TanuloUid: "100"
s.MigrateSingletonStudent()
s.EnsureDefaultUsers()
s.SetTeacher(seedTeacher())
```

## 8. auth.go handleToken – username mező

A Flutter `username` + `userName` mezőt is küldhet.  
Fogadd el mindkettőt:

```go
username := r.FormValue("username")
if username == "" {
	username = r.FormValue("userName")
}
```

## 9. Render env

```
DATABASE_URL=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
PORT=10000
```

Deploy után **ne** nyomj feleslegesen Reset-et, ha már van éles adat.

## Userek (seed)

| user | jelszó | role |
|------|--------|------|
| student | student | Tanulo |
| teacher | teacher | Tanar |

## Teszt

```bash
curl -s -X POST https://edukreta.onrender.com/connect/token \
  -d 'grant_type=password&username=student&password=student'

TOKEN=...
curl -s -H "Authorization: Bearer $TOKEN" \
  https://edukreta.onrender.com/ellenorzo/v3/sajat/TanuloAdatlap
```

Admin UI: `/admin/` (static) vagy a régi admin + `/static/admin/index.html`
