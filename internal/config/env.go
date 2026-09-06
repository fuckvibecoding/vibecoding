package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// EnvConfig contains environment variables injected into bash and skill tools.
type EnvConfig struct {
	Vars map[string]string `json:"vars"`
}

func GlobalEnvPath() string { return filepath.Join(ConfigDir(), "env.json") }

func LoadEnv() *EnvConfig {
	c := &EnvConfig{Vars: map[string]string{}}
	data, err := os.ReadFile(GlobalEnvPath())
	if err == nil {
		_ = json.Unmarshal(data, c)
	}
	if c.Vars == nil {
		c.Vars = map[string]string{}
	}
	return c
}

func (c *EnvConfig) List() map[string]string {
	out := make(map[string]string, len(c.Vars))
	for k, v := range c.Vars {
		out[k] = v
	}
	return out
}

// ValidateEnvName checks whether a name is acceptable for a global
// environment variable. It mirrors the rules enforced by EnvConfig.Set.
func ValidateEnvName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, "=\x00\r\n") {
		return fmt.Errorf("invalid environment variable name")
	}
	return nil
}

// ApplyPatch atomically applies a set of variable assignments and a set of
// deletions. It validates every name, rejects duplicates or conflicts, and
// writes the result once. Values are preserved as-is, including empty strings.
func (c *EnvConfig) ApplyPatch(set map[string]string, unset []string) error {
	if c.Vars == nil {
		c.Vars = map[string]string{}
	}
	seen := make(map[string]struct{}, len(set)+len(unset))
	for name := range set {
		name = strings.TrimSpace(name)
		if err := ValidateEnvName(name); err != nil {
			return err
		}
		if _, ok := seen[name]; ok {
			return fmt.Errorf("duplicate environment variable name %q", name)
		}
		seen[name] = struct{}{}
	}
	for _, name := range unset {
		name = strings.TrimSpace(name)
		if err := ValidateEnvName(name); err != nil {
			return err
		}
		if _, ok := seen[name]; ok {
			return fmt.Errorf("environment variable %q cannot be both set and unset", name)
		}
		seen[name] = struct{}{}
	}
	for name, value := range set {
		c.Vars[strings.TrimSpace(name)] = value
	}
	for _, name := range unset {
		delete(c.Vars, strings.TrimSpace(name))
	}
	return c.Save()
}

func (c *EnvConfig) Set(key, value string) error {
	key = strings.TrimSpace(key)
	if err := ValidateEnvName(key); err != nil {
		return err
	}
	if c.Vars == nil {
		c.Vars = map[string]string{}
	}
	c.Vars[key] = value
	return c.Save()
}
func (c *EnvConfig) Unset(key string) error { delete(c.Vars, strings.TrimSpace(key)); return c.Save() }
func (c *EnvConfig) Clear() error           { c.Vars = map[string]string{}; return c.Save() }
func (c *EnvConfig) Save() error {
	if err := os.MkdirAll(ConfigDir(), 0700); err != nil {
		return err
	}
	keys := make([]string, 0, len(c.Vars))
	for k := range c.Vars {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	ordered := make(map[string]string, len(keys))
	for _, k := range keys {
		ordered[k] = c.Vars[k]
	}
	data, err := json.MarshalIndent(EnvConfig{Vars: ordered}, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := GlobalEnvPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, GlobalEnvPath())
}
