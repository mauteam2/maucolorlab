package com.elifora.app.data.offline

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.elifora.app.domain.offline.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Ciphertext only, scoped by verified identity, using non-exportable Keystore
 * keys. App backup is already disabled. Never persists HTTP/auth/provider keys. */
class EncryptedOfflineDraftStore(context: Context) : OfflineDraftStore {
    private val preferences = context.getSharedPreferences("elifora-offline-intents", Context.MODE_PRIVATE)
    val deviceId: String = preferences.getString("device-id", null) ?: UUID.randomUUID().toString().also {
        check(preferences.edit().putString("device-id", it).commit())
    }
    private fun scope(identity: OfflineIdentity) = offlineHash(listOf(identity.userId, identity.organizationId, identity.locationId, identity.deviceId, identity.membershipId).joinToString(":"))
    private fun key(scope: String): SecretKey {
        val alias = "elifora-offline-$scope"
        val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keys.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    override suspend fun read(identity: OfflineIdentity): List<OfflineDraft> = withContext(Dispatchers.IO) {
        val scope = scope(identity)
        preferences.all.filterKeys { it.startsWith("$scope:") }.map { (name, encoded) ->
            val bytes = Base64.decode(encoded as String, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(scope), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            decodeDraft(JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)), identity)
        }.sortedBy { it.createdAt }
    }
    override suspend fun put(draft: OfflineDraft) = withContext(Dispatchers.IO) {
        val records = read(draft.identity); val old = records.firstOrNull { it.draftId == draft.draftId }
        check(old == null || old.payloadHash == draft.payloadHash && old.mutationId == draft.mutationId && old.domain == draft.domain) { "PAYLOAD_CHANGED" }
        check(old != null || records.size < 100) { "DRAFT_STORAGE_LIMIT" }
        val scope = scope(draft.identity); val name = "$scope:${draft.draftId}"
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(scope))
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val ciphertext = cipher.iv + cipher.doFinal(encodeDraft(draft).toString().toByteArray(Charsets.UTF_8))
        check(preferences.edit().putString(name, Base64.encodeToString(ciphertext, Base64.NO_WRAP)).commit())
    }
    override suspend fun remove(identity: OfflineIdentity, draftId: String) = withContext(Dispatchers.IO) {
        check(preferences.edit().remove("${scope(identity)}:$draftId").commit())
    }
}
internal fun encodeDraft(d: OfflineDraft) = JSONObject().apply {
    put("schema_version", 1); put("draft_id", d.draftId); put("mutation_id", d.mutationId); put("domain", d.domain.name)
    put("organization_id", d.identity.organizationId); put("location_id", d.identity.locationId); put("user_id", d.identity.userId)
    put("device_id", d.identity.deviceId); put("membership_id", d.identity.membershipId); put("workspace_reference", d.identity.reference)
    put("entity_id", d.entityId ?: JSONObject.NULL); put("base_version", d.baseVersion ?: JSONObject.NULL)
    put("session_id", d.sessionId ?: JSONObject.NULL); put("control_epoch", d.controlEpoch ?: JSONObject.NULL)
    put("created_at", d.createdAt); put("updated_at", d.updatedAt); put("payload", d.payload); put("payload_hash", d.payloadHash)
    put("status", d.status.name); put("dependencies", JSONArray(d.dependencies)); put("attempt_count", d.attemptCount)
    put("next_attempt_at", d.nextAttemptAt ?: JSONObject.NULL); put("conflict", d.conflict?.name ?: JSONObject.NULL); put("correlation_id", d.correlationId ?: JSONObject.NULL)
}
internal fun decodeDraft(o: JSONObject, identity: OfflineIdentity): OfflineDraft {
    require(o.getInt("schema_version") == 1 && o.getString("organization_id") == identity.organizationId && o.getString("location_id") == identity.locationId && o.getString("user_id") == identity.userId && o.getString("device_id") == identity.deviceId && o.getString("membership_id") == identity.membershipId)
    fun nullable(name: String) = if (o.isNull(name)) null else o.getString(name)
    val dependencies = o.getJSONArray("dependencies")
    return OfflineDraft(o.getString("draft_id"), o.getString("mutation_id"), DraftDomain.valueOf(o.getString("domain")), identity,
        nullable("entity_id"), if (o.isNull("base_version")) null else o.getLong("base_version"), nullable("session_id"), if (o.isNull("control_epoch")) null else o.getLong("control_epoch"),
        o.getString("created_at"), o.getString("updated_at"), o.getString("payload"), o.getString("payload_hash"), SyncState.valueOf(o.getString("status")),
        List(dependencies.length()) { dependencies.getString(it) }, o.getInt("attempt_count"), nullable("next_attempt_at"), nullable("conflict")?.let(ConflictType::valueOf), nullable("correlation_id"))
}
