# EGM design, structural and style critique

Three fresh-context reviewers read their bundled personas and feature-spec standard and reviewed feature lines 1..77 with the full 107-line spec as context. Source-reading evidence was returned by design/structure reviewers; style read both preceding reports. All reviews completed before implementation.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| D1 | Major | Open WebSockets/cached data need not trigger server rejection after eight-hour expiry; window events miss other-tab logout | Add 60-second session verification, five-second timeout, focus/visibility verification and timestamp-only cross-tab logout signal. Fail closed on verification failure. |
| T1 | Major | Second accepted local-mode flag unnamed | Explicitly identify TRADEHUB_LOCAL_PREVIEW and TRADEHUB_LOCAL_AUTH and their owning runtimes. |
| T2 | Nit | Clarifications carry normative rules away from governing sections | Mark clarifications normative and reference them from policy sections. |
| T3 | Nit | Historical environment naming inconsistent | Define all historical-preview references as the same existing preview:local runtime. |

Structural reviewer: no findings. Design reviewer: no other Blocker/Major. All listed findings accepted and incorporated before implementation.
