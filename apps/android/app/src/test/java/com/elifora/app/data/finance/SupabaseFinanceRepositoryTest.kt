package com.elifora.app.data.finance
import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.math.BigInteger

class SupabaseFinanceRepositoryTest {
    private fun fixture():JSONObject {val root=generateSequence(File(".").canonicalFile){it.parentFile}.first{File(it,"contracts/fixtures/finance-contract.json").isFile};return JSONObject(File(root,"contracts/fixtures/finance-contract.json").readText()).getJSONObject("snapshot")}
    private fun context(data:JSONObject=fixture())=ActiveTenantContext("e5000000-0000-4000-8000-000000000111",data.getString("organization_id"),"Salon",data.getString("location_id"),"Branch","owner","active",setOf("finance.view","finance.expense.view","finance.cash.close"))
    private var checks=0
    private var revoke=false
    private var request:JSONObject?=null
    private fun repository(data:JSONObject=fixture(),c:ActiveTenantContext=context(data))=SupabaseFinanceRepository(snapshot={raw->request=JSONObject(raw);HttpReply(200,JSONObject().put("data",data).toString(),"e5000000-0000-4000-8000-000000000999")},memberships={checks++;if(revoke&&checks>1)emptyList() else listOf(c)})
    @Test fun sharedFixtureReadsExactMinorUnits()=runBlocking {val c=context();val out=repository().load(c,null,null);assertEquals(BigInteger("40000"),out.clients.single().balance.minorUnits);assertEquals(2,checks);assertEquals(c.membershipId,request!!.getString("p_membership_id"));assertEquals(c.locationId,request!!.getString("p_location_id"))}
    @Test fun numericMoneyRejected()=runBlocking {val d=fixture();d.getJSONObject("summary").put("payments_minor",1000);try{repository(d).load(context(),null,null);fail("floating point transport accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun foreignScopeRejected()=runBlocking {val d=fixture();d.put("location_id","e5000000-0000-4000-8000-000000000012");try{repository(d,context()).load(context(),null,null);fail("foreign data released")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun revocationAfterReadReleasesNoMoney()=runBlocking {revoke=true;try{repository().load(context(),null,null);fail("revoked snapshot released")}catch(e:ClientFailure){assertEquals("MEMBERSHIP_REVOKED",e.code)}}
    @Test fun receptionCannotReadExpenseOrCashDiscrepancy()=runBlocking {val d=fixture();val c=context(d).copy(permissions=setOf("finance.view"));val out=repository(d,c).load(c,null,null);assertNull(out.summary.expenses);assertNull(out.cashSessions.single().expected);assertNull(out.cashSessions.single().difference)}
}
