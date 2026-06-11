/**
 * LexiFlow State Machine
 *
 * This is the single source of truth for all valid state transitions.
 * NOTHING writes to requests.state except this module + the DB migration triggers.
 *
 * State: RequestState (11 active + 2 terminal)
 * Overlay: Pending_Requester_Response is handled as an SLA pause, not a separate state.
 */

import type { RequestState, UserRole } from "@/types";

// ─── Valid transitions map ────────────────────────────────────────────────────
// Key = current state; Value = array of states the system may transition to

const TRANSITIONS: Record<RequestState, RequestState[]> = {
  submitted: [
    "pending_pre_legal_approval", // if workflow has Phase A
    "pending_legal_assignment",   // if no Phase A configured
    "withdrawn",
  ],
  pending_pre_legal_approval: [
    "pending_legal_assignment", // all Phase A nodes approved
    "rejected",                 // any Phase A node returned
    "withdrawn",
  ],
  pending_legal_assignment: [
    "under_legal_review",       // lawyer assigned
    "withdrawn",
  ],
  under_legal_review: [
    "pending_internal_inputs",  // lawyer sends input requests
    "ready_to_share",           // lawyer marks ready for counterparty
    "execution_copy_review",    // skip external sharing; go straight to execution
    "withdrawn",
  ],
  pending_internal_inputs: [
    "under_legal_review",       // all inputs received, lawyer uploads revised draft
    "ready_to_share",           // lawyer skips re-review after inputs
    "withdrawn",
  ],
  ready_to_share: [
    "returned_with_external_feedback", // requester uploads counterparty markup
    "execution_copy_review",           // counterparty accepted; no markup
    "under_legal_review",              // lawyer pulls back for more work
    "withdrawn",
  ],
  returned_with_external_feedback: [
    "pending_internal_inputs",  // counterparty feedback requires internal re-consultation
    "ready_to_share",           // reconciled; send back to counterparty
    "execution_copy_review",    // fully resolved; ready for execution
    "under_legal_review",       // needs substantive re-drafting
    "withdrawn",
  ],
  execution_copy_review: [
    "pending_execution_approval", // checklist complete + execution copy uploaded
    "under_legal_review",         // checklist reveals issues; return to drafting
    "withdrawn",
  ],
  pending_execution_approval: [
    "ready_for_signature",      // all Phase B nodes approved
    "execution_copy_review",    // approver returns to lawyer
    "rejected",
    "withdrawn",
  ],
  ready_for_signature: [
    "execution_in_progress",    // signing parties configured; tracking begins
    "execution_copy_review",    // lawyer needs to re-issue
    "withdrawn",
  ],
  execution_in_progress: [
    "archived",                 // all parties signed + hard copy confirmed
    "withdrawn",
  ],
  // Terminal states — no exit
  archived: [],
  rejected: [],
  withdrawn: [],
};

// ─── Role permissions per transition ─────────────────────────────────────────
// Which roles are allowed to trigger a given "to" state.
// System-triggered transitions (auto-routing) use role "super_admin" internally.

const TRANSITION_ROLES: Partial<Record<RequestState, UserRole[]>> = {
  pending_pre_legal_approval: ["super_admin", "group_admin"],
  pending_legal_assignment:   ["super_admin", "group_admin"],
  under_legal_review:         ["super_admin", "group_admin", "lawyer"],
  pending_internal_inputs:    ["super_admin", "lawyer"],
  ready_to_share:             ["super_admin", "lawyer"],
  returned_with_external_feedback: ["super_admin", "requester"],
  execution_copy_review:      ["super_admin", "lawyer"],
  pending_execution_approval: ["super_admin", "lawyer"],
  ready_for_signature:        ["super_admin", "approver"],
  execution_in_progress:      ["super_admin", "lawyer"],
  archived:                   ["super_admin", "lawyer"],
  rejected:                   ["super_admin", "approver", "group_admin"],
  withdrawn:                  ["super_admin", "requester", "group_admin"],
};

// ─── Public API ───────────────────────────────────────────────────────────────

export class StateMachineError extends Error {
  constructor(
    public code: "INVALID_TRANSITION" | "UNAUTHORIZED_ROLE",
    message: string
  ) {
    super(message);
    this.name = "StateMachineError";
  }
}

/**
 * Check whether a transition is valid (ignoring role).
 */
export function isValidTransition(
  from: RequestState,
  to: RequestState
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check whether a role is allowed to trigger a specific "to" state.
 */
export function canRoleTrigger(role: UserRole, to: RequestState): boolean {
  const allowed = TRANSITION_ROLES[to];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Full transition guard — throws StateMachineError if invalid.
 * Call this before writing to the DB.
 */
export function assertTransition(
  from: RequestState,
  to: RequestState,
  actorRole: UserRole
): void {
  if (!isValidTransition(from, to)) {
    throw new StateMachineError(
      "INVALID_TRANSITION",
      `Cannot transition from '${from}' to '${to}'`
    );
  }
  if (!canRoleTrigger(actorRole, to)) {
    throw new StateMachineError(
      "UNAUTHORIZED_ROLE",
      `Role '${actorRole}' cannot trigger state '${to}'`
    );
  }
}

/**
 * Returns all valid next states from a given state (for UI rendering).
 */
export function getValidTransitions(from: RequestState): RequestState[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * Human-readable label for each state (English default).
 */
export const STATE_LABELS: Record<RequestState, string> = {
  submitted:                          "Submitted",
  pending_pre_legal_approval:         "Pending Pre-Legal Approval",
  pending_legal_assignment:           "Pending Legal Assignment",
  under_legal_review:                 "Under Legal Review",
  pending_internal_inputs:            "Pending Internal Inputs",
  ready_to_share:                     "Ready to Share",
  returned_with_external_feedback:    "Returned with Counterparty Feedback",
  execution_copy_review:              "Execution Copy Review",
  pending_execution_approval:         "Pending Execution Approval",
  ready_for_signature:                "Ready for Signature",
  execution_in_progress:              "Execution in Progress",
  archived:                           "Archived",
  rejected:                           "Rejected",
  withdrawn:                          "Withdrawn",
};

/**
 * Status colour for UI badges.
 */
export const STATE_COLOR: Record<RequestState, "blue" | "amber" | "green" | "red" | "slate"> = {
  submitted:                       "blue",
  pending_pre_legal_approval:      "amber",
  pending_legal_assignment:        "amber",
  under_legal_review:              "blue",
  pending_internal_inputs:         "amber",
  ready_to_share:                  "blue",
  returned_with_external_feedback: "amber",
  execution_copy_review:           "blue",
  pending_execution_approval:      "amber",
  ready_for_signature:             "amber",
  execution_in_progress:           "blue",
  archived:                        "green",
  rejected:                        "red",
  withdrawn:                       "slate",
};
