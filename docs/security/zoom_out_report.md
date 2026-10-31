# EGM initial zoom-out review

Fresh-context reviewer: security_zoom_initial. Read persona `agents/zoom_out.md`, `zoom-out-standard.md`, the full 97-line specification, README and explicitly supplied source context. Read-only review completed before security implementation.

- Major Z1, specification lines 57, 66, 75, 91: logout cache clearing alone does not prevent in-flight REST success/403 from repopulating shared cache or denied endpoints. Require a session generation for cache writes, denial recording and queued retries. Test delayed success/403 after logout and subsequent login.
- No Blocker findings. Existing auth/store reuse and explicit deferred relay scope were accepted.

Resolution: accept Z1. Add a module-level session generation, increment it on logout/expiry, and reject old-generation requests/results before retries, denial recording and cache writes. No server architecture expansion is needed.
