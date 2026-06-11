import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/lib/trpc/server";
import { assertTransition, StateMachineError } from "@/lib/state-machine";
import { assert as assertRBAC, RBACError } from "@/lib/rbac";
import type { RequestState, Priority } from "@/types";

const priorityEnum = z.enum(["critical", "high", "normal", "low"]);
const stateEnum = z.enum([
  "submitted",
  "pending_pre_legal_approval",
  "pending_legal_assignment",
  "under_legal_review",
  "pending_internal_inputs",
  "ready_to_share",
  "returned_with_external_feedback",
  "execution_copy_review",
  "pending_execution_approval",
  "ready_for_signature",
  "execution_in_progress",
  "archived",
  "rejected",
  "withdrawn",
]);

export const requestsRouter = router({
  // ── Submit new request ──────────────────────────────────────────────────────
  submit: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(300),
        type_id: z.string().uuid(),
        priority: priorityEnum.default("normal"),
        contract_value: z.number().positive().nullable().optional(),
        currency: z.string().default("EGP"),
        counterparty_name: z.string().nullable().optional(),
        counterparty_jurisdiction: z.string().nullable().optional(),
        governing_law: z.string().nullable().optional(),
        form_data: z.record(z.unknown()).default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        assertRBAC(ctx.user.role, "request:submit");
      } catch (e) {
        if (e instanceof RBACError) throw new TRPCError({ code: "FORBIDDEN", message: e.message });
        throw e;
      }

      // Determine initial state: check if request type has a workflow with Phase A
      const { data: reqType } = await ctx.supabase
        .from("request_types")
        .select("workflow_definition_id, handling_group_id")
        .eq("id", input.type_id)
        .single();

      if (!reqType) throw new TRPCError({ code: "NOT_FOUND", message: "Request type not found" });

      let initialState: RequestState = "pending_legal_assignment";
      let workflowDefId: string | null = null;

      if (reqType.workflow_definition_id) {
        const { data: wfDef } = await ctx.supabase
          .from("workflow_definitions")
          .select("id, definition")
          .eq("id", reqType.workflow_definition_id)
          .eq("is_active", true)
          .single();

        if (wfDef) {
          workflowDefId = wfDef.id;
          const hasPreLegal =
            Array.isArray((wfDef.definition as any)?.zones?.pre_legal) &&
            (wfDef.definition as any).zones.pre_legal.length > 0;
          if (hasPreLegal) initialState = "pending_pre_legal_approval";
        }
      }

      // Generate reference number
      const { count } = await ctx.supabase
        .from("requests")
        .select("id", { count: "exact", head: true });
      const ref = `LB-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, "0")}`;

      const { data: request, error } = await ctx.supabase
        .from("requests")
        .insert({
          reference_number: ref,
          title: input.title,
          type_id: input.type_id,
          requester_id: ctx.user.id,
          handling_group_id: reqType.handling_group_id,
          state: initialState,
          priority: input.priority,
          contract_value: input.contract_value ?? null,
          currency: input.currency,
          counterparty_name: input.counterparty_name ?? null,
          counterparty_jurisdiction: input.counterparty_jurisdiction ?? null,
          governing_law: input.governing_law ?? null,
          workflow_definition_id: workflowDefId,
          workflow_state_json: {},
          form_data: input.form_data,
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // Write audit log
      await ctx.supabase.from("audit_log").insert({
        request_id: request.id,
        actor_id: ctx.user.id,
        action: "request_submitted",
        to_state: initialState,
        payload: { reference_number: ref },
        source: "in_platform",
      });

      return request;
    }),

  // ── Get by ID ───────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("requests")
        .select(`
          *,
          requester:users!requests_requester_id_fkey(id, full_name, email, department),
          assigned_lawyer:users!requests_assigned_lawyer_id_fkey(id, full_name, email),
          handling_group:groups(id, name, type),
          request_type:request_types(id, name)
        `)
        .eq("id", input.id)
        .single();

      if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      // RLS on Supabase handles row visibility; if we got here, actor has access
      return data;
    }),

  // ── List my tasks ───────────────────────────────────────────────────────────
  listMyTasks: protectedProcedure
    .input(
      z.object({
        status_filter: z.enum(["open", "archived", "all"]).default("open"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role;
      let query = ctx.supabase
        .from("requests")
        .select(`
          id, reference_number, title, state, priority, counterparty_name,
          sla_deadline, submitted_at, updated_at,
          requester:users!requests_requester_id_fkey(full_name),
          assigned_lawyer:users!requests_assigned_lawyer_id_fkey(full_name),
          request_type:request_types(name)
        `, { count: "exact" });

      // Scope by role
      if (role === "requester") {
        query = query.eq("requester_id", ctx.user.id);
      } else if (role === "lawyer") {
        query = query.eq("assigned_lawyer_id", ctx.user.id);
      }
      // group_admin, super_admin, approver see all they have RLS access to

      // Status filter
      if (input.status_filter === "open") {
        query = query.not("state", "in", '("archived","rejected","withdrawn")');
      } else if (input.status_filter === "archived") {
        query = query.in("state", ["archived", "rejected", "withdrawn"]);
      }

      const { data, error, count } = await query
        .order("updated_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return { items: data ?? [], total: count ?? 0 };
    }),

  // ── Transition state ────────────────────────────────────────────────────────
  transition: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        to_state: stateEnum,
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Load current state
      const { data: req, error: fetchErr } = await ctx.supabase
        .from("requests")
        .select("id, state")
        .eq("id", input.id)
        .single();

      if (fetchErr || !req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      const from = req.state as RequestState;
      const to = input.to_state as RequestState;

      // 2. RBAC check
      try {
        assertRBAC(ctx.user.role, "request:transition_state");
      } catch (e) {
        if (e instanceof RBACError) throw new TRPCError({ code: "FORBIDDEN", message: e.message });
        throw e;
      }

      // 3. State machine guard
      try {
        assertTransition(from, to, ctx.user.role);
      } catch (e) {
        if (e instanceof StateMachineError)
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        throw e;
      }

      // 4. Write in a single update (atomicity via Supabase)
      const { data: updated, error: updateErr } = await ctx.supabase
        .from("requests")
        .update({ state: to, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();

      if (updateErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateErr.message });

      // 5. Audit log
      await ctx.supabase.from("audit_log").insert({
        request_id: input.id,
        actor_id: ctx.user.id,
        action: "state_transition",
        from_state: from,
        to_state: to,
        payload: { comment: input.comment ?? null },
        source: "in_platform",
      });

      return updated;
    }),

  // ── Assign lawyer ───────────────────────────────────────────────────────────
  assignLawyer: protectedProcedure
    .input(
      z.object({
        request_id: z.string().uuid(),
        lawyer_id: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        assertRBAC(ctx.user.role, "request:assign_lawyer");
      } catch (e) {
        if (e instanceof RBACError) throw new TRPCError({ code: "FORBIDDEN", message: e.message });
        throw e;
      }

      const { data, error } = await ctx.supabase
        .from("requests")
        .update({
          assigned_lawyer_id: input.lawyer_id,
          state: "under_legal_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.request_id)
        .eq("state", "pending_legal_assignment") // guard: only assign from this state
        .select()
        .single();

      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      if (!data) throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not in pending_legal_assignment state" });

      await ctx.supabase.from("audit_log").insert({
        request_id: input.request_id,
        actor_id: ctx.user.id,
        action: "lawyer_assigned",
        to_state: "under_legal_review",
        payload: { lawyer_id: input.lawyer_id },
        source: "in_platform",
      });

      return data;
    }),
});
