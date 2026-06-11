/**
 * LexiFlow RBAC
 *
 * Single capability matrix. Every permission check goes through here.
 * Never inline role checks in components or route handlers.
 */

import type { UserRole } from "@/types";

// ─── Capability definitions ───────────────────────────────────────────────────

export type Capability =
  | "request:submit"
  | "request:assign_lawyer"
  | "request:assign_group"
  | "request:transition_state"
  | "request:view_internal_notes"
  | "request:add_internal_note"
  | "document:upload_draft"
  | "document:upload_signed_copy"
  | "document:upload_counterparty_feedback"
  | "document:view_all_versions"
  | "input:create"
  | "input:respond"
  | "input:ask_requester"
  | "approval:act"
  | "approval:delegate"
  | "request:archive"
  | "request:withdraw"
  | "signing:configure_parties"
  | "signing:confirm_hard_copy"
  | "admin:access_panel"
  | "admin:manage_users"
  | "admin:manage_groups"
  | "admin:configure_workflows"
  | "admin:configure_sla"
  | "reports:view_all"
  | "reports:view_own_group"
  | "group_admin:manage_own_group"
  | "group_admin:configure_assignment"
  | "template:manage"
  | "template:use";

// ─── Permission matrix ────────────────────────────────────────────────────────

const PERMISSIONS: Record<Capability, UserRole[]> = {
  "request:submit":                   ["super_admin", "group_admin", "lawyer", "requester"],
  "request:assign_lawyer":            ["super_admin", "group_admin"],
  "request:assign_group":             ["super_admin", "group_admin"],
  "request:transition_state":         ["super_admin", "group_admin", "lawyer"],
  "request:view_internal_notes":      ["super_admin", "group_admin", "lawyer"],
  "request:add_internal_note":        ["super_admin", "group_admin", "lawyer"],
  "document:upload_draft":            ["super_admin", "lawyer"],
  "document:upload_signed_copy":      ["super_admin", "requester"],
  "document:upload_counterparty_feedback": ["super_admin", "requester"],
  "document:view_all_versions":       ["super_admin", "group_admin", "lawyer"],
  "input:create":                     ["super_admin", "group_admin", "lawyer"],
  "input:respond":                    ["super_admin", "group_admin", "lawyer", "requester"],
  "input:ask_requester":              ["super_admin", "group_admin", "lawyer", "approver"],
  "approval:act":                     ["super_admin", "group_admin", "approver"],
  "approval:delegate":                ["super_admin", "approver"],
  "request:archive":                  ["super_admin", "group_admin", "lawyer"],
  "request:withdraw":                 ["super_admin", "requester", "group_admin"],
  "signing:configure_parties":        ["super_admin", "lawyer"],
  "signing:confirm_hard_copy":        ["super_admin", "lawyer"],
  "admin:access_panel":               ["super_admin", "group_admin"],
  "admin:manage_users":               ["super_admin"],
  "admin:manage_groups":              ["super_admin"],
  "admin:configure_workflows":        ["super_admin"],
  "admin:configure_sla":              ["super_admin"],
  "reports:view_all":                 ["super_admin"],
  "reports:view_own_group":           ["super_admin", "group_admin"],
  "group_admin:manage_own_group":     ["super_admin", "group_admin"],
  "group_admin:configure_assignment": ["super_admin", "group_admin"],
  "template:manage":                  ["super_admin", "lawyer"],
  "template:use":                     ["super_admin", "lawyer"],
};

// ─── Public API ───────────────────────────────────────────────────────────────

export class RBACError extends Error {
  constructor(public role: UserRole, public capability: Capability) {
    super(`Role '${role}' does not have capability '${capability}'`);
    this.name = "RBACError";
  }
}

/**
 * Returns true if the role has the capability.
 */
export function can(role: UserRole, capability: Capability): boolean {
  return PERMISSIONS[capability]?.includes(role) ?? false;
}

/**
 * Throws RBACError if the role does not have the capability.
 * Use this in tRPC procedures before any DB writes.
 */
export function assert(role: UserRole, capability: Capability): void {
  if (!can(role, capability)) {
    throw new RBACError(role, capability);
  }
}

/**
 * Returns all capabilities a role has (useful for frontend rendering decisions).
 */
export function getCapabilities(role: UserRole): Capability[] {
  return (Object.entries(PERMISSIONS) as [Capability, UserRole[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([cap]) => cap);
}
