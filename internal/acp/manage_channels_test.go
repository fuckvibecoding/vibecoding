package acp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestManageChannelsGetIsSecretFree(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{
  "api": {"listen": "127.0.0.1:7872"},
  "channels": {
    "wechat": {"enabled": true, "cred_path": "/secret/cred.json", "work_dir": "/wechat/wd", "auto_typing": false},
    "feishu": {"enabled": false, "app_id": "app-id-secret", "app_secret": "app-secret-secret", "work_dir": "/feishu/wd"}
  },
  "features": {"wechat": true, "feishu": false}
}`)

	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, configDir)
	result := manageFixtureResult(t, callManageFixture(t, srv, output, 1, "mothx/manage/channels/get", map[string]any{}))

	wechat, ok := result["wechat"].(map[string]any)
	if !ok {
		t.Fatalf("wechat view missing: %#v", result)
	}
	if wechat["enabled"] != true || wechat["workDir"] != "/wechat/wd" || wechat["autoTyping"] != false || wechat["credentialConfigured"] != true {
		t.Fatalf("wechat view = %#v", wechat)
	}

	feishu, ok := result["feishu"].(map[string]any)
	if !ok {
		t.Fatalf("feishu view missing: %#v", result)
	}
	if feishu["enabled"] != false || feishu["workDir"] != "/feishu/wd" || feishu["appIDConfigured"] != true || feishu["appSecretConfigured"] != true {
		t.Fatalf("feishu view = %#v", feishu)
	}

	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"/secret/cred.json", "app-id-secret", "app-secret-secret", "cred_path", "app_id", "app_secret"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("channels view leaks secret %q: %s", secret, raw)
		}
	}
}

func TestManageChannelsPatchRoundTripPreservesAndClears(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{
  "api": {"listen": "127.0.0.1:7872"},
  "channels": {
    "wechat": {"enabled": false, "cred_path": "/old/cred.json", "work_dir": "/old/wechat", "auto_typing": true},
    "feishu": {"enabled": false, "app_id": "old-id", "app_secret": "old-secret", "work_dir": "/old/feishu"}
  }
}`)

	output := &syncedBuffer{}
	srv := newManageFixtureServer(output, configDir)
	patch := map[string]any{
		"wechat": map[string]any{
			"enabled":    true,
			"workDir":    "/new/wechat",
			"autoTyping": false,
			"credPath":   "/new/cred.json",
		},
		"feishu": map[string]any{
			"enabled":   true,
			"workDir":   "/new/feishu",
			"appId":     "new-id",
			"appSecret": "new-secret",
		},
	}
	result := manageFixtureResult(t, callManageFixture(t, srv, output, 1, "mothx/manage/channels/patch", map[string]any{"patch": patch}))

	wechat := result["wechat"].(map[string]any)
	if wechat["enabled"] != true || wechat["workDir"] != "/new/wechat" || wechat["autoTyping"] != false || wechat["credentialConfigured"] != true {
		t.Fatalf("wechat view after patch = %#v", wechat)
	}
	feishu := result["feishu"].(map[string]any)
	if feishu["enabled"] != true || feishu["workDir"] != "/new/feishu" || feishu["appIDConfigured"] != true || feishu["appSecretConfigured"] != true {
		t.Fatalf("feishu view after patch = %#v", feishu)
	}

	data, err := os.ReadFile(filepath.Join(configDir, "serve.json"))
	if err != nil {
		t.Fatal(err)
	}
	raw := map[string]json.RawMessage{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	var channels map[string]json.RawMessage
	if err := json.Unmarshal(raw["channels"], &channels); err != nil {
		t.Fatal(err)
	}
	var storedWechat map[string]json.RawMessage
	if err := json.Unmarshal(channels["wechat"], &storedWechat); err != nil {
		t.Fatal(err)
	}
	var storedFeishu map[string]json.RawMessage
	if err := json.Unmarshal(channels["feishu"], &storedFeishu); err != nil {
		t.Fatal(err)
	}
	if string(storedWechat["credPath"]) != `"/new/cred.json"` {
		t.Fatalf("wechat credPath on disk = %s", storedWechat["credPath"])
	}
	if string(storedFeishu["appId"]) != `"new-id"` || string(storedFeishu["appSecret"]) != `"new-secret"` {
		t.Fatalf("feishu secrets on disk = %s / %s", storedFeishu["appId"], storedFeishu["appSecret"])
	}

	var features map[string]json.RawMessage
	if err := json.Unmarshal(raw["features"], &features); err != nil {
		t.Fatal(err)
	}
	if string(features["wechat"]) != "true" || string(features["feishu"]) != "true" {
		t.Fatalf("features not synced: %s / %s", features["wechat"], features["feishu"])
	}

	// Clearing credentials preserves other fields.
	output.Reset()
	clearPatch := map[string]any{
		"wechat": map[string]any{"clearCredPath": true},
		"feishu": map[string]any{"clearAppId": true, "clearAppSecret": true},
	}
	result2 := manageFixtureResult(t, callManageFixture(t, srv, output, 2, "mothx/manage/channels/patch", map[string]any{"patch": clearPatch}))
	if result2["wechat"].(map[string]any)["credentialConfigured"] != false {
		t.Fatalf("wechat credential should be cleared: %#v", result2["wechat"])
	}
	if result2["feishu"].(map[string]any)["appIDConfigured"] != false || result2["feishu"].(map[string]any)["appSecretConfigured"] != false {
		t.Fatalf("feishu secrets should be cleared: %#v", result2["feishu"])
	}
	if result2["wechat"].(map[string]any)["workDir"] != "/new/wechat" || result2["feishu"].(map[string]any)["workDir"] != "/new/feishu" {
		t.Fatalf("other fields should be preserved: %#v / %#v", result2["wechat"], result2["feishu"])
	}
}

