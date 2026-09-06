package acp

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/startvibecoding/mothx/internal/config"
)

func TestACPStdioProcessInitializeNewPromptClose(t *testing.T) {
	configDir := t.TempDir()
	workDir := t.TempDir()
	providerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/chat/completions" {
			t.Errorf("provider request = %s %s, want POST /v1/chat/completions", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"id\":\"chatcmpl-process\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"ACP smoke response\"},\"finish_reason\":null}]}\n"))
		_, _ = w.Write([]byte("data: {\"id\":\"chatcmpl-process\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer providerServer.Close()

	t.Setenv("MOTHX_DIR", configDir)
	settings := config.DefaultSettings()
	settings.DefaultProvider = "process-test"
	settings.DefaultModel = "process-model"
	settings.DefaultMode = "yolo"
	settings.SessionDir = filepath.Join(configDir, "sessions")
	settings.Providers = map[string]*config.ProviderConfig{
		"process-test": {
			APIKey:  "test-key",
			BaseURL: providerServer.URL + "/v1",
			API:     "openai-chat",
			Models:  []config.ModelConfig{{ID: "process-model", Name: "Process Model", ContextWindow: 32768, MaxTokens: 1024}},
		},
	}
	if err := config.SaveGlobalSettings(settings); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command(os.Args[0], "-test.run=^TestACPStdioProcessHelper$")
	cmd.Env = append(os.Environ(), "MOTHX_ACP_PROCESS_HELPER=1", "MOTHX_DIR="+configDir)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(stdout)

	sendACPRequest(t, stdin, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": map[string]any{"protocolVersion": 1}})
	assertACPResponseID(t, reader, 1)
	sendACPRequest(t, stdin, map[string]any{"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": map[string]any{"cwd": workDir}})
	newSession := assertACPResponseID(t, reader, 2)
	result, ok := newSession["result"].(map[string]any)
	if !ok {
		t.Fatalf("session/new result = %#v", newSession["result"])
	}
	sessionID, ok := result["sessionId"].(string)
	if !ok || sessionID == "" {
		t.Fatalf("session/new response = %#v, missing sessionId", newSession)
	}

	sendACPRequest(t, stdin, map[string]any{
		"jsonrpc": "2.0",
		"id":      3,
		"method":  "session/prompt",
		"params": map[string]any{
			"sessionId": sessionID,
			"prompt":    []map[string]any{{"type": "text", "text": "Say hello"}},
		},
	})
	notifications := assertACPResponseIDCollecting(t, reader, 3)
	if !containsACPNotification(notifications, "session/update", "agent_message_chunk", "ACP smoke response") {
		t.Fatalf("prompt notifications missing assistant message: %#v", notifications)
	}

	sendACPRequest(t, stdin, map[string]any{"jsonrpc": "2.0", "id": 4, "method": "session/close", "params": map[string]any{"sessionId": sessionID}})
	assertACPResponseID(t, reader, 4)
	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	waitForACPProcess(t, cmd)
}

func containsACPNotification(messages []map[string]any, method, update, text string) bool {
	for _, message := range messages {
		if message["method"] != method {
			continue
		}
		params, _ := message["params"].(map[string]any)
		updatePayload, _ := params["update"].(map[string]any)
		if updatePayload["sessionUpdate"] != update {
			continue
		}
		content, _ := updatePayload["content"].(map[string]any)
		if content["text"] == text {
			return true
		}
	}
	return false
}

func waitForACPProcess(t *testing.T, cmd *exec.Cmd) {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatal("ACP process did not exit after stdin EOF")
	}
}

func assertACPResponseIDCollecting(t *testing.T, reader *bufio.Reader, id float64) []map[string]any {
	t.Helper()
	var notifications []map[string]any
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			t.Fatal(err)
		}
		var message map[string]any
		if err := json.Unmarshal(line, &message); err != nil {
			t.Fatal(err)
		}
		if got, ok := message["id"].(float64); ok && got == id {
			if rpcErr := message["error"]; rpcErr != nil {
				t.Fatalf("ACP response %v error: %#v", id, rpcErr)
			}
			return notifications
		}
		notifications = append(notifications, message)
	}
}
