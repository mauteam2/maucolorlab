"""Validate the public contract and security-critical platform vocabulary."""
from pathlib import Path
import yaml
from openapi_spec_validator import validate

root = Path(__file__).resolve().parents[1]
contract = yaml.safe_load((root / "contracts/openapi.yaml").read_text(encoding="utf-8"))
validate(contract)
for path in (root / ".github/workflows").glob("*.yml"):
    yaml.safe_load(path.read_text(encoding="utf-8"))
errors = contract["components"]["schemas"]["ErrorCode"]["enum"]
android = (root / "apps/android/app/src/main/java/com/elifora/app/domain/auth/WorkspaceController.kt").read_text(encoding="utf-8")
for error in ("UNAUTHENTICATED", "SESSION_EXPIRED", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "FORBIDDEN"):
    assert error in errors and error in android, error
context = contract["components"]["schemas"]["ActiveTenantContext"]
web = (root / "apps/web/lib/tenant/context.ts").read_text(encoding="utf-8")
adapter = (root / "apps/android/app/src/main/java/com/elifora/app/data/auth/SupabaseAuthRepository.kt").read_text(encoding="utf-8")
for field in context["required"]:
    assert field in web and field in adapter, field
print("PASS: OpenAPI, workflow YAML, and shared context/error vocabulary")
