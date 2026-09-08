package expert

import (
	"os"
	"path/filepath"
	"testing"
)

func managedAgentDraft(name string) ManagedBundle {
	return ManagedBundle{
		Manifest: Manifest{
			SchemaVersion: SchemaVersion,
			Name:          name,
			ExpertType:    TypeAgent,
			AgentName:     "lead",
			DisplayName:   LocalizedText{Zh: "测试主角", En: "Test Lead"},
			Members: []MemberMeta{{
				ID: "lead", Name: LocalizedText{Zh: "主角", En: "Lead"}, Role: RoleLead,
			}},
		},
		Agents: map[string]string{"lead": "---\nname: lead\n---\nYou are the lead.\n"},
	}
}

func TestManagerGlobalCreateUpdateDelete(t *testing.T) {
	globalDir := filepath.Join(t.TempDir(), "experts")
	manager := &Manager{GlobalDir: globalDir}
	draft := managedAgentDraft("desktop-team")

	created, err := manager.Create(ScopeGlobal, draft)
	if err != nil {
		t.Fatal(err)
	}
	if created.Scope != ScopeGlobal || created.Manifest.Name != "desktop-team" {
		t.Fatalf("created = %#v", created)
	}
	if _, err := os.Stat(filepath.Join(globalDir, "desktop-team", manifestFileName)); err != nil {
		t.Fatalf("global bundle not published: %v", err)
	}

	draft.Manifest.DisplayName.Zh = "已修改主角团"
	updated, err := manager.Update(ScopeGlobal, draft)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Manifest.DisplayName.Zh != "已修改主角团" {
		t.Fatalf("updated display name = %q", updated.Manifest.DisplayName.Zh)
	}
	if err := manager.Delete(ScopeGlobal, "desktop-team"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(globalDir, "desktop-team")); !os.IsNotExist(err) {
		t.Fatalf("deleted bundle stat error = %v, want not exist", err)
	}
}

func TestManagerProjectScopeAndInvalidDraft(t *testing.T) {
	project := t.TempDir()
	manager := &Manager{ProjectDir: project, GlobalDir: filepath.Join(t.TempDir(), "experts")}
	draft := managedAgentDraft("project-team")
	if _, err := manager.Create(ScopeProject, draft); err != nil {
		t.Fatal(err)
	}
	projectPath := filepath.Join(project, ".mothx", "experts", "project-team", manifestFileName)
	if _, err := os.Stat(projectPath); err != nil {
		t.Fatalf("project bundle not published: %v", err)
	}

	invalid := managedAgentDraft("bad-team")
	invalid.Agents["lead"] = "---\nname: other\n---\nwrong identity\n"
	if _, err := manager.Create(ScopeGlobal, invalid); err == nil {
		t.Fatal("Create accepted invalid agent frontmatter")
	}
	if _, err := os.Stat(filepath.Join(manager.GlobalDir, "bad-team")); !os.IsNotExist(err) {
		t.Fatalf("invalid bundle was published, stat error = %v", err)
	}
}

func TestManagerRejectsBuiltinAndPreservesPrecedence(t *testing.T) {
	globalRoot := t.TempDir()
	t.Setenv("MOTHX_DIR", globalRoot)
	project := t.TempDir()
	manager := NewManager(project)

	if err := manager.Delete(Scope(SourceBuiltin), "software-company"); err == nil {
		t.Fatal("Delete accepted builtin scope")
	}
	global := managedAgentDraft("frontend-developer")
	global.Manifest.DisplayName.Zh = "全局覆盖"
	if _, err := manager.Create(ScopeGlobal, global); err != nil {
		t.Fatal(err)
	}
	projectDraft := managedAgentDraft("frontend-developer")
	projectDraft.Manifest.DisplayName.Zh = "项目覆盖"
	if _, err := manager.Create(ScopeProject, projectDraft); err != nil {
		t.Fatal(err)
	}

	for _, item := range manager.List() {
		if item.Name == "frontend-developer" {
			if item.Source != SourceProject || item.DisplayName.Zh != "项目覆盖" {
				t.Fatalf("precedence = %#v, want project override", item)
			}
			return
		}
	}
	t.Fatal("frontend-developer missing from effective list")
}
