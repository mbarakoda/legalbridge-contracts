import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/lib/trpc/server";
import { assert as assertRBAC, RBACError } from "@/lib/rbac";

export const documentsRouter = router({
  // ── Get version history for a request ──────────────────────────────────────
  getVersionHistory: protectedProcedure
    .input(z.object({ request_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("documents")
        .select(`
          *,
          uploader:users!documents_uploaded_by_fkey(id, full_name, role)
        `)
        .eq("request_id", input.request_id)
        .order("created_at", { ascending: false });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ── Get a signed download URL ───────────────────────────────────────────────
  getDownloadUrl: protectedProcedure
    .input(z.object({ document_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: doc, error: docErr } = await ctx.supabase
        .from("documents")
        .select("storage_path, file_name, request_id")
        .eq("id", input.document_id)
        .single();

      if (docErr || !doc)
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

      const { data, error } = await ctx.supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60 * 60); // 1 hour

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { url: data.signedUrl, file_name: doc.file_name };
    }),

  // ── Register a document after client-side upload ────────────────────────────
  // Client uploads directly to Supabase Storage via signed upload URL,
  // then calls this to register the document in the DB and trigger parsing.
  register: protectedProcedure
    .input(
      z.object({
        request_id: z.string().uuid(),
        file_name: z.string(),
        storage_path: z.string(),
        file_type: z.enum(["docx", "pdf"]),
        upload_source: z.enum(["lawyer", "requester", "counterparty", "ai_generated"]),
        is_execution_copy: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check capability based on source
      const capabilityMap = {
        lawyer: "document:upload_draft",
        requester: "document:upload_signed_copy",
        counterparty: "document:upload_counterparty_feedback",
        ai_generated: "document:upload_draft",
      } as const;

      try {
        assertRBAC(ctx.user.role, capabilityMap[input.upload_source]);
      } catch (e) {
        if (e instanceof RBACError) throw new TRPCError({ code: "FORBIDDEN", message: e.message });
        throw e;
      }

      // Determine version number
      const { count } = await ctx.supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("request_id", input.request_id);

      const versionNum = (count ?? 0) + 1;
      const version = `v${Math.floor(versionNum / 10 + 1)}.${versionNum % 10}`;

      const { data, error } = await ctx.supabase
        .from("documents")
        .insert({
          request_id: input.request_id,
          version,
          file_name: input.file_name,
          storage_path: input.storage_path,
          file_type: input.file_type,
          uploaded_by: ctx.user.id,
          upload_source: input.upload_source,
          is_execution_copy: input.is_execution_copy,
          // Parsed counts default to 0; Edge Function updates these after parsing
          comment_count: 0,
          mention_count: 0,
          track_changes_count: 0,
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await ctx.supabase.from("audit_log").insert({
        request_id: input.request_id,
        actor_id: ctx.user.id,
        action: "document_uploaded",
        payload: {
          document_id: data.id,
          version,
          file_name: input.file_name,
          source: input.upload_source,
        },
        source: "in_platform",
      });

      return data;
    }),

  // ── Get a signed upload URL (pre-signed, client uploads directly) ───────────
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        request_id: z.string().uuid(),
        file_name: z.string(),
        file_type: z.enum(["docx", "pdf"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const path = `${input.request_id}/${Date.now()}_${input.file_name}`;
      const { data, error } = await ctx.supabase.storage
        .from("documents")
        .createSignedUploadUrl(path);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { upload_url: data.signedUrl, storage_path: path, token: data.token };
    }),
});
