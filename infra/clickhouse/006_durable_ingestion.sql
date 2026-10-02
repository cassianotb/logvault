-- A API somente confirma um lote depois que as partes do MergeTree e o
-- comprovante correspondente foram sincronizados com o disco local.
ALTER TABLE argus.ingest_raw
  MODIFY SETTING fsync_after_insert = 1, fsync_part_directory = 1;

ALTER TABLE argus.cgnat_events
  MODIFY SETTING fsync_after_insert = 1, fsync_part_directory = 1;

ALTER TABLE argus.ingest_batch_receipts
  MODIFY SETTING fsync_after_insert = 1, fsync_part_directory = 1;
