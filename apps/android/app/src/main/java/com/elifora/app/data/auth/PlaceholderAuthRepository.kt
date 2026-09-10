package com.elifora.app.data.auth

import com.elifora.app.domain.auth.AuthRepository
import com.elifora.app.domain.auth.AuthState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PlaceholderAuthRepository : AuthRepository {
    private val mutableAuthState = MutableStateFlow<AuthState>(AuthState.SignedOut)
    override val authState: StateFlow<AuthState> = mutableAuthState.asStateFlow()
}

