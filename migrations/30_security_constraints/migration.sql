DO $$
DECLARE
  target record;
  constraint_name text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('Church', 'monthlyFeeMinor'),
      ('SubscriptionPayment', 'amountMinor'),
      ('GivingBatch', 'countedMinor'),
      ('Transaction', 'giftMinor'),
      ('Transaction', 'feeCoverMinor'),
      ('Transaction', 'chargedMinor'),
      ('Transaction', 'feeEstimateMinor'),
      ('Transaction', 'gatewayFeeMinor'),
      ('Transaction', 'netSettledMinor'),
      ('Transaction', 'settledMinor'),
      ('Transaction', 'presentmentMinor'),
      ('Expense', 'amountMinor'),
      ('SmsPackage', 'priceMinor'),
      ('SmsPurchase', 'priceMinor'),
      ('Remittance', 'amountMinor')
    ) AS columns(table_name, column_name)
  LOOP
    constraint_name := 'ck_' || lower(target.table_name) || '_' || lower(target.column_name) || '_nonnegative';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name AND conrelid = format('public.%I', target.table_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I >= 0)',
        target.table_name,
        constraint_name,
        target.column_name
      );
    END IF;
  END LOOP;
END $$;
