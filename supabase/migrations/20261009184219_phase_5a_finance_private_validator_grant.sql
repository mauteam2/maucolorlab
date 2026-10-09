-- Grant only the shared pure key validator, not any Salon mutation helper.
grant execute on function app_private.salon_keys(jsonb,text[]) to elifora_finance_writer;
