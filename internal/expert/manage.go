package expert

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Scope identifies the writable expert layer. Builtin bundles deliberately do
// not have a scope: they are packaged with the binary and always read-only.
type Scope string

const (
	ScopeGlobal  Scope = SourceGlobal
	ScopeProject Scope = SourceProject
)

// ManagedBundle is the editable representation of an expert bundle. Agent
// values are complete agents/<id>.md source files (including frontmatter), so
// the Desktop only ever receives the same bundle format Runtime consumes.
type ManagedBundle struct {
	Scope    Scope             `json:"scope"`
	Manifest Manifest          `json:"manifest"`
	Agents   map[string]string `json:"agents"`
}

// Manager owns safe CRUD for the two user-writable bundle layers. ProjectDir
// is required only for project scope. GlobalDir is primarily injectable for
// tests; production callers should leave it empty.
type Manager struct {
	ProjectDir string
	GlobalDir  string
}

func NewManager(projectDir string) *Manager {
	return &Manager{ProjectDir: projectDir}
}

// List returns the effective, shadow-resolved catalog used by SessionRuntime.
func (m *Manager) List() []Summary {
	return (&Center{ProjectDir: m.ProjectDir}).List()
}

// ListScope returns bundles physically present in one writable layer. It is
// useful for management UIs that need to expose a global bundle shadowed by a
// project bundle without weakening the Runtime's precedence rules.
func (m *Manager) ListScope(scope Scope) ([]Summary, error) {
	dir, err := m.scopeDir(scope)
	if err != nil {
		return nil, err
	}
	items := listOSLayer(dir, string(scope))
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	return items, nil
}

// Get reads a bundle from exactly the requested writable layer. It never
// falls through to an identically named bundle in a lower-priority layer.
func (m *Manager) Get(scope Scope, name string) (*ManagedBundle, error) {
	if err := validateBundleName(name); err != nil {
		return nil, err
	}
	dir, err := m.scopeDir(scope)
	if err != nil {
		return nil, err
	}
	bundleDir := filepath.Join(dir, name)
	if !isFile(filepath.Join(bundleDir, manifestFileName)) {
		return nil, fmt.Errorf("%s expert %q not found", scope, name)
	}
	bundle, err := LoadBundle(bundleDir)
	if err != nil {
		return nil, err
	}
	if bundle.Invalid {
		return nil, fmt.Errorf("expert bundle %q is invalid: %s", name, bundle.InvalidReason)
	}
	agents, err := readAgentSources(bundleDir)
	if err != nil {
		return nil, err
	}
	return &ManagedBundle{Scope: scope, Manifest: bundle.Manifest, Agents: agents}, nil
}

// Create validates and atomically publishes a new bundle. A name already in
// the selected user layer is an error even if it merely shadows a builtin.
func (m *Manager) Create(scope Scope, draft ManagedBundle) (*ManagedBundle, error) {
	name, dir, err := m.validateDraftScope(scope, draft)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
		return nil, fmt.Errorf("%s expert %q already exists", scope, name)
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("inspect expert %q: %w", name, err)
	}
	if err := m.publish(dir, name, draft, false); err != nil {
		return nil, err
	}
	return m.Get(scope, name)
}

// Update replaces exactly one existing global/project bundle. Builtins cannot
// be updated because no writable scope resolves to the embedded filesystem.
func (m *Manager) Update(scope Scope, draft ManagedBundle) (*ManagedBundle, error) {
	name, dir, err := m.validateDraftScope(scope, draft)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(filepath.Join(dir, name))
	if errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("%s expert %q not found", scope, name)
	}
	if err != nil {
		return nil, fmt.Errorf("inspect expert %q: %w", name, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s expert %q is not a directory", scope, name)
	}
	if err := m.publish(dir, name, draft, true); err != nil {
		return nil, err
	}
	return m.Get(scope, name)
}

// Delete removes exactly one user-owned bundle directory. A caller must name
// a writable scope; attempting to delete a builtin is rejected by scopeDir.
func (m *Manager) Delete(scope Scope, name string) error {
	if err := validateBundleName(name); err != nil {
		return err
	}
	dir, err := m.scopeDir(scope)
	if err != nil {
		return err
	}
	target := filepath.Join(dir, name)
	info, err := os.Stat(target)
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%s expert %q not found", scope, name)
	}
	if err != nil {
		return fmt.Errorf("inspect expert %q: %w", name, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s expert %q is not a directory", scope, name)
	}
	return os.RemoveAll(target)
}

