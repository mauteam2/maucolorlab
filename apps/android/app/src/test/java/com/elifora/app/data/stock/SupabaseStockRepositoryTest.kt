package com.elifora.app.data.stock

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.stock.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.math.BigDecimal

class SupabaseStockRepositoryTest {
    private fun id(n:Int)="a4000000-0000-4000-8000-${n.toString().padStart(12,'0')}"
    private val context=ActiveTenantContext(id(111),id(1),"Salon",id(11),"Branch","owner","active",setOf("stock.view"))
    private fun fixture():JSONObject {val root=generateSequence(File(".").canonicalFile){it.parentFile}.first{File(it,"contracts/fixtures/stock-contract.json").isFile};return JSONObject(File(root,"contracts/fixtures/stock-contract.json").readText()).getJSONObject("snapshot")}
    private var checks=0
    private var revoke=false
    private var body:JSONObject?=null
    private fun repository(data:JSONObject=fixture())=SupabaseStockRepository(snapshot={raw->body=JSONObject(raw);HttpReply(200,JSONObject().put("data",data).toString(),id(901))},memberships={checks++;if(revoke&&checks>1)emptyList() else listOf(context)})
    @Test fun sharedFixtureUsesAuthoritativeDecimalBalance()=runBlocking {val result=repository().load(context,null,"",0);assertEquals(BigDecimal("100"),result.items.single().onHand);assertEquals(StockStatus.OK,result.items.single().status);assertEquals(2,checks);assertEquals(context.membershipId,body!!.getString("p_membership_id"));assertEquals(context.locationId,body!!.getString("p_location_id"))}
    @Test fun unknownNeverBecomesZero()=runBlocking {val data=fixture();data.getJSONArray("items").getJSONObject(0).put("on_hand",JSONObject.NULL).put("stock_status","UNKNOWN");val item=repository(data).load(context,null,"",0).items.single();assertNull(item.onHand);assertEquals(StockStatus.UNKNOWN,item.status)}
    @Test fun measuredZeroRemainsOut()=runBlocking {val data=fixture();data.getJSONArray("items").getJSONObject(0).put("on_hand",0).put("stock_status","OUT");val item=repository(data).load(context,null,"",0).items.single();assertEquals(BigDecimal.ZERO,item.onHand);assertEquals(StockStatus.OUT,item.status)}
    @Test fun rejectsForeignItem()=runBlocking {val data=fixture();data.getJSONArray("items").getJSONObject(0).put("organization_id",id(2));try{repository(data).load(context,null,"",0);fail("foreign item released")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun revokedAfterReadReleasesNoSnapshot()=runBlocking {revoke=true;try{repository().load(context,null,"",0);fail("revoked data released")}catch(e:ClientFailure){assertEquals("MEMBERSHIP_REVOKED",e.code)}}
    @Test fun rejectsInventedUnits()=runBlocking {val data=fixture();data.getJSONArray("items").getJSONObject(0).put("inventory_unit","AUTO_DENSITY");try{repository(data).load(context,null,"",0);fail("unit accepted")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
    @Test fun rejectsMismatchedDetail()=runBlocking {try{repository().load(context,id(102),"",0);fail("wrong detail released")}catch(e:ClientFailure){assertEquals("NETWORK_ERROR",e.code)}}
}
