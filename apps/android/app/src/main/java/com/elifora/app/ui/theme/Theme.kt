package com.elifora.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class ThemeMode { System, Light, Dark }
enum class DensityMode { Comfortable, Compact }

@Immutable
data class EliforaSpacing(
    val page: Dp,
    val section: Dp,
    val control: Dp,
)

val LocalEliforaSpacing = staticCompositionLocalOf {
    EliforaSpacing(page = 24.dp, section = 24.dp, control = 48.dp)
}

private val LightColors = lightColorScheme(
    primary = Color(0xFF70483F),
    onPrimary = Color.White,
    background = Color(0xFFF7F3EE),
    onBackground = Color(0xFF231F20),
    surface = Color(0xFFFFFDF9),
    onSurface = Color(0xFF231F20),
    surfaceVariant = Color(0xFFEFE6DF),
    onSurfaceVariant = Color(0xFF675F5C),
    error = Color(0xFF9B2C2C),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFDDB0A3),
    onPrimary = Color(0xFF2C1712),
    background = Color(0xFF1B1818),
    onBackground = Color(0xFFF8F1EC),
    surface = Color(0xFF242020),
    onSurface = Color(0xFFF8F1EC),
    surfaceVariant = Color(0xFF352F2D),
    onSurfaceVariant = Color(0xFFC9BDB6),
    error = Color(0xFFFFB4AB),
)

@Composable
fun EliforaTheme(
    themeMode: ThemeMode = ThemeMode.System,
    densityMode: DensityMode = DensityMode.Comfortable,
    content: @Composable () -> Unit,
) {
    val useDarkColors = when (themeMode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val spacing = when (densityMode) {
        DensityMode.Comfortable -> EliforaSpacing(page = 24.dp, section = 24.dp, control = 48.dp)
        DensityMode.Compact -> EliforaSpacing(page = 20.dp, section = 16.dp, control = 40.dp)
    }

    CompositionLocalProvider(LocalEliforaSpacing provides spacing) {
        MaterialTheme(
            colorScheme = if (useDarkColors) DarkColors else LightColors,
            content = content,
        )
    }
}

