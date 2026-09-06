package acp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeManageServeConfig(t *testing.T, configDir, data string) {
	t.Helper()
	path := filepath.Join(configDir, "serve.json")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
}

func readManageServeConfig(t *testing.T, configDir string) map[string]json.RawMessage {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(configDir, "serve.json"))
	if err != nil {
		t.Fatal(err)
	}
	raw := map[string]json.RawMessage{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("parse serve.json: %v", err)
	}
	return raw
}

func TestManageServeConfigGetIsSecretFree(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{
  "api": {
    "listen": "0.0.0.0:7872",
    "auth": {"enabled": true, "tokens": ["sk-secret-token"]},
    "cors": {"enabled": true, "allowOrigins": ["https://example.com"]}
  },
  "channels": {
    "wechat": {"enabled": true, "cred_path": "/secret/cred.json"},
    "feishu": {"enabled": false, "app_id": "id", "app_secret": "secret"}
  },
  "features": {"webUI": true, "openAIAPI": true, "cron": true, "memory": true}
}`)

	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, configDir)
	result := manageFixtureResult(t, callManageFixture(t, srv, output, 1, "mothx/manage/serve/get", map[string]any{}))

	api, ok := result["api"].(map[string]any)
	if !ok {
		t.Fatalf("api view missing: %#v", result)
	}
	if api["listen"] != "0.0.0.0:7872" {
		t.Fatalf("listen = %#v, want 0.0.0.0:7872", api["listen"])
	}
	if _, ok := api["auth"]; ok {
		t.Fatalf("auth must not be projected: %#v", api)
	}
	if _, ok := api["cors"]; ok {
		t.Fatalf("cors must not be projected: %#v", api)
	}

	features, ok := result["features"].(map[string]any)
	if !ok {
		t.Fatalf("features view missing: %#v", result)
	}
	if features["webUI"] != true || features["openAIAPI"] != true || features["cron"] != true || features["memory"] != true {
		t.Fatalf("features = %#v", features)
	}
	if _, ok := result["channels"]; ok {
		t.Fatalf("channels must not be projected: %#v", result)
	}

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"sk-secret-token", "/secret/cred.json", "allowOrigins", "https://example.com"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("serve config view leaks secret/unsafe field %q: %s", secret, raw)
		}
	}
}

func TestManageServeConfigPatchRoundTripKeepsSecrets(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{
  "api": {
    "listen": "127.0.0.1:7872",
    "auth": {"enabled": true, "tokens": ["sk-keep-me"]}
  },
  "features": {"webUI": true, "openAIAPI": true, "cron": true, "memory": true}
}`)

	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, configDir)
	patch := map[string]any{
		"api": map[string]any{
			"listen":                "127.0.0.1:7873",
			"defaultMode":           "agent",
			"defaultThinkingLevel":  "high",
			"enableSubAgents":       true,
			"enableDelegate":        true,
			"enableWorkflows":       true,
			"enableWebSearch":       true,
			"enableBrowser":         true,
			"enableA2AMaster":       true,
			"toolVisibility":        map[string]any{"mode": "sse_event", "detail": "expanded"},
			"systemPromptMode":      "ignore",
			"requestTimeoutSeconds": 3600,
			"maxConcurrentRequests": 16,
			"logLevel":              "debug",
		},
		"features": map[string]any{
			"webUI":      false,
			"openAIAPI":  false,
			"multiAgent": true,
			"cron":       false,
			"memory":     true,
		},
		"webUI":    map[string]any{"enabled": false, "dir": "ui/dist-new"},
		"cron":     map[string]any{"enabled": false, "interval": 60},
		"memory":   map[string]any{"enabled": true, "path": "/tmp/memory.md"},
		"security": map[string]any{"smartApprovals": false},
		"agent": map[string]any{
			"maxTurns":                 50,
			"budgetPressure":           false,
			"contextPressure":          false,
			"budgetPressureThreshold":  0.3,
			"contextPressureThreshold": 0.6,
			"runStaleTimeoutSeconds":   300,
			"runMaxDurationSeconds":    7200,
			"backgroundRunMaxSecs":     18000,
		},
		"lobsterMode": true,
	}
	result := manageFixtureResult(t, callManageFixture(t, srv, output, 1, "mothx/manage/serve/patch", map[string]any{"patch": patch}))

	if result["api"].(map[string]any)["listen"] != "127.0.0.1:7873" {
		t.Fatalf("listen not updated: %#v", result["api"])
	}
	if result["features"].(map[string]any)["webUI"] != false {
		t.Fatalf("features.webUI not updated: %#v", result["features"])
	}
	if result["webUI"].(map[string]any)["enabled"] != false {
		t.Fatalf("webUI.enabled not updated: %#v", result["webUI"])
	}
	if result["features"].(map[string]any)["multiAgent"] != true || result["api"].(map[string]any)["enableSubAgents"] != true {
		t.Fatalf("multiAgent/enableSubAgents not synced: %#v / %#v", result["features"], result["api"])
	}
	if result["cron"].(map[string]any)["interval"] != float64(60) {
		t.Fatalf("cron.interval not updated: %#v", result["cron"])
	}

	// Secrets on disk must survive and patch must be reflected at top-level.
	raw := readManageServeConfig(t, configDir)
	var listen string
	if err := json.Unmarshal(raw["listen"], &listen); err != nil {
		t.Fatal(err)
	}
	if listen != "127.0.0.1:7873" {
		t.Fatalf("listen on disk = %q, want 127.0.0.1:7873", listen)
	}
	authRaw := map[string]json.RawMessage{}
	if err := json.Unmarshal(raw["auth"], &authRaw); err != nil {
		t.Fatal(err)
	}
	tokensRaw := authRaw["tokens"]
	var tokens []string
	if err := json.Unmarshal(tokensRaw, &tokens); err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 1 || tokens[0] != "sk-keep-me" {
		t.Fatalf("auth tokens not preserved: %#v", tokens)
	}

	// GET returns the same updated view.
	output.Reset()
	result2 := manageFixtureResult(t, callManageFixture(t, srv, output, 2, "mothx/manage/serve/get", map[string]any{}))
	if result2["api"].(map[string]any)["listen"] != "127.0.0.1:7873" {
		t.Fatalf("GET did not reflect patch: %#v", result2["api"])
	}
}

