package com.elifora.app.domain.auth

import kotlinx.coroutines.flow.StateFlow

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val userId: String) : AuthState
}

interface AuthRepository {
    val authState: StateFlow<AuthState>
}

