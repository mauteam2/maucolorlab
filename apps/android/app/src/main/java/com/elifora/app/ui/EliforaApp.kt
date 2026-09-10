package com.elifora.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.elifora.app.domain.auth.AuthRepository
import com.elifora.app.ui.home.HomeScreen
import com.elifora.app.ui.theme.EliforaTheme

private object Routes {
    const val Home = "home"
}

@Composable
fun EliforaApp(authRepository: AuthRepository) {
    val authState by authRepository.authState.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    EliforaTheme {
        NavHost(navController = navController, startDestination = Routes.Home) {
            composable(Routes.Home) {
                HomeScreen(authState = authState)
            }
        }
    }
}

