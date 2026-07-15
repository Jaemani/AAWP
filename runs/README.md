# Run storage

`runs/` is the single local persistence root for AAWP Studio. Runtime data is intentionally git-ignored; this README and `.gitkeep` define the stable layout.

```text
runs/
  history.jsonl                 # append-only snapshots for every workflow run
  requests/<request-id>/
    request.json                # immutable workflow input
    source-spec.json            # pinned copy of the source input
  run_<uuid>/
    run.json                    # latest materialized run record
    input.json                  # exact executor input
    logs/
      <node>.stdout.log
      <node>.stderr.log
    artifacts/
      demo/                     # builder-owned output before release snapshot
    demo/                       # immutable served snapshot; may be onboarded/offboarded
```

All new Studio instances use `runs/history.jsonl`, `runs/` as the execution root, and `runs/` as the demo root by default. A demo workflow should declare `--demo-source runs/{runId}/artifacts/demo` so its released snapshot is stored under the same run.

`Delete demo` removes only `runs/<runId>/demo`. It preserves `run.json`, input, logs, builder artifacts and `history.jsonl`, so the workflow remains auditable and reproducible.

Legacy `.awf/*.jsonl`, execution folders and demos can be imported with:

```bash
rtk node scripts/migrate-runs-to-root.mjs
```

The importer preserves legacy records and files, deduplicates identical JSONL snapshots and leaves at most one demo onboarded.
