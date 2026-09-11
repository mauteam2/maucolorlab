"""Validate the public contract and security-critical platform vocabulary."""
from pathlib import Path
import yaml
from openapi_spec_validator import validate
from jsonschema import Draft202012Validator, FormatChecker

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
client_web = (root / "apps/web/lib/clients/contracts.ts").read_text(encoding="utf-8")
client_android = (root / "apps/android/app/src/main/java/com/elifora/app/data/clients/SupabaseClientRepository.kt").read_text(encoding="utf-8")
for field in ("full_name", "phone", "phone_region", "email", "birth_date", "client_id", "expected_version", "request_id", "confirmation_token"):
    assert field in client_web and field in client_android, field
for code in ("CLIENT_NOT_FOUND", "CLIENT_ARCHIVED", "DUPLICATE_CLIENT_CANDIDATES", "DUPLICATE_CONFIRMATION_INVALID", "VALIDATION_FAILED", "CONFLICT"):
    assert code in errors and code in client_web, code
validator = Draft202012Validator({"$ref": "#/components/schemas/ClientCommand", "components": contract["components"]}, format_checker=FormatChecker())
identifier = "70000000-0000-4000-8000-000000000001"
identity = {"full_name": "Synthetic Person", "phone": "05321234567", "request_id": identifier}
versioned = {"client_id": identifier, "expected_version": 1, "request_id": identifier}
for operation, payload in (("list", {}), ("detail", {"client_id": identifier}), ("create", identity), ("update", identity | versioned), ("archive", versioned), ("restore", versioned)):
    validator.validate({"operation": operation, "payload": payload})
for command in ({"operation": "create", "payload": identity | {"organization_id": identifier}}, {"operation": "update", "payload": identity}, {"operation": "list", "payload": {"limit": 51}}):
    assert list(validator.iter_errors(command)), "Contract accepted an unsafe client command"
print("PASS: OpenAPI, workflow YAML, shared vocabulary, and six client commands with rejection cases")
