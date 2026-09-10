package com.elifora.app

import android.app.Application
import com.elifora.app.di.AppContainer
import com.elifora.app.di.DefaultAppContainer

class EliforaApplication : Application() {
    val container: AppContainer by lazy { DefaultAppContainer() }
}

