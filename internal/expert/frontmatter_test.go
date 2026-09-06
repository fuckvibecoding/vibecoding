package expert

import (
	"reflect"
	"testing"
)

func TestParseFrontmatter(t *testing.T) {
	tests := []struct {
		name       string
		content    string
		fallback   string
		want       Frontmatter
		wantPrompt string
		wantErr    bool
	}{
		{
			name:       "basic string fields",
			content:    "---\nname: alice\ndescription: helper\nrole: lead\nemoji: 🎯\ncolor: \"#E8A33D\"\nvibe: 严谨\n---\nBody text.\n",
			fallback:   "file",
			want:       Frontmatter{Name: "alice", Description: "helper", Role: "lead", Emoji: "🎯", Color: "#E8A33D", Vibe: "严谨"},
			wantPrompt: "Body text.",
		},
		{
			name:       "single quotes and capability fields",
			content:    "---\nname: 'bob'\nmode: yolo\nwork_dir: /tmp/ws\nmax_iterations: 80\n---\nPrompt\n",
			fallback:   "file",
			want:       Frontmatter{Name: "bob", Mode: "yolo", WorkDir: "/tmp/ws", MaxIterations: 80},
			wantPrompt: "Prompt",
		},
		{
			name:       "inline list with quoted item",
			content:    "---\ntools: [a, b, \"c d\"]\n---\nx\n",
			fallback:   "f",
			want:       Frontmatter{Name: "f", Tools: []string{"a", "b", "c d"}},
			wantPrompt: "x",
		},
		{
			name:       "inline empty list",
			content:    "---\ntools: []\n---\nx\n",
			fallback:   "f",
			want:       Frontmatter{Name: "f"},
			wantPrompt: "x",
		},
		{
			name:       "block list",
			content:    "---\ntools:\n  - read\n  - \"write edit\"\nname: c\n---\ny\n",
			fallback:   "f",
			want:       Frontmatter{Name: "c", Tools: []string{"read", "write edit"}},
			wantPrompt: "y",
		},
		{
			name:       "comment lines and unknown keys ignored",
			content:    "---\n# comment line\nname: d\nunknown_key: whatever\nmodel: some-model\n---\nz\n",
			fallback:   "f",
			want:       Frontmatter{Name: "d"},
			wantPrompt: "z",
		},
		{
			name:       "CJK values preserved verbatim",
			content:    "---\nname: 中文名\ndescription: 描述：含全角冒号 与 空格\nvibe: 严谨、一次写完\n---\n正文内容\n",
			fallback:   "f",
			want:       Frontmatter{Name: "中文名", Description: "描述：含全角冒号 与 空格", Vibe: "严谨、一次写完"},
			wantPrompt: "正文内容",
		},
		{
			name:       "value containing ASCII colon",
			content:    "---\ndescription: 输入契约: 设计文档+PRD\n---\nb\n",
			fallback:   "f",
			want:       Frontmatter{Name: "f", Description: "输入契约: 设计文档+PRD"},
			wantPrompt: "b",
		},
		{
			name:       "keys match case-insensitively",
			content:    "---\nNAME: e\nMode: plan\n---\np\n",
			fallback:   "f",
			want:       Frontmatter{Name: "e", Mode: "plan"},
			wantPrompt: "p",
		},
		{
			name:       "no frontmatter uses fallback name and whole body",
			content:    "Just a prompt body.\nMultiple lines.\n",
			fallback:   "my-file",
			want:       Frontmatter{Name: "my-file"},
			wantPrompt: "Just a prompt body.\nMultiple lines.",
		},
		{
			name:       "missing name falls back to file name",
			content:    "---\nrole: member\n---\nbody\n",
			fallback:   "agent-x",
			want:       Frontmatter{Name: "agent-x", Role: "member"},
			wantPrompt: "body",
		},
		{
			name:     "unclosed frontmatter is an error",
			content:  "---\nname: f\nno closing delimiter\n",
			fallback: "f",
			wantErr:  true,
		},
		{
			name:     "invalid max_iterations is an error",
			content:  "---\nmax_iterations: many\n---\nb\n",
			fallback: "f",
			wantErr:  true,
		},
		{
			name:       "CRLF line endings",
			content:    "---\r\nname: g\r\ntools: [read]\r\n---\r\nbody\r\n",
			fallback:   "f",
			want:       Frontmatter{Name: "g", Tools: []string{"read"}},
			wantPrompt: "body",
		},
		{
			name:       "closing delimiter at EOF without trailing newline",
			content:    "---\nname: h\n---",
			fallback:   "f",
			want:       Frontmatter{Name: "h"},
			wantPrompt: "",
		},
		{
			name:       "empty frontmatter block",
			content:    "---\n---\nbody only\n",
			fallback:   "f",
			want:       Frontmatter{Name: "f"},
			wantPrompt: "body only",
		},
		{
			name:       "body may contain --- lines and tables after frontmatter",
			content:    "---\nname: i\n---\nintro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\ntail\n",
			fallback:   "f",
			want:       Frontmatter{Name: "i"},
			wantPrompt: "intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\ntail",
		},
		{
			name:       "empty file",
			content:    "",
			fallback:   "f",
			want:       Frontmatter{Name: "f"},
			wantPrompt: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, prompt, err := parseFrontmatter(tt.content, tt.fallback)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got none (fm=%+v prompt=%q)", got, prompt)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("frontmatter = %+v, want %+v", got, tt.want)
			}
			if prompt != tt.wantPrompt {
				t.Errorf("prompt = %q, want %q", prompt, tt.wantPrompt)
			}
		})
	}
}
