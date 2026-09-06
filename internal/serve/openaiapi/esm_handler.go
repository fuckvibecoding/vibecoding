package openaiapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

// HandleESMAPI serves graphical WebUI ESM controls, not TUI commands.
func (s *Server) HandleESMAPI(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/sessions/"), "/"), "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] != "esm" {
		writeError(w, http.StatusBadRequest, "invalid ESM path", "invalid_request_error")
		return
	}
	id := parts[0]
	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			v, err := s.GetESM(id)
			if err != nil {
				writeESMError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, v)
		case http.MethodPost:
			var req ESMControlRequest
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error(), "invalid_request_error")
				return
			}
			if err := s.ValidateESMVersion(id, req.Version); err != nil {
				writeESMError(w, err)
				return
			}
			v, err := s.CreateESM(id, req.Objective)
			if err != nil {
				writeESMError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, v)
		case http.MethodPatch:
			var req ESMControlRequest
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error(), "invalid_request_error")
				return
			}
			if err := s.ValidateESMVersion(id, req.Version); err != nil {
				writeESMError(w, err)
				return
			}
			var v *ESMSnapshot
			var err error
			if strings.TrimSpace(req.Objective) == "" {
				writeError(w, http.StatusBadRequest, "objective is required", "invalid_request_error")
				return
			}
			v, err = s.EditESM(id, req.Objective)
			if err != nil {
				writeESMError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, v)
		case http.MethodDelete:
			if err := s.ClearESM(id); err != nil {
				writeESMError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, &ESMSnapshot{SessionID: id, Status: "none"})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) != 3 {
		writeError(w, http.StatusBadRequest, "invalid ESM action", "invalid_request_error")
		return
	}
	var v *ESMSnapshot
	var err error
	switch parts[2] {
	case "guidance":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Guidance string `json:"guidance"`
			Version  string `json:"version"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error(), "invalid_request_error")
			return
		}
		v, err = s.AddESMGuidance(id, req.Version, req.Guidance)
	case "pause":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		v, err = s.PauseESM(id)
	case "resume":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		v, err = s.ResumeESM(id)
	default:
		writeError(w, http.StatusNotFound, "unknown ESM action", "not_found")
		return
	}
	if err != nil {
		writeESMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func writeESMError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	msg := err.Error()
	switch {
	case errors.Is(err, ErrSessionNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrESMControlRequiresIdle):
		status = http.StatusConflict
	case strings.Contains(msg, "changed") || strings.Contains(msg, "already exists") || strings.Contains(msg, "invalid esm status"):
		status = http.StatusConflict
	case strings.Contains(msg, "cannot be empty") || strings.Contains(msg, "positive") || strings.Contains(msg, "invalid"):
		status = http.StatusBadRequest
	}
	writeError(w, status, msg, "esm_error")
}
