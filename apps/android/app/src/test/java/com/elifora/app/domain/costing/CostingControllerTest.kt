package com.elifora.app.domain.costing
import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class CostingControllerTest {
    private val context = ActiveTenantContext("member","org","Salon","loc","Branch","colorist","active",setOf("commission.view_self","cost.view"))
    private var calls = 0
    private var barrier: CompletableDeferred<Unit>? = null
    private val repository = object : CostingRepository {
        override suspend fun load(context: ActiveTenantContext, ownCommission: Boolean, chargeId: String?, offset: Int): CostingBundle {
            calls++; barrier?.await(); return CostingBundle(emptyList(),emptyList(),offset,0)
        }
    }
    @Test fun deniedPermissionNeverLoadsSensitiveData() = runBlocking {
        val controller=CostingController(repository);controller.bind(context.copy(permissions=emptySet()));controller.open()
        assertEquals(0,calls);assertEquals("FORBIDDEN",(controller.state.value as CostingState.Error).failure.code)
    }
    @Test fun backgroundConcealsLateEarnings() = runBlocking {
        val controller=CostingController(repository);controller.bind(context);barrier=CompletableDeferred()
        val job=launch {controller.open()};yield();controller.conceal();barrier!!.complete(Unit);job.join();assertEquals(CostingState.Closed,controller.state.value)
    }
    @Test fun workspaceSwitchDiscardsLateCostRead() = runBlocking {
        val controller=CostingController(repository);controller.bind(context);barrier=CompletableDeferred()
        val job=launch {controller.open(false)};yield();controller.bind(context.copy(locationId="other"));barrier!!.complete(Unit);job.join();assertEquals(CostingState.Closed,controller.state.value)
    }
    @Test fun permissionChangeInvalidatesLoadedCommission() = runBlocking {
        val controller=CostingController(repository);controller.bind(context);controller.open();assertTrue(controller.state.value is CostingState.Ready)
        controller.bind(context.copy(permissions=emptySet()));assertEquals(CostingState.Closed,controller.state.value)
    }
    @Test fun signOutInvalidatesAndPreventsReload() = runBlocking {
        val controller=CostingController(repository);controller.bind(context);controller.open();controller.invalidate();controller.open();assertEquals(1,calls);assertEquals(CostingState.Closed,controller.state.value)
    }
}
