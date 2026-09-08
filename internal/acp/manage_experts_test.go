package acp

import (
	"path/filepath"
	"testing"
)

func manageExpertDraft(name string) map[string]any {
	return map[string]any{
		"manifest": map[string]any{
			"schemaVersion": 1,
			"name":          name,
			"expertType":    "agent",
			"agentName":     "lead",
			"displayName":   map[string]any{"zh": "桌面主角团", "en": "Desktop Team"},
			"members":       []any{map[string]any{"id": "lead", "name": map[string]any{"zh": "主角", "en": "Lead"}, "role": "lead"}},
		},
		"agents": map[string]any{"lead": "---\nname: lead\n---\nYou are the lead.\n"},
	}
}

func TestManageExpertsGlobalDefaultAndProjectScope(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	workDir := t.TempDir()
	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, workDir)

	created := manageFixtureResult(t, callManageFixture(t, srv, output, 1, "mothx/manage/experts/create", map[string]any{
		"bundle": manageExpertDraft("desktop-global"),
	}))
	if created["scope"] != "global" {
		t.Fatalf("default scope = %#v, want global", created["scope"])
	}
	globalBundle, _ := created["bundle"].(map[string]any)
	if globalBundle["scope"] != "global" {
		t.Fatalf("global bundle = %#v", globalBundle)
	}

	projectDraft := manageExpertDraft("desktop-project")
	project := manageFixtureResult(t, callManageFixture(t, srv, output, 2, "mothx/manage/experts/create", map[string]any{
		"scope": "project", "cwd": workDir, "bundle": projectDraft,
	}))
	if project["scope"] != "project" || project["cwd"] != filepath.Clean(workDir) {
		t.Fatalf("project create = %#v", project)
	}

	listed := manageFixtureResult(t, callManageFixture(t, srv, output, 3, "mothx/manage/experts/list", map[string]any{
		"scope": "project", "cwd": workDir,
	}))
	items, _ := listed["experts"].([]any)
	found := false
	for _, item := range items {
		view, _ := item.(map[string]any)
		if view["name"] == "desktop-project" {
			found = true
		}
	}
	if !found {
		t.Fatalf("project expert missing from list: %#v", listed)
	}

	updatedDraft := manageExpertDraft("desktop-global")
	updatedDraft["manifest"].(map[string]any)["displayName"] = map[string]any{"zh": "已更新", "en": "Updated"}
	updated := manageFixtureResult(t, callManageFixture(t, srv, output, 4, "mothx/manage/experts/update", map[string]any{"bundle": updatedDraft}))
	updatedBundle, _ := updated["bundle"].(map[string]any)
	manifest, _ := updatedBundle["manifest"].(map[string]any)
	display, _ := manifest["displayName"].(map[string]any)
	if display["zh"] != "已更新" {
		t.Fatalf("updated bundle = %#v", updated)
	}

	removed := manageFixtureResult(t, callManageFixture(t, srv, output, 5, "mothx/manage/experts/delete", map[string]any{"name": "desktop-global"}))
	if removed["deleted"] != true || removed["scope"] != "global" {
		t.Fatalf("delete result = %#v", removed)
	}
}

func TestManageExpertsRejectsBuiltinScope(t *testing.T) {
	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, t.TempDir())
	code, _ := manageFixtureError(t, callManageFixture(t, srv, output, 1, "mothx/manage/experts/delete", map[string]any{
		"scope": "builtin", "name": "software-company",
	}))
	if code != "expert_invalid_request" {
		t.Fatalf("error code = %q, want expert_invalid_request", code)
	}
}
