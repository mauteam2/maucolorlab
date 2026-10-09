package com.elifora.app.domain.finance
import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.math.BigInteger

class FinanceControllerTest {
    private val context=ActiveTenantContext("membership","organization","Salon","location","Branch","owner","active",setOf("finance.view"))
    private var reads=0
    private var barrier:CompletableDeferred<Unit>?=null
    private val zero=Money("TRY",BigInteger.ZERO,2)
    private val repo=object:FinanceRepository { override suspend fun load(context:ActiveTenantContext,clientId:String?,appointmentId:String?):FinanceBundle {reads++;barrier?.await();return FinanceBundle(true,FinanceSummary(zero,zero,zero,zero,null),emptyList(),emptyList(),emptyList())} }
    @Test fun deniedPermissionDoesNotRead()=runBlocking {val c=FinanceController(repo);c.bind(context.copy(permissions=emptySet()));c.open();assertEquals(0,reads);assertEquals("FORBIDDEN",(c.state.value as FinanceState.Error).failure.code)}
    @Test fun malformedClientDoesNotRead()=runBlocking {val c=FinanceController(repo);c.bind(context);c.open(clientId="wrong");assertEquals(0,reads);assertEquals("VALIDATION_FAILED",(c.state.value as FinanceState.Error).failure.code)}
    @Test fun backgroundDiscardsLateFinancialData()=runBlocking {val c=FinanceController(repo);c.bind(context);barrier=CompletableDeferred();val job=launch {c.open()};yield();c.conceal();barrier!!.complete(Unit);job.join();assertEquals(FinanceState.Closed,c.state.value)}
    @Test fun workspaceSwitchDiscardsLateFinancialData()=runBlocking {val c=FinanceController(repo);c.bind(context);barrier=CompletableDeferred();val job=launch {c.open()};yield();c.bind(context.copy(locationId="other"));barrier!!.complete(Unit);job.join();assertEquals(FinanceState.Closed,c.state.value)}
    @Test fun negativeCreditRemainsExact() {assertEquals("−90000000000000,00 TRY",Money("TRY",BigInteger("-9000000000000000"),2).display())}
    @Test fun zeroDecimalCurrency() {assertEquals("125 JPY",Money("JPY",BigInteger("125"),0).display())}
    @Test fun threeDecimalCurrency() {assertEquals("1,005 KWD",Money("KWD",BigInteger("1005"),3).display())}
}
