// Package db owns the process-wide SQLite connection lifecycle.
//
// Database access outside schema migrations should go through this package and
// a DAO. Only this package may open, configure, cache, or close the underlying
// SQLite connection; table operations belong to internal/dao.
package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"modernc.org/sqlite"
)

// Migrator initializes or validates a database. It is intentionally kept
// compatible with the existing session migration implementation; migrations
// are the one place where schema SQL is required.
type Migrator func(*sql.DB) error

var state = struct {
	sync.Mutex
	dbs map[string]*bun.DB
}{dbs: make(map[string]*bun.DB)}

// CanonicalPath returns the absolute, cleaned database path used as the cache
// key. Keeping this in one package prevents duplicate connections to the same
// SQLite file through differently spelled paths.
func CanonicalPath(path string) (string, error) {
	abs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", fmt.Errorf("resolve database path: %w", err)
	}
	return abs, nil
}

// Open returns the process-wide Bun connection for path. Callers must not
// close it; CloseAll owns the lifecycle.
func Open(path string, migrate Migrator) (*bun.DB, error) {
	canonical, err := CanonicalPath(path)
	if err != nil {
		return nil, err
	}
	state.Lock()
	defer state.Unlock()
	if existing := state.dbs[canonical]; existing != nil {
		return existing, nil
	}
	db, err := open(canonical, migrate)
	if err != nil {
		return nil, err
	}
	state.dbs[canonical] = db
	return db, nil
}

// OpenStandalone opens an uncached connection for callers that explicitly own
// its lifecycle, such as offline integrity checks.
func OpenStandalone(path string, migrate Migrator) (*bun.DB, error) {
	canonical, err := CanonicalPath(path)
	if err != nil {
		return nil, err
	}
	return open(canonical, migrate)
}

// Query runs a read operation through the process-wide connection.
func Query(path string, migrate Migrator, fn func(*bun.DB) error) error {
	connection, err := Open(path, migrate)
	if err != nil {
		return err
	}
	return fn(connection)
}

// Write runs a write operation in one Bun transaction.
func Write(ctx context.Context, path string, migrate Migrator, fn func(context.Context, bun.Tx) error) error {
	connection, err := Open(path, migrate)
	if err != nil {
		return err
	}
	return connection.RunInTx(ctx, nil, fn)
}

// CloseAll checkpoints and closes all process-owned connections.
func CloseAll() error {
	state.Lock()
	defer state.Unlock()
	var errs []error
	for path, connection := range state.dbs {
		var busy, logFrames, checkpointed int
		if err := connection.QueryRow("PRAGMA wal_checkpoint(PASSIVE)").Scan(&busy, &logFrames, &checkpointed); err != nil {
			errs = append(errs, fmt.Errorf("checkpoint %s: %w", path, err))
		}
		if err := connection.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close %s: %w", path, err))
		}
		delete(state.dbs, path)
	}
	return errors.Join(errs...)
}

// Close releases one process-owned SQLite connection. It is used by resource
// stores that own a whole database file and need to remove that exact file
// after their data has been deleted. General callers should normally keep
// using CloseAll at process shutdown.
func Close(path string) error {
	canonical, err := CanonicalPath(path)
	if err != nil {
		return err
	}
	state.Lock()
	connection := state.dbs[canonical]
	if connection != nil {
		delete(state.dbs, canonical)
	}
	state.Unlock()
	if connection == nil {
		return nil
	}
	var errs []error
	var busy, logFrames, checkpointed int
	if err := connection.QueryRow("PRAGMA wal_checkpoint(PASSIVE)").Scan(&busy, &logFrames, &checkpointed); err != nil {
		errs = append(errs, fmt.Errorf("checkpoint %s: %w", canonical, err))
	}
	if err := connection.Close(); err != nil {
		errs = append(errs, fmt.Errorf("close %s: %w", canonical, err))
	}
	return errors.Join(errs...)
}

func open(path string, migrate Migrator) (*bun.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}
	sqlDB, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("initialize sqlite connection: %w", err)
	}
	var integrity string
	if err := sqlDB.QueryRow("PRAGMA quick_check").Scan(&integrity); err != nil || integrity != "ok" {
		_ = sqlDB.Close()
		if err != nil {
			return nil, fmt.Errorf("run sqlite integrity check: %w", err)
		}
		return nil, fmt.Errorf("sqlite integrity check failed: %s", integrity)
	}
	if err := enableWAL(sqlDB); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	if migrate != nil {
		if err := migrate(sqlDB); err != nil {
			_ = sqlDB.Close()
			return nil, fmt.Errorf("apply database migration: %w", err)
		}
	}
	return bun.NewDB(sqlDB, sqlitedialect.New()), nil
}

func dsn(path string) string {
	return DSNForOS(path, runtime.GOOS == "windows")
}

// DSNForOS returns the configured SQLite file URI. It is exported for
// platform-specific integration tests.
func DSNForOS(path string, windows bool) string {
	uriPath := filepath.ToSlash(path)
	if windows && !strings.HasPrefix(uriPath, "/") {
		uriPath = "/" + uriPath
	}
	u := url.URL{Scheme: "file", Path: uriPath}
	q := u.Query()
	q.Add("_pragma", "busy_timeout(10000)")
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "synchronous(FULL)")
	q.Set("_txlock", "immediate")
	q.Set("_dqs", "false")
	u.RawQuery = q.Encode()
	return u.String()
}

func enableWAL(sqlDB *sql.DB) error {
	deadline := time.Now().Add(10 * time.Second)
	for {
		var mode string
		err := sqlDB.QueryRow("PRAGMA journal_mode=WAL").Scan(&mode)
		if err == nil {
			if strings.EqualFold(mode, "wal") {
				return nil
			}
			return fmt.Errorf("sqlite journal mode is %q, want WAL", mode)
		}
		var sqliteErr *sqlite.Error
		if !errors.As(err, &sqliteErr) || (sqliteErr.Code()&0xff != 5 && sqliteErr.Code()&0xff != 6) || time.Now().After(deadline) {
			return fmt.Errorf("enable sqlite WAL mode: %w", err)
		}
		time.Sleep(25 * time.Millisecond)
	}
}
