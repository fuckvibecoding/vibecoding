package skills

import "embed"

// BuiltinFS contains first-party skills compiled into every MothX runtime.
// Manager.Load installs this lowest-priority layer before global and project
// directories, so users can override a built-in skill deliberately without
// adapters carrying their own skill catalogs.
//
//go:embed builtin/*
var BuiltinFS embed.FS

const (
	// ExpertCreaterSkillName is the built-in guide for authoring and installing
	// a project-local expert team with the current Agent.
	ExpertCreaterSkillName = "expert-creater"
)