func TestManageServeConfigPatchRejectsUnsafeAndInvalidFields(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{"api":{"listen":"127.0.0.1:7872"}}`)

	cases := []struct {
		name  string
		patch map[string]any
		want  string
	}{
		{
			name:  "api.auth.tokens",
			patch: map[string]any{"api": map[string]any{"auth": map[string]any{"tokens": []string{"x"}}}},
			want:  "serve_field_not_allowed",
		},
		{
			name:  "api.cors.allowOrigins",
			patch: map[string]any{"api": map[string]any{"cors": map[string]any{"allowOrigins": []string{"*"}}}},
			want:  "serve_field_not_allowed",
		},
		{
			name:  "channels.wechat.credPath",
			patch: map[string]any{"channels": map[string]any{"wechat": map[string]any{"credPath": "x"}}},
			want:  "serve_field_not_allowed",
		},
		{
			name:  "unknown top-level",
			patch: map[string]any{"unknown": true},
			want:  "serve_field_not_allowed",
		},
		{
			name:  "null nested section",
			patch: map[string]any{"api": nil},
			want:  "serve_field_invalid",
		},
		{
			name:  "empty nested section",
			patch: map[string]any{"features": map[string]any{}},
			want:  "serve_field_invalid",
		},
		{
			name:  "features.wechat",
			patch: map[string]any{"features": map[string]any{"wechat": true}},
			want:  "serve_field_not_allowed",
		},
		{
			name:  "invalid defaultMode",
			patch: map[string]any{"api": map[string]any{"defaultMode": "turbo"}},
			want:  "serve_field_invalid",
		},
		{
			name:  "invalid thinkingLevel",
			patch: map[string]any{"api": map[string]any{"defaultThinkingLevel": "mega"}},
			want:  "serve_field_invalid",
		},
		{
			name:  "invalid toolVisibility.mode",
			patch: map[string]any{"api": map[string]any{"toolVisibility": map[string]any{"mode": "unknown"}}},
			want:  "serve_field_invalid",
		},
		{
			name:  "invalid logLevel",
			patch: map[string]any{"api": map[string]any{"logLevel": "verbose"}},
			want:  "serve_field_invalid",
		},
		{
			name:  "negative maxConcurrentRequests",
			patch: map[string]any{"api": map[string]any{"maxConcurrentRequests": -1}},
			want:  "serve_field_invalid",
		},
		{
			name:  "threshold out of range",
			patch: map[string]any{"agent": map[string]any{"budgetPressureThreshold": 1.5}},
			want:  "serve_field_invalid",
		},
		{
			name:  "zero maxTurns",
			patch: map[string]any{"agent": map[string]any{"maxTurns": 0}},
			want:  "serve_field_invalid",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			output := &syncedBuffer{}
			srv := newManageFixtureServer(output, configDir)
			message := callManageFixture(t, srv, output, 1, "mothx/manage/serve/patch", map[string]any{"patch": tc.patch})
			code, _ := manageFixtureError(t, message)
			if code != tc.want {
				t.Fatalf("error code = %q, want %q; message = %#v", code, tc.want, message)
			}
			// File must remain unchanged.
			raw := readManageServeConfig(t, configDir)
			if strings.Contains(string(raw["api"]), "7873") {
				t.Fatal("serve.json was modified by a rejected patch")
			}
		})
	}
}

func TestManageServeConfigFeatureDiscovered(t *testing.T) {
	output := &syncedBuffer{}
	s := newPhase1FixtureServer(output)
	s.handleInitialize(rpcRequest{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "initialize", Params: json.RawMessage(`{"protocolVersion":1}`)})
	var response struct {
		Result struct {
			Meta map[string]any `json:"_meta"`
		} `json:"result"`
	}
	line := strings.TrimSpace(output.String())
	if err := json.Unmarshal([]byte(line), &response); err != nil {
		t.Fatalf("parse initialize response: %v", err)
	}
	namespace, _ := response.Result.Meta[mothxExtensionNamespace].(map[string]any)
	rawFeatures, _ := namespace["features"].([]any)
	features := make(map[string]bool, len(rawFeatures))
	for _, feature := range rawFeatures {
		if name, ok := feature.(string); ok {
			features[name] = true
		}
	}
	if !features["manageServeConfig"] {
		t.Fatalf("features = %#v, want manageServeConfig", features)
	}
}

func TestManageServeConfigSessionProjectionAndValidation(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{
  "api": {
    "listen": "127.0.0.1:7872",
    "session": {"idleTimeoutSeconds": 600, "maxSessions": 5}
  }
}`)

	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, configDir)

	// GET projects the current session limits safely.
	result := manageFixtureResult(t, callManageFixture(t, srv, output, 1, "mothx/manage/serve/get", map[string]any{}))
	api := result["api"].(map[string]any)
	session, ok := api["session"].(map[string]any)
	if !ok {
		t.Fatalf("api.session missing from view: %#v", api)
	}
	if session["idleTimeoutSeconds"] != float64(600) {
		t.Fatalf("idleTimeoutSeconds = %#v, want 600", session["idleTimeoutSeconds"])
	}
	if session["maxSessions"] != float64(5) {
		t.Fatalf("maxSessions = %#v, want 5", session["maxSessions"])
	}

	// PATCH accepts valid integer values, including maxSessions=0 (unlimited).
	result = manageFixtureResult(t, callManageFixture(t, srv, output, 2, "mothx/manage/serve/patch", map[string]any{
		"patch": map[string]any{
			"api": map[string]any{
				"session": map[string]any{"idleTimeoutSeconds": 1200, "maxSessions": 0},
			},
		},
	}))
	api = result["api"].(map[string]any)
	session = api["session"].(map[string]any)
	if session["idleTimeoutSeconds"] != float64(1200) || session["maxSessions"] != float64(0) {
		t.Fatalf("patched session = %#v", session)
	}

	raw := readManageServeConfig(t, configDir)
	var sessionRaw map[string]json.RawMessage
	if err := json.Unmarshal(raw["session"], &sessionRaw); err != nil {
		t.Fatal(err)
	}
	var idle, max int
	if err := json.Unmarshal(sessionRaw["idleTimeoutSeconds"], &idle); err != nil || idle != 1200 {
		t.Fatalf("idleTimeoutSeconds on disk = %d, want 1200", idle)
	}
	if err := json.Unmarshal(sessionRaw["maxSessions"], &max); err != nil || max != 0 {
		t.Fatalf("maxSessions on disk = %d, want 0", max)
	}

	invalidCases := []struct {
		name     string
		patch    map[string]any
		wantCode string
	}{
		{"null session section", map[string]any{"api": map[string]any{"session": nil}}, "serve_field_invalid"},
		{"empty session object", map[string]any{"api": map[string]any{"session": map[string]any{}}}, "serve_field_invalid"},
		{"unknown session field", map[string]any{"api": map[string]any{"session": map[string]any{"idleTimeoutSeconds": 1, "unknown": 1}}}, "serve_field_not_allowed"},
		{"idleTimeoutSeconds zero", map[string]any{"api": map[string]any{"session": map[string]any{"idleTimeoutSeconds": 0}}}, "serve_field_invalid"},
		{"idleTimeoutSeconds negative", map[string]any{"api": map[string]any{"session": map[string]any{"idleTimeoutSeconds": -1}}}, "serve_field_invalid"},
		{"maxSessions negative", map[string]any{"api": map[string]any{"session": map[string]any{"maxSessions": -1}}}, "serve_field_invalid"},
		{"idleTimeoutSeconds float", map[string]any{"api": map[string]any{"session": map[string]any{"idleTimeoutSeconds": 1.5}}}, "serve_field_invalid"},
		{"idleTimeoutSeconds string", map[string]any{"api": map[string]any{"session": map[string]any{"idleTimeoutSeconds": "fast"}}}, "serve_field_invalid"},
		{"maxSessions null", map[string]any{"api": map[string]any{"session": map[string]any{"maxSessions": nil}}}, "serve_field_invalid"},
	}

	for i, tc := range invalidCases {
		message := callManageFixture(t, srv, output, i+3, "mothx/manage/serve/patch", map[string]any{"patch": tc.patch})
		code, _ := manageFixtureError(t, message)
		if code != tc.wantCode {
			t.Fatalf("%s: error code = %q, want %s; message = %#v", tc.name, code, tc.wantCode, message)
		}
		// File must remain at the last valid values.
		raw := readManageServeConfig(t, configDir)
		var sessionRaw map[string]json.RawMessage
		if err := json.Unmarshal(raw["session"], &sessionRaw); err != nil {
			t.Fatal(err)
		}
		var idle, max int
		_ = json.Unmarshal(sessionRaw["idleTimeoutSeconds"], &idle)
		_ = json.Unmarshal(sessionRaw["maxSessions"], &max)
		if idle != 1200 || max != 0 {
			t.Fatalf("%s: serve.json was modified by rejected patch (idle=%d max=%d)", tc.name, idle, max)
		}
	}
}
