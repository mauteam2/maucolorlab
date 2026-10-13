package com.elifora.app.domain.reporting
import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.math.BigInteger
class ReportingControllerTest {
    private val context=ActiveTenantContext("member","org","Salon","loc","Branch","colorist","active",setOf("reports.read"))
    private var calls=0;private var barrier:CompletableDeferred<Unit>?=null
    private val repository=object:ReportingRepository {override suspend fun load(context:ActiveTenantContext,filter:ReportFilter):ReportBundle{calls++;barrier?.await();return ReportBundle(filter.kind,true,"self","TRY",ReportDates("UTC","start","end","previous","previousEnd"),ReportFreshness("CURRENT","now",BigInteger.ZERO,1),emptyList())}}
    @Test fun deniedPermissionNeverLoads()=runBlocking {val c=ReportingController(repository);c.bind(context.copy(permissions=emptySet()));c.open();assertEquals(0,calls);assertEquals("FORBIDDEN",(c.state.value as ReportingState.Error).failure.code)}
    @Test fun backgroundDiscardsLateSummary()=runBlocking {val c=ReportingController(repository);c.bind(context);barrier=CompletableDeferred();val job=launch{c.open()};yield();c.conceal();barrier!!.complete(Unit);job.join();assertEquals(ReportingState.Closed,c.state.value)}
    @Test fun workspaceSwitchDiscardsLateSummary()=runBlocking {val c=ReportingController(repository);c.bind(context);barrier=CompletableDeferred();val job=launch{c.open()};yield();c.bind(context.copy(locationId="other"));barrier!!.complete(Unit);job.join();assertEquals(ReportingState.Closed,c.state.value)}
    @Test fun permissionChangeConcealsLoadedSummary()=runBlocking {val c=ReportingController(repository);c.bind(context);c.open();c.bind(context.copy(permissions=emptySet()));assertEquals(ReportingState.Closed,c.state.value)}
    @Test fun signOutPreventsReload()=runBlocking {val c=ReportingController(repository);c.bind(context);c.open();c.invalidate();c.open();assertEquals(1,calls);assertEquals(ReportingState.Closed,c.state.value)}
}
