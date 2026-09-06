package expert

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

const validTeamManifest = `{
  "schemaVersion": 1,
  "name": "team-x",
  "expertType": "team",
  "agentName": "lead-x",
  "displayName": { "zh": "测试团队", "en": "Test Team" },
  "teamInfo": { "leadAgent": "lead-x", "memberAgents": ["worker-a", "worker-b"] },
  "members": [
    { "id": "lead-x", "name": { "zh": "领队", "en": "Lead L" }, "role": "lead" },
    { "id": "worker-a", "name": { "zh": "", "en": "Worker A" }, "role": "member" },
    { "id": "worker-b", "name": { "zh": "工人乙", "en": "Worker B" }, "role": "member" }
  ]
}`

const validAgentManifest = `{
  "schemaVersion": 1,
  "name": "agent-x",
  "expertType": "agent",
  "agentName": "solo",
  "displayName": { "zh": "单专家", "en": "Solo Expert" },
  "members": [ { "id": "solo", "name": { "zh": "独立", "en": "Solo" }, "role": "lead" } ]
}`

func teamFiles() map[string]string {
	return map[string]string{
		"expert.json": validTeamManifest,
		// lead frontmatter role intentionally "member": manifest must win.
		"agents/lead-x.md":   "---\nname: lead-x\ndescription: 领队人设\nrole: member\nemoji: 🎯\n---\n领队正文\n",
		"agents/worker-a.md": "---\nname: worker-a\ndescription: worker a persona\nrole: member\nemoji: 🔧\n---\nA body\n",
		"agents/worker-b.md": "---\nname: worker-b\nrole: member\n---\nB body\n",
	}
}

func agentFiles() map[string]string {
	return map[string]string{
		"expert.json": validAgentManifest,
		// frontmatter role intentionally "member": agentName must resolve to lead.
		"agents/solo.md": "---\nname: solo\ndescription: 独立专家\nrole: member\nemoji: 🖥️\n---\nsolo body\n",
	}
}

// writeBundle writes files (bundle-relative slash paths) under root/name and
// returns the bundle directory.
func writeBundle(t *testing.T, root, name string, files map[string]string) string {
	t.Helper()
	dir := filepath.Join(root, name)
	for rel, content := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatalf("mkdir for %s: %v", rel, err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}
	return dir
}

func TestLoadBundleValidTeam(t *testing.T) {
	files := teamFiles()
	files["agents/extra.md"] = "---\nrole: member\ndescription: 未被 manifest 引用的成员\n---\nextra body\n"
	files["skills/pack-skill/SKILL.md"] = "---\nname: pack-skill\n---\nskill body\n"
	dir := writeBundle(t, t.TempDir(), "team-x", files)

	b, err := LoadBundle(dir)
	if err != nil {
		t.Fatalf("LoadBundle: %v", err)
	}
	if b.Invalid {
		t.Fatalf("bundle invalid: %s", b.InvalidReason)
	}
	if b.Name != "team-x" {
		t.Errorf("Name = %q, want team-x", b.Name)
	}
	// 3 referenced + 1 unreferenced md all load into Defs.
	if len(b.Defs) != 4 {
		t.Fatalf("len(Defs) = %d, want 4: %v", len(b.Defs), defIDs(b))
	}
	lead := b.Defs["lead-x"]
	if lead.Role != RoleLead {
		t.Errorf("lead role = %q, want %q (manifest wins over frontmatter)", lead.Role, RoleLead)
	}
	if lead.DisplayName != "领队" {
		t.Errorf("lead DisplayName = %q, want 领队 (members[] name.zh)", lead.DisplayName)
	}
	if lead.Prompt != "领队正文" {
		t.Errorf("lead Prompt = %q", lead.Prompt)
	}
	if lead.Emoji != "🎯" || lead.Description != "领队人设" {
		t.Errorf("lead emoji/description = %q/%q", lead.Emoji, lead.Description)
	}
	for _, id := range []string{"worker-a", "worker-b"} {
		if b.Defs[id].Role != RoleMember {
			t.Errorf("%s role = %q, want member", id, b.Defs[id].Role)
		}
	}
	// name.en fallback (zh empty), then zh preference, then ID fallback.
	if b.Defs["worker-a"].DisplayName != "Worker A" {
		t.Errorf("worker-a DisplayName = %q, want Worker A (name.en fallback)", b.Defs["worker-a"].DisplayName)
	}
	if b.Defs["worker-b"].DisplayName != "工人乙" {
		t.Errorf("worker-b DisplayName = %q, want 工人乙", b.Defs["worker-b"].DisplayName)
	}
	if b.Defs["extra"].DisplayName != "extra" {
		t.Errorf("extra DisplayName = %q, want extra (ID fallback)", b.Defs["extra"].DisplayName)
	}
	// Unreferenced md falls back to frontmatter role; missing name filled from file name.
	if b.Defs["extra"].Role != RoleMember {
		t.Errorf("extra role = %q, want member (frontmatter fallback)", b.Defs["extra"].Role)
	}
	if b.Defs["extra"].Meta.Name != "extra" {
		t.Errorf("extra Meta.Name = %q, want extra", b.Defs["extra"].Meta.Name)
	}
	// skills/ exposed, not loaded.
	if b.SkillsDir == "" || !strings.HasSuffix(b.SkillsDir, "skills") {
		t.Errorf("SkillsDir = %q, want path ending in skills", b.SkillsDir)
	}
	if filepath.Join(dir, "skills") != b.SkillsDir {
		t.Errorf("SkillsDir = %q, want %q", b.SkillsDir, filepath.Join(dir, "skills"))
	}
	if b.SkillsFS != nil {
		t.Errorf("SkillsFS should be nil for OS-directory loads")
	}
}

