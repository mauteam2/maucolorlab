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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val controller get() = (application as EliforaApplication).container.workspaceController
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
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
                change = { lifecycleScope.launch { controller.changeWorkspace() } },
                logout = { lifecycleScope.launch { controller.logout() } })
        }
    }
    override fun onStop() {
        controller.conceal()
        super.onStop()
    }
}
