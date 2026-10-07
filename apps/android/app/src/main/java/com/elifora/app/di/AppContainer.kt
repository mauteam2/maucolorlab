package com.elifora.app.di

import android.content.Context
import com.elifora.app.core.config.AppConfig
import com.elifora.app.core.config.BuildConfigAppConfig
import com.elifora.app.data.auth.*
import com.elifora.app.domain.auth.WorkspaceController
import com.elifora.app.domain.clients.ClientController
import com.elifora.app.data.clients.SupabaseClientRepository
import com.elifora.app.data.hair.SupabaseHairPassportRepository
import com.elifora.app.data.hair.SupabaseHairMutationRepository
import com.elifora.app.domain.hair.HairPassportController

interface AppContainer {
    val appConfig: AppConfig
    val workspaceController: WorkspaceController
    val clientController: ClientController
    val hairPassportController: HairPassportController
    val clientCrmController: com.elifora.app.domain.crm.ClientCrmController
}
class DefaultAppContainer(context: Context) : AppContainer {
    override val appConfig: AppConfig by lazy { BuildConfigAppConfig() }
    private val repository by lazy { SupabaseAuthRepository(SupabaseTransport(appConfig), EncryptedSessionStore(context)) }
    override val workspaceController by lazy { WorkspaceController(repository, repository, PreferenceWorkspaceStore(context)) }
    override val clientController by lazy { ClientController(SupabaseClientRepository(repository::clientOperation)) }
    override val clientCrmController by lazy { com.elifora.app.domain.crm.ClientCrmController(com.elifora.app.data.crm.SupabaseClientCrmRepository(repository::crmRead, repository::crmOperation, repository::list)) }
    override val hairPassportController by lazy { HairPassportController(SupabaseHairPassportRepository(repository::hairPassportSnapshot, repository::list),
        SupabaseHairMutationRepository(repository::hairMutation, repository::list, repository::userId)) }
}
