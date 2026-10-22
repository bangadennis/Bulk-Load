# DHIS2 Bulk Load

The Bulk Load application generates templates (an Excel sheet) and imports multiple data values for DHIS2 v2.30 instances. Some notes:

-   Settings are only visible for superusers (`ALL` authority) or users that belong to the settings groups.
-   The generation box is only visible for users that belong to the configurable `Template Generation` groups (initial value: `HMIS Officers`).
-   Imported files are stored as documents (and can be downloaded later from the history) only for users with the `ALL` or `F_DOCUMENT_PRIVATE_ADD` authority. Users without them see a warning in the import page: their data is imported as usual and the import is still recorded in the history, but without the file.

## Setup

Install dependencies:

```
$ yarn install
```

## Development

Start the development server:

```
$ PORT=8081 VITE_DHIS2_BASE_URL="http://localhost:8080" VITE_DHIS2_AUTH="" yarn start
```

Now in your browser, go to `http://localhost:8081`.

Notes:

-   Requests to DHIS2 will be transparently proxied from `http://localhost:8081/dhis2/path` to `http://localhost:8080/path` (see `vite.config.ts`) to avoid CORS and cross-domain problems.

-   The optional environment variable `VITE_DHIS2_AUTH=USERNAME:PASSWORD` forces some credentials to be used by the proxy. This variable is usually not set, so the app has the same user logged in at `VITE_DHIS2_BASE_URL`.

-   The optional environment variable `VITE_PROXY_LOG_LEVEL` can be helpful to debug the proxied requests (accepts: "warn" | "debug" | "info" | "error" | "silent")

-   Create a file `.env.local` (copy it from `.env`) to customize environment variables so you can simply run `yarn start`.

-   [why-did-you-render](https://github.com/welldone-software/why-did-you-render) is loaded in development to help debug re-renders.

## Tests

### Unit tests

```
$ yarn test
```

## Data sets with data elements as rows (transposed layout)

By default a data set template has one data entry per row (org unit, period, ... in the first columns) and the
data elements as columns. The **transposed layout** has the data elements (and category option combos) as rows and
one data entry per column, with the org unit, period, attribute option combo and completed flag in header rows.

- **Generated template**: tick "Data elements as rows (data entries as columns)" in the download page (data sets,
  no custom template). It uses the template `DATASET_GENERATED_v4`. The number of entry columns is dynamic: one per
  org unit and period of the selection (at least 50 and at most 500 from the selection), or one per data entry when
  downloading with data (more than 500 if needed, up to the Excel limit). The dropdowns of the header rows cover the
  whole row, so more entries can be added by hand.
- **Custom template**: in the Settings > Templates dialog, basic mode, data sets, enable "Data elements as rows"
  and set the header rows (org unit, period, attribute, optional completed), the data element and category option
  combo columns, and the first value cell (range starting row/column). It is saved as a `column` data source:

```json
{
    "type": "column",
    "orgUnit": { "type": "row", "sheet": "Form", "ref": 3 },
    "period": { "type": "row", "sheet": "Form", "ref": 4 },
    "attribute": { "type": "row", "sheet": "Form", "ref": 5 },
    "completed": { "type": "row", "sheet": "Form", "ref": 6 },
    "range": { "sheet": "Form", "rowStart": 8, "columnStart": "D" },
    "dataElement": { "type": "column", "sheet": "Form", "ref": "A" },
    "categoryOption": { "type": "column", "sheet": "Form", "ref": "B" }
}
```

Notes for custom templates:

- The data element and category option combo cells can be formulas (`_ID` defined names, as in the generated
  templates) or plain text IDs. The last data row is the last row with a data element in its column, unless the
  range defines `rowEnd`.
- Do not combine it with `fixedOrgUnit`/`fixedPeriod` (those are for a single data entry per sheet).
- Import only uses the data sources and the template version stored in the file, so it works the same for any
  layout (row layout, generated transposed, custom transposed).

## Build app ZIP

```
$ yarn build
```

## i18n

```
$ yarn localize
```

### App context

The file `src/webapp/contexts/app-context.ts` holds some general context so typical infrastructure objects (`api`, `d2`, ...) are readily available. Add your own global objects if necessary.

### Import XLSX files (from filled templates)

You can use the script `import-multiple-files.ts` to import multiple xlsx files:

```bash
#!/bin/bash

npx ts-node src/scripts/import-multiple-files.ts \
    --dhis2-url="http://admin:district@localhost:8080" \
    --results-path="/path/to/folder/for/json_results" \
    file1.xlsx file2.xlsx
```

### Regenerate template metadata (from DHIS2)

You can use the script `regenerate-metadata.ts` to refresh **only** the Metadata
sheet of an existing template from fresh DHIS2 metadata, leaving every other sheet
(custom form, dropdowns, VBA) untouched:

```bash
yarn regenerate-metadata \
    --dhis2-url="https://play.dhis2.org" \
    --auth="user:pass" \
    --input=template.xlsm \
    --output=template.regenerated.xlsm \
    --form-id=U6z7eJniNfL \
    --form-type=trackerPrograms \
    --include-codes
```

| Flag | Required | Description |
| ---- | -------- | ----------- |
| `--dhis2-url` / `-u` | yes | DHIS2 base URL (auth can be embedded here or via `--auth`). |
| `--auth` / `-a` | — | `"username:password"` (special characters are handled). |
| `--input` / `-i` | yes | Path to the input template (`.xlsm`/`.xlsx`). |
| `--output` / `-o` | yes | Path where the regenerated template is written. |
| `--form-id` | yes | DHIS2 program/dataSet id whose metadata is used. |
| `--form-type` | — | `trackerPrograms` \| `programs` \| `dataSets` (default `trackerPrograms`). |
| `--language` | — | Metadata name language (default `en`). |
| `--include-codes` | — | Write the Code column in the Metadata sheet (default off). |
| `--use-codes` | — | Use item codes instead of names for org units, data elements, options… (default off). |
| `--org-unit-short-name` | — | Use each org unit's short name instead of its regular name (default off). |

The same operation is available in the app, under Settings → Maintenance → Regenerate template metadata.
