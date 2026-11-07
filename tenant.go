package main

import (
	"net/http"
	"os"
	"strings"
)

// Multi-tenant URL:
//   Path:  /i/{intezmenyKod}/...     pl. /i/demo/ , /i/demo/admin/
//   Host:  {kod}.example.com         ha TENANT_BASE_DOMAIN=example.com
//
// A middleware levágja a /i/{kod} prefixet, és X-Edukreta-Institute headert állít.

const tenantHeader = "X-Edukreta-Institute"

func tenantMiddleware(next http.Handler) http.Handler {
	baseDomain := strings.ToLower(strings.TrimSpace(os.Getenv("TENANT_BASE_DOMAIN")))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		code := ""

		if strings.HasPrefix(r.URL.Path, "/i/") {
			rest := strings.TrimPrefix(r.URL.Path, "/i/")
			parts := strings.SplitN(rest, "/", 2)
			if len(parts) > 0 && parts[0] != "" && parts[0] != "api" {
				code = parts[0]
				if len(parts) == 1 || parts[1] == "" {
					// /i/demo → intézmény landing
					r.URL.Path = "/intezmeny/"
					r.Header.Set("X-Tenant-Landing", "1")
				} else {
					r.URL.Path = "/" + parts[1]
				}
			}
		}

		if code == "" && baseDomain != "" {
			host := r.Host
			if i := strings.Index(host, ":"); i >= 0 {
				host = host[:i]
			}
			host = strings.ToLower(host)
			suffix := "." + baseDomain
			if strings.HasSuffix(host, suffix) {
				sub := strings.TrimSuffix(host, suffix)
				if sub != "" && sub != "www" && !strings.Contains(sub, ".") {
					code = sub
				}
			}
		}

		if code != "" {
			r.Header.Set(tenantHeader, code)
			q := r.URL.Query()
			if q.Get("institute_code") == "" {
				q.Set("institute_code", code)
				r.URL.RawQuery = q.Encode()
			}
		}

		next.ServeHTTP(w, r)
	})
}

func instituteFromRequest(r *http.Request) string {
	if c := r.Header.Get(tenantHeader); c != "" {
		return c
	}
	return r.URL.Query().Get("institute_code")
}
