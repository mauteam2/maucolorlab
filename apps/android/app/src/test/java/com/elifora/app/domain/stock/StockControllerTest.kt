package com.elifora.app.domain.stock

import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class StockControllerTest {
    private val context=ActiveTenantContext("membership","organization","Salon","location","Branch","owner","active",setOf("stock.view"))
    private var loads=0
    private var wait:CompletableDeferred<Unit>?=null
    private val repository=object:StockRepository {override suspend fun load(context:ActiveTenantContext,itemId:String?,query:String,offset:Int):StockBundle {loads++;wait?.await();return StockBundle(emptyList(),emptyList(),0,offset,true,0,0)}}
    @Test fun permissionDeniedNeverReads()=runBlocking {val c=StockController(repository);c.bind(context.copy(permissions=emptySet()));c.open();assertEquals(0,loads);assertEquals("FORBIDDEN",(c.state.value as StockState.Error).failure.code)}
    @Test fun invalidQueryNeverReads()=runBlocking {val c=StockController(repository);c.bind(context);c.open(query="x".repeat(81));assertEquals(0,loads)}
    @Test fun invalidItemNeverReads()=runBlocking {val c=StockController(repository);c.bind(context);c.open(itemId="wrong");assertEquals(0,loads)}
    @Test fun backgroundDiscardsLateResult()=runBlocking {val c=StockController(repository);c.bind(context);wait=CompletableDeferred();val job=launch {c.open()};yield();c.conceal();wait!!.complete(Unit);job.join();assertEquals(StockState.Closed,c.state.value)}
    @Test fun workspaceChangeDiscardsLateResult()=runBlocking {val c=StockController(repository);c.bind(context);wait=CompletableDeferred();val job=launch {c.open()};yield();c.bind(context.copy(locationId="other"));wait!!.complete(Unit);job.join();assertEquals(StockState.Closed,c.state.value)}
    @Test fun boundedPagingReachesRepository()=runBlocking {val c=StockController(repository);c.bind(context);c.open(offset=50);assertEquals(50,(c.state.value as StockState.Ready).data.offset)}
}
