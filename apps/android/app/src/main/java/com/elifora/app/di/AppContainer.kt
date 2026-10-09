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
    val financeController: com.elifora.app.domain.finance.FinanceController
    val stockController: com.elifora.app.domain.stock.StockController
}
class DefaultAppContainer(context: Context) : AppContainer {
    override val appConfig: AppConfig by lazy { BuildConfigAppConfig() }
    private val repository by lazy { SupabaseAuthRepository(SupabaseTransport(appConfig), EncryptedSessionStore(context)) }
    override val workspaceController by lazy { WorkspaceController(repository, repository, PreferenceWorkspaceStore(context)) }
    override val clientController by lazy { ClientController(SupabaseClientRepository(repository::clientOperation)) }
    override val financeController by lazy { com.elifora.app.domain.finance.FinanceController(com.elifora.app.data.finance.SupabaseFinanceRepository(repository::financeSnapshot, repository::list)) }
    override val stockController by lazy { com.elifora.app.domain.stock.StockController(com.elifora.app.data.stock.SupabaseStockRepository(repository::stockSnapshot, repository::list)) }
    override val clientCrmController by lazy { com.elifora.app.domain.crm.ClientCrmController(com.elifora.app.data.crm.SupabaseClientCrmRepository(repository::crmRead, repository::crmOperation, repository::list)) }
    override val hairPassportController by lazy { HairPassportController(SupabaseHairPassportRepository(repository::hairPassportSnapshot, repository::list),
        SupabaseHairMutationRepository(repository::hairMutation, repository::list, repository::userId)) }
}