func (m *Manager) scopeDir(scope Scope) (string, error) {
	switch scope {
	case ScopeGlobal:
		if strings.TrimSpace(m.GlobalDir) != "" {
			return filepath.Clean(m.GlobalDir), nil
		}
		return GlobalExpertsDir(), nil
	case ScopeProject:
		dir := (&Center{ProjectDir: m.ProjectDir}).ProjectExpertsDir()
		if dir == "" {
			return "", errors.New("project scope requires an absolute workspace directory")
		}
		return dir, nil
	default:
		return "", fmt.Errorf("expert scope %q is not writable; builtin experts are read-only", scope)
	}
}

func (m *Manager) validateDraftScope(scope Scope, draft ManagedBundle) (string, string, error) {
	if draft.Scope != "" && draft.Scope != scope {
		return "", "", fmt.Errorf("bundle scope %q does not match requested scope %q", draft.Scope, scope)
	}
	name := strings.TrimSpace(draft.Manifest.Name)
	if err := validateBundleName(name); err != nil {
		return "", "", err
	}
	dir, err := m.scopeDir(scope)
	if err != nil {
		return "", "", err
	}
	return name, dir, nil
}

func readAgentSources(bundleDir string) (map[string]string, error) {
	entries, err := os.ReadDir(filepath.Join(bundleDir, agentsDirName))
	if err != nil {
		return nil, fmt.Errorf("read agents directory: %w", err)
	}
	agents := make(map[string]string)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".md")
		if err := validateAgentID(id); err != nil {
			return nil, err
		}
		data, err := os.ReadFile(filepath.Join(bundleDir, agentsDirName, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read agent %q: %w", id, err)
		}
		agents[id] = string(data)
	}
	return agents, nil
}

func validateAgentID(id string) error {
	if strings.TrimSpace(id) == "" || id != filepath.Base(id) || strings.ContainsAny(id, `/\\`) || id == "." || id == ".." {
		return fmt.Errorf("invalid agent id %q", id)
	}
	return nil
}

func (m *Manager) publish(parent, name string, draft ManagedBundle, replace bool) error {
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("create experts directory: %w", err)
	}
	tmpRoot, err := os.MkdirTemp(parent, ".expert-write-")
	if err != nil {
		return fmt.Errorf("create expert staging directory: %w", err)
	}
	defer os.RemoveAll(tmpRoot)
	staged := filepath.Join(tmpRoot, name) // its basename must match manifest.name for LoadBundle.
	if err := writeManagedBundle(staged, draft); err != nil {
		return err
	}
	validated, err := LoadBundle(staged)
	if err != nil {
		return err
	}
	if validated.Invalid {
		return fmt.Errorf("expert bundle is invalid: %s", validated.InvalidReason)
	}
	target := filepath.Join(parent, name)
	if !replace {
		if err := os.Rename(staged, target); err != nil {
			return fmt.Errorf("publish expert bundle: %w", err)
		}
		return nil
	}
	backup := filepath.Join(tmpRoot, ".previous")
	if err := os.Rename(target, backup); err != nil {
		return fmt.Errorf("stage previous expert bundle: %w", err)
	}
	if err := os.Rename(staged, target); err != nil {
		_ = os.Rename(backup, target)
		return fmt.Errorf("publish expert bundle: %w", err)
	}
	return nil
}

func writeManagedBundle(dir string, draft ManagedBundle) error {
	if err := os.MkdirAll(filepath.Join(dir, agentsDirName), 0o755); err != nil {
		return fmt.Errorf("create agents directory: %w", err)
	}
	data, err := json.MarshalIndent(draft.Manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode expert manifest: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, manifestFileName), append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write expert manifest: %w", err)
	}
	for id, source := range draft.Agents {
		if err := validateAgentID(id); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, agentsDirName, id+".md"), []byte(source), 0o600); err != nil {
			return fmt.Errorf("write agent %q: %w", id, err)
		}
	}
	return nil
}
