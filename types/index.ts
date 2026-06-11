// ─── Enums (mirror DB enums exactly) ─────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "group_admin"
  | "lawyer"
  | "approver"
  | "requester";

export type GroupType = "legal" | "non_legal";

export type AssignmentMode = "open_pool" | "manual" | "auto" | "hybrid";

export type GroupInternalRole = "group_admin" | "director" | "member";

export type RequestState =
  | "submitted"
  | "pending_pre_legal_approval"
  | "pending_legal_assignment"
  | "under_legal_review"
  | "pending_internal_inputs"
  | "ready_to_share"
  | "returned_with_external_feedback"
  | "execution_copy_review"
  | "pending_execution_approval"
  | "ready_for_signature"
  | "execution_in_progress"
  | "archived"
  | "rejected"
  | "withdrawn";

export type Priority = "critical" | "high" | "normal" | "low";

export type FileType = "docx" | "pdf";

export type DocSource = "lawyer" | "requester" | "counterparty" | "ai_generated";

export type ApprovalPhase = "pre_legal" | "execution";

export type NodeStatus =
  | "pending"
  | "approved"
  | "returned"
  | "delegated"
  | "skipped";

export type InputStatus = "pending" | "answered" | "overridden";

export type InputSource = "mention_extraction" | "manual" | "ask_requester";

export type ResponseDecision =
  | "approved"
  | "approved_with_mods"
  | "rejected"
  | null;

export type SigningMethod = "physical" | "digital";

export type SigningStatus = "pending" | "upload_received" | "confirmed";

export type ActionSource = "in_platform" | "email_reply";

// ─── Database row types ───────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  manager_id: string | null;
  language: "en" | "ar";
  is_active: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  department: string | null;
  assignment_mode: AssignmentMode;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  internal_role: GroupInternalRole;
  joined_at: string;
}

export interface RequestType {
  id: string;
  name: string;
  description: string | null;
  handling_group_id: string | null;
  workflow_definition_id: string | null;
  form_schema: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface Request {
  id: string;
  reference_number: string;
  title: string;
  type_id: string;
  requester_id: string;
  assigned_lawyer_id: string | null;
  handling_group_id: string | null;
  state: RequestState;
  priority: Priority;
  contract_value: number | null;
  currency: string;
  counterparty_name: string | null;
  counterparty_jurisdiction: string | null;
  governing_law: string | null;
  workflow_definition_id: string | null;
  workflow_state_json: Record<string, unknown>;
  sla_deadline: string | null;
  sla_paused_at: string | null;
  form_data: Record<string, unknown>;
  submitted_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  request_id: string;
  version: string;
  file_name: string;
  storage_path: string;
  file_type: FileType;
  uploaded_by: string;
  upload_source: DocSource;
  comment_count: number;
  mention_count: number;
  track_changes_count: number;
  is_execution_copy: boolean;
  created_at: string;
}

export interface ApprovalNode {
  id: string;
  request_id: string;
  phase: ApprovalPhase;
  node_definition_id: string;
  position: number;
  is_parallel: boolean;
  actor_user_id: string | null;
  status: NodeStatus;
  comment: string | null;
  acted_at: string | null;
  sla_deadline: string | null;
  delegated_to: string | null;
}

export interface InputRequest {
  id: string;
  request_id: string;
  from_user_id: string;
  to_group_id: string | null;
  to_user_id: string | null;
  question_text: string;
  source: InputSource;
  status: InputStatus;
  response_text: string | null;
  response_decision: ResponseDecision;
  responded_by: string | null;
  sla_deadline: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface SigningParty {
  id: string;
  request_id: string;
  party_name: string;
  party_role: string;
  signing_method: SigningMethod;
  expected_signatory_name: string;
  status: SigningStatus;
  signed_document_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
}

export interface AuditEntry {
  id: string;
  request_id: string | null;
  actor_id: string;
  action: string;
  from_state: string | null;
  to_state: string | null;
  payload: Record<string, unknown>;
  source: ActionSource;
  created_at: string;
}

export interface WorkflowDefinition {
  id: string;
  request_type_id: string;
  version: number;
  is_active: boolean;
  definition: WorkflowDSL;
  created_by: string;
  created_at: string;
}

// ─── Workflow DSL types ───────────────────────────────────────────────────────

export type NodeType =
  | "direct_manager"
  | "named_user"
  | "group_any_member"
  | "group_admin_only"
  | "group_director_only"
  | "group_member_then_director"
  | "group_member_then_admin"
  | "same_user_as_earlier_node"
  | "parallel_gate"
  | "conditional_branch";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  group_id?: string;
  user_id?: string;
  ref_node_id?: string;
  sla_hours: number;
  escalation_target: string;
  on_rejection: "stop_and_reject" | "return_to_lawyer" | "return_full_chain";
  children?: WorkflowNode[];
  completion_rule?: "all" | "majority";
  condition?: {
    field: string;
    operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in";
    value: unknown;
    then_nodes: string[];
    else_nodes?: string[];
  };
}

export interface WorkflowDSL {
  version: 1;
  zones: {
    pre_legal: WorkflowNode[];
    execution: WorkflowNode[];
  };
  legal_processing: {
    input_groups?: string[];
  };
}
