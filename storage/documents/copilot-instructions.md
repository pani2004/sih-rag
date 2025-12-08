# Echo - AI Coding Agent Instructions

## Architecture Overview

Echo is a **Turborepo monorepo** for a chatbot/widget platform with three main applications and shared packages:

### Applications (`apps/`)
- **`web/`** - Next.js 15 dashboard (port 3000) with Clerk auth, module-based architecture
  - Features: chatbot management, knowledge bases, file uploads, conversations, integrations, billing
  - Premium features gated with subscription checks
- **`widget/`** - Next.js 15 standalone chat widget (port 3001)
  - Public-facing chat interface embedded on customer sites
  - Receives `organizationId` and optional `chatbotId` via query params
  - Supports AI voice calling via Vapi integration
- **`embed/`** - Vite-built IIFE script (port 3002)
  - Tiny script customers add to their websites: `<script src="your-domain/widget.js" data-organization-id="org_xxx"></script>`
  - Creates iframe pointing to widget app with proper config
  - Handles positioning (bottom-right/bottom-left) and theming

### Packages (`packages/`)
- **`backend/`** - Convex backend (serverless functions, schema, real-time DB, RAG)
  - Integrated with `@convex-dev/rag` for vector search and embeddings
  - Integrated with `@convex-dev/agent` for AI agent capabilities
- **`ui/`** - Shared shadcn/ui component library with Radix primitives
  - All shadcn components centralized here, imported via `@workspace/ui/components/*`
- **`typescript-config/`, `eslint-config/`** - Shared configs
- **`math/`** - Example utility package

## Critical Workflows

### Development
```bash
# Start all apps in dev mode
pnpm dev

# Start specific app
pnpm --filter web dev         # port 3000
pnpm --filter widget dev      # port 3001  
pnpm --filter embed dev       # port 3002, opens demo.html

# Start Convex backend
pnpm --filter @workspace/backend dev
```

### Build & Deploy
```bash
# Build all
pnpm build

# Embed script deployment (REQUIRED after embed changes)
pnpm --filter embed build:deploy
# This builds dist/widget.iife.js AND copies to widget/public/widget.js
```

**Important**: The embed script must be built AND copied to `widget/public/widget.js` for local testing. The `build:deploy` script (in `apps/embed/scripts/build-and-deploy.js`) handles both steps.

### Debugging
```bash
# Check Convex function logs
pnpm --filter @workspace/backend dev  # Watch console for errors

# Type checking
pnpm --filter web typecheck
pnpm --filter widget typecheck

# Linting
pnpm lint
```

## Project-Specific Patterns

### Module Architecture (web app)
All features in `apps/web/modules/` follow this structure:
```
modules/
  <feature>/           # e.g., chatbots, knowledge-bases, billing
    ui/
      components/      # Feature-specific components
      views/          # Top-level page components
      layouts/        # Layout wrappers
    hooks/            # Feature-specific hooks
    constants/        # Feature constants
```

**Example**: `modules/chatbots/ui/views/chatbots-view.tsx` is imported in `app/(dashboard)/chatbots/page.tsx`

### Convex Backend Structure
Backend logic lives in `packages/backend/convex/`:
- **`private/`** - Mutations/queries/actions called from authenticated web/widget apps
  - Requires auth via `ctx.auth.getUserIdentity()` 
  - Returns `organizationId` from Clerk token
  - Examples: `private/chatbots.ts`, `private/knowledgeBases.ts`, `private/files.ts`
- **`public/`** - Public HTTP endpoints and unauthenticated queries
  - Widget app uses these (no auth required)
  - Examples: `public/widgetSettings.ts`, `public/conversations.ts`
- **`system/`** - Internal functions (prefixed `internal*`) called only by other Convex functions
  - Used for background jobs, file processing, AI operations
  - Examples: `system/fileProcessor.ts`, `system/ai/rag.ts`
- **`schema.ts`** - Convex database schema with validation schemas
  - Defines tables, indexes, and zod-style validators
  - Key schemas: `appearanceSchema`, `logoSchema` (reusable across chatbots/widget settings)

**Access pattern**:
```tsx
// In web/widget apps
import { api } from "@workspace/backend/_generated/api";
import { useQuery, useMutation, useAction } from "convex/react";

const data = useQuery(api.private.chatbots.list);
const update = useMutation(api.private.chatbots.update);

// Auth pattern in Convex functions (private/ directory)
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error("Unauthenticated");
const organizationId = identity.org_id;
```

