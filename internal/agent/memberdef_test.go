package agent

import (
	"reflect"
	"testing"
)

func TestNewMemberDefRegistryOrderAndLookup(t *testing.T) {
	defs := []*MemberDef{
		{ID: "lead", DisplayName: "交付总监", Role: "lead"},
		nil,
		{ID: ""},
		{ID: "engineer", DisplayName: "工程师", Role: "member"},
		{ID: "lead", DisplayName: "duplicate-ignored"},
	}
	r := NewMemberDefRegistry(defs)

	wantIDs := []string{"lead", "engineer"}
	if got := r.IDs(); !reflect.DeepEqual(got, wantIDs) {
		t.Fatalf("IDs() = %v, want %v", got, wantIDs)
	}

	def, ok := r.Get("lead")
	if !ok {
		t.Fatal("expected lead to resolve")
	}
	if def.DisplayName != "交付总监" {
		t.Fatalf("duplicate id must keep the first definition, got %q", def.DisplayName)
	}
	if _, ok := r.Get("ghost"); ok {
		t.Fatal("unknown id must not resolve")
	}

	// IDs must return a copy: mutating it cannot corrupt the registry.
	ids := r.IDs()
	ids[0] = "mutated"
	if got := r.IDs(); !reflect.DeepEqual(got, wantIDs) {
		t.Fatalf("IDs() after mutation = %v, want %v", got, wantIDs)
	}
}

func TestNewMemberDefRegistryEmpty(t *testing.T) {
	r := NewMemberDefRegistry(nil)
	if ids := r.IDs(); len(ids) != 0 {
		t.Fatalf("empty registry IDs = %v", ids)
	}
	if _, ok := r.Get("any"); ok {
		t.Fatal("empty registry must not resolve members")
	}
}

func TestMemberDefRegistryNilReceiverIsSafe(t *testing.T) {
	var r *MemberDefRegistry
	if _, ok := r.Get("x"); ok {
		t.Fatal("nil registry must not resolve members")
	}
	if ids := r.IDs(); ids != nil {
		t.Fatalf("nil registry IDs = %v, want nil", ids)
	}
}

func TestAgentManagerSetMemberContext(t *testing.T) {
	_, mgr := newTestFactoryAndManager(t)
	if mgr.Members != nil || mgr.Mailbox != nil || mgr.ExpertID != "" {
		t.Fatalf("expected empty member context by default, got %#v", mgr)
	}

	reg := NewMemberDefRegistry([]*MemberDef{{ID: "pm", DisplayName: "产品经理"}})
	mbox := NewMemberMailbox()
	mgr.SetMemberContext(reg, mbox, "software-company")
	if mgr.Members != reg || mgr.Mailbox != mbox || mgr.ExpertID != "software-company" {
		t.Fatal("SetMemberContext did not install the member context")
	}
	if _, ok := mgr.Members.Get("pm"); !ok {
		t.Fatal("installed roster must resolve members")
	}

	// Nil/empty values clear the binding.
	mgr.SetMemberContext(nil, nil, "")
	if mgr.Members != nil || mgr.Mailbox != nil || mgr.ExpertID != "" {
		t.Fatal("SetMemberContext(nil, nil, \"\") must clear the member context")
	}
}
