package com.elifora.app.data.auth

import com.elifora.app.domain.auth.AuthState
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaceholderAuthRepositoryTest {
    @Test
    fun startsSignedOut() {
        val repository = PlaceholderAuthRepository()

        assertEquals(AuthState.SignedOut, repository.authState.value)
    }
}

