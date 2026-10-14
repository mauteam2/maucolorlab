package com.elifora.app.data.saas
import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.saas.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.math.BigInteger
class SupabaseSaasRepositoryTest {
    private fun fixture():JSONObject {val root=generateSequence(File(".").canonicalFile){it.parentFile}.first{File(it,"contracts/fixtures/saas-contract.json").isFile};return JSONObject(File(root,"contracts/fixtures/saas-contract.json").readText()).getJSONObject("snapshot")}
    private fun context(d:JSONObject=fixture())=ActiveTenantContext("f7000000-0000-4000-8000-000000000111",d.getString("organization_id"),"Studio",d.getString("location_id"),"Branch","owner","active",setOf("saas.entitlements.read","saas.subscription.view","saas.usage.view"))
    private var reads=0;private var checks=0;private var revoke=false
    private fun repository(d:JSONObject=fixture(),c:ActiveTenantContext=context(),next:JSONObject?=null)=SupabaseSaasRepository(snapshot={reads++;HttpReply(200,JSONObject().put("data",if(reads>1&&next!=null)next else d).toString(),"correlation")},memberships={checks++;if(revoke&&checks>1)emptyList() else listOf(c)})
    private fun denied(d:JSONObject,c:ActiveTenantContext=context(),code:String="NETWORK_ERROR")=runBlocking {try{repository(d,c).load(c);fail("Unsafe account released")}catch(e:ClientFailure){assertEquals(code,e.code)}}
    @Test fun readsSharedContractAndRechecksDatabaseScope()=runBlocking {val account=repository().load(context());assertEquals(SubscriptionState.ACTIVE,account.status);assertEquals(BigInteger("4"),account.quotas.first().used);assertEquals(2,reads);assertEquals(2,checks)}
    @Test fun exactQuotaBeyondJsInteger()=runBlocking {val d=fixture();d.getJSONArray("quotas").getJSONObject(0).put("used","9007199254740993").put("limit","9007199254740994");assertEquals(BigInteger("9007199254740993"),repository(d).load(context()).quotas.first().used)}
    @Test fun unknownUsageIsNotMeasuredZero()=runBlocking {assertNull(repository().load(context()).quotas[1].used)}
    @Test fun numericQuotaRejected(){val d=fixture();d.getJSONArray("quotas").getJSONObject(0).put("used",4);denied(d)}
    @Test fun inconsistentQuotaStatusRejected(){val d=fixture();d.getJSONArray("quotas").getJSONObject(0).put("used","6");denied(d)}
    @Test fun foreignOrganizationRejected(){val d=fixture();d.put("organization_id","f7000000-0000-4000-8000-000000000002");denied(d)}
    @Test fun managerCannotReceivePrivatePlan(){denied(fixture(),context().copy(role="manager"))}
    @Test fun duplicateCapabilitiesRejected(){val d=fixture();d.getJSONArray("entitlements").put(1,d.getJSONArray("entitlements").getJSONObject(0));denied(d)}
    @Test fun forgedSuspensionPermissionRejected(){val d=fixture();d.put("status","SUSPENDED");denied(d)}
    @Test fun unexpectedPrivateFieldsRejected(){val d=fixture();d.put("provider_secret","forged");denied(d)}
    @Test fun revokedMembershipConcealsResponse()=runBlocking {revoke=true;try{repository().load(context());fail("Revoked account released")}catch(e:ClientFailure){assertEquals("MEMBERSHIP_REVOKED",e.code)}}
    @Test fun missingPermissionNeverFetches()=runBlocking {val c=context().copy(permissions=emptySet());try{repository(c=c).load(c);fail("Unauthorized fetch")}catch(e:ClientFailure){assertEquals("FORBIDDEN",e.code);assertEquals(0,reads)}}
    @Test fun stateTransitionDuringFetchIsDiscarded()=runBlocking {val d=fixture();val n=fixture();n.put("status","SUSPENDED");n.getJSONObject("subscription").put("status","SUSPENDED").put("creation_allowed",false);val e=n.getJSONArray("entitlements");for(i in 0 until e.length())e.getJSONObject(i).put("creation_allowed",false).put("reason","SUSPENDED");try{repository(d,next=n).load(context());fail("Old enabled state released")}catch(f:ClientFailure){assertEquals("SAAS_VERSION_CONFLICT",f.code)}}
    @Test fun ownerScopeNarrowedDuringFetchIsDiscarded()=runBlocking {val n=fixture();n.put("management_allowed",false);for(key in listOf("plan","subscription","period","diagnostics"))n.put(key,JSONObject.NULL);n.put("quotas",org.json.JSONArray());try{repository(next=n).load(context());fail("Old owner scope released")}catch(f:ClientFailure){assertEquals("TENANT_CONTEXT_INVALID",f.code)}}
}
