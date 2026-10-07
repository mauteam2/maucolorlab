package com.elifora.app.data.crm

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.crm.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class SupabaseClientCrmRepositoryTest {
    private fun id(n: Int)="a4000000-0000-4000-8000-${n.toString().padStart(12,'0')}"
    private val context=ActiveTenantContext(id(111),id(1),"Salon",id(11),"Branch","owner","active",setOf("crm.read","crm.actions.manage"))
    private fun overview():JSONObject { val root=generateSequence(File(".").canonicalFile){it.parentFile}.first{File(it,"contracts/fixtures/client-crm-contract.json").isFile};return JSONObject(File(root,"contracts/fixtures/client-crm-contract.json").readText()).getJSONObject("overview") }
    private val requests=mutableListOf<JSONObject>()
    private var checks=0
    private var revokeAfterRead=false
    private fun repository(data:JSONObject=overview())=SupabaseClientCrmRepository(read={raw -> val body=JSONObject(raw);requests.add(body);val q=body.getJSONObject("p_request");val result=if(q.getString("operation")=="summary")data else JSONObject().put("items",org.json.JSONArray()).put("has_more",false).put("offset",q.getInt("offset"));HttpReply(200,JSONObject().put("data",result).toString(),id(901))},write={HttpReply(200,JSONObject().put("data",JSONObject().put("id",id(601)).put("version",2)).toString(),id(901))},memberships={checks++;if(revokeAfterRead&&checks>1)emptyList() else listOf(context)})
    @Test fun readsSharedFixtureAndActualScopedRpc()=runBlocking {val r=repository().load(context,id(31),0);assertEquals(RelationshipStatus.NEW,r.summary.relationshipStatus);assertEquals(PreferenceSource.UNKNOWN,r.summary.preferenceSource);assertEquals(2,checks);assertEquals(listOf("summary","timeline","actions"),requests.map{it.getJSONObject("p_request").getString("operation")});assertTrue(requests.all{it.getString("p_membership_id")==context.membershipId&&it.getString("p_location_id")==context.locationId})}
    @Test fun foreignTenantCannotReachUi()=runBlocking {val o=overview();o.getJSONObject("summary").put("organization_id",id(2));try{repository(o).load(context,id(31),0);fail("foreign response released")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun revokedAfterReadCannotReachUi()=runBlocking {revokeAfterRead=true;try{repository().load(context,id(31),0);fail("revoked snapshot released")}catch(e:ClientFailure){assertEquals("MEMBERSHIP_REVOKED",e.code)}}
    @Test fun fabricatedFinancialValueIsRejected()=runBlocking {val o=overview();o.getJSONObject("summary").put("finance","HIGH_VALUE");try{repository(o).load(context,id(31),0);fail("fabricated financial inference released")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
}
