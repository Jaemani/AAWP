BEGIN;

CREATE TABLE tenants (
  tenant_id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_versions (
  workflow_version_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id),
  workflow_id text NOT NULL,
  version text NOT NULL,
  wir_digest text NOT NULL CHECK (wir_digest ~ '^[0-9a-f]{64}$'),
  wir jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workflow_version_id),
  UNIQUE (tenant_id, workflow_id, version)
);

CREATE TABLE runs (
  run_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id),
  workflow_version_id uuid NOT NULL,
  active_branch_id uuid,
  branch_generation bigint NOT NULL DEFAULT 0 CHECK (branch_generation >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id),
  FOREIGN KEY (tenant_id, workflow_version_id)
    REFERENCES workflow_versions (tenant_id, workflow_version_id)
);

CREATE TABLE run_branches (
  branch_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  parent_branch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, branch_id),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id),
  FOREIGN KEY (tenant_id, run_id, parent_branch_id)
    REFERENCES run_branches (tenant_id, run_id, branch_id)
);

ALTER TABLE runs
  ADD CONSTRAINT runs_active_branch_fk
  FOREIGN KEY (tenant_id, run_id, active_branch_id)
  REFERENCES run_branches (tenant_id, run_id, branch_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE events (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_key text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (tenant_id, run_id, sequence),
  UNIQUE (tenant_id, run_id, event_key),
  FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, run_id)
);

CREATE FUNCTION awf_append_event(
  p_tenant_id uuid,
  p_run_id uuid,
  p_event_key text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload jsonb,
  p_expected_next_sequence bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_sequence bigint;
BEGIN
  PERFORM 1 FROM runs
  WHERE tenant_id = p_tenant_id AND run_id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(sequence), 0) + 1 INTO next_sequence
  FROM events
  WHERE tenant_id = p_tenant_id AND run_id = p_run_id;

  IF p_expected_next_sequence IS NOT NULL
     AND p_expected_next_sequence <> next_sequence THEN
    RAISE EXCEPTION 'event sequence compare-and-swap failed' USING ERRCODE = '40001';
  END IF;

  INSERT INTO events (
    tenant_id, run_id, sequence, event_key, event_type, occurred_at, payload
  ) VALUES (
    p_tenant_id, p_run_id, next_sequence, p_event_key, p_event_type, p_occurred_at, p_payload
  );
  RETURN next_sequence;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON events FROM PUBLIC;

CREATE TABLE artifacts (
  artifact_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (tenant_id),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  media_type text NOT NULL,
  semantic_type text NOT NULL,
  schema_version text NOT NULL,
  producer_node_id text NOT NULL,
  producer_node_version text NOT NULL,
  workflow_version_id uuid NOT NULL,
  run_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  storage_uri text NOT NULL,
  scope_tags text[] NOT NULL DEFAULT '{}',
  sensitivity text NOT NULL CHECK (sensitivity IN ('public', 'internal', 'confidential', 'restricted')),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, artifact_id),
  UNIQUE (tenant_id, content_hash),
  FOREIGN KEY (tenant_id, workflow_version_id)
    REFERENCES workflow_versions (tenant_id, workflow_version_id),
  FOREIGN KEY (tenant_id, run_id, branch_id)
    REFERENCES run_branches (tenant_id, run_id, branch_id)
);

CREATE TABLE artifact_edges (
  tenant_id uuid NOT NULL,
  parent_artifact_id uuid NOT NULL,
  child_artifact_id uuid NOT NULL,
  edge_type text NOT NULL CHECK (edge_type IN ('read', 'derived', 'validated', 'supersedes')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, parent_artifact_id, child_artifact_id, edge_type),
  CHECK (parent_artifact_id <> child_artifact_id),
  FOREIGN KEY (tenant_id, parent_artifact_id) REFERENCES artifacts (tenant_id, artifact_id),
  FOREIGN KEY (tenant_id, child_artifact_id) REFERENCES artifacts (tenant_id, artifact_id)
);

CREATE TABLE cache_entries (
  tenant_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  verifier_policy_digest text NOT NULL CHECK (verifier_policy_digest ~ '^[0-9a-f]{64}$'),
  sensitivity text NOT NULL CHECK (sensitivity IN ('public', 'internal', 'confidential', 'restricted')),
  artifact_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fingerprint, verifier_policy_digest, sensitivity),
  FOREIGN KEY (tenant_id, artifact_id) REFERENCES artifacts (tenant_id, artifact_id)
);

CREATE FUNCTION awf_reject_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER workflow_versions_immutable
BEFORE UPDATE OR DELETE ON workflow_versions
FOR EACH ROW EXECUTE FUNCTION awf_reject_immutable_mutation();

CREATE TRIGGER run_branches_immutable
BEFORE UPDATE OR DELETE ON run_branches
FOR EACH ROW EXECUTE FUNCTION awf_reject_immutable_mutation();

CREATE TRIGGER events_append_only
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION awf_reject_immutable_mutation();

CREATE TRIGGER artifacts_immutable
BEFORE UPDATE OR DELETE ON artifacts
FOR EACH ROW EXECUTE FUNCTION awf_reject_immutable_mutation();

CREATE TRIGGER artifact_edges_immutable
BEFORE UPDATE OR DELETE ON artifact_edges
FOR EACH ROW EXECUTE FUNCTION awf_reject_immutable_mutation();

CREATE FUNCTION awf_promote_branch(
  p_tenant_id uuid,
  p_run_id uuid,
  p_branch_id uuid,
  p_expected_generation bigint
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  next_generation bigint;
BEGIN
  UPDATE runs
  SET active_branch_id = p_branch_id,
      branch_generation = branch_generation + 1
  WHERE tenant_id = p_tenant_id
    AND run_id = p_run_id
    AND branch_generation = p_expected_generation
    AND EXISTS (
      SELECT 1 FROM run_branches
      WHERE tenant_id = p_tenant_id
        AND run_id = p_run_id
        AND branch_id = p_branch_id
    )
  RETURNING branch_generation INTO next_generation;

  IF next_generation IS NULL THEN
    RAISE EXCEPTION 'branch compare-and-swap failed' USING ERRCODE = '40001';
  END IF;
  RETURN next_generation;
END;
$$;

COMMIT;
