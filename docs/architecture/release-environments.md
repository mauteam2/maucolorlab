# Release environments

ELIFORA progresses through Development, Staging, Pilot, and Production. Each environment uses separate Supabase projects, keys, data, storage, and deployment configuration.

- Development uses synthetic local data and local Supabase where possible.
- Staging validates migrations, service contracts, and release candidates with non-production data.
- Pilot is a controlled pre-production environment for approved salon trials and operational validation.
- Production contains live salon data and accepts only reviewed, tested, forward migrations through the release process.

Client builds contain only their environment's public URL and publishable key. Secret/service-role keys remain in the relevant server environment. A migration is first exercised locally, then in Staging, then Pilot, and only then considered for Production. Phase 0 configures no remote environment and performs no deployment.

