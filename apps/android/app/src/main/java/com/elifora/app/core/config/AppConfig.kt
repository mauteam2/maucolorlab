package com.elifora.app.core.config

import com.elifora.app.BuildConfig

interface AppConfig {
    val supabaseUrl: String
    val supabasePublishableKey: String?
}

class BuildConfigAppConfig : AppConfig {
    override val supabaseUrl: String = BuildConfig.SUPABASE_URL
    override val supabasePublishableKey: String? = BuildConfig.SUPABASE_PUBLISHABLE_KEY.ifBlank { null }
}

