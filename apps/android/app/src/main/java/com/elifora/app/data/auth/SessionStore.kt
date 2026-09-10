package com.elifora.app.data.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.elifora.app.domain.auth.WorkspaceReferenceStore
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SessionStore {
    fun read(): String?
    fun write(value: String?)
}

/** Tokens are encrypted with a non-exportable Android Keystore key; backup is disabled. */
class EncryptedSessionStore(context: Context) : SessionStore {
    private val preferences = context.getSharedPreferences("elifora-session", Context.MODE_PRIVATE)
    private val alias = "elifora-session-v1"
    private fun key(): SecretKey {
        val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keys.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    override fun read(): String? {
        val stored = preferences.getString("ciphertext", null) ?: return null
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
        } catch (_: Exception) { write(null); null }
    }
    override fun write(value: String?) {
        val encoded = value?.let {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            Base64.encodeToString(cipher.iv + cipher.doFinal(it.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        }
        check(preferences.edit().putString("ciphertext", encoded).commit())
    }
}
class PreferenceWorkspaceStore(context: Context) : WorkspaceReferenceStore {
    private val preferences = context.getSharedPreferences("elifora-workspace", Context.MODE_PRIVATE)
    override var reference: String?
        get() = preferences.getString("reference", null)
        set(value) { preferences.edit().putString("reference", value).apply() }
}
