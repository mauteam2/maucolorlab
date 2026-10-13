package com.elifora.app.data.reporting
import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.reporting.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.math.BigDecimal

class SupabaseReportingRepositoryTest {
    private fun fixture(): JSONObject { val root=generateSequence(File(".").canonicalFile){it.parentFile}.first{File(it,"contracts/fixtures/reporting-contract.json").isFile};return JSONObject(File(root,"contracts/fixtures/reporting-contract.json").readText()).getJSONObject("snapshot") }
    private fun context(d:JSONObject=fixture())=ActiveTenantContext("b4000000-0000-4000-8000-000000000111",d.getString("organization_id"),"Studio",d.getString("location_id"),"Branch","owner","active",setOf("reports.read","salon.read","finance.view","cost.view","commission.view_all"))
    private var checks=0;private var revoke=false;private var request:JSONObject?=null
    private fun repository(d:JSONObject=fixture(),c:ActiveTenantContext=context())=SupabaseReportingRepository(snapshot={body->request=JSONObject(body);HttpReply(200,JSONObject().put("data",d).toString(),"correlation")},memberships={checks++;if(revoke&&checks>1)emptyList() else listOf(c)},userId={"b4000000-0000-4000-8000-000000000021"})
    private fun filter()=ReportFilter(period=ReportPeriodKind.THIS_MONTH)
    @Test fun sharedUnknownContributionIsNeverZero()=runBlocking {val d=repository().load(context(),filter());assertNull(d.metrics.first{it.name=="contribution_after_commission"}.value);assertEquals(BigDecimal("100000"),d.metrics.first{it.name=="recognized_net_revenue"}.value);assertEquals(2,checks);assertEquals("OVERVIEW",request!!.getJSONObject("p_request").getString("kind"))}
    @Test fun veryLargeMoneyRemainsExact()=runBlocking {val d=fixture();d.getJSONArray("metrics").getJSONObject(1).put("value","900719925474099312345");assertEquals(BigDecimal("900719925474099312345"),repository(d).load(context(),filter()).metrics[1].value)}
    @Test fun numericMoneyRejected()=runBlocking {val d=fixture();d.getJSONArray("metrics").getJSONObject(1).put("value",1000);try{repository(d).load(context(),filter());fail("Numeric money accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun foreignLocationRejected()=runBlocking {val d=fixture();d.put("location_id","b4000000-0000-4000-8000-000000000012");try{repository(d).load(context(),filter());fail("Foreign report accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun revokedAccessReleasesNothing()=runBlocking {revoke=true;try{repository().load(context(),filter());fail("Revoked report released")}catch(e:ClientFailure){assertEquals("MEMBERSHIP_REVOKED",e.code)}}
    @Test fun missingPermissionDoesNotCallServer()=runBlocking {try{repository().load(context().copy(permissions=emptySet()),filter());fail("Missing permission accepted")}catch(e:ClientFailure){assertEquals("FORBIDDEN",e.code);assertNull(request)}}
    @Test fun coloristCannotReceiveBroadOverview()=runBlocking {val c=context().copy(role="colorist",permissions=setOf("reports.read","salon.read","commission.view_self"));try{repository(c=c).load(c,filter());fail("Broad report accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun receptionCannotReceiveAcquisitionCost()=runBlocking {val c=context().copy(role="reception",permissions=setOf("reports.read","finance.view","salon.read"));try{repository(c=c).load(c,filter());fail("Private cost accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun overlongCustomIntervalRejected()=runBlocking {try{repository().load(context(),ReportFilter(period=ReportPeriodKind.CUSTOM,from="2026-01-01",until="2026-04-01"));fail("Unbounded period accepted")}catch(e:ClientFailure){assertNull(request)}}
    @Test fun wrongReportKindRejected()=runBlocking {try{repository().load(context(),ReportFilter(kind=ReportKind.STOCK,period=ReportPeriodKind.THIS_MONTH));fail("Wrong kind accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
}
