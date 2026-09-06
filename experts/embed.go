// Package experts embeds the built-in expert bundle seed packages shipped
// with the binary. internal/expert consumes BuiltinFS as the lowest-priority
// (builtin) ExpertCenter source.
package experts

import "embed"

// BuiltinFS contains the embedded seed expert bundles. Each top-level
// directory is one bundle (expert.json + agents/*.md [+ skills/ avatars/]).
//
//go:embed all:software-company all:frontend-developer
var BuiltinFS embed.FS