func TestManageChannelsPatchRejectsUnsafeAndInvalidFields(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("MOTHX_DIR", configDir)
	writeManageServeConfig(t, configDir, `{"api":{"listen":"127.0.0.1:7872"}}`)

	cases := []struct {
		name  string
		patch map[string]any
		want  string
	}{
		{
			name:  "unknown top-level",
			patch: map[string]any{"unknown": map[string]any{"enabled": true}},
			want:  "serve_field_not_allowed",
		},
		{
			name:  "null nested section",
			patch: map[string]any{"wechat": nil},
			want:  "serve_field_invalid",
		},
		{
			name:  "empty nested section",
			patch: map[string]any{"wechat": map[string]any{}},
			want:  "serve_field_invalid",
		},
		{
			name:  "unknown wechat field",
			patch: map[string]any{"wechat": map[string]any{"credPath": "/x", "unknown": true}},
			want:  "serve_field_invalid",
		},
		{
			name:  "wechat credPath type",
			patch: map[string]any{"wechat": map[string]any{"credPath": 123}},
			want:  "serve_field_invalid",
		},
		{
			name:  "wechat set and clear conflict",
			patch: map[string]any{"wechat": map[string]any{"credPath": "/x", "clearCredPath": true}},
			want:  "serve_field_invalid",
		},
		{
			name:  "feishu set and clear conflict",
			patch: map[string]any{"feishu": map[string]any{"appId": "x", "clearAppId": true}},
			want:  "serve_field_invalid",
		},
		{
			name:  "feishu empty appSecret",
			patch: map[string]any{"feishu": map[string]any{"appSecret": "   "}},
			want:  "serve_field_invalid",
		},
		{
			name:  "wechat workDir type",
			patch: map[string]any{"wechat": map[string]any{"workDir": true}},
			want:  "serve_field_invalid",
		},
		{
			name:  "wechat enabled type",
			patch: map[string]any{"wechat": map[string]any{"enabled": "true"}},
			want:  "serve_field_invalid",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			output := &syncedBuffer{}
			srv := newManageFixtureServer(output, configDir)
			message := callManageFixture(t, srv, output, 1, "mothx/manage/channels/patch", map[string]any{"patch": tc.patch})
			code, _ := manageFixtureError(t, message)
			if code != tc.want {
				t.Fatalf("error code = %q, want %q; message = %#v", code, tc.want, message)
			}
			// File must remain unchanged.
			raw, err := os.ReadFile(filepath.Join(configDir, "serve.json"))
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(raw), "wechat-cred") || strings.Contains(string(raw), "new-id") {
				t.Fatal("serve.json was modified by a rejected patch")
			}
		})
	}
}

func TestManageChannelsFeatureDiscovered(t *testing.T) {
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
	if !features["manageChannels"] {
		t.Fatalf("features = %#v, want manageChannels", features)
	}
}
