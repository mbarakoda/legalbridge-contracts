# LexiFlow — Sprint 1 Setup

## Prerequisites
- Node.js 20+
- npm 10+

## 1. Install dependencies

```bash
cd lexiflow
npm install
```

## 2. Set the service role key

Open `.env.local` and replace the placeholder:

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Get the key from:  
**Supabase Dashboard → Project `lexiflow-clm` → Settings → API → service_role secret**

> ⚠️ Never commit this key. It bypasses RLS and is server-side only.

## 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/en/login`.

## 4. Create your first user

Go to **Supabase Dashboard → Authentication → Users → Add user**, then run this SQL in the SQL Editor to promote them to `super_admin`:

```sql
UPDATE users
SET role = 'super_admin'
WHERE email = 'your@email.com';
```

## Project structure (Sprint 1)

```
lexiflow/
├── app/
│   ├── layout.tsx                    ← minimal root (delegates to [locale])
│   ├── page.tsx                      ← redirects / → /en
│   ├── globals.css                   ← Lex-Enterprise design tokens
│   ├── api/trpc/[trpc]/route.ts      ← tRPC HTTP handler
│   └── [locale]/
│       ├── layout.tsx                ← html/body, Inter font, providers
│       ├── auth/callback/route.ts    ← OAuth/magic-link callback
│       ├── (auth)/login/             ← Login page + server action
│       └── (app)/
│           ├── layout.tsx            ← auth guard + AppShell
│           └── dashboard/            ← role-aware dashboard
├── components/
│   ├── providers.tsx                 ← tRPC + React Query provider
│   └── app-shell.tsx                 ← sidebar navigation
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── state-machine/index.ts        ← 14-state transition guard
│   ├── rbac/index.ts                 ← 31 capabilities × 5 roles
│   └── trpc/{server,client}.ts
├── server/
│   ├── root.ts                       ← AppRouter
│   └── routers/{requests,documents,users}.ts
├── i18n/
│   ├── routing.ts
│   ├── request.ts
│   └── messages/{en,ar}.json
├── types/index.ts                    ← all enums + DB row types
├── middleware.ts                     ← next-intl + session refresh
└── .env.local                        ← fill SUPABASE_SERVICE_ROLE_KEY
```

## Supabase project

- **Project:** `lexiflow-clm`  
- **Region:** eu-central-1  
- **URL:** `https://xzsxdeazrxxuwuqkjsbf.supabase.co`

### Tables created (Sprint 1)
`groups` · `users` · `group_members` · `workflow_definitions` · `request_types` · `requests` · `documents` · `document_mentions` · `approval_nodes` · `input_requests` · `signing_parties` · `audit_log`

All tables have RLS enabled. Storage bucket `contract-documents` created (50 MB limit, Word + PDF + image).

## Next: Sprint 2

- Intake form (5-step wizard)
- Request detail page
- Lawyer assignment flow
- Workflow DSL builder (admin)
