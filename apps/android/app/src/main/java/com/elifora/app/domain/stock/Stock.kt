package com.elifora.app.domain.stock

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.math.BigDecimal
import java.util.UUID

enum class StockUnit { GRAM, MILLILITER, UNIT }
enum class StockStatus { OK, LOW, OUT, UNKNOWN }
data class StockItem(val id: String, val name: String, val sku: String?, val unit: StockUnit,
    val onHand: BigDecimal?, val status: StockStatus, val syncRequired: Boolean, val source: String)
data class StockMovement(val id: String, val itemId: String, val type: String, val quantity: BigDecimal,
    val unit: StockUnit, val at: String, val reason: String)
data class StockBundle(val items: List<StockItem>, val movements: List<StockMovement>, val total: Int,
    val offset: Int, val enabled: Boolean, val pending: Int, val failed: Int)
interface StockRepository { suspend fun load(context: ActiveTenantContext, itemId: String?, query: String, offset: Int): StockBundle }
sealed interface StockState {
    data object Closed : StockState
    data object Loading : StockState
    data class Ready(val data: StockBundle) : StockState
    data class Error(val failure: ClientFailure) : StockState
}
/** Native UI consumes authoritative inventory only; it never derives usage or balances. */
class StockController(private val repository: StockRepository) {
    private val mutable = MutableStateFlow<StockState>(StockState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var generation = 0
    fun conceal() { generation++; mutable.value = StockState.Closed }
    fun invalidate() { conceal(); context = null }
    fun bind(next: ActiveTenantContext) {
        if (context?.reference != next.reference || context?.organizationId != next.organizationId) invalidate()
        context = next
    }
    suspend fun open(itemId: String? = null, query: String = "", offset: Int = 0) {
        val selected = context ?: return
        val current = ++generation
        mutable.value = StockState.Loading
        try {
            if ("stock.view" !in selected.permissions) throw ClientFailure("FORBIDDEN")
            if (query.length > 80 || offset !in 0..10000 || itemId != null && runCatching { UUID.fromString(itemId) }.isFailure) throw ClientFailure("VALIDATION_FAILED")
            val data = repository.load(selected, itemId, query, offset)
            if (current == generation && context?.reference == selected.reference) mutable.value = StockState.Ready(data)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (current == generation) mutable.value = StockState.Error(failure) }
        catch (_: Exception) { if (current == generation) mutable.value = StockState.Error(ClientFailure("NETWORK_ERROR")) }
    }
}
