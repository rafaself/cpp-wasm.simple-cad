# 70_security-review

Applies when: tasks touch authentication, authorization, secrets, or backend surface area.

Rules (imperative)
- Do NOT log PII.
- Verify that authentication middleware wraps every route that requires it.
- Secrets MUST be stored in environment variables and never hard-coded in source.
- Any change that alters authentication, authorization, or data exposure MUST be flagged for security review.

Backend guidance (FastAPI)
- Keep API layer thin: validation + orchestration only.
- Prefer Pydantic models for all external input; validate everything.
- Side effects (DB/files/network) MUST be isolated behind dedicated modules/services.
