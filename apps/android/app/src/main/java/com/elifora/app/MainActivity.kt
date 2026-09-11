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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        lifecycleScope.launch {
            controller.state.collectLatest { state ->
                when (state) {
                    is WorkspaceState.Ready -> clients.bind(state.context)
                    WorkspaceState.LoadingSession, WorkspaceState.LoadingMemberships -> clients.conceal()
                    else -> clients.invalidate()
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
                        controller.state.value is WorkspaceState.NoMembership) controller.restore()
                }
            }
        }
        setContent {
            EliforaApp(controller.state,
                signIn = { email, password -> lifecycleScope.launch { controller.signIn(email, password) } },
                select = { lifecycleScope.launch { controller.select(it) } },
                retry = { lifecycleScope.launch { controller.restore() } },
                change = { clients.invalidate(); lifecycleScope.launch { controller.changeWorkspace() } },
                logout = { clients.invalidate(); lifecycleScope.launch { controller.logout() } },
                clients = { permissions -> ClientScreens(clients, permissions) })
        }
    }
    override fun onStop() {
        clients.conceal()
        controller.conceal()
        super.onStop()
    }
}
