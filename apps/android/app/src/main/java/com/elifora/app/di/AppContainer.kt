package com.elifora.app.di

import com.elifora.app.core.config.AppConfig
import com.elifora.app.core.config.BuildConfigAppConfig
import com.elifora.app.data.auth.PlaceholderAuthRepository
import com.elifora.app.domain.auth.AuthRepository

interface AppContainer {
    val appConfig: AppConfig
    val authRepository: AuthRepository
}

class DefaultAppContainer : AppContainer {
    override val appConfig: AppConfig by lazy { BuildConfigAppConfig() }
    override val authRepository: AuthRepository by lazy { PlaceholderAuthRepository() }
}