func TestLoadBundleValidAgent(t *testing.T) {
	dir := writeBundle(t, t.TempDir(), "agent-x", agentFiles())
	b, err := LoadBundle(dir)
	if err != nil {
		t.Fatalf("LoadBundle: %v", err)
	}
	if b.Invalid {
		t.Fatalf("bundle invalid: %s", b.InvalidReason)
	}
	if b.Manifest.ExpertType != TypeAgent {
		t.Errorf("ExpertType = %q, want agent", b.Manifest.ExpertType)
	}
	solo := b.Defs["solo"]
	if solo == nil {
		t.Fatalf("Defs missing solo: %v", defIDs(b))
	}
	if solo.Role != RoleLead {
		t.Errorf("solo role = %q, want lead (agentName resolves to lead)", solo.Role)
	}
	if solo.DisplayName != "独立" {
		t.Errorf("solo DisplayName = %q, want 独立", solo.DisplayName)
	}
	if b.SkillsDir != "" {
		t.Errorf("SkillsDir = %q, want empty", b.SkillsDir)
	}
}

func TestLoadBundleInvalidCases(t *testing.T) {
	tests := []struct {
		name       string
		dirName    string // default team-x
		files      func() map[string]string
		mutate     func(t *testing.T, files map[string]string) map[string]string
		wantReason string
	}{
		{
			name:       "skill type rejected",
			files:      teamFiles,
			mutate:     replaceInManifest(`"expertType": "team"`, `"expertType": "skill"`),
			wantReason: "skills/skillhub",
		},
		{
			name:       "unknown expertType rejected",
			files:      teamFiles,
			mutate:     replaceInManifest(`"expertType": "team"`, `"expertType": "workflow"`),
			wantReason: "expertType",
		},
		{
			name:       "bad schemaVersion",
			files:      teamFiles,
			mutate:     replaceInManifest(`"schemaVersion": 1`, `"schemaVersion": 2`),
			wantReason: "schemaVersion",
		},
		{
			name:       "manifest name mismatch with directory",
			files:      teamFiles,
			mutate:     replaceInManifest(`"name": "team-x"`, `"name": "other-name"`),
			wantReason: "不一致",
		},
		{
			name:       "empty manifest name",
			files:      teamFiles,
			mutate:     replaceInManifest(`"name": "team-x"`, `"name": ""`),
			wantReason: "name",
		},
		{
			name:       "bad json",
			files:      teamFiles,
			mutate:     func(_ *testing.T, f map[string]string) map[string]string { f["expert.json"] = `{not json`; return f },
			wantReason: "expert.json",
		},
		{
			name:       "missing expert.json",
			files:      teamFiles,
			mutate:     func(_ *testing.T, f map[string]string) map[string]string { delete(f, "expert.json"); return f },
			wantReason: "expert.json",
		},
		{
			name:       "team missing teamInfo",
			files:      teamFiles,
			mutate:     replaceInManifest(`"teamInfo": { "leadAgent": "lead-x", "memberAgents": ["worker-a", "worker-b"] },`, ``),
			wantReason: "teamInfo",
		},
		{
			name:       "memberAgents contains leadAgent",
			files:      teamFiles,
			mutate:     replaceInManifest(`["worker-a", "worker-b"]`, `["lead-x", "worker-b"]`),
			wantReason: "leadAgent",
		},
		{
			name:       "memberAgents duplicated",
			files:      teamFiles,
			mutate:     replaceInManifest(`["worker-a", "worker-b"]`, `["worker-a", "worker-a"]`),
			wantReason: "重复",
		},
		{
			name:       "missing lead md",
			files:      teamFiles,
			mutate:     func(_ *testing.T, f map[string]string) map[string]string { delete(f, "agents/lead-x.md"); return f },
			wantReason: "lead-x.md",
		},
		{
			name:       "missing member md",
			files:      teamFiles,
			mutate:     func(_ *testing.T, f map[string]string) map[string]string { delete(f, "agents/worker-b.md"); return f },
			wantReason: "worker-b.md",
		},
		{
			name:       "agent type missing agentName",
			dirName:    "agent-x",
			files:      agentFiles,
			mutate:     replaceInManifest(`"agentName": "solo",`, ``),
			wantReason: "agentName",
		},
		{
			name:       "agent type missing md",
			dirName:    "agent-x",
			files:      agentFiles,
			mutate:     func(_ *testing.T, f map[string]string) map[string]string { delete(f, "agents/solo.md"); return f },
			wantReason: "solo.md",
		},
		{
			name:  "illegal mode",
			files: teamFiles,
			mutate: func(_ *testing.T, f map[string]string) map[string]string {
				f["agents/worker-a.md"] = "---\nname: worker-a\nmode: turbo\n---\nbody\n"
				return f
			},
			wantReason: "mode",
		},
		{
			name:  "negative max_iterations",
			files: teamFiles,
			mutate: func(_ *testing.T, f map[string]string) map[string]string {
				f["agents/worker-a.md"] = "---\nname: worker-a\nmax_iterations: -3\n---\nbody\n"
				return f
			},
			wantReason: "max_iterations",
		},
		{
			name:  "frontmatter name mismatch",
			files: teamFiles,
			mutate: func(_ *testing.T, f map[string]string) map[string]string {
				f["agents/worker-b.md"] = "---\nname: someone-else\n---\nbody\n"
				return f
			},
			wantReason: "文件名",
		},
		{
			name:  "unclosed frontmatter",
			files: teamFiles,
			mutate: func(_ *testing.T, f map[string]string) map[string]string {
				f["agents/worker-b.md"] = "---\nname: worker-b\nbody without closing\n"
				return f
			},
			wantReason: "frontmatter",
		},
		{
			name:  "non-integer max_iterations",
			files: teamFiles,
			mutate: func(_ *testing.T, f map[string]string) map[string]string {
				f["agents/worker-a.md"] = "---\nname: worker-a\nmax_iterations: many\n---\nbody\n"
				return f
			},
			wantReason: "max_iterations",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dirName := tt.dirName
			if dirName == "" {
				dirName = "team-x"
			}
			files := tt.files()
			if tt.mutate != nil {
				files = tt.mutate(t, files)
			}
			dir := writeBundle(t, t.TempDir(), dirName, files)
			b, err := LoadBundle(dir)
			if err != nil {
				t.Fatalf("LoadBundle returned IO error: %v", err)
			}
			if !b.Invalid {
				t.Fatalf("expected invalid bundle, got valid (defs=%v)", defIDs(b))
			}
			if !strings.Contains(b.InvalidReason, tt.wantReason) {
				t.Errorf("InvalidReason = %q, want substring %q", b.InvalidReason, tt.wantReason)
			}
			if b.Defs == nil {
				t.Errorf("invalid bundle should still carry an initialized Defs map")
			}
		})
	}
}

