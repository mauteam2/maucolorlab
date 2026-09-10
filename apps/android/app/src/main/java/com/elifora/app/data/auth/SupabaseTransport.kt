package com.elifora.app.data.auth

import com.elifora.app.core.config.AppConfig
import com.elifora.app.domain.auth.AccessFailure
import com.elifora.app.domain.auth.ErrorCode
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class HttpReply(val status: Int, val body: String, val correlationId: String)
fun interface AuthTransport {
    suspend fun request(method: String, path: String, token: String?, body: String?): HttpReply
}
class SupabaseTransport(private val config: AppConfig) : AuthTransport {
    override suspend fun request(method: String, path: String, token: String?, body: String?): HttpReply =
        withContext(Dispatchers.IO) {
            val correlationId = UUID.randomUUID().toString()
            val key = config.supabasePublishableKey ?: throw AccessFailure(ErrorCode.CONFIGURATION_ERROR, correlationId)
            val connection = URI(config.supabaseUrl.trimEnd('/') + path).toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = method
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.setRequestProperty("apikey", key)
                connection.setRequestProperty("X-Correlation-ID", correlationId)
                connection.setRequestProperty("Accept", "application/json")
                if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
                if (body != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                HttpReply(status, stream?.bufferedReader()?.use { it.readText() } ?: "", correlationId)
            } catch (_: java.io.IOException) {
                throw AccessFailure(ErrorCode.NETWORK_ERROR, correlationId)
            } finally { connection.disconnect() }
        }
}
