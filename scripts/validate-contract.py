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

physical_tests = json.loads((root / "contracts/fixtures/hair-physical-test-mutation.json").read_text(encoding="utf-8"))
for command in physical_tests["valid"]:
    observation_validator("HairAddPhysicalTestCommand").validate(command)
    observation_validator("HairPhysicalTestRpcRequest").validate({"p_membership_id": identifier, "p_location_id": identifier,
        "p_client_id": command["client_id"], "p_payload": command["payload"]})
for case in physical_tests["invalid"]:
    command = copy.deepcopy(physical_tests["valid"][0])
    command["payload"].update(case["payload"])
    assert list(observation_validator("HairAddPhysicalTestCommand").iter_errors(command)), case["name"]
for result in physical_tests["results"]:
    observation_validator("HairAddPhysicalTestResult").validate(result)
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/tests"]) == {"post"}
print(f"PASS: Physical-test contract: {len(physical_tests['valid'])} commands and RPCs, {len(physical_tests['invalid'])} rejections, {len(physical_tests['results'])} existing-format tests")

history = json.loads((root / "contracts/fixtures/hair-history-mutation.json").read_text(encoding="utf-8"))
for command in history["valid"]:
    observation_validator("HairAddHistoryCommand").validate(command)
    observation_validator("HairHistoryRpcRequest").validate({"p_membership_id": identifier, "p_location_id": identifier,
        "p_client_id": command["client_id"], "p_payload": command["payload"]})
for case in history["invalid"]:
    command = copy.deepcopy(history["valid"][0])
    command["payload"].update(case["payload"])
    assert list(observation_validator("HairAddHistoryCommand").iter_errors(command)), case["name"]
for result in history["results"]:
    observation_validator("HairAddHistoryResult").validate(result)
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/history"]) == {"post"}
print(f"PASS: Technical-history contract: {len(history['valid'])} commands and RPCs, {len(history['invalid'])} rejections, {len(history['results'])} existing-format events")

confidence_fixture = json.loads((root / "contracts/fixtures/confidence-result.json").read_text(encoding="utf-8"))
observation_validator("CaseConfidenceResult").validate(confidence_fixture)
golden = json.loads((root / "contracts/fixtures/confidence-golden.json").read_text(encoding="utf-8"))
observation_validator("ConfidenceEvaluationInput").validate({"pages": [golden["baseSnapshot"]], "evaluatedAt": golden["evaluatedAt"]})
observation_validator("ConfidenceSnapshotRequest").validate({"p_membership_id": identifier, "p_location_id": identifier, "p_client_id": identifier})
for change in ({"band": "SAFE"}, {"confidence": 1.1}, {"engineVersion": "unversioned"}, {"inputFingerprint": "invalid"}, {"serviceApproved": True}):
    candidate = copy.deepcopy(confidence_fixture)
    candidate["data"].update(change)
    assert list(observation_validator("CaseConfidenceResult").iter_errors(candidate)), change
for field in ("conflicts", "significantUnknowns", "informationRequirements", "engineVersion"):
    candidate = copy.deepcopy(confidence_fixture)
    del candidate["data"][field]
    assert list(observation_validator("CaseConfidenceResult").iter_errors(candidate)), field
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/confidence"]) == {"get"}
print(f"PASS: Confidence assessment/input/RPC contracts, {len(golden['cases'])} golden scenarios, and 9 unsafe/malformed result rejections")

risk_examples = json.loads((root / "contracts/fixtures/risk-results.json").read_text(encoding="utf-8"))
risk_validator = observation_validator("RiskResult")
for example in risk_examples:
    risk_validator.validate(example)
for change in ({"overallBand": "SAFE"}, {"engineVersion": "unversioned"}, {"inputFingerprint": "invalid"}, {"recipe": {}}, {"ignoreRisk": True}):
    candidate = copy.deepcopy(risk_examples[0])
    candidate["data"].update(change)
    assert list(risk_validator.iter_errors(candidate)), change
for field in ("gate", "hardStops", "requiredPhysicalTests", "requiredInformation", "confidence", "dominantReasons"):
    candidate = copy.deepcopy(risk_examples[0])
    del candidate["data"][field]
    assert list(risk_validator.iter_errors(candidate)), field
