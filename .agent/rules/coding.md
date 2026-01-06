---
trigger: always_on
---

1. When updating or refacoring documents or code, never leave comments about the old version, avoid phrases like "updated", "replacing the old approach...", "doing (this) instead", "new", etc. This is to reduce congnitive load when reading, and we should always only keep the latest information. 

1. After done significant code changes, always check and update relevant documentations in the project. We should always maintain documentations for project handover, architecture, progress, and so on, so anyone working on the project always have a wholistic view of the progress and what to work on next. 

1. Do not create or use any mocks in feature code unless explicitly told to do so. If anything is too hard to do now, leave that to a TODO list.

1. When solving module compatibility issues between CommonJS and ESM, always lean to ESM unless impossible to do so.

1. When introducing environment variables, if you can't edit .env files, remember to update the respective example.env files (which are included in git).

1. When database schema is changed, make sure both client and server sides have the same schema, and changes are applied to Supabase DB.

1. Do not git push code unless told to do so.