func TestLoadBundleFS(t *testing.T) {
	mapfs := fstest.MapFS{
		"pkg-a/expert.json":        &fstest.MapFile{Data: []byte(strings.ReplaceAll(validTeamManifest, "team-x", "pkg-a"))},
		"pkg-a/agents/lead-x.md":   &fstest.MapFile{Data: []byte("---\nname: lead-x\nrole: lead\n---\nlead body\n")},
		"pkg-a/agents/worker-a.md": &fstest.MapFile{Data: []byte("---\nname: worker-a\n---\na body\n")},
		"pkg-a/agents/worker-b.md": &fstest.MapFile{Data: []byte("---\nname: worker-b\n---\nb body\n")},
		"pkg-a/skills/s1/SKILL.md": &fstest.MapFile{Data: []byte("# s1\n")},
	}
	b, err := LoadBundleFS(mapfs, "pkg-a")
	if err != nil {
		t.Fatalf("LoadBundleFS: %v", err)
	}
	if b.Invalid {
		t.Fatalf("pkg-a invalid: %s", b.InvalidReason)
	}
	if b.Name != "pkg-a" {
		t.Errorf("Name = %q, want pkg-a", b.Name)
	}
	if b.Defs["lead-x"].Role != RoleLead {
		t.Errorf("lead-x role = %q, want lead", b.Defs["lead-x"].Role)
	}
	if b.SkillsDir != "pkg-a/skills" {
		t.Errorf("SkillsDir = %q, want pkg-a/skills", b.SkillsDir)
	}
	if b.SkillsFS == nil {
		t.Errorf("SkillsFS should be set for fs.FS loads")
	} else if _, err := fs.Stat(b.SkillsFS, b.SkillsDir); err != nil {
		t.Errorf("SkillsFS/SkillsDir not resolvable: %v", err)
	}

	// FS rooted at the bundle itself: name comes from the manifest.
	rooted := fstest.MapFS{
		"expert.json":    &fstest.MapFile{Data: []byte(validAgentManifest)},
		"agents/solo.md": &fstest.MapFile{Data: []byte("---\nname: solo\n---\nsolo body\n")},
	}
	rb, err := LoadBundleFS(rooted, ".")
	if err != nil {
		t.Fatalf("LoadBundleFS rooted: %v", err)
	}
	if rb.Invalid {
		t.Fatalf("rooted bundle invalid: %s", rb.InvalidReason)
	}
	if rb.Name != "agent-x" {
		t.Errorf("rooted Name = %q, want agent-x (manifest fallback)", rb.Name)
	}

	// Missing manifest is a validation failure, not an IO error.
	empty := fstest.MapFS{"agents/solo.md": &fstest.MapFile{Data: []byte("x")}}
	eb, err := LoadBundleFS(empty, "no-manifest")
	if err != nil {
		t.Fatalf("LoadBundleFS missing manifest: %v", err)
	}
	if !eb.Invalid || !strings.Contains(eb.InvalidReason, "expert.json") {
		t.Errorf("expected invalid with expert.json reason, got %+v", eb)
	}

	if _, err := LoadBundleFS(nil, "x"); err == nil {
		t.Errorf("expected error for nil fs.FS")
	}
}

func replaceInManifest(old, neu string) func(*testing.T, map[string]string) map[string]string {
	return func(t *testing.T, files map[string]string) map[string]string {
		t.Helper()
		manifest, ok := files["expert.json"]
		if !ok {
			return files
		}
		if !strings.Contains(manifest, old) {
			// Surface mutation typos loudly instead of silently passing.
			t.Fatalf("replaceInManifest: pattern not found: %s", old)
		}
		files["expert.json"] = strings.ReplaceAll(manifest, old, neu)
		return files
	}
}

func defIDs(b *Bundle) []string {
	ids := make([]string, 0, len(b.Defs))
	for id := range b.Defs {
		ids = append(ids, id)
	}
	return ids
}
