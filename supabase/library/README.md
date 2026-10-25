# Reading library

Short cards summarising pages from trusted health organisations, shown in the app next to
related results and readings. Built by the `library-build` Edge Function; this folder holds
the list of source pages.

- `sources.json`: the pages to summarise (`url`, `source_name`, optional `extra_urls`).
  Overview pages are read together with their sub-pages automatically.
- `build.sh`: summarises every page and saves the cards. Pages that haven't changed since the
  last run are skipped without calling the AI, so re-running it is the refresh.

Run from the project root (needs the admin secret in a file, never committed):

```bash
LIBRARY_ADMIN_SECRET_FILE=/path/to/secret supabase/library/build.sh
```
