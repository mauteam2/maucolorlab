package com.elifora.app.data.salon

import com.elifora.app.domain.salon.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AppointmentReadinessTest {
    private val id="e9000000-0000-4000-8000-000000000001"
    private fun row()=JSONObject().put("schema_version",1).put("appointment_id",id).put("appointment_version",1).put("evaluated_at","2026-10-18T09:00:00Z").put("preparation_status","CONSULTATION_REQUIRED").put("consultation_required",true).put("strand_test_status","UNKNOWN").put("allocated_minutes",60).put("duration_source","APPOINTMENT_ALLOCATION").put("technical_clearance",false)
    @Test fun minimumProjectionHasNoTechnicalAuthority(){val v=SupabaseAppointmentReadinessRepository.parse(row(),id);assertEquals(PreparationStatus.CONSULTATION_REQUIRED,v.preparationStatus);assertEquals(StrandTestStatus.UNKNOWN,v.strandTestStatus);assertFalse(v.technicalClearance)}
    @Test fun fullTechnicalDtoIsRejected(){for(key in listOf("risk","last_formula","photos","notes","cost","commission")){try{SupabaseAppointmentReadinessRepository.parse(row().put(key,JSONObject()),id);fail(key)}catch(_:IllegalArgumentException){}}}
    @Test fun forgedClearanceIsRejected(){try{SupabaseAppointmentReadinessRepository.parse(row().put("technical_clearance",true),id);fail()}catch(_:IllegalArgumentException){}}
    @Test fun otherAppointmentIsRejected(){try{SupabaseAppointmentReadinessRepository.parse(row(),"e9000000-0000-4000-8000-000000000002");fail()}catch(_:IllegalArgumentException){}}
}
