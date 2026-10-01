package com.elifora.app.domain.hair

import com.elifora.app.domain.auth.AccessFailure
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Holds no persistent technical cache. Every bind and refresh conceals the prior snapshot first. */
class HairPassportController(private val repository: HairPassportRepository,
    private val mutations: HairMutationRepository = HairMutationRepository { _, _ -> throw HairFailure("FORBIDDEN") }) {
    private val mutable = MutableStateFlow<HairState>(HairState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var selected: Client? = null
    private var offsets = HairOffsets()
    private var generation = 0
    private var latest: HairPassport? = null
    private var draft: HairDraft? = null
    private var editStatus: HairEditStatus = HairEditStatus.Editing
    private var pending: HairCommand? = null
    private var busy = false
    private var visible = false

    fun isOpenFor(clientId: String) = selected?.id == clientId
    val canLeave get() = !busy && pending == null
    fun conceal() { generation++; visible = false; if (selected != null) mutable.value = HairState.Loading }
    fun invalidate() { generation++; visible = false; context = null; selected = null; latest = null; draft = null; pending = null; offsets = HairOffsets(); mutable.value = HairState.Closed }
    fun close() { if (!canLeave) return; generation++; selected = null; latest = null; draft = null; offsets = HairOffsets(); mutable.value = HairState.Closed }
    suspend fun bind(next: ActiveTenantContext) {
        if (context?.reference != next.reference || context?.organizationId != next.organizationId) {
            invalidate()
        }
        context = next
        visible = true
        if (selected != null) refresh()
    }
    suspend fun open(client: Client) { if (selected?.id != client.id) { draft = null; pending = null }; selected = client; visible = true; offsets = HairOffsets(); refresh() }
    suspend fun refresh() {
        val client = selected ?: return
        val currentContext = context ?: run { mutable.value = HairState.Forbidden; return }
        val current = ++generation
        mutable.value = HairState.Loading
        if (!currentContext.permissions.containsAll(setOf("clients.read", "hair_passport.read"))) {
            if (current == generation) mutable.value = HairState.Forbidden
            return
        }
        try {
            val result = repository.read(currentContext, client, offsets)
            if (current != generation) return
            mutable.value = when (result) {
                is HairReadResult.Snapshot -> { latest = result.passport; editorState(client) ?: HairState.Ready(client, result.passport) }
                HairReadResult.Empty -> { latest = null; editorState(client) ?: HairState.EmptyPassport(client) }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: HairFailure) { if (current == generation) fail(failure.code, failure.correlationId) }
        catch (failure: AccessFailure) { if (current == generation) fail(failure.code.name, failure.correlationId) }
        catch (_: Exception) { if (current == generation) mutable.value = HairState.Error("NETWORK_ERROR", null) }
    }
    fun can(action: HairAction): Boolean = selected?.status == com.elifora.app.domain.clients.ClientStatus.ACTIVE && latest?.archived != true &&
        context?.permissions?.containsAll(setOf("clients.read", "hair_passport.read", action.permission)) == true
    fun begin(action: HairAction, regionId: String? = null) {
        if (mutable.value !is HairState.Ready && mutable.value !is HairState.EmptyPassport) return
        if (!can(action)) { fail("FORBIDDEN", null); return }
        val passport = latest
        if ((action == HairAction.CREATE) != (passport == null)) return
        draft = when (action) {
            HairAction.CREATE, HairAction.CORE -> TechnicalDraft.from(passport?.core).let { HairDraft.Core(action, it, it, passport?.version) }
            HairAction.REGION_CREATE -> HairDraft.NewRegion()
            HairAction.REGION_EDIT -> {
                val region = passport?.regions?.find { it.id == regionId && !it.archived } ?: return
                TechnicalDraft.from(region.assessment).let { HairDraft.Core(action, it, it, region.version, region.id, region.label.orEmpty(), region.label.orEmpty(), region.type) }
            }
        }
        editStatus = HairEditStatus.Editing
        publishEditor()
    }
    fun change(next: HairDraft) {
        val prior = draft ?: return
        if (pending != null || busy || editStatus is HairEditStatus.Conflict) return
        if (prior is HairDraft.Core && next is HairDraft.Core)
            require(next.copy(values = prior.values, label = prior.label) == prior)
        else require(next.action == prior.action)
        draft = next; editStatus = HairEditStatus.Editing; publishEditor()
    }
    suspend fun cancelEdit() { if (!canLeave) return; draft = null; refresh() }
    suspend fun reloadAfterConflict() { if (!canLeave) return; draft = null; offsets = HairOffsets(); refresh() }
    suspend fun save() {
        if (busy || !visible) return
        val editor = draft ?: return
        val tenant = context ?: return
        val client = selected ?: return
        if (!can(editor.action)) { fail("FORBIDDEN", null); return }
        if (editStatus is HairEditStatus.Conflict) return
        val command = pending ?: try { HairCommand(client.id, editor.write()) }
            catch (failure: HairDraftFailure) { editStatus = HairEditStatus.ValidationError(failure.field); publishEditor(); return }
        pending = command
        busy = true; editStatus = HairEditStatus.Saving; publishEditor()
        try {
            mutations.mutate(tenant, command)
            if (context?.reference != tenant.reference || selected?.id != client.id) return
            pending = null; draft = null; offsets = HairOffsets()
            if (visible) refresh()
        } catch (cancelled: CancellationException) {
            if (selected?.id == client.id) editStatus = HairEditStatus.NetworkError(null)
            throw cancelled
        } catch (failure: Exception) {
            if (context?.reference != tenant.reference || selected?.id != client.id) return
            val code = when (failure) { is HairFailure -> failure.code; is AccessFailure -> failure.code.name; else -> "NETWORK_ERROR" }
            val correlation = (failure as? HairFailure)?.correlationId ?: (failure as? AccessFailure)?.correlationId
            when (code) {
                "FORBIDDEN", "MEMBERSHIP_REVOKED", "MEMBERSHIP_REQUIRED", "TENANT_CONTEXT_INVALID", "UNAUTHENTICATED", "SESSION_EXPIRED" -> { pending = null; draft = null; if (visible) fail(code, correlation) }
                "CONFLICT", "HAIR_PASSPORT_ALREADY_EXISTS", "HAIR_REGION_ALREADY_EXISTS", "HAIR_REGION_NOT_FOUND", "HAIR_PASSPORT_NOT_FOUND", "CLIENT_ARCHIVED" -> {
                    pending = null; editStatus = HairEditStatus.Conflict(code); publishEditor()
                }
                "NETWORK_ERROR" -> { editStatus = HairEditStatus.NetworkError(correlation); publishEditor() }
                else -> { pending = null; editStatus = HairEditStatus.ValidationError(code); publishEditor() }
            }
        } finally { busy = false }
    }
    private fun editorState(client: Client): HairState.Editing? = draft?.let { editor ->
        if (!can(editor.action)) { draft = null; pending = null; null } else HairState.Editing(client, latest, editor, editStatus)
    }
    private fun publishEditor() { if (visible) selected?.let { editorState(it)?.let { state -> mutable.value = state } } }
    suspend fun page(kind: HairPageKind, nextOffset: Int) {
        if (nextOffset !in 0..10000) return
        offsets = when (kind) {
            HairPageKind.OBSERVATIONS -> offsets.copy(observations = nextOffset)
            HairPageKind.TESTS -> offsets.copy(tests = nextOffset)
            HairPageKind.HISTORY -> offsets.copy(history = nextOffset)
        }
        refresh()
    }
    private fun fail(code: String, correlationId: String?) {
        latest = null
        if (code in setOf("FORBIDDEN", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "UNAUTHENTICATED", "SESSION_EXPIRED")) { draft = null; pending = null }
        mutable.value = when (code) {
            "FORBIDDEN", "MEMBERSHIP_REQUIRED" -> HairState.Forbidden
            "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID" -> HairState.MembershipRevoked
            "UNAUTHENTICATED", "SESSION_EXPIRED" -> HairState.SessionExpired
            else -> HairState.Error(code, correlationId)
        }
    }
}
