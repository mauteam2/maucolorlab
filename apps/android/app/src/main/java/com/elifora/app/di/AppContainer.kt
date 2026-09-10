package com.elifora.app.di

import android.content.Context
import com.elifora.app.core.config.AppConfig
import com.elifora.app.core.config.BuildConfigAppConfig
import com.elifora.app.data.auth.*
import com.elifora.app.domain.auth.WorkspaceController

interface AppContainer {
    val appConfig: AppConfig
    val workspaceController: WorkspaceController
}
class DefaultAppContainer(context: Context) : AppContainer {
    override val appConfig: AppConfig by lazy { BuildConfigAppConfig() }
    private val repository by lazy { SupabaseAuthRepository(SupabaseTransport(appConfig), EncryptedSessionStore(context)) }
    override val workspaceController by lazy { WorkspaceController(repository, repository, PreferenceWorkspaceStore(context)) }
}
