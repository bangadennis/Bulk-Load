# Configurable org unit matching for attribute option combos

## TL;DR

Template generation was recently changed to include an attribute option combo (a
category option like "Funding Source" or "Program") wherever its assigned org unit
**or any org unit below it** applies — matching the org-unit-hierarchy convention
used throughout DHIS2 (e.g. data capture access cascading to org units below the
ones a user is assigned to). That change was made unconditionally, with no way to
turn it off. This PR turns it into a setting, keeping that cascading behavior as the
default, with the old strict behavior available as an opt-out for instances that
need it.

## Why this matters

Some data sets use an **attribute category combo** — a set of category options
(e.g. "Funding Source", "Implementing Partner", "Program") that a user picks from
when entering data, on top of the data set itself. In Maintenance, each of those
category options can optionally be restricted to certain organisation units, so it
only shows up where it's relevant.

The convention this codebase has followed (both before and after `f0c8f803`) is that
the restriction resolves hierarchically: assign a category option to a country, and
it becomes available to every district and facility under that country too — not
just the country itself. That's convenient for admins: assign once at the top, and
it applies everywhere below.

**Example.** A category option `Global Fund` is assigned to org unit `Country`, in
a hierarchy `Country → District → Facility`:

| Generating a template for... | Does `Global Fund` show up? |
|---|---|
| `Country` (the assigned org unit) | ✅ Yes |
| `District` (below `Country`) | ✅ Yes |
| `Facility` (below `District`) | ✅ Yes |
| `Country2`, an unrelated country | ❌ No |

Bulk Load has to apply this same rule when building a template, so the workbook
only offers combos that are actually valid to fill in for the org unit it's
generated for.

> **A note on sourcing.** This proposal describes the descendant-cascading rule as
> matching DHIS2's own behavior because that's the assumption `f0c8f803` was written
> under, and it's consistent with how org-unit hierarchy is treated elsewhere in the
> platform (e.g. a user's data capture org units implicitly include everything below
> them). I was not able to find an explicit line in DHIS2's public documentation that
> states this rule for category-option org-unit restriction specifically, and
> couldn't inspect dhis2-core's validation source directly to confirm it from code.
> If this matters for the review, it's worth confirming directly against a running
> instance (assign a category option to a parent org unit, then check whether it's
> offered in the Data Entry / Aggregate Data Entry app at a child org unit) before
> relying on it as ground truth.

## The problem

Bulk Load's rule for this used to be **stricter than the cascading convention
above**: a category option only counted if it was assigned to the *exact* org unit
selected, not to any ancestor. So in the example above, `Global Fund` would only
appear when generating directly for `Country` — never for `District` or `Facility`.

A recent change fixed that mismatch, but it made the new "cascade down the
hierarchy" behavior the *only* option. There's no way to go back to the old,
stricter behavior — which some instances may be relying on if they assign category
options directly to every org unit they want them to appear at, rather than to a
shared parent.

## What changes

A new setting, **"Category options are available"**, lets each instance choose how
this is resolved:

| Option label in Settings | What it does | Choose this if... |
|---|---|---|
| **"For their assigned Organisation Units and all descendants"** *(default — keeps current behavior)* | A category option shows up for its assigned org unit and everything below it. | You want assign-once-at-the-top-apply-everywhere-below behavior. This is right for most instances and is what the app already does today. |
| **"Only for their assigned Organisation Units"** | A category option shows up only for the org unit(s) it's directly assigned to. | Your instance already assigns category options to every org unit individually, and depends on that narrower scope. |

### Where to find it

**Settings → Organisation Unit Visibility**, right below the existing
"select org units on generation/import" option.

## Will this change anything for existing instances?

No, not unless someone deliberately changes it. Instances that already had no
opinion on this setting keep getting the cascading (descendant-aware) behavior
that's live today — this PR just gives them an escape hatch, it doesn't flip a
switch under anyone's feet.

## Under the hood (for reviewers)

- **Minimal change, not a rewrite.** The existing matching logic already falls
  back to an exact-id check when an org unit has no hierarchy path available.
  Adding the "assigned only" mode is a single early-return in
  `getSelectedOrgUnits`: skip fetching org unit paths altogether, and hand back
  bare IDs. The matching function itself didn't need to change.
- **The strict mode is also the cheaper one.** Skipping the path lookup also
  skips the extra org-unit API calls the cascading behavior needs — so
  `"assigned"` does slightly less work, not more.
- **Kept out of the domain layer.** The functions this setting flows through
  (`getElementMetadata`, `filterRawMetadata`) are shared with template
  regeneration, so they take the setting as a plain value instead of pulling in
  the whole `Settings` class — keeping the domain layer decoupled from
  presentation-layer settings code, per an existing `// TODO` in that file.

## Where this setting does — and doesn't — apply

This only affects what a **generated template offers** to fill in. It has no
effect on **importing** a filled-in template:

- Import only checks that a row's org unit belongs to the data set and that the
  current user has access to it — it never re-checks whether the attribute
  option combo is valid for that org unit. (Verified: no such check exists in
  `ImportTemplateUseCase`.)
- Whatever combo ends up in the sheet is sent to DHIS2's `dataValueSets` API as-is.
  Whether the DHIS2 server itself re-validates the combo against the org unit at
  that point — and with which rule — is not something this PR verifies; it's
  outside Bulk Load's control either way.

In other words: choosing the stricter "assigned only" setting can only make a
generated template *more conservative* than the app's current behavior — it may
leave out a combo that `"assignedAndDescendants"` (or the DHIS2 server) would have
accepted, but it never adds anything extra that wasn't already possible before this
PR.

## Files touched

| File | What changed |
|---|---|
| `src/domain/entities/AppSettings.ts` | New setting type and field |
| `src/data/ConfigWebRepository.ts` | Default value, overridable per app-config |
| `src/webapp/logic/settings.ts` | Read/write/update support on `Settings` |
| `src/webapp/components/settings/SettingsFields.tsx` | New dropdown in Settings |
| `src/domain/usecases/DownloadTemplateUseCase.ts` | Setting is read and applied when filtering combos |
| `src/domain/usecases/RegenerateTemplateMetadataUseCase.ts` | Setting is passed through here too |

## How to verify

1. In Maintenance, assign a category option to a parent org unit (e.g. a country).
2. In Bulk Load Settings, set **"Category options are available"** to
   *"Only for their assigned Organisation Units"*.
3. Generate a template for a descendant org unit (e.g. a facility under that
   country) — the category option should **not** appear.
4. Switch the setting to *"For their assigned Organisation Units and all
   descendants"* and regenerate — the category option should now appear.

`tsc --noEmit` passes; the above manual check is still pending.

## Before merging

- [ ] Run `yarn localize` to add the two new setting-label strings to the translation files.
- [ ] Run `yarn lint` and `yarn test-unit`.
- [ ] No datastore migration needed — existing settings default to the new field automatically.
