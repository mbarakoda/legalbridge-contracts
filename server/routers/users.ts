import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/lib/trpc/server";
import { assert as assertRBAC, RBACError } from "@/lib/rbac";

export const usersRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("users")
        .select("id, full_name, email, role, department, is_active")
        .eq("id", input.id)
        .single();

      if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return data;
    }),

  list: protectedProcedure
    .input(
      z.object({
        role: z.enum(["super_admin", "group_admin", "lawyer", "approver", "requester"]).optional(),
        group_id: z.string().uuid().optional(),
        is_active: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        assertRBAC(ctx.user.role, "admin:manage_users");
      } catch (e) {
        if (e instanceof RBACError) throw new TRPCError({ code: "FORBIDDEN", message: e.message });
        throw e;
      }

      let query = ctx.supabase
        .from("users")
        .select("id, full_name, email, role, department, is_active, created_at", { count: "exact" })
        .eq("is_active", input.is_active);

      if (input.role) query = query.eq("role", input.role);

      const { data, error, count } = await query
        .order("full_name")
        .range(input.offset, input.offset + input.limit - 1);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { items: data ?? [], total: count ?? 0 };
    }),
});
