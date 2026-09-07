package serve

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKnowledgeBaseHandlersManageRuntimeOwnedIndexes(t *testing.T) {
	sessionDir := t.TempDir()
	sourceDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceDir, "guide.md"), []byte("# Runtime knowledge\n\nThe knowledge index belongs to the shared runtime.\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runtime := &channelRuntime{sessionDir: sessionDir}

	list := knowledgeBaseRequest(t, runtime, http.MethodGet, "/api/knowledge-bases", "")
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), `"knowledgeBases":[]`) {
		t.Fatalf("initial list = %d: %s", list.Code, list.Body.String())
	}

	createBody := `{"knowledgeBase":{"name":"Docs","rootDir":` + quoteJSON(sourceDir) + `,"preprocessProfile":"documents","mode":"yolo","schedule":"manual","enabled":true}}`
	created := knowledgeBaseRequest(t, runtime, http.MethodPost, "/api/knowledge-bases", createBody)
	if created.Code != http.StatusCreated {
		t.Fatalf("create = %d: %s", created.Code, created.Body.String())
	}
	var view knowledgeBaseView
	if err := json.Unmarshal(created.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if view.KnowledgeBase.ID == "" || view.KnowledgeBase.Schedule != "manual" || view.Status != "unindexed" {
		t.Fatalf("created view = %#v", view)
	}

	invalidIndexer := knowledgeBaseRequest(t, runtime, http.MethodPatch, "/api/knowledge-bases/"+view.KnowledgeBase.ID, `{"knowledgeBase":{"name":"Docs","rootDir":`+quoteJSON(sourceDir)+`,"preprocessProfile":"documents","provider":"openai","schedule":"manual","enabled":true}}`)
	if invalidIndexer.Code != http.StatusBadRequest || !strings.Contains(invalidIndexer.Body.String(), "provider and model") {
		t.Fatalf("invalid indexer update = %d: %s", invalidIndexer.Code, invalidIndexer.Body.String())
	}

	scanned := knowledgeBaseRequest(t, runtime, http.MethodPost, "/api/knowledge-bases/"+view.KnowledgeBase.ID+"/scan", "{}")
	if scanned.Code != http.StatusOK {
		t.Fatalf("scan = %d: %s", scanned.Code, scanned.Body.String())
	}
	if err := json.Unmarshal(scanned.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if view.Snapshot == nil || view.Status != "completed" || view.Snapshot.ChunkCount == 0 {
		t.Fatalf("scan view = %#v", view)
	}

	queried := knowledgeBaseRequest(t, runtime, http.MethodPost, "/api/knowledge-bases/"+view.KnowledgeBase.ID+"/query", `{"query":"shared runtime","limit":8}`)
	if queried.Code != http.StatusOK || !strings.Contains(queried.Body.String(), "guide.md") {
		t.Fatalf("query = %d: %s", queried.Code, queried.Body.String())
	}

	deleted := knowledgeBaseRequest(t, runtime, http.MethodDelete, "/api/knowledge-bases/"+view.KnowledgeBase.ID, "")
	if deleted.Code != http.StatusOK || !strings.Contains(deleted.Body.String(), `"deleted":true`) {
		t.Fatalf("delete = %d: %s", deleted.Code, deleted.Body.String())
	}
}

func TestKnowledgeBaseHandlersRejectScheduledWebUIConfiguration(t *testing.T) {
	runtime := &channelRuntime{sessionDir: t.TempDir()}
	sourceDir := t.TempDir()
	request := knowledgeBaseRequest(t, runtime, http.MethodPost, "/api/knowledge-bases", `{"knowledgeBase":{"name":"Docs","rootDir":`+quoteJSON(sourceDir)+`,"preprocessProfile":"documents","schedule":"@daily","enabled":true}}`)
	if request.Code != http.StatusBadRequest || !strings.Contains(request.Body.String(), "scheduled knowledge base indexing") {
		t.Fatalf("scheduled create = %d: %s", request.Code, request.Body.String())
	}
}

func knowledgeBaseRequest(t *testing.T, runtime *channelRuntime, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	response := httptest.NewRecorder()
	runtime.handleKnowledgeBases(response, req)
	return response
}

func quoteJSON(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
