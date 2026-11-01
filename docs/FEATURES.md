# Features and workflow reference

The UI is currently in Turkish. This guide uses English names with the corresponding navigation labels where helpful.

## Integration catalog

Search by service, system, description, or ID. Filter records by draft/completed status, synchronous/asynchronous flow, or review requirement. Open a record to continue its setup or inspect it with your account's permissions.

The backend owns the saved status. The frontend reloads records after writes rather than assuming a local edit has become the authoritative state.

## System catalog

Source, destination, and middleware selections use one shared system catalog. Systems are identified by ID, so equal names do not merge separate definitions.

Authorized users can create, rename, describe, activate, or deactivate systems. Administrators can request deletion of an unused system; the backend checks usage again at deletion time. Existing inactive selections remain visible on saved integrations, while new selections use active systems.

## Integration setup

The editor follows this sequence:

1. **Basic information:** name, description, source, destination, optional middleware, payload formats, and flow type.
2. **Environment settings:** DEV, TEST, or PROD connections, with separate destination and middleware settings where required.
3. **Request and response:** save schemas, sample content, or sample files for the required directions.
4. **Field mapping:** optionally connect compatible JSON, XML, or IDOC fields.
5. **Review and completion:** inspect missing requirements, explicitly confirm a required review, and request completion.

Creating an integration saves a draft. Saving basic information does not automatically create environment settings, save samples, or complete the record. Technical changes can return a completed record to draft/review state according to the backend's rules.

Save actions support continuing to the next step or saving and leaving. Unsaved changes prompt before leaving. If a write's outcome is uncertain, the editor requires a refresh/reconciliation before another change.

## Environment settings and credentials

Each connection stores its own URL, timeout, retry settings, and authentication type. Middleware integrations can require both a destination and middleware connection in each configured environment.

Credential values are requested only through an explicit reveal action and with the backend's permission checks. Revealed values are cleared after a short timeout, when the document becomes hidden, or when the view closes. Leaving existing credentials unspecified preserves them; supplying replacements or clearing authentication follows the backend contract.

## Payload formats

| Format | Sample support | Field mapping |
| --- | --- | --- |
| JSON | Object content and files | Supported |
| XML | Raw content and files | Supported |
| IDOC | XML representation and files | Supported |
| CSV | Text/files with delimiter and header options | Not supported |
| Excel | `.xls` / `.xlsx` sample files | Not supported |

JSON samples must be objects. XML and IDOC preserve their raw content. IDOC support uses its XML representation. The UI does not automatically convert one payload format into another.

Text/sample limits are 1 MiB for JSON, XML, IDOC, and CSV, and 5 MiB for Excel. Server-side content validation remains authoritative. An Excel preview is not provided.

For direct field mapping, source and target content can share one schema record while retaining independent definitions or samples. Follow the [backend payload contract](https://github.com/EnginKisin/integration-catalog/blob/main/docs/payload-content.md) for direction and format requirements.

## Manual field mapping

The mapping editor builds field trees from saved schemas or examples. Select a source and target field, inspect the resulting connection, and save the mapping list. Manual paths remain available for fields outside the visible tree or dynamic schema structures.

Request and response directions are handled separately. XML namespaces, attributes, repeated elements, and backend field paths are preserved. A field-type difference is a review aid rather than proof that a mapping can execute a conversion.

Field mapping is optional. The editor documents relationships; it does not execute transformations, resolve remote schema references, or run integrations.

## AI-assisted mapping

AI availability and provider configuration come from the backend. The browser uses the catalog API and does not contact model providers directly.

The frontend starts an asynchronous job, follows its polling interval, and displays suggestions separately from saved mappings. Users select, edit, or remove proposals before accepting them. Accepted suggestions are appended while preserving existing mappings and their IDs.

Changed context, expired results, mapping conflicts, empty results, and failed jobs are distinct outcomes. Provider errors do not become user-session authentication failures. AI being unavailable does not prevent manual mapping.

Suggestions use qualitative confidence labels, not calibrated accuracy percentages. Model explanations are plain text in the language returned by the backend. Code-bearing errors and unmatched-field diagnostics are translated into Turkish.

## Flow map

Filter by source, target, middleware, individual integration, environment, flow type, status, or search text. All matching integrations appear in one map.

- A system is shown once within its source, middleware, or target column. Equal names with different IDs stay separate.
- Shared middleware nodes grow with the number of integrations that pass through them.
- Each integration retains its own labeled path through shared nodes. Selecting it highlights both legs and opens its summary.
- Direct connections bypass middleware. A shared node does not create a new inferred integration between unrelated records.
- Zoom, fit, keyboard selection, and a service selector help navigate the map. Users can open the selected integration and return with filters preserved.

SVG and PNG exports contain all filtered results, the filter summary, and generation time. Large raster exports are bounded by browser canvas limits; SVG remains available for larger diagrams. Browser printing provides PDF output and keeps connected groups together.

These diagrams describe saved catalog connections. They do not measure traffic, latency, availability, or successful integration execution.

## Accounts and permissions

| Account capability | UI behavior |
| --- | --- |
| VIEWER | Read catalog records and diagrams within backend-granted access |
| EDITOR | Create and edit integrations and systems |
| ADMIN | Manage users and administrative actions, with backend protections |
| VIEW_CREDENTIALS | Additional permission to reveal saved integration credentials |
| MANAGE_CREDENTIALS | Additional permission to change credentials; the account's role must also permit editing |

Administrator access includes credential capabilities. Frontend visibility and disabled controls help explain permissions; the backend enforces authorization.

Account flows include invitation acceptance, password recovery/change, email confirmation/change, and session revocation. User creation is invitation-based. A queued email is not a delivery confirmation, and password-recovery responses do not disclose whether an account exists.

## Localized errors

The shared API envelope supplies stable codes, parameters, field violations, and a request ID. The frontend selects Turkish text from its own dictionary and preserves actionable metadata.

Supported forms show matching violations under the affected controls. Other field and completion violations are listed in the shared panel with translated field/direction names. Unknown codes receive a generic Turkish explanation. The support request ID can be correlated with backend logs.

## Current boundaries

- The frontend requires a compatible running backend for normal use.
- Turkish is the only interface language; there is no language switcher.
- Provider setup, database migrations, email delivery, and encryption-key management belong to the backend.
- Model-generated prose and warnings without codes are not automatically translated.
- Automated tests use controlled API responses; live-backend acceptance is a separate activity.