for change in ({"outcome": "SAFE"}, {"ignoreRisk": True}, {"reasonCodes": []}):
    candidate = copy.deepcopy(risk_examples[0])
    candidate["data"]["gate"].update(change)
    assert list(risk_validator.iter_errors(candidate)), change
candidate = copy.deepcopy(risk_examples[2])
candidate["data"]["gate"]["canProgress"] = True
assert list(risk_validator.iter_errors(candidate)), "A blocking gate cannot progress"
assert set(contract["paths"]["/api/clients/{clientId}/hair-passport/risk"]) == {"get"}
risk_golden = json.loads((root / "contracts/fixtures/risk-golden.json").read_text(encoding="utf-8"))
print(f"PASS: Risk assessment contracts, {len(risk_golden['cases'])} golden scenarios, 3 explained results and 15 unsafe/malformed rejections")

color_fixture = __import__('json').loads((root / 'contracts/fixtures/color-contract.json').read_text())
for name, fixture in [('ColorTargetResult', color_fixture['target']), ('ColorPlanResult', color_fixture['plan'])]:
    observation_validator(name).validate(fixture)
    unsafe = __import__('copy').deepcopy(fixture)
    unsafe['data']['organization_id'] = identifier
    assert list(observation_validator(name).iter_errors(unsafe)), 'Forged target/plan ownership accepted'
draft_validator = observation_validator('RecipeDraft')
draft = color_fixture['plan']['data']['result']['recipeDraft']
for change in ({'executionStatus': 'EXECUTABLE'}, {'developerVolume': 20}, {'grams': 40}, {'version': 2}, {'origin': 'ADMIN_OVERRIDE'}):
    assert list(draft_validator.iter_errors(draft | change)), 'Unsafe recipe accepted'
generate_validator = observation_validator('GenerateColorPlan')
generate_validator.validate({'request_id': identifier, 'target_id': identifier})
for field in ('risk', 'confidence', 'evidence', 'organization_id', 'ignoreRisk'):
    assert list(generate_validator.iter_errors({'request_id': identifier, 'target_id': identifier, field: {}}))
print('PASS: Color target/plan contracts, 2 immutable examples and 12 unsafe ownership/recipe/input rejections')

brand = json.loads((root / 'contracts/fixtures/brand-contract.json').read_text())
observation_validator('EvaluateBrandAdapter').validate(brand['request'])
observation_validator('BrandCatalogRelease').validate(brand['catalog']['release'])
for product in brand['catalog']['products']:
    observation_validator('BrandProduct').validate(product)
for rule in brand['catalog']['compatibility']:
    observation_validator('BrandCompatibility').validate(rule)
observation_validator('BrandAdapterEvaluation').validate(brand['evaluation'])
for field in ('verificationStatus', 'pigment', 'compatibility', 'organization_id', 'created_by', 'ignoreRisk'):
    assert list(observation_validator('EvaluateBrandAdapter').iter_errors(brand['request'] | {field: {}})), field
unsafe = copy.deepcopy(brand['evaluation'])
unsafe['recipe']['executable'] = True
assert list(observation_validator('BrandAdapterEvaluation').iter_errors(unsafe)), 'Executable formulation invented'
assert list(observation_validator('BrandAdapterEvaluation').iter_errors(brand['evaluation'] | {'recipe': None})), 'Success without a recipe'
fact = brand['catalog']['products'][0]['facts'][0]
for change in ({'source':'UNKNOWN'}, {'verifiedBy':None}, {'confidence':2}, {'unit':'PERCENT'}):
    assert list(observation_validator('BrandTechnicalFact').iter_errors(fact | change)), change
baseline = json.loads((root / 'contracts/fixtures/phase-1f-schema-fingerprints.json').read_text())
for name, fingerprint in baseline.items():
    current = json.dumps(contract['components']['schemas'][name], sort_keys=True, separators=(',', ':'))
    assert __import__('hashlib').sha256(current.encode()).hexdigest() == fingerprint, 'Phase 1F contract changed: ' + name
