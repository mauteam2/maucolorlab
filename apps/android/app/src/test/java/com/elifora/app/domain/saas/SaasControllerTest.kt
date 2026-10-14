package com.elifora.app.domain.saas
import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
class SaasControllerTest {
    private val context=ActiveTenantContext("member","org","Salon","loc","Branch","owner","active",setOf("saas.entitlements.read"))
    private var calls=0;private var barrier:CompletableDeferred<Unit>?=null;private var suspended=false
    private val repository=object:SaasRepository {override suspend fun load(context:ActiveTenantContext):SaaSAccount {calls++;barrier?.await();return SaaSAccount(context.organizationId,context.locationId,1,if(suspended) SubscriptionState.SUSPENDED else SubscriptionState.ACTIVE,true,"PLAN_A",null,listOf(Entitlement(Capability.COLOR_ENGINE,true,true,!suspended,if(suspended)"SUSPENDED" else null)),emptyList(),"observed")}}
    @Test fun missingPermissionDoesNotFetch()=runBlocking {val c=SaasController(repository);c.bind(context.copy(permissions=emptySet()));c.open();assertEquals(0,calls);assertEquals("FORBIDDEN",(c.state.value as SaasState.Error).failure.code)}
    @Test fun suspensionDisablesNewWorkWithoutGrantingDomainPermission()=runBlocking {val c=SaasController(repository);c.bind(context);c.open();assertTrue(c.canCreate(Capability.COLOR_ENGINE));suspended=true;c.open();assertFalse(c.canCreate(Capability.COLOR_ENGINE));assertFalse(c.canCreate(Capability.FINANCE))}
    @Test fun backgroundConcealsLateEntitlements()=runBlocking {val c=SaasController(repository);c.bind(context);barrier=CompletableDeferred();val job=launch{c.open()};yield();c.conceal();barrier!!.complete(Unit);job.join();assertEquals(SaasState.Closed,c.state.value);assertFalse(c.canCreate(Capability.COLOR_ENGINE))}
    @Test fun organizationSwitchDropsOldAccount()=runBlocking {val c=SaasController(repository);c.bind(context);barrier=CompletableDeferred();val job=launch{c.open()};yield();c.bind(context.copy(organizationId="other"));barrier!!.complete(Unit);job.join();assertEquals(SaasState.Closed,c.state.value)}
    @Test fun signOutInvalidatesCachedAccess()=runBlocking {val c=SaasController(repository);c.bind(context);c.open();c.invalidate();c.open();assertEquals(1,calls);assertFalse(c.canCreate(Capability.COLOR_ENGINE))}
    @Test fun permissionChangeConcealsLoadedAccount()=runBlocking {val c=SaasController(repository);c.bind(context);c.open();c.bind(context.copy(permissions=emptySet()));assertEquals(SaasState.Closed,c.state.value)}
}
