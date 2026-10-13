package com.elifora.app

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.elifora.app.domain.auth.WorkspaceState
import com.elifora.app.ui.EliforaApp
import com.elifora.app.ui.ClientScreens
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val controller get() = (application as EliforaApplication).container.workspaceController
    private val clients get() = (application as EliforaApplication).container.clientController
    private val stock get() = (application as EliforaApplication).container.stockController
    private val reports get() = (application as EliforaApplication).container.reportingController
    private val crm get() = (application as EliforaApplication).container.clientCrmController
    private val passports get() = (application as EliforaApplication).container.hairPassportController
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        lifecycleScope.launch {
            controller.state.collectLatest { state ->
                when (state) {
                    is WorkspaceState.Ready -> { reports.conceal(); reports.bind(state.context); passports.conceal(); passports.bind(state.context); crm.bind(state.context); stock.conceal(); stock.bind(state.context); clients.bind(state.context) }
                    WorkspaceState.LoadingSession, WorkspaceState.LoadingMemberships -> { reports.conceal(); clients.conceal(); passports.conceal(); crm.conceal(); stock.conceal() }
                    else -> { reports.invalidate(); clients.invalidate(); passports.invalidate(); crm.invalidate(); stock.invalidate() }
                }
            }
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                controller.restore()
                while (true) {
                    delay(15000)
                    if (controller.state.value is WorkspaceState.Ready ||
                        controller.state.value is WorkspaceState.SelectingWorkspace ||
                        controller.state.value is WorkspaceState.NoMembership) {
                        passports.conceal()
                        controller.refresh()
                        (controller.state.value as? WorkspaceState.Ready)?.let { clients.bind(it.context, keepVisible = true); passports.bind(it.context) }
                    }
                }
            }
        }
        setContent {
            EliforaApp(controller.state,
                signIn = { email, password -> lifecycleScope.launch { controller.signIn(email, password) } },
                select = { lifecycleScope.launch { controller.select(it) } },
                retry = { lifecycleScope.launch { controller.restore() } },
                change = { reports.invalidate(); clients.invalidate(); passports.invalidate(); crm.invalidate(); stock.invalidate(); lifecycleScope.launch { controller.changeWorkspace() } },
                logout = { reports.invalidate(); clients.invalidate(); passports.invalidate(); crm.invalidate(); stock.invalidate(); lifecycleScope.launch { controller.logout() } },
                clients = { permissions -> ClientScreens(clients, passports, permissions, crm) },
                stock = { com.elifora.app.ui.StockScreen(stock) }, reports = { com.elifora.app.ui.ReportingScreen(reports) })
        }
    }
    override fun onStop() {
        reports.conceal()
        clients.conceal()
        passports.conceal()
        crm.conceal(); stock.conceal()
        controller.conceal()
        super.onStop()
    }
}
