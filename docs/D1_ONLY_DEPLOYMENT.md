# Private reading on Workers Free + D1 (no R2)

This fork stores book text in private D1 tables instead of requiring an R2 subscription.
It has not yet been verified against a deployed Cloudflare account or the mobile ChatGPT client.

## Requirements and limits

- Cloudflare Workers Free and a D1 database; no R2 binding/subscription.
- One Free D1 database has a 500 MB storage ceiling (including indexes and notes).
- This adapter currently accepts at most 8 MiB of extracted UTF-8 text per object.
- Books are split into 128 KiB BLOB rows, below D1's 2 MB row limit.
- Free plan CPU/request/database limits still apply; start with a small TXT book.
- D1 persists separately from Worker memory. Database deletion still deletes books.
- No data was migrated from R2. Existing R2 deployments should keep their binding;
  the Worker still selects R2 when SOURCES_BUCKET is bound.

## Deployment

1. Create a D1 database named `an-reading-db` in the Cloudflare dashboard.
2. Set `database_name` and `database_id` in `server/wrangler.jsonc` to that database.
3. Install with Node 22+ and `pnpm install --frozen-lockfile`.
4. Authenticate Wrangler via the official browser authorization flow (`pnpm --filter @ss/server exec wrangler login`).
5. Apply both migrations: `pnpm --filter @ss/server exec wrangler d1 migrations apply DB --remote`.
6. Generate a strong random `MCP_PATH_TOKEN` and set it with the interactive
   `pnpm --filter @ss/server exec wrangler secret put MCP_PATH_TOKEN` prompt.
   Do not put the token in Git, logs, screenshots, or a public issue.
7. Run `pnpm deploy:cloudflare`.
8. The private MCP URL is `https://<worker>.workers.dev/mcp/<token>/ios-v4`.
   The private standalone reader URL is `https://<worker>.workers.dev/reader/<token>`.

Keep production observability disabled: invocation URLs contain the path token.
The token grants full access to this personal bookshelf; this is not multi-user OAuth.
A random wrong token must return 404. Verify MCP initialization and tool listing,
then upload a small book, restart the client, and verify book text, progress,
and notes restore before treating the deployment as ready.
