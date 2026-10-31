# Intelligence JSON contracts

## Overview

Five draft-07 JSON Schemas define the Python-report input, browser transport, and optional analyst and options presentations. These are data contracts, not source ingestion or deployment configuration. This schema directory is retained in the bootstrap because it is a central system boundary.

## Interface

| File | Schema ID and purpose |
| --- | --- |
| `python-market-intelligence-v1.schema.json` | `python-market-intelligence-v1`: accepts `schema_version: market-intelligence-v1`, timestamped features, playbooks, options and quality metadata |
| `tradehub-intelligence-v1.schema.json` | `tradehub-intelligence-v1`: browser envelope with report identity, retrieval time, freshness, sample label, options and optional referenced presentations |
| `analyst-brief-v1.schema.json` | `analyst-brief-v1`: symbol evidence, session open, confidence, validation and scenarios |
| `analyst-desk-v1.schema.json` | `analyst-desk-v1`: educational sections, quant/flow context, validation, training and provenance |
| `options-workspace-v1.schema.json` | `options-workspace-v1`: matched-archive symbols, expiration groups, strikes, missing-side states, prior OI observation and pricing/activity/gamma evidence |

Consumers are the report adapter in `src/lib/reportContract.js` and the [report API](../api/EGM.md); producers include the [offline scripts](../scripts/EGM.md).

## Invariants

- JSON schema IDs and constants are versioned interfaces. Cross-schema references require the validator to register the referenced schemas.
- The transport requires `sample: true`; the options workspace requires `retrieval_mode: SAVED_REPORT_AND_MATCHED_ARCHIVE_ONLY`. These contracts describe historical review rather than a generic live feed.
- Transport, analyst brief and desk top-level objects reject additional properties; Python input and options workspace allow them. Validation is therefore intentionally uneven and is not proof of full semantic consistency or safe arbitrary publication.
- Nullable OI/change fields preserve unavailable values separately from known zero. Source cutoff, underlying observation and report session have different meanings.

## Side Effects

Schema files have no runtime effects themselves. Validation accepts or rejects payloads; `scripts/create-contracts.py` can overwrite the Python and transport schemas when explicitly run.

## Verification

Existing verification target: `npm test`, including report and intelligence tests. All five JSON files parsed successfully during documentation inspection. No schema generation was run.
