package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/uptrace/bun"
)

func TestOpenCachesBunConnectionAndRunsTransactions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "test.db")
	migrate := func(sqlDB *sql.DB) error {
		_, err := sqlDB.Exec(`CREATE TABLE IF NOT EXISTS db_test_values (value TEXT NOT NULL)`)
		return err
	}
	first, err := Open(path, migrate)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Open(filepath.Join(filepath.Dir(path), ".", filepath.Base(path)), migrate)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("Open returned separate connections for the same canonical path")
	}

	if err := Write(context.Background(), path, migrate, func(_ context.Context, tx bun.Tx) error {
		row := struct {
			bun.BaseModel `bun:"table:db_test_values"`
			Value         string `bun:"value"`
		}{Value: "bun"}
		_, err := tx.NewInsert().Model(&row).Exec(context.Background())
		return err
	}); err != nil {
		t.Fatal(err)
	}
	var value string
	if err := first.NewSelect().Table("db_test_values").Column("value").Limit(1).Scan(context.Background(), &value); err != nil {
		t.Fatal(err)
	}
	if value != "bun" {
		t.Fatalf("value = %q, want bun", value)
	}
	if err := CloseAll(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, migrate)
	if err != nil {
		t.Fatal(err)
	}
	if reopened == first {
		t.Fatal("CloseAll returned the closed cached connection")
	}
	if err := CloseAll(); err != nil {
		t.Fatal(err)
	}
}

// TestDSNForOSDisablesForeignKeys locks the canonical session database policy:
// the exported session DSN must never enable SQLite foreign key enforcement.
// Referential integrity for canonical session data lives in the repository
// layer, not the engine, so dormant REFERENCES clauses stay inactive.
func TestDSNForOSDisablesForeignKeys(t *testing.T) {
	for _, windows := range []bool{false, true} {
		dsn := DSNForOS(filepath.Join("sessions", "sessions.db"), windows)
		if strings.Contains(dsn, "foreign_keys") {
			t.Fatalf("session DSN must not enable foreign keys: %q", dsn)
		}
	}
}

// TestOpenForeignKeysOptionIsPerDatabase proves the opt-in boundary: the
// default Open keeps enforcement off (session policy) while OpenWithOptions
// enables it for a private, rebuildable derived store that relies on cascade
// pruning. Each connection reports its own PRAGMA foreign_keys state.
func TestOpenForeignKeysOptionIsPerDatabase(t *testing.T) {
	migrate := func(sqlDB *sql.DB) error {
		_, err := sqlDB.Exec(`CREATE TABLE IF NOT EXISTS fk_probe (id TEXT PRIMARY KEY)`)
		return err
	}
	sessionPath := filepath.Join(t.TempDir(), "session.db")
	sessionDB, err := Open(sessionPath, migrate)
	if err != nil {
		t.Fatal(err)
	}
	var sessionFK int
	if err := sessionDB.QueryRow("PRAGMA foreign_keys").Scan(&sessionFK); err != nil {
		t.Fatal(err)
	}
	if sessionFK != 0 {
		t.Fatalf("session database foreign_keys = %d, want 0", sessionFK)
	}

	knowledgePath := filepath.Join(t.TempDir(), "knowledge.db")
	knowledgeDB, err := OpenWithOptions(knowledgePath, migrate, Options{ForeignKeys: true})
	if err != nil {
		t.Fatal(err)
	}
	var knowledgeFK int
	if err := knowledgeDB.QueryRow("PRAGMA foreign_keys").Scan(&knowledgeFK); err != nil {
		t.Fatal(err)
	}
	if knowledgeFK != 1 {
		t.Fatalf("knowledge database foreign_keys = %d, want 1", knowledgeFK)
	}

	if err := CloseAll(); err != nil {
		t.Fatal(err)
	}
}