assert contract['info']['version'] == '0.17.0'
brand_golden = json.loads((root / 'contracts/fixtures/brand-golden.json').read_text())
assert len(brand_golden['cases']) >= 30
assert len({c['name'] for c in brand_golden['cases']}) == len(brand_golden['cases'])
assert set(contract['paths']['/api/brand-adapter/evaluate']) == {'post'}
print(f"PASS: Brand catalog/adapter contract, {len(brand_golden['cases'])} golden scenarios, 12 forged/unsafe rejections, and unchanged Phase 1F schemas")
transition = {'p_catalog_id': identifier, 'p_state': 'APPROVED', 'p_receipt': 'TEST_ONLY_REVIEW_RECEIPT', 'p_correlation_id': identifier}
observation_validator('BrandCatalogTransitionRequest').validate(transition)
for change in ({'p_receipt': None}, {'p_state': 'DRAFT'}, {'verificationStatus': 'ELIFORA_VERIFIED'}, {'organization_id': identifier}):
    assert list(observation_validator('BrandCatalogTransitionRequest').iter_errors(transition | change)), change
print('PASS: Catalog governance RPC contract and 4 invalid/forged request rejections')

pilot = json.loads((root / 'contracts/fixtures/verified-pilot-contract.json').read_text())
observation_validator('VerifiedPilotPacket').validate(pilot['packet'])
observation_validator('VerifiedPilotResult').validate(pilot['result'])
for document in pilot['packet']['sources']:
    observation_validator('CatalogSourceDocument').validate(document)
    unsafe = document | {'verified_by': None}
    assert list(observation_validator('CatalogSourceDocument').iter_errors(unsafe))
governance = {'operation':'PUBLISH','note':'Synthetic development review'}
observation_validator('CatalogGovernanceRequest').validate(governance)
for field in ('verificationStatus','reviewed_by','approved_by','published_status','compatibility','organization_id'):
    assert list(observation_validator('CatalogGovernanceRequest').iter_errors(governance | {field:'forged'}))
assert list(observation_validator('VerifiedPilotResult').iter_errors(pilot['result'] | {'executable':True}))
assert list(observation_validator('VerifiedPilotResult').iter_errors(pilot['result'] | {'professionalReviewRequired':False}))
golden = json.loads((root / 'contracts/fixtures/verified-pilot-golden.json').read_text())
assert len(golden['cases']) == 15 and len({c['change'] for c in golden['cases']}) == 15
manifest = json.loads((root / 'contracts/catalogs/schwarzkopf-igora-royal-absolutes.json').read_text())
assert len(manifest['shades']) == 29 and len(manifest['developers']) == 2
assert all(s['pigmentVector']=='UNKNOWN' for s in manifest['shades'])
for source in manifest['sources']:
    assert source['documentVersion'] is None and source['documentDate'] is None
    assert source['sourceUrl'].startswith('https://dm.henkel-dam.com/is/content/henkel/')
    assert len(source['contentSha256']) == 64
print('PASS: Verified pilot/source/governance contracts, 15 official-source golden fixtures, 29 shades + 2 developers, 11 unsafe/forged rejections')
for rpc in ('catalog_governance','catalog_pilot_packet','catalog_operator_access'):
    assert contract['paths']['/rest/v1/rpc/'+rpc]['post']['security']==[{'bearerAuth':[], 'publishableKey':[]}]

controlled = json.loads((root / 'contracts/fixtures/controlled-recipe-contract.json').read_text())
observation_validator('CreateControlledRecipe').validate(controlled['request'])
observation_validator('StoredControlledRecipe').validate(controlled['stored'])
for field in ('white_ratio','developer_grams','processing_minutes','executable','verified','organization_id'):
    assert list(observation_validator('CreateControlledRecipe').iter_errors(controlled['request'] | {field: True})), field
for amount in (0, -1, 1000.01, .001):
    assert list(observation_validator('CreateControlledRecipe').iter_errors(controlled['request'] | {'color_grams': amount}))
for patch in ({'executable': True}, {'professionalReviewRequired': False}, {'selectionOrigin': 'ENGINE'}, {'sources': []}):
    assert list(observation_validator('ControlledRecipe').iter_errors(controlled['stored']['result'] | patch))
