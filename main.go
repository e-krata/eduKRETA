package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

//go:embed static
var staticFiles embed.FS

type Server struct {
	store *Store
	auth  *AuthStore
}

func main() {
	ctx := context.Background()

	// ============================================================
	// PostgreSQL
	// ============================================================

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL nincs beállítva")
	}

	db, err := NewDB(ctx, databaseURL)
	if err != nil {
		log.Fatalf("adatbázis inicializálása sikertelen: %v", err)
	}
	defer db.Close()
	log.Println("PostgreSQL kapcsolat létrejött")

	// ============================================================
	// Store + Auth
	// ============================================================

	store := NewStore(db)
	store.BootstrapMultiUser()

	auth := NewAuthStore("auth.json")

	server := &Server{
		store: store,
		auth:  auth,
	}

	// ============================================================
	// Router
	// ============================================================

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/health", handleHealth)

	// Intézménylista (login oldalhoz, auth nélkül)
	mux.HandleFunc("/api/intezmenyek", server.handleListInstitutions)

	// Authentication
	mux.HandleFunc("/Account/Login", server.handleAccountLogin)
	mux.HandleFunc("/ellenorzo-student/prod/oauthredirect", server.handleOauthRedirect)
	mux.HandleFunc("/connect/token", server.handleToken)

	// ============================================================
	// Student API (session-scoped)
	// ============================================================

	mux.HandleFunc("/ellenorzo/v3/sajat/TanuloAdatlap",
		server.requireAuthSession(server.handleGetStudentScoped))
	mux.HandleFunc("/ellenorzo/v3/sajat/OsztalyCsoportok",
		server.requireAuthSession(server.handleGetClassGroupsScoped))
	mux.HandleFunc("/ellenorzo/v3/sajat/FaliujsagElemek",
		server.requireAuthSession(server.handleGetNoticeBoard))
	mux.HandleFunc("/ellenorzo/v3/sajat/Feljegyzesek",
		server.requireAuthSession(server.handleGetInfoBoard))
	mux.HandleFunc("/ellenorzo/v3/sajat/Ertekelesek",
		server.requireAuthSession(server.handleGetGradesScoped))
	mux.HandleFunc("/ellenorzo/v3/sajat/Ertekelesek/Atlagok/OsztalyAtlagok",
		server.requireAuthSession(server.handleGetClassGroupAverages))
	mux.HandleFunc("/ellenorzo/v3/sajat/OrarendElemek",
		server.requireAuthSession(server.handleGetTimeTableScoped))
	mux.HandleFunc("/ellenorzo/v3/sajat/Mulasztasok",
		server.requireAuthSession(server.handleGetOmissionsScoped))
	mux.HandleFunc("/ellenorzo/v3/sajat/HaziFeladatok",
		server.requireAuthSession(server.handleGetHomeworkScoped))
	mux.HandleFunc("/ellenorzo/v3/sajat/BejelentettSzamonkeresek",
		server.requireAuthSession(server.handleGetTestsScoped))

	// DKT
	mux.HandleFunc("/dktapi/intezmenyek/munkaterek/tanulok",
		server.requireAuthSession(server.handleGetDktSubjects))
	mux.HandleFunc("/dktapi/orak/oraifeladat/",
        server.requireAuthSession(server.handleOraiFeladatLekeres))
	mux.HandleFunc("/dktapi/orak/hazifeladat/megoldasok/{haziFeladatId}/bekuldes",
	    server.requireAuthSession(server.handleHazifeladatMegoldasBekuldes))
	mux.HandleFunc("/dktapi/orak/hazifeladat/megoldasok/{haziFeladatId}/torles",
	    server.requireAuthSession(server.handleHazifeladatMegoldasTorles))
	mux.HandleFunc("/dktapi/intezmenyek/munkaterek/tanulok/orak/tananyagok",
	    server.requireAuthSession(server.handleDKTtananyagLekeres))


	// ============================================================
	// Teacher (Napló) API
	// ============================================================

	server.registerTeacherRoutes(mux)

	// ============================================================
	// Osztályfőnök (Of/Diakok, Of/Users) – of_role_patch.go
	// ============================================================

	server.registerOFRoutes(mux)

	// ============================================================
	// E-ügyintézés üzenetek (KRÉTA mobil API formátum)
	// ============================================================

	server.registerMessageRoutes(mux)

	server.registerMFARoutes(mux)

	server.registerSurveyRoutes(mux)

	// ============================================================
	// Admin
	// ============================================================

	server.registerAdminRoutes(mux)

	// Kapcsolódás / eAdmin / LEP / Covid / Faliújság
	server.registerKapcsolodasRoutes(mux)
	
	// ============================================================
	// Static (embed)
	// ============================================================

	staticContent, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("static könyvtár megnyitása sikertelen: %v", err)
	}
	mux.Handle("/", http.FileServer(http.FS(staticContent)))

	// ============================================================
	// HTTP server
	// ============================================================

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	addr := ":" + port

	log.Printf("ujkreta server listening on %s", addr)

	handler := cors(logRequests(mux))
	serverHTTP := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Fatal(serverHTTP.ListenAndServe())
}

// ============================================================
// CORS – engedélyezett frontend originök
// ============================================================

var allowedOrigins = map[string]bool{
	"https://puspus-dev.github.io": true,
	"https://e-krata.github.io":    true,
	"https://ekrata.ct.ws":         true,
	"http://localhost:3000":        true,
	"http://localhost:5173":        true,
	"http://127.0.0.1:3000":        true,
	"http://127.0.0.1:5173":        true,
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		allow := allowedOrigins[origin]
		// helyi fejlesztés: bármely localhost port
	if !allow && (strings.HasPrefix(origin, "http://localhost") ||
	strings.HasPrefix(origin, "http://127.0.0.1") ||
	strings.HasPrefix(origin, "capacitor://") ||
	strings.HasPrefix(origin, "ionic://")) {
	allow = true
}

		if allow && origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ============================================================
// HEALTH
// ============================================================

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ============================================================
// REQUEST LOGGING
// ============================================================

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s from %s", r.Method, r.URL.String(), r.RemoteAddr)
		next.ServeHTTP(w, r)
	})
}
