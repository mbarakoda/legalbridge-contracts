import { router } from "@/lib/trpc/server";
import { requestsRouter } from "./routers/requests";
import { documentsRouter } from "./routers/documents";
import { usersRouter } from "./routers/users";

export const appRouter = router({
  requests: requestsRouter,
  documents: documentsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