### Database Schema Patterns
All organization-scoped tables follow this pattern:
```typescript
// In schema.ts
defineTable({
  organizationId: v.string(),
  // ... other fields
})
.index("by_organization_id", ["organizationId"])
```

Key tables:
- **`chatbots`** - Multiple chatbots per org, each linked to a knowledge base
- **`knowledgeBases`** - Contains `ragNamespace` for vector search isolation
- **`conversations`** - Linked to `contactSessions` (visitor sessions), filterable by status/chatbot
- **`widgetSettings`** - Default org-wide chatbot config (fallback when no chatbot specified)
- **`plugins`** - External integrations (e.g., Vapi for voice), stores AWS Secrets Manager reference
- **`subscriptions`** - Tracks org subscription status (updates via Clerk webhooks)
- **`notifications`** - File processing status updates, unread count tracking

### RAG & AI Integration
Uses `@convex-dev/rag` for vector search and embeddings:
```typescript
// System RAG instance in system/ai/rag.ts
import { RAG } from "@convex-dev/rag";
import { openai } from "@ai-sdk/openai";

const rag = new RAG(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: 1536,
});
```

**Knowledge base namespacing**: Each knowledge base has a unique `ragNamespace` to isolate vector search. File chunks are embedded into the knowledge base's namespace.

**File processing workflow**:
1. User uploads file → `generateUploadUrl` mutation → stores in Convex storage
2. `processFile` internal action triggered → extracts text → chunks content
3. Chunks embedded via RAG → stored in knowledge base namespace
4. Notification created to inform user of processing status

### State Management (Jotai)
Used sparingly for local UI state, NOT for server data (Convex handles that):
```tsx
// apps/web/modules/dashboard/atoms.ts
import { atom } from "jotai";

export const statusFilterAtom = atom<"all" | "unresolved" | "escalated" | "resolved">("all");
export const chatbotFilterAtom = atom<Id<"chatbots"> | "all">("all");

// Usage in components
import { useAtomValue, useSetAtom } from "jotai/react";
const statusFilter = useAtomValue(statusFilterAtom);
const setChatbotFilter = useSetAtom(chatbotFilterAtom);
```

**Jotai Provider**: Dashboard layout wraps content in `<Provider>` to scope atoms (see `modules/dashboard/ui/layouts/dashboard-layout.tsx`)

Widget app uses atoms for local state (e.g., `widgetSettingsAtom` in `widget/modules/widget/atoms/`)

### Workspace Package Imports
```tsx
// UI components (from packages/ui)
import { Button } from "@workspace/ui/components/button";
import "@workspace/ui/globals.css";

// Backend API (from packages/backend)
import { api } from "@workspace/backend/_generated/api";

// Math utilities (from packages/math)
import { add } from "@workspace/math";
```

### Authentication & State
- **Clerk** for auth (domain in `CLERK_JWT_ISSUER_DOMAIN`)
- **ConvexProviderWithClerk** wraps app in `apps/web/components/providers.tsx`
  ```tsx
  import { ConvexProviderWithClerk } from 'convex/react-clerk';
  import { useAuth } from '@clerk/nextjs';
  
  <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
  ```
- Organization-scoped data: most tables indexed by `organizationId` (from Clerk token)
- **Subscription gating**: `PremiumFeatureOverlay` component wraps premium pages
  - Pages wrapped: chatbots, files, knowledge-bases, customization, vapi plugin
  - Component checks subscription status and displays upgrade prompt if needed

### File Upload Pattern
Convex storage workflow for files/images:
```tsx
// 1. Generate upload URL (mutation)
const generateUploadUrl = useMutation(api.private.files.generateUploadUrl);
const uploadUrl = await generateUploadUrl();

// 2. Upload file to URL
const result = await fetch(uploadUrl, {
  method: "POST",
  body: file,
});
const { storageId } = await result.json();

// 3. Save metadata with storageId
await saveFile({ storageId, fileName, mimeType });

// 4. Retrieve URL for display (in query/mutation)
const url = await ctx.storage.getUrl(storageId);
```

**Logo handling**: Uses `logoSchema` with `type: "default" | "upload" | "url"` to support multiple sources