r = controlled['stored']['result']
assert r['selected']['mixingRatio'] == '1:1' and r['developerGrams'] == r['colorGrams']
assert round(r['totalGrams']*100) == round(r['colorGrams']*100)*2
assert r['context']['whiteRatio'] > r['selected']['restrictions']['whitePercentGreaterThan']/100
assert contract['paths']['/rest/v1/rpc/controlled_recipe_store']['post']['security'] == [{'bearerAuth': [], 'publishableKey': []}]
print('PASS: Phase 2C controlled recipe contract, ratio arithmetic, source-backed white condition and 14 forged/unsafe rejections')

for patch in ({'mixingRatio':'1:2'}, {'executable':True}):
    changed = copy.deepcopy(controlled['stored']['result'])
    changed['selected'].update(patch)
    assert list(observation_validator('ControlledRecipe').iter_errors(changed))
for patch in ({'review_status':'PENDING'}, {'verification_status':'UNVERIFIED'}):
    changed = copy.deepcopy(controlled['stored']['result'])
    changed['sources'][0].update(patch)
    assert list(observation_validator('ControlledRecipe').iter_errors(changed))
print('PASS: Controlled ratio and approved-source restrictions, 4 further unsafe result rejections')

# Phase 3 runtime-generated schemas preserve existing contracts.
live_schemas = json.loads((root / 'contracts/live-session.schemas.json').read_text())
for name, schema in live_schemas.items():
    assert contract['components']['schemas'][name] == schema, name
live_fixture = json.loads((root / 'contracts/fixtures/live-session-contract.json').read_text())
observation_validator('CreateLiveSession').validate(live_fixture['request'])
observation_validator('LiveSession').validate(live_fixture['session'])
for field in ('organization_id', 'controller_user_id', 'risk_result', 'elapsed', 'audit_actor'):
    assert list(observation_validator('CreateLiveSession').iter_errors(live_fixture['request'] | {field: True}))
assert list(observation_validator('CreateLiveSession').iter_errors(live_fixture['request'] | {'professional_review': False}))
assert contract['paths']['/rest/v1/rpc/live_session_store']['post']['security'] == contract['paths']['/rest/v1/rpc/controlled_recipe_store']['post']['security']
print('PASS: Phase 3 shared live schemas, controlled-review fixture and six forgery rejections')

# Phase 4A: additive shared salon boundaries, no client-supplied authority or quote.
salon_schemas = json.loads((root / 'contracts/salon-operations.schemas.json').read_text())
for name, schema in salon_schemas.items():
    assert contract['components']['schemas'][name] == schema, name
salon = json.loads((root / 'contracts/fixtures/salon-operations-contract.json').read_text())
observation_validator('SalonCommand').validate(salon['command'])
observation_validator('SalonSnapshot').validate(salon['snapshot'])
for field in ('organization_id','location_id','role','quoted_total','ignore_conflicts'):
    assert list(observation_validator('SalonCommand').iter_errors(salon['command'] | {field: True})), field
for field in ('base_price','tax_rate','timezone'):
    forged = copy.deepcopy(salon['command'])
    forged['definition'][field] = 1
    assert list(observation_validator('SalonCommand').iter_errors(forged)), field
assert set(contract['paths']['/api/salon/appointments/{id}/precheck']) == {'get'}
print('PASS: Phase 4A shared salon schemas, actual-data fixtures and eight forgery rejections')

# Phase 4B: shared CRM vocabulary and controlled request AST.
crm_schemas = json.loads((root / 'contracts/client-crm.schemas.json').read_text())
for name, schema in crm_schemas.items():
    assert contract['components']['schemas'][name] == schema, name
crm = json.loads((root / 'contracts/fixtures/client-crm-contract.json').read_text())
observation_validator('ClientCrmOverview').validate(crm['overview'])
observation_validator('CrmCommand').validate(crm['command'])
observation_validator('CrmOptions').validate(crm['options'])
for field in ('organization_id','location_id','role','risk_result','audit_actor','executable'):
    assert list(observation_validator('CrmCommand').iter_errors(crm['command'] | {field: True})), field
