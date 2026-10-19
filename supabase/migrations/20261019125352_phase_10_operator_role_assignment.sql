-- The migration administrator already owns the definer procedure. Explicit role
-- assumption is required by the controlled operator runbook and test harness.
-- No application, service-role or authenticator membership is granted.
grant elifora_pilot_operator to postgres;