### Widget Integration Flow
1. Customer adds embed script to their site with data attributes:
   ```html
   <script 
     src="your-domain/widget.js" 
     data-organization-id="org_xxx"
     data-chatbot-id="chatbot_123"  <!-- optional -->
     data-position="bottom-right"    <!-- optional: bottom-right or bottom-left -->
   ></script>
   ```
2. Embed script (`apps/embed/embed.ts`) reads attributes and creates iframe:
   - Constructs widget URL with query params
   - Applies positioning styles
   - Creates chat bubble button with org's branding
3. Widget app (`apps/widget/app/page.tsx`) receives params and renders `WidgetView`
4. Widget queries Convex via `public/` endpoints (no auth required)
   - Falls back to `widgetSettings` if no `chatbotId` specified
   - Loads appearance, greet message, suggestions, Vapi config

**Theming**: Widget reads org's primary color and applies to chat bubble, headers, buttons

## Technology Stack

- **Frontend**: React 19, Next.js 15, TailwindCSS 4, shadcn/ui, Radix UI
- **Backend**: Convex (real-time serverless functions + DB)
- **Auth**: Clerk
- **Build**: Turborepo, pnpm workspaces
- **Monitoring**: Sentry (web app only)
- **Forms**: react-hook-form + zod
- **AI/Voice**: Vapi integration (@vapi-ai/web, @vapi-ai/server-sdk), @convex-dev/agent

## Common Tasks

### Adding shadcn/ui Component
```bash
# From monorepo root
pnpm dlx shadcn@latest add <component> -c apps/web
# Components added to packages/ui/src/components
```

### Creating New Convex Function
1. Add to appropriate directory:
   - `private/` - Requires authentication, use `query`, `mutation`, or `action`
   - `public/` - No auth required, use `query` or `httpAction`
   - `system/` - Internal only, use `internalQuery`, `internalMutation`, or `internalAction`
2. Export function with proper type
3. Import in frontend: `api.private.<file>.<function>` or `api.public.<file>.<function>`

**Example**:
```typescript
// packages/backend/convex/private/example.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const createExample = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const organizationId = identity.org_id;
    
    return await ctx.db.insert("examples", {
      organizationId,
      name: args.name,
    });
  },
});
```

### Adding Feature Module (web app)
```bash
# Create module structure
mkdir -p apps/web/modules/<feature>/ui/{components,views}
mkdir -p apps/web/modules/<feature>/hooks

# Create view component
# apps/web/modules/<feature>/ui/views/<feature>-view.tsx

# Import in route
# apps/web/app/(dashboard)/<feature>/page.tsx
import { <Feature>View } from "@/modules/<feature>/ui/views/<feature>-view";
```

**Naming pattern**: All view components end with `-view.tsx`, all dialogs with `-dialog.tsx`

### Webhook Integration
Clerk webhooks configured in `packages/backend/convex/http.ts`:
```typescript
// Webhook endpoint: /clerk-webhook
// Handles: subscription.updated, organization.created, etc.
// Updates: organization limits, subscription status in Convex DB
```

Webhook validates using Svix, then calls internal mutations to update DB state.

### Testing Widget Locally
```bash
# Terminal 1: Start Convex
pnpm --filter @workspace/backend dev

# Terminal 2: Start widget
pnpm --filter widget dev

# Terminal 3: Build and serve embed script
pnpm --filter embed build:deploy
pnpm --filter embed dev

# Visit http://localhost:3002/demo.html or faq.html
```

Demo files in `apps/embed/*.html` show different integration examples.

## File Naming Conventions
- React components: `kebab-case.tsx` (e.g., `create-chatbot-dialog.tsx`)
- Convex functions: `camelCase.ts` (e.g., `knowledgeBases.ts`)
- Next.js routes: follow App Router conventions (`page.tsx`, `layout.tsx`)

## Key Environment Variables
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL
- `CLERK_JWT_ISSUER_DOMAIN` - Clerk JWT issuer for auth
- `CLERK_SECRET_KEY` - For server-side Clerk operations

## Testing Locally
1. Start Convex: `pnpm --filter @workspace/backend dev`
2. Start web app: `pnpm --filter web dev`
3. Start widget: `pnpm --filter widget dev`
4. Build embed (if testing widget integration): `pnpm --filter embed build:deploy`
5. Visit demo: `http://localhost:3002/demo.html`
