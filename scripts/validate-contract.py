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

# Shared Hair Passport fixtures exercise the same domain shapes as the server mapper.
import copy
import json

fixtures = json.loads((root / "contracts/fixtures/hair-passport-read.json").read_text(encoding="utf-8"))
hair_validator = Draft202012Validator(
    {"$ref": "#/components/schemas/HairPassportReadResult", "components": contract["components"]},
    format_checker=FormatChecker(),
)
error_validator = Draft202012Validator(
    {"$ref": "#/components/schemas/ErrorResponse", "components": contract["components"]},
    format_checker=FormatChecker(),
)
for name in ("empty", "populated"):
    hair_validator.validate(fixtures[name])
for mutation in fixtures["invalid"]:
    payload = copy.deepcopy(fixtures["populated"])
    target = payload
    for key in mutation["path"][:-1]:
        target = target[int(key)] if isinstance(target, list) else target[key]
    key = mutation["path"][-1]
    if mutation.get("remove"):
        del target[key]
    else:
        target[key] = mutation["value"]
    assert list(hair_validator.iter_errors(payload)), mutation["name"]
for failure in fixtures["errors"]:
    error_validator.validate(failure)
assert "HAIR_PASSPORT_NOT_FOUND" in errors
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport"]) == {"get", "post", "patch"}
hair_rpc = Draft202012Validator(
    {"$ref": "#/components/schemas/HairPassportRpcRequest", "components": contract["components"]},
    format_checker=FormatChecker(),
)
request = {"p_membership_id": identifier, "p_location_id": identifier, "p_client_id": identifier}
hair_rpc.validate(request)
for options in ({"passport_id": identifier}, {"organization_id": identifier}, {"page_size": 101}, {"include_archived": "true"}):
    assert list(hair_rpc.iter_errors(request | {"p_options": options})), options
print(f"PASS: Hair Passport read contract: 2 snapshots, {len(fixtures['invalid'])} malformed payloads, {len(fixtures['errors'])} errors, and bounded read-only requests")

mutations = json.loads((root / "contracts/fixtures/hair-core-mutation.json").read_text(encoding="utf-8"))
mutation_validator = Draft202012Validator(
    {"$ref": "#/components/schemas/HairMutationCommand", "components": contract["components"]}, format_checker=FormatChecker())
mutation_result = Draft202012Validator(
    {"$ref": "#/components/schemas/HairMutationResult", "components": contract["components"]}, format_checker=FormatChecker())
core_rpc = Draft202012Validator(
    {"$ref": "#/components/schemas/HairCoreRpcRequest", "components": contract["components"]}, format_checker=FormatChecker())
for command in mutations["valid"]:
    mutation_validator.validate(command)
    core_rpc.validate({"p_membership_id": identifier, "p_location_id": identifier, "p_client_id": command["client_id"],
                       "p_operation": command["operation"], "p_payload": command["payload"] | ({"region_id": command["region_id"]} if "region_id" in command else {})})
for case in mutations["invalid"]:
    command = copy.deepcopy(mutations["valid"][case["base"]])
    command["payload"].update(case["payload"])
    assert list(mutation_validator.iter_errors(command)), case["name"]
for name in ("created", "enriched", "region"):
    mutation_result.validate(mutations[name])
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/regions"]) == {"post"}
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/regions/{regionId}"]) == {"patch"}
print(f"PASS: Hair core mutation contract: {len(mutations['valid'])} commands/RPC requests, {len(mutations['invalid'])} rejection cases, 3 results")

observations = json.loads((root / "contracts/fixtures/hair-observation-mutation.json").read_text(encoding="utf-8"))
def observation_validator(schema):
    return Draft202012Validator({"$ref": "#/components/schemas/" + schema, "components": contract["components"]}, format_checker=FormatChecker())
for command in observations["valid"]:
    observation_validator("HairAddObservationCommand").validate(command)
    observation_validator("HairObservationRpcRequest").validate({"p_membership_id": identifier, "p_location_id": identifier,
        "p_client_id": command["client_id"], "p_payload": command["payload"]})
for case in observations["invalid"]:
    command = copy.deepcopy(observations["valid"][0])
    command["payload"].update(case["payload"])
    assert list(observation_validator("HairAddObservationCommand").iter_errors(command)), case["name"]
for result in observations["results"]:
    observation_validator("HairAddObservationResult").validate(result)
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/observations"]) == {"post"}
print(f"PASS: Observation/evidence contract: {len(observations['valid'])} commands and RPCs, {len(observations['invalid'])} rejections, {len(observations['results'])} existing-format observations")