for change in ({'sql':'select * from clients'}, {'last_visit_min_days':0}, {'last_no_show':'true'}, {'technical_followup_kind':'RISK_SCORE'}, {'query':'x'*81}):
    assert list(observation_validator('ClientSearchFilter').iter_errors(change)), change
for rpc in ('crm_read','crm_operation'):
    assert contract['paths']['/rest/v1/rpc/'+rpc]['post']['security'] == [{'bearerAuth':[], 'publishableKey':[]}]
android_crm = (root / 'apps/android/app/src/main/java/com/elifora/app/data/crm/SupabaseClientCrmRepository.kt').read_text()
for field in ('p_membership_id','p_location_id','p_request','p_command','p_correlation_id','expected_version','mutation_id','source_client_ids','preferred_staff','effective_status'):
    assert field in android_crm, field
print('PASS: Phase 4B shared CRM schemas, Android RPC vocabulary and eleven forgery rejections')

# Phase 4C: real immutable-ledger vocabulary shared by Web, DB and Android.
stock_schemas=json.loads((root/'contracts/stock.schemas.json').read_text())
assert {'StockItem','StockLot','StockMovement','StockBalance','StockReceipt','StockAdjustment','StockCount','StockCountLine','StockSignal','StockSourceStatus'} <= stock_schemas.keys()
for name,schema in stock_schemas.items():
    assert contract['components']['schemas'][name]==schema,name
stock=json.loads((root/'contracts/fixtures/stock-contract.json').read_text())
observation_validator('StockSnapshot').validate(stock['snapshot'])
observation_validator('StockCommand').validate(stock['command'])
for field in ('organization_id','location_id','actor','source_event_id','source_session_id','derived_consumption','current_balance','stock_sync_status'):
    assert list(observation_validator('StockCommand').iter_errors(stock['command']|{field:True})),field
for rpc in ('stock_snapshot','stock_operation'):
    assert contract['paths']['/rest/v1/rpc/'+rpc]['post']['security']==[{'bearerAuth':[], 'publishableKey':[]}]
stock_android=(root/'apps/android/app/src/main/java/com/elifora/app/data/stock/SupabaseStockRepository.kt').read_text()
for field in ('p_membership_id','p_location_id','p_request','inventory_unit','on_hand','stock_status','stock_sync_status','quantity_delta','BigDecimal'):
    assert field in stock_android,field
print('PASS: Phase 4C shared inventory schemas, Android decimal reads and eight forgery rejections')

# Phase 5A exact integer money, permanent commands and private projections.
finance_schemas=json.loads((root/'contracts/finance.schemas.json').read_text())
assert {'Money','FinanceCharge','FinancePayment','PaymentAllocation','Deposit','Refund','Expense','ClientBalance','CashSession','FinanceSummary'} <= finance_schemas.keys()
for name,schema in finance_schemas.items():
    assert contract['components']['schemas'][name]==schema,name
finance=json.loads((root/'contracts/fixtures/finance-contract.json').read_text())
observation_validator('FinanceSnapshot').validate(finance['snapshot'])
observation_validator('FinanceCommand').validate(finance['command'])
for field in ('organization_id','location_id','actor','current_balance','tax_amount_minor','source_session_id','outstanding_minor','cash_expected_minor','allocation_state'):
    assert list(observation_validator('FinanceCommand').iter_errors(finance['command']|{field:True})),field
assert list(observation_validator('FinanceCommand').iter_errors(finance['command']|{'amount_minor':1000}))
for rpc in ('finance_snapshot','finance_operation'):
    assert contract['paths']['/rest/v1/rpc/'+rpc]['post']['security']==[{'bearerAuth':[], 'publishableKey':[]}]
native=(root/'apps/android/app/src/main/java/com/elifora/app/data/finance/SupabaseFinanceRepository.kt').read_text()
for field in ('p_membership_id','p_location_id','p_request','BigInteger','outstanding_minor','available_credit_minor','current_expected_minor','finance.expense.view','finance.cash.close'):
    assert field in native,field
print('PASS: Phase 5A shared integer-money schemas, native private projections and ten forgery rejections')
