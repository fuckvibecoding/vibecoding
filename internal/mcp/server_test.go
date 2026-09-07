package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

type serverFixture struct{}

func (serverFixture) ListTools(context.Context) ([]ServerTool, error) {
	return []ServerTool{{Name: "lookup", InputSchema: json.RawMessage(`{"type":"object"}`)}}, nil
}

func (serverFixture) CallTool(_ context.Context, name string, arguments json.RawMessage) (ServerToolResult, error) {
	return ServerToolResult{Content: []ServerContent{{Type: "text", Text: name + ":" + string(arguments)}}}, nil
}

func TestServeStdioDispatchesStandardToolMethods(t *testing.T) {
	input := strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n" +
		"{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}\n" +
		"{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"lookup\",\"arguments\":{\"query\":\"runtime\"}}}\n")
	var output bytes.Buffer
	if err := ServeStdio(t.Context(), input, &output, serverFixture{}); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("responses = %q, want three lines", output.String())
	}
	var initialized struct {
		Result struct {
			Capabilities map[string]any `json:"capabilities"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(lines[0]), &initialized); err != nil || initialized.Result.Capabilities["tools"] == nil {
		t.Fatalf("initialize response = %s (%v)", lines[0], err)
	}
	if !strings.Contains(lines[1], "lookup") || !strings.Contains(lines[2], "lookup") || !strings.Contains(lines[2], "runtime") {
		t.Fatalf("tool responses = %#v", lines)
	}
}
