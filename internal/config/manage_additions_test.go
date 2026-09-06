package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Coverage of the additive Phase 3 management-plane schema fields:
// settings.skills.disabled and mcp.json per-server enabled.

func TestSkillsSettingsSparseRoundTrip(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)

	// A zero Settings must not grow a skills section.
	data, err := json.Marshal(&Settings{})
	if err != nil {
		t.Fatal(err)
	}
	raw := map[string]json.RawMessage{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["skills"]; ok {
		t.Fatalf("empty settings must omit skills: %s", data)
	}

	// Nil-safe accessor.
	var nilSettings *Settings
	if got := nilSettings.SkillsDisabled(); got != nil {
		t.Fatalf("nil settings SkillsDisabled = %#v", got)
	}
	if got := (&Settings{}).SkillsDisabled(); got != nil {
		t.Fatalf("empty settings SkillsDisabled = %#v", got)
	}

	if err := SaveGlobalSettingsPatch(map[string]any{"skills": map[string]any{"disabled": []string{"gen-skill"}}}); err != nil {
		t.Fatal(err)
	}
	sparse, err := LoadGlobalSettingsSparse()
	if err != nil {
		t.Fatal(err)
	}
	disabled := sparse.SkillsDisabled()
	if len(disabled) != 1 || disabled[0] != "gen-skill" {
		t.Fatalf("sparse SkillsDisabled = %#v", disabled)
	}
	effective, err := LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if got := effective.SkillsDisabled(); len(got) != 1 || got[0] != "gen-skill" {
		t.Fatalf("effective SkillsDisabled = %#v", got)
	}
	// The accessor copies, so mutations cannot reach the settings value.
	got := effective.SkillsDisabled()
	got[0] = "mutated"
	if effective.Skills.Disabled[0] != "gen-skill" {
		t.Fatal("SkillsDisabled must return a copy")
	}

	// Dropping the section keeps the file sparse.
	if err := SaveGlobalSettingsPatch(map[string]any{"skills": nil}); err != nil {
		t.Fatal(err)
	}
	fileData, err := os.ReadFile(GlobalSettingsPath())
	if err != nil {
		t.Fatal(err)
	}
	raw = map[string]json.RawMessage{}
	if err := json.Unmarshal(fileData, &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["skills"]; ok {
		t.Fatalf("skills section must be removable: %s", fileData)
	}
}

func TestMCPServerEnabledAdditiveField(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)

	// Legacy entries without the field stay enabled.
	legacy := MCPServer{Name: "legacy", Type: "stdio", Command: "/bin/legacy"}
	if !MCPServerEnabled(legacy) {
		t.Fatal("nil Enabled must default to enabled")
	}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	raw := map[string]json.RawMessage{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["enabled"]; ok {
		t.Fatalf("legacy entries must not grow an enabled key: %s", data)
	}

	disabled := false
	enabled := true
	if MCPServerEnabled(MCPServer{Name: "off", Enabled: &disabled}) {
		t.Fatal("explicit false must disable")
	}
	if !MCPServerEnabled(MCPServer{Name: "on", Enabled: &enabled}) {
		t.Fatal("explicit true must enable")
	}

	// The field survives a full save/load round trip.
	path := filepath.Join(configDir, "mcp.json")
	cfg := &MCPConfig{MCPServers: []MCPServer{
		{Name: "off", Type: "stdio", Command: "/bin/off", Enabled: &disabled},
		{Name: "on", Type: "stdio", Command: "/bin/on"},
	}}
	if err := SaveMCPConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadMCPConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.MCPServers) != 2 {
		t.Fatalf("loaded servers = %#v", loaded.MCPServers)
	}
	byName := map[string]MCPServer{}
	for _, srv := range loaded.MCPServers {
		byName[srv.Name] = srv
	}
	if byName["off"].Enabled == nil || *byName["off"].Enabled {
		t.Fatalf("off enabled = %#v", byName["off"].Enabled)
	}
	if byName["on"].Enabled != nil {
		t.Fatalf("on enabled = %#v, want nil", byName["on"].Enabled)
	}
	NormalizeMCPConfig(loaded)
	if MCPServerEnabled(byName["off"]) || !MCPServerEnabled(byName["on"]) {
		t.Fatal("normalization must not change enablement")
	}
}
