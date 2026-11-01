# Test fixtures

## Payload samples

`order.json`, `order.xml`, `order.idoc`, `order.csv`, and `order.xlsx` are small samples for payload-format and upload tests. The Excel fixture is a single-worksheet workbook. Treat these files as test inputs rather than application seed data.

## Backend error catalog

`error-catalog.json` is a committed snapshot of the backend's machine-readable error contract. `tests/api-errors.test.mjs` uses it to check localization coverage and HTTP examples without a live backend or network access.

- Upstream repository: [EnginKisin/integration-catalog](https://github.com/EnginKisin/integration-catalog)
- Source commit: [`fadfcd1ade8e35ad77a7eada4ea2905f60452640`](https://github.com/EnginKisin/integration-catalog/commit/fadfcd1ade8e35ad77a7eada4ea2905f60452640)
- Source file: [`docs/error-catalog.json` at that commit](https://github.com/EnginKisin/integration-catalog/blob/fadfcd1ade8e35ad77a7eada4ea2905f60452640/docs/error-catalog.json)

This snapshot is test data. It is not loaded by the browser application and does not claim that all backend endpoints have been verified against that commit.

To update it, choose the intended backend commit, copy its catalog, and update this source reference in the same change. Review any new codes, parameter shapes, or job states against the frontend adapters and Turkish dictionary, then run:

```sh
npm test
npm run build
```

Run the affected browser tests if the contract change affects visible feedback or workflow behavior. Preserve actual backend examples rather than generating a replacement catalog from frontend translations; otherwise the coverage test would miss unsupported backend codes.
