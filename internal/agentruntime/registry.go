package agentruntime

import (
	"context"
	"fmt"

	"github.com/startvibecoding/mothx/internal/browser"
	"github.com/startvibecoding/mothx/internal/config"
	"github.com/startvibecoding/mothx/internal/mcp"
	"github.com/startvibecoding/mothx/internal/sandbox"
	"github.com/startvibecoding/mothx/internal/skills"
	"github.com/startvibecoding/mothx/internal/tools"
)

// RegistryMutator is an adapter policy callback for tools that cannot yet be
// represented as core Runtime capabilities.
type RegistryMutator func(*tools.Registry) error

// RegistryPolicy controls shared registry construction without letting adapters
// own its sandbox, workdir, or lifecycle.
type RegistryPolicy struct {
	RegisterDefaults bool
	EnablePlanTool   *bool
	SkillsMgr        *skills.Manager
	Browser          bool
	Mutators         []RegistryMutator
}

// BuildRegistry creates the base registry and applies explicit adapter tool
// policy. It is the only registry construction API for non-test adapters.
func BuildRegistry(workDir string, sandboxMgr *sandbox.Manager, settings *config.Settings, policy RegistryPolicy) (*tools.Registry, error) {
	if workDir == "" {
		return nil, fmt.Errorf("registry work directory is required")
	}
	var active sandbox.Sandbox
	if sandboxMgr != nil {
		active = sandboxMgr.GetActive()
	}
	registry := tools.NewRegistry(workDir, active)
	if policy.RegisterDefaults {
		if policy.EnablePlanTool == nil {
			registry.RegisterDefaults()
		} else {
			registry.RegisterDefaultsWithPlanTool(*policy.EnablePlanTool)
		}
	}
	if policy.SkillsMgr != nil {
		registry.Register(tools.NewSkillRefTool(policy.SkillsMgr))
	}
	if policy.Browser {
		browser.RegisterTool(registry)
	}
	for _, mutate := range policy.Mutators {
		if mutate == nil {
			continue
		}
		if err := mutate(registry); err != nil {
			return nil, err
		}
	}
	return registry, nil
}

// MCPPolicy describes adapter-specific MCP transport behavior while Runtime
// owns client connection and release.
type MCPPolicy struct {
	Servers   []mcp.ServerConfig
	Callbacks mcp.Callbacks
	Optional  bool
	OnError   func(error)
}

// ConnectMCP connects policy servers to this Runtime's registry. Strict policy
// returns errors; optional policy records them via OnError and leaves the
// Runtime usable without MCP clients.
func (r *SessionRuntime) ConnectMCP(ctx context.Context, policy MCPPolicy) error {
	if r == nil || r.Registry == nil {
		return fmt.Errorf("runtime registry is required")
	}
	servers := make([]mcp.ServerConfig, 0, len(policy.Servers))
	for _, server := range policy.Servers {
		if config.MCPServerEnabled(server) {
			servers = append(servers, server)
		}
	}
	if len(servers) == 0 {
		return nil
	}
	clients, err := mcp.ConnectServers(ctx, servers, r.Registry, policy.Callbacks)
	if err != nil {
		if policy.Optional {
			if policy.OnError != nil {
				policy.OnError(err)
			}
			return nil
		}
		return err
	}
	r.MCPClients = clients
	return nil
}

// ConnectConfiguredMCP loads the standard global/project MCP configuration,
// appends explicitly negotiated protocol servers, and applies the same
// strict/optional connection behavior as ConnectMCP. This keeps adapters from
// creating a second configuration resolution path while still honoring ACP's
// standard mcpServers request field.
func (r *SessionRuntime) ConnectConfiguredMCP(ctx context.Context, policy MCPPolicy) error {
	if r == nil {
		return fmt.Errorf("runtime is required")
	}
	servers, err := mcp.LoadConfiguredServers(r.WorkDir)
	if err != nil {
		if policy.Optional {
			if policy.OnError != nil {
				policy.OnError(err)
			}
			return nil
		}
		return err
	}
	policy.Servers = append(servers, policy.Servers...)
	return r.ConnectMCP(ctx, policy)
}

// CloseMCPClients releases clients held by legacy adapter aliases during migration.
func CloseMCPClients(clients []*mcp.Client) {
	mcp.CloseClients(clients)
}

// DefaultPlanToolPolicy returns the configured plan-tool setting.
func DefaultPlanToolPolicy(settings *config.Settings) *bool {
	if settings == nil {
		return nil
	}
	enabled := settings.IsPlanToolEnabled()
	return &enabled
}
