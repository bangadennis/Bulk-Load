# Dataset attribute options: organisation unit filter mode

## Summary

Add a setting that controls whether a category option (attribute option) assigned to an organisation
unit is treated as available only at that exact organisation unit, or also at its
descendants, when Bulk Load generates a template.

Default: **For their assigned Organisation Units and all descendants**
Alternative: **Only for their assigned Organisation Units**

## 1. Background

A data set's attribute category combo is a set of category options (e.g. "Funding
Source", "Implementing Partner", "Program") a user picks from during data entry.
In Maintenance, a category option can be restricted to specific organisation units.
Bulk Load has to apply this same restriction when generating a template, so the
workbook only offers combos that are actually valid to fill in for the org unit
being generated for.

This matches how DHIS2's own Data Entry app resolves attribute option
availability: open Data Entry for a given org unit, and the attribute option
selector already reflects assignment-plus-descendants — a category option
assigned to a top-level org unit is offered at every org unit under it too, not
just at that org unit itself.

### Example hierarchy used throughout this doc

```
Country
├── District 1
│   └── Facility 1a
└── District 2

Country 2  (unrelated country)
```

**Use case:** `Partner A` is an implementing partner supporting programs across
an entire country. Rather than assigning `Partner A` to every district and
facility one by one, the country office assigns it once, at the country level,
and expects it to be selectable everywhere underneath.

Attribute category option `Partner A` is assigned to `Country`.

| Generating for | Available? |
|---|---|
| Country | Yes |
| District 1 | Yes |
| Facility 1a | Yes |
| Country 2 | No |

## 2. Problem

Bulk Load currently matches strictly: a category option only counts if it's
assigned to the exact org unit selected, not to any ancestor. In the example
above, `Partner A` would only appear when generating directly for `Country` —
not for `District 1` or `Facility 1a`, even though the partner is meant to
support the whole country. This is a mismatch with DHIS2's own Data Entry
behavior described in Section 1.

This proposal fixes that mismatch and makes the fix configurable, as one piece
of work: it changes matching to be ancestry-aware by default, so `Partner A`
cascades down to every district and facility under `Country` and matches Data
Entry, while adding an explicit, opt-in strict mode for instances that
intentionally assign category options directly to every org unit they want
them to appear at (for example, a partner that only supports specific
facilities, not a whole country). Neither half ships without the other —
matching Data Entry by default and making that choice configurable are both
part of this same proposal, not a follow-up to something already merged.

## 3. Proposal

Add a setting, **categoryOptionOrgUnitFilter**, with two values:

| Value | Behavior | Choose this if |
|---|---|---|
| `assignedAndDescendants` (default) | A category option is available at its assigned org unit and everything below it. | You want assign-once-at-the-top behavior, like `Partner A` supporting an entire country. Right for most instances, and what the app already does today. |
| `assigned` | A category option is available only at the org unit(s) it's directly assigned to. | Your instance assigns category options to every org unit individually — e.g. a partner that only supports a handful of named facilities — and depends on that narrower scope. |

**Where it lives:** its own section in Settings, titled with the setting's own
label, directly below "Organisation Unit Visibility." It's not nested inside that
section — it's an independent control.

**Label:** "Dataset attribute options (category options): organisation unit
filter mode"

**Description shown under the dropdown:** "Controls whether a category option
assigned to a parent organisation unit is also treated as available for its
descendant organisation units when generating a template."

Upgrading an existing instance changes nothing by default — the fallback is
`assignedAndDescendants`, which is what the app already does unconditionally
today. Someone has to explicitly pick `assigned` to get the older, stricter
behavior.

## 4. Worked example: exact-match mode

Same hierarchy, `Partner A` still assigned only to `Country`:

| Generating for | Available under `assigned`? |
|---|---|
| Country | Yes |
| District 1 | No |
| Facility 1a | No |

If the country office later also assigns `Partner A` directly to `District 1`
(say, because that district's own coordination team wants it listed on their
forms too):

| Generating for | Available under `assigned`? |
|---|---|
| Country | Yes |
| District 1 | Yes |
| Facility 1a | No |

Strict mode gives an admin full control through direct assignment — it just
doesn't infer anything from the hierarchy.

## 5. Scope

Applies to: template generation, the metadata filtering behind it, and template
metadata regeneration.

Does not affect: importing a filled-in template, user permissions, dataset or
category-option org-unit assignments, or DHIS2's own server-side validation.

**Import specifically:** verified that `ImportTemplateUseCase`'s org-unit check
(`validateOrgUnitAccess`) only confirms a row's org unit belongs to the data set
and that the current user has access to it — it never re-checks whether the
attribute option combo is valid for that org unit. Whatever combo is in the sheet
gets sent to DHIS2's `dataValueSets` API as-is; what the server itself does with
that at that point isn't something this proposal verifies or changes. So this
setting can only make a generated template more conservative than before — it
may leave out a combo the server would have accepted, but it never lets through
anything that wasn't already possible.

## 6. Implementation

The existing matching function already falls back to an exact-ID check when an
org unit has no hierarchy path available. So the whole feature is one
early-return in `getSelectedOrgUnits`: under `assigned`, skip fetching org unit
paths and return bare IDs. The matching function itself doesn't change.

That also makes `assigned` the cheaper mode — it skips the extra org-unit API
calls the cascading mode needs to resolve ancestry.

The setting is threaded through `getElementMetadata` / `filterRawMetadata` as a
plain value rather than the `Settings` class, since those functions are shared
with `RegenerateTemplateMetadataUseCase` and the domain layer shouldn't take on
another dependency on presentation-layer settings code.

## 7. Files touched

| File | Change |
|---|---|
| `src/domain/entities/AppSettings.ts` | New setting type and field |
| `src/data/ConfigWebRepository.ts` | Default value, overridable per app-config |
| `src/webapp/logic/settings.ts` | Read/write/update support on `Settings` |
| `src/webapp/components/settings/SettingsFields.tsx` | New dropdown and its own settings section |
| `src/domain/usecases/DownloadTemplateUseCase.ts` | Reads and applies the setting when filtering combos |
| `src/domain/usecases/RegenerateTemplateMetadataUseCase.ts` | Passes the setting through |

## 8. Manual verification

Using the example hierarchy from Section 1. Category option `Partner A` assigned
to `Country`.

1. Set the filter mode to `assignedAndDescendants`. Generate templates for
   `Country`, `District 1`, `Facility 1a`, and `Country 2`. Expect `Partner A`
   on the first three, not the fourth.
2. Switch to `assigned` and regenerate. Expect `Partner A` only on `Country`.
3. Assign `Partner A` directly to `Facility 1a` as well. Still under `assigned`,
   regenerate for `Facility 1a` — expect it to now appear there, and nowhere
   else it wasn't already appearing.
4. Switch back to `assignedAndDescendants` and regenerate for all four — expect
   the original result from step 1.
