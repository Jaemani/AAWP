export const PREVIEW_HARNESS_MIGRATION = String.raw`
CREATE SCHEMA aawp_preview;

CREATE TABLE aawp_preview.contracts (
  contract_kind text PRIMARY KEY CHECK (contract_kind IN ('data', 'api')),
  contract_digest text NOT NULL CHECK (contract_digest ~ '^[0-9a-f]{64}$'),
  contract jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE aawp_preview.resource_versions (
  entity_id text NOT NULL,
  resource_id text NOT NULL,
  resource_version bigint NOT NULL CHECK (resource_version > 0),
  payload jsonb NOT NULL,
  command_id text NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, resource_id, resource_version)
);

CREATE TABLE aawp_preview.command_results (
  command_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (command_id, idempotency_key)
);

CREATE TABLE aawp_preview.audit_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  command_id text NOT NULL,
  actor_id text NOT NULL,
  entity_id text NOT NULL,
  resource_id text NOT NULL,
  before_version bigint NOT NULL CHECK (before_version >= 0),
  after_version bigint NOT NULL CHECK (after_version > before_version),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION aawp_preview.append_resource_version(
  p_entity_id text,
  p_resource_id text,
  p_expected_version bigint,
  p_payload jsonb,
  p_command_id text,
  p_actor_id text
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  current_version bigint;
  next_version bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_entity_id || ':' || p_resource_id));
  SELECT COALESCE(MAX(resource_version), 0) INTO current_version
  FROM aawp_preview.resource_versions
  WHERE entity_id = p_entity_id AND resource_id = p_resource_id;

  IF current_version <> p_expected_version THEN
    RAISE EXCEPTION 'resource version conflict: expected %, actual %',
      p_expected_version, current_version USING ERRCODE = '40001';
  END IF;

  next_version := current_version + 1;
  INSERT INTO aawp_preview.resource_versions (
    entity_id, resource_id, resource_version, payload, command_id, actor_id
  ) VALUES (
    p_entity_id, p_resource_id, next_version, p_payload, p_command_id, p_actor_id
  );
  RETURN next_version;
END;
$$;
`;
