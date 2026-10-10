package com.elifora.app.data.costing
import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.math.BigInteger

class SupabaseCostingRepositoryTest {
    private val self="b4000000-0000-4000-8000-000000000021"
    private fun fixture(): JSONObject { val root=generateSequence(File(".").canonicalFile){it.parentFile}.first{File(it,"contracts/fixtures/costing-contract.json").isFile};return JSONObject(File(root,"contracts/fixtures/costing-contract.json").readText()).getJSONObject("snapshot") }
    private fun context(d:JSONObject=fixture())=ActiveTenantContext("b4000000-0000-4000-8000-000000000111",d.getString("organization_id"),"Salon",d.getString("location_id"),"Branch","owner","active",setOf("cost.view","commission.view_self","commission.view_all"))
    private var checks=0
    private var revoke=false
    private var request:JSONObject?=null
    private fun repository(d:JSONObject=fixture(),c:ActiveTenantContext=context())=SupabaseCostingRepository(snapshot={body->request=JSONObject(body);HttpReply(200,JSONObject().put("data",d).toString(),"correlation")},memberships={checks++;if(revoke&&checks>1)emptyList() else listOf(c)},userId={self})
    @Test fun sharedUnknownCostNeverInventsContribution()=runBlocking { val r=repository().load(context(),false,null,0);assertNull(r.profitability.single().directCost);assertNull(r.profitability.single().afterCommission);assertNull(r.profitability.single().marginBps);assertEquals(BigInteger("100000"),r.profitability.single().netRevenue.minorUnits);assertEquals(2,checks);assertEquals("PROFITABILITY",request!!.getJSONObject("p_request").getString("kind")) }
    @Test fun numericMoneyRejected()=runBlocking {val d=fixture();d.getJSONArray("items").getJSONObject(0).put("net_revenue_minor",1000);try{repository(d).load(context(),false,null,0);fail("Numeric money accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun foreignRowRejected()=runBlocking {val d=fixture();d.getJSONArray("items").getJSONObject(0).put("organization_id","b4000000-0000-4000-8000-000000000002");try{repository(d).load(context(),false,null,0);fail("Foreign row released")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun revocationAfterReadReleasesNothing()=runBlocking {revoke=true;try{repository().load(context(),false,null,0);fail("Revoked snapshot released")}catch(e:ClientFailure){assertEquals("MEMBERSHIP_REVOKED",e.code)}}
    private fun commission(staff:String=self):JSONObject {val d=fixture();d.put("kind","COMMISSION_SELF");val r=JSONObject().put("organization_id",d.getString("organization_id")).put("location_id",d.getString("location_id")).put("staff_user_id",staff).put("id","c5000000-0000-4000-8000-000000000601").put("charge_id","c5000000-0000-4000-8000-000000000301").put("policy_id","c5000000-0000-4000-8000-000000000201").put("policy_version",1).put("service_name","Renk hizmeti").put("eligible_at","2026-10-10T12:00:00Z").put("currency","KWD").put("basis_minor","10005").put("amount_minor","1001").put("adjustment_minor","-200").put("commission_net_minor","801");d.put("items",JSONArray().put(r));return d}
    @Test fun ownCommissionExactThreeExponent()=runBlocking {val d=commission();val r=repository(d).load(context(),true,null,0).ownCommission.single();assertEquals("0,801 KWD",r.remaining.display());assertEquals(BigInteger("-200"),r.adjustment.minorUnits)}
    @Test fun anotherStaffCommissionRejectedEvenInSelfResponse()=runBlocking {try{repository(commission("b4000000-0000-4000-8000-000000000023")).load(context(),true,null,0);fail("Another staff earnings leaked")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun technicalReaderCannotSeeCommissionWithoutAllPermission()=runBlocking {val d=fixture();val c=context().copy(permissions=setOf("cost.view"));d.getJSONArray("items").getJSONObject(0).put("commission_minor","99999");val r=repository(d,c).load(c,false,null,0).profitability.single();assertNull(r.commission);assertNull(r.afterCommission)}
    @Test fun boundedOffset()=runBlocking {try{repository().load(context(),false,null,10001);fail("Unbounded request accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
}
