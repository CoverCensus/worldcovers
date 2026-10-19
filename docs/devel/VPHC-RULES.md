# VPHC Rules -- v2

The decode, normalise and match rules that `tools/vphc_extract.py`,
`tools/vphc_crossexam.py` and `tools/vphc_manuscript_ledger.py` implement. Rule IDs
(R1, I3c, E6, ...) are cited in those files and in ledger lines. How to run the
chain is in [TOOLS.md](TOOLS.md#vphc-source-extraction); decisions taken during the
ingest are in [VPHC-DECISIONS.md](VPHC-DECISIONS.md).

Moved from the ingest workspace on 2026-10-18 and otherwise unchanged except for
ASCII punctuation. `#nn` numbers are Reese's workspace-local `docs/issues.md`
(see ISSUE.md); `phase-NN-*.md` reports and `unresolved/` paths it cites belong to
that workspace, or to the tool output under `tools/wip/out/vphc/`.

Every transformation applied to `VPHS_COMPLETE_BOOK_DONE.xlsx` on its way into the catalog.
Rules are **versioned**: a ledger line records `rule` and `rule_version`, so "re-run everything R4
touched" is one query. Bump a rule's version when its behaviour changes; do not edit in place.

Reason codes in `unresolved/` filenames map 1:1 to the rule that gave up.

---

## R1 -- Century recovery (v1)

**The problem.** Every date in the sheet is an Excel serial produced from a **2-digit year**, so
the century is gone. Excel's 2-digit rule maps `00-29 -> 20xx` and `30-99 -> 19xx`:

| Cell | Serial displays | Actually |
|---|---|---|
| `T1:r7` I (Abingdon ms. #4) | 2029-09-08 | **1829**-09-08 |
| `T1:r5` I (Abingdon #2) | 2014-05-21 | **1814**-05-21 |
| `T1:r26` I (Abingdon #14) | 1957-09-... | **1857**-09-... |
| `T3:r15904` D (Gerrard T. Conn) | 1993-04-... | **1793**-04-... |

**The rule.**

1. Decode the serial against the 1900 date system (epoch 1899-12-30) -> `(month, day, yy)`.
2. Candidate readings are `1800 + yy` and `1700 + yy`.
3. **Era window (R1c).** `1800 + yy` is legal only up to **1869**; past that only the 1700s
   reading is available. See below -- this is the load-bearing half of the rule.
4. **Town window (R1d).** Where the town has >=3 postmaster appointments, a reading is legal only
   within `[first appointment - 15, last appointment + 20]`. A post office cannot postmark before
   it existed.
5. **Sequence correction.** Within a *contiguous run* of equal key -- `(town, cancel #)` for T1,
   `(town)` for T3 -- choose the assignment that keeps the run non-decreasing while using as few
   1700s readings as possible. Exact two-state DP, so the answer does not depend on scan
   direction. Corrected rows carry `century_inferred: true`.
6. No consistent assignment -> **drop the sequence constraint, never the window** (see precedence
   below), and quarantine the run to `unresolved/dates.csv`.

**Precedence: era (hard) > town window > sequence.** Runs are usually unsolvable because the
source row has earliest and latest reversed, not because the window is wrong -- 17 such rows exist
(`unresolved/dates_reversed.csv`, e.g. Abingdon #8 reads 1840..1823). Relaxing the *window* to
satisfy sequence produced 1740 for that row and 1727 for Alexandria #22, both outside their town's
operating life. Relaxing sequence instead is correct.

### R1d -- the town window, and what it caught

Cross-checking every marking date against its town's postmaster window found the sequence rule
over-reaching, and adding the window as a constraint fixed it:

| | before R1d | after |
|---|---|---|
| marking dates outside their town window | 87 | **17** |
| 17xx corrections the window contradicts | 76 | **1** |

It also exposed a bug the aggregate numbers hid: the DP's initial state hardcoded the 1700s
reading as legal without testing it, so the **first date of every run** could escape both the era
and window constraints. That is why Abingdon #8 resolved to 1740 despite Abingdon having no post
office before 1792.

**Net result: 97.2% of T1 dates resolve to 18xx, 2.8% to 17xx** -- and every 17xx is an active
correction with a stated reason, never a default.

**Runs must be contiguous, not keyed.** Several towns appear in more than one block of the sheet
(Abingdon holds T3 r15904-15915 *and* r27075-27077). Grouping by town name merges those blocks
into a sequence that can never be monotonic, which defeats step 4 entirely -- it silently disabled
the correction for every re-listed town until this was found.

### R1c -- the era window, and why it is the load-bearing rule

Step 4 can only fire when a date has an out-of-order neighbour, and T1's runs are one or two rows
long, so on its own it almost never fires there. The era window is what actually resolves T1.

This is a **stampless** catalog. The corpus ends at a clean cliff:

| 1867 | 1868 | 1869 | 1870 | 1871 | 1872 |
|---|---|---|---|---|---|
| 338 | 23 | 5 | 1 | 2 | 5 |

Everything from 1870 on totals **319** values; the 1770-1799 population is **302**, and the 1780s
were otherwise *empty*. The late tail is the displaced 18th-century material, and moving it back
produces a smooth 1700s->1860s ramp with nothing after 1870.

**Verified against a scan.** T1:r4 (Abingdon cancel #1) decodes from serial `35766` to
1897-12-02. The embedded image for that exact cancel -- `extract/media/vphc-va-abingdon-1-r9726.png`
-- is a manuscript marking reading **"Abingdon Dec 2. 179-"**. Month and day match; the century
does not. R1c gives **1797-12-02**.

**Regression fixture (T3 Abingdon r15904-15915)** -- must resolve to:

```
1793 1796 1800 1813 1820 1836 1842 1849 1853 1858 1861 1865
```

Abingdon's post office was established in 1793, corroborating the first correction independently.

**Known limitation.** A run wholly inside 1800-1869 that is *really* 18th-century has no signal to
catch it. Runs of length 1 are emitted with `confidence: "low"`.

## R1b -- Non-numeric date values (v1)

Roughly 1,179 date cells are text, not serials. Preserve verbatim in `date_raw` and classify:

| Pattern | Examples | Treatment |
|---|---|---|
| circa year | `Ca.55`, `Ca 55`, `Ca. 52`, `ca. 76` | `YEAR` granularity, `1800 + yy`, `is_circa: true` |
| bare 2-digit | `53`, `20` | `YEAR` granularity, `1800 + yy`, `century_confidence: "low"` |
| stampless refs | `St USA 11`, `St USA 26`, `St CSA 6`, `St USAUIO` | **not dates** -> `unresolved/date_vocab.csv` |
| era markers | `CSA`, `Late` | **not dates** -> `unresolved/date_vocab.csv` |

`St USA nn` / `CSA` / `Late` need Ian and Wayne Farley to define them. They are almost certainly
Simpson-style stampless type references that landed in the wrong column, but that is a guess and
is recorded as one.

## R2 -- County normalisation (v1)

1. Strip trailing `Co.` / `Co` / `Co .` / `CO,` / `Co:` and surrounding whitespace.
2. Uppercase, collapse internal whitespace.
3. Match against the canonical VA + WV county lists (below). Exact match wins.
4. No exact match -> fuzzy match (Levenshtein <= 2 on a name >= 6 chars) against the canonical list.
   A unique hit is applied and recorded as `county_repaired: true`.
   Confirmed OCR corruptions this catches: `ALBEMSRLE`, `AUGSTA`, `AUGUST`, `BARKELEY`,
   `BOTATOURT`, `CULPEPR`, `DINWIDDE`, `FAAUQUIER`, `FRANKLIQ`, `HAMSHIRE`, `HONTGOMERY`,
   `NONTGOMERY`, `HORTHAMPTON`, `LOUDON`, `LOUDOUNN`, `MECKLENG`, `MONOGALIA`, `NICKOLAS`,
   `NORFLOK`, `PITTSVLVANIA`, `PITTSYKVANIA`, `SUSEX`, `VLESTMORELAND`, `WHTHE`, `MANAMOND`
   (-> Nansemond), and the spaced/punctuated variants `FAIR FAX`, `PITT SYLVANIA`, `ROCK.BRIDGE`,
   `NOR FOLK`, `NORT.HAMPTON`, `KI:NG WILLIAM`, `KING W.ILLIAM`, `KING WILL IAM`, `MAR SHALL`,
   `NOT"TOWAY`, `PRINCE EDWARD CP./CQ./COO`, `ESSEX.`, `NELSON.`, `APPOMATTOX` + a trailing middle dot (U+00B7), `PRESTON GO.`,
   `AMHERST CO,`, `SPOTTSYLVANIA`, `POWHATTAN`.
5. Still no match -> classify and quarantine, see R2b.

**`GREENVILLE` vs `GREENSVILLE`** is deliberately *not* auto-repaired. Greensville is a VA county;
Greenville is a town in Augusta Co. -> `unresolved/county_ambiguous.csv` (9 rows).

## R2c -- County backfill (v1)

The sheet's supplement/errata blocks re-list towns with the **county column left blank** (T1 from
r6536, T3 from r27075), which would leave ~370 rows countyless and therefore unroutable by R3.

Every such town is named with its county elsewhere in the sheet. So: build a `town -> county` index
across T1 *and* T3 together, and fill a blank county from it. A town indexed under **more than
one** county is excluded and quarantined -- those are R3's boundary-redraw cases and must never be
silently collapsed.

Result: **316 rows backfilled** (201 T1 + 115 T3), and county-unknown falls from 473 to 123.

**49 towns are named under two counties** -> `unresolved/county_conflict.csv`. These are not noise;
they are overwhelmingly genuine county formations, and they are the real evidence base for **#92**:

| Town | Counties | What happened |
|---|---|---|
| Flint Hill, Gaines Cross Roads | Culpeper / Rappahannock | Rappahannock formed from Culpeper, 1833 |
| Millwood, Berry's Ferry | Frederick / Clarke | Clarke formed from Frederick, 1836 |
| Harpers Ferry | Berkeley / Jefferson | Jefferson formed from Berkeley, 1801 |
| Fairview | Brooke / Hancock | Hancock formed from Brooke, 1848 |
| Ballardsville | Logan / Boone | Boone formed from Logan, 1847 |
| Hillsville | Grayson / Carroll | Carroll formed from Grayson, 1842 |
| French Creek, Buckhannon | Lewis / Upshur | Upshur formed from Lewis, 1851 |

A minority look like data damage rather than history -- `PRINCE EDWARD` recurs against several
unrelated towns (Jamestown, Fincastle, Floods, Buckland) and should be treated as suspect.

Warning: **Ian's Shepherdstown/Mingo example does not appear in this data.** Shepherdstown is in Jefferson
Co. throughout, and there is no Mingo county anywhere in 29,089 rows. The date-ranged county
requirement is real, but the table above is its evidence -- not that example.

## R2b -- Non-county values in the county column (v1)

Four distinct classes, none of them simple errors:

| Class | Examples | Treatment |
|---|---|---|
| **Route agent** | `POTOMAC RIVER`, `BALTIMORE AND OHIO R. R.`, `FREDERICKSBURG AND RICHMOND RAILROAD`, `NORFOLK TO WILLIAMSBURG`, `ALBEMARLE CO. TO HENRICO`, `HENRICO CO. TO STAFFORD`, `GRAFTON, TAYLOR` | **a real philatelic category**, not a county -> `unresolved/route_agent.csv`, flagged `is_route: true`. Needs Ian's call on how routes are modelled |
| **Compiler's county-change note** | `FLUVANNA CO. (NOW ALBEMARLE CO.)`, `PRESTON CO. (NOW W. VA.)` | parse both counties, keep the parenthetical as evidence for #92 |
| **Town in the county column** | `ACADEMY`, `ACCOKEEK`, `ACCOTINK`, `ACQUINTON`, `PEMBROKE`, `FRONT ROYAL`, `KESWICK'S DEPOT`, `CHARLES CITY C. H.`, `GILES C. H.`, `POWHATAN C. H.` | -> `unresolved/county_is_town.csv`. Do **not** guess the county |
| **Out of state / junk** | `BALTIMORE`, `NORFOLK, VIRGINIA - BALTIMORE, MARYLAND`, `BANK'S DIVISION`, `SUPPLEMENT`, `?` | -> `unresolved/county_unknown.csv` |

## R3 -- VA / WV routing (v1)

The sheet is pre-1863 Virginia. Each town routes to a **modern** state by its county.

**The two canonical lists share no name**, verified against all 214 distinct county values in the
sheet -- so county -> state is unambiguous and needs no tie-break.

**West Virginia (55).** Barbour, Berkeley, Boone, Braxton, Brooke, Cabell, Calhoun, Clay,
Doddridge, Fayette, Gilmer, Grant, Greenbrier, Hampshire, Hancock, Hardy, Harrison, Jackson,
Jefferson, Kanawha, Lewis, Lincoln, Logan, Marion, Marshall, Mason, McDowell, Mercer, Mineral,
Mingo, Monongalia, Monroe, Morgan, Nicholas, Ohio, Pendleton, Pleasants, Pocahontas, Preston,
Putnam, Raleigh, Randolph, Ritchie, Roane, Summers, Taylor, Tucker, Tyler, Upshur, Wayne, Webster,
Wetzel, Wirt, Wood, Wyoming.

**Virginia** -- everything else in the canonical list, including the five counties later absorbed
into independent cities: Elizabeth City (-> Hampton), Nansemond (-> Suffolk), Norfolk Co.
(-> Chesapeake), Princess Anne (-> Virginia Beach), Warwick (-> Newport News). Alexandria appears as
a county and is treated as one for routing.

The big movers: **Jefferson (115 rows), Berkeley (99), Ohio (80), Hampshire (71), Greenbrier (61),
Harrison (61), Kanawha (49)** all go to **WV**. Martinsburg sits under Berkeley Co. -> WV, which
satisfies **#94**.

**Verification:** Martinsburg must resolve to WV and meet the 928 WV markings already in the
catalog rather than creating a second Martinsburg under VA.

## R4 -- Town normalisation (v1)

Uppercase, collapse whitespace, strip trailing punctuation. Production's convention is uppercase
with `C.H.` for court houses (`ABINGDON C.H.`, `ACCOMACK C.H`), and production is inconsistent
about the trailing period -- so match on a key with all punctuation removed, and keep the sheet's
spelling as the display value.

Production also contains **extraction damage** that must not be matched against blindly:
`ALEX`, `ALEXA`, `ALEXAN` are all truncated `ALEXANDRIA`; `ACCOMACK`, `ACCOMACK C.H`,
`ACCOMACK COURTHOUSE`, `ACCOMAN` are one town in four rows. These feed **#50** and are logged to
`unresolved/prod_town_damage.csv` rather than silently merged.

## R5 -- Size parsing (v1)

| Form | Reading | Count |
|---|---|---|
| `24mm`, `30.5mm` | circle -- `width = height = n` | majority |
| `21x4mm`, `16x4.5mm` | `width x height` | common |
| `llxl5mm`, `13x9mm ` with stray glyphs | OCR damage -> `unresolved/size_unparsed.csv` | rare |

`Size` is present on only 3,212 of 7,483 T1 rows. Absence is not an error -- manuscript markings
have no measurable size.

## R6 -- Colour vocabulary (v1)

Map onto the existing `Colors` table. Clean: `Black` (5,733), `Red` (720), `Blue` (689),
`Green` (145), `Brown` (48), `Orange` (23), `Magenta`, `Yellow`, `Violet`, `Gray`.

**R6b -- OCR repair.** `Blaok` -> BLACK, `Ye11ow` -> YELLOW, `Orang` -> ORANGE, and similar
digit-for-letter substitutions.

Still needing a decision -> `unresolved/color_vocab.csv` (49 rows):
`Pencil` (17 -- a medium, not a colour), `BluGr` / `Blu/Gr` (7), `GrBlk` (3), `RedOr` (3),
`Blue*` / `Grn*` / `Red*` (-- the asterisk carries meaning in VPHS notation and we do not know
what), `Black, Gray-blue`, `Olive 3 Sep 45` and `Black 6 Jun 99` (colour and date in one cell), `?`.

## R6c -- Column-shift repair (v1)

Nine T1 rows have columns **G-J shifted one place left**: the colour sits in `Size` and a date
serial sits in `Colour`. Left alone this destroys both dates and poisons the colour vocabulary.

Example -- `T1:r3612` Monterey #6 reads `size='Black'`, `color='22508'`, `earliest='22531'`. The
true reading is `size=(none)`, `color=Black`, `earliest=22508` (1861-08-15), `latest=22531`.

Detected on the unambiguous signature -- **Size holds a known colour name AND Colour holds a date
serial** -- and shifted back. Repaired rows are flagged `column_shift=true` in the CSV and listed in
`unresolved/column_shift.csv` so a human can confirm all nine.

## R7 -- Postmaster control words (v1)

T3's `Postmaster Name` column carries records that are not names:

| Value | Count | Treatment |
|---|---|---|
| `Discontinued` | 743 | not a postmaster -- a **post office closure event** on that date |
| `Reappointed` / `Re-appointed` | 42 | attaches to the preceding row's postmaster |
| `?` | 19 | tenure with an unknown postmaster -- keep the date, null the name |

Filtering these leaves ~9,200 real postmaster names across 11,546 tenure rows.

## R8 -- VPHC marking code (v1)

The sheet's `Cancel Number` is VPHS's own per-town numbering -- Ian's **"counsel number"** (#97) --
and is **not** ASCC's. It becomes `Marking.code` as `VPHC-<ST>-<TOWN>-<n>`, which resolves **#95**
without new schema: `Marking.code` already exists, is unique and nullable (`models.py:92`).

T1 and T2 join on `(town, cancel #)`; 374 orphan image rows -> `unresolved/images_orphan.csv`.

**Image filenames carry their source row** -- `vphc-va-abingdon-1-r9726.png`. Without it 70 names
collide and 72 images are silently overwritten, because the errata block re-lists a marking with a
*different* image (Alexandria #54 appears at r9827 and again at r14387) and some cancels carry two
images on adjacent rows. 4,373 files, 4,304 distinct images.

## R9 -- The errata structure (v1)

**854 markings are listed more than once**, in a supplement block that revises the main block --
there are explicit `Supplement`, `11-93 Supplement` and `5-94 Supplement` markers in the sheet
(VPHS newsletter addenda). The later listing is an *erratum*, not a duplicate:

| | main | supplement |
|---|---|---|
| Abingdon #1 | 1797-12-02 .. 1798-07-18 | 1797-12-02 .. **1799-12-29** (later latest) |
| Abingdon #4 | 1829-10-05 .. -- | **1822-07-12** .. 1829-10-05 (earlier earliest) |
| Abingdon #24 | `CSA` .. -- | **1862-05-14 .. 1862-05-28** (vocab resolved to real dates) |

Each T1 row carries `occurrence` / `occurrences`. **Phase 3 must merge these, not create a second
marking** -- otherwise the errata block alone manufactures 854 duplicates.

**The marking grain is `(town, cancel #)`** -- *not* including colour. Adding colour to the key
raises non-contiguous duplicates from 854 to 968, because one cancel is genuinely observed twice in
the same colour on different dates (Abingdon #6 is Blue at both 1847 and 1850). T2 confirms the
grain independently: VPHS files exactly one image per `(town, cancel #)` and T2 has **no colour
column at all**. Colour and dates are per-*observation* attributes.

Warning: **This is the READING grain, and it is not the WRITING grain.** *(Revised 2026-08-17, issue #103.)*
`(town, cancel #)` is how the sheet is parsed and how matching scores -- that part above stands and
should not be changed. It is **not** how markings are written.

**The writing grain is production's: one `Marking` row per type x colour.** Reese settled this on
2026-08-15 in favour of the incumbent ASCC shape (`docs/DECISIONS.md`); it is no longer open and no
longer Michael's. A new listing recorded in three colours is therefore **three markings**, not one
marking whose description mentions three colours.

The two grains meet in `apply_vphc_ledger._contribution`, which reads one crosswalk row and emits
one contribution **per recognised colour**. The earlier version emitted one contribution, kept
`colours[0]`, and wrote the rest into the description as *"Colours recorded: ..."* -- that was this
rule applied to writing as well as reading, and it stranded 347 colour observations across 277 of
1,798 create listings. **Edits are exempt**: rule I3 pairs them one-per-colour against live rows
already, so an edit is one contribution against one existing marking.

---

## Matching rules -- I (identity) and E (enrichment), v2

> **The v2 invariant: no field may both establish identity for a pair and be written for that same
> pair.** A rule set that violates it can only confirm what production already holds. v1's M1-M4
> did exactly that -- they keyed on town + size + colour and then wrote size and colour -- and
> measured across every unique match they filled **zero** empty production fields.

Matching runs at VPHC's grain, `(town, cancel #)`, after the R9 errata merge -- **not** per row.
Abingdon cancel #6 is five rows in five colours and one marking; scoring rows independently
manufactures five ambiguous matches out of one clean one.

Production's VA rows are ASCC munger **fan-outs**: one listing explodes into one row per
type x colour, sharing a `catalog_txt`. `catalog_txt` is therefore the *listing* label and
`inscription_txt` is the *member* label -- which is why identity is built on the latter.

### I -- identity

| Rule | Key | Conf |
|---|---|---|
| **I0a** | `town_key` resolves to exactly one post office | -- |
| **I0b** | `town_key` resolves to several; resolve only if exactly one holds markings, else -> `unresolved/prod_town_damage.csv` | -- |
| **I0c** | no post office of that name -> **create** | -- |
| **I1** | town + `norm_inscription`. Sheet side is `town` + `cancel_detail`; production side is `inscription_txt`, populated on 4,000/4,000 rows | 0.90 |
| **I1b** | the sheet leaves `cancel_detail` blank, so the composed key is the bare town while production always writes `ABINGDON/Va.`. Widen to any production inscription **beginning with the town followed by a separator** (`/`, space, `.`, `,`), then let colour and size select. The separator is what stops `ALEXANDRIA` reaching `ALEXANDRIA C.H.` | 0.85 |
| **I2** | I1 + device type and `rate_val`, derived from the `cancel` code vocabulary | 0.95 |
| **I2b** | `cancel_detail` sometimes carries the rate or auxiliary word rather than a state abbreviation. Aldie #5's detail is `PAID 3`, which production files as the RATEMARK `PAID/3` -- not as a townmark | 0.95 |
| **I3** | I2 + colour selects the fan-out member, one pairing per colour observation | 0.97 |
| **I3c** | **contention** -- a production device may be claimed by at most one sheet marking. Where several claim it, keep the one whose size corroborates; if none or several do, refuse them all | -- |
| **I4** | date-range overlap and size proximity (+/-0.6 mm) -- **corroboration only.** May break a tie among otherwise equal candidates; may never establish identity. Every field consumed is recorded in the ledger's `rejected` map and its E-rule is suppressed for that pair | -- |
| **I5** | no identity either direction -> create (sheet side) / report (production side) | -- |

`norm_inscription` upper-cases and collapses whitespace but **preserves punctuation** -- it is the
deliberate mirror image of `town_key`, which strips it. Production distinguishes `ABINGDON/*VA.*`
from `ABINGDON/VA.` from `ABINGDON/VA`, and the sheet carries the same asterisk convention.

Ambiguous matches -> `unresolved/fanout_ambiguous.csv`. **Never pick arbitrarily** -- and this holds
in both directions. Abingdon #10 and #13 are both recorded as `3` in blue, and production has
exactly one such row; nothing can say which cancel ASCC catalogued, so both are refused.

### E -- enrichment

| Rule | Field | Policy |
|---|---|---|
| **E1** | `width` / `height` | fill where production is empty. Where both hold a value and they differ, **the sheet wins and the ledger records `before`/`after`**, and the row is also written to `crossexam/conflicts.csv` |
| **E2** | `shape` | fill where empty, derived from the `cancel` device code. Never overwrite -- production's explicit shape outranks a derived one |
| **E3** | `DateSeen` | purely additive; dedupe on `date_key`, never delete |
| **E4** | `Marking.code` | **never written -- the site owns numbering** (Reese, 2026-08-12). The catalog mints its own codes and keeps them; the VPHC cancel number is carried as *reference data*, not as an identifier. This was previously recorded as the blocker forcing a merge-strategy decision; it is not one, because the sheet's numbering does not need to win |
| **E5** | images | **purely additive -- nothing is ever deleted or replaced.** T2 anchors one scan per `(town, cancel #)`, the same key T1 uses for a marking, so the marking number *is* the picture's key: Abingdon #10 -> `vphc-va-abingdon-10-r9735.png`. 1,185 of the 2,227 non-manuscript markings (53%) carry a scan; 1,217 images in total. Production keeps every image it already holds -- an `add_images` ledger line records the existing count as context and can only increase it. Where one marking matched several fan-out members (the same device in several colours) the scan attaches to the lowest code and the alternatives are named in `rejected`, because copying one scan onto every colour row would be wrong |
| **E6** | `color` | **Never written on an EDIT** -- it is doing identity work in I3 there, so writing it back could only confirm what production already holds. **Always written on a CREATE**, because the writing grain is one row per type x colour: the colour is not enrichment on a new marking, it is part of what distinguishes it from its siblings. A colour the catalog vocabulary does not know cannot become a row; it is flagged `color_unrecognised` **and named in the description**, because the flag alone says a colour was dropped without saying which. *(Split 2026-08-17, issue #103 -- the single "never written" policy was correct for matching and wrong for creation.)* |
| **E7** | `rate_val` | **Derived from the `cancel` device vocabulary, exactly as I2 specifies -- never from `cancel_no`.** The device reaches the applier as the sheet's inscription *key set*, so read every key rather than the first: `PAID 3` arrives sorted as `3/PAID;PAID 3;PAID/3` and leads with `3/PAID`. A bare number is its own rate; `PAID`/`DUE`/`WAY` with digits in either order yields the digits; `V` and `X` are Roman rates worth 5 and 10. Where the device states **no** rate, **no key is written** -- absent means "keep whatever production holds" under the issue #111 merge, where `""` would clear it and a guess would be wrong while looking deliberate. *(Added 2026-08-24, issue #120. This row did not exist, which is why an undocumented write could sit at `apply_vphc_ledger.py:406` taking `cancel_no` -- the **drawing number**, and by E5 the key that names the scan -- as a rate on 276 queued listings, 57 of them edits against live markings.)* |

### C -- coverage, and D -- duplicates

> **Nothing from the sheet is ever dropped** (Reese, 2026-08-12). Every marking either enriches a
> record it matched or is created as a new one. A failed match is a reason to *catalogue it
> separately*, not to discard it -- the bucket travels with the record as the explanation, and the
> duplicate rule cleans up afterwards. **100% of the 2,227 non-manuscript markings land.**

| Rule | What | Policy |
|---|---|---|
| **C1** | any marking I1-I3 could not confidently match -- including `ambiguous`, `town_damaged`, `no_colour_match` and `unclassified_device`, which were refusals under the first draft of v2 | **create**, carrying `why_unmatched` so the reason survives into the ledger |
| **P1** | a town the ingest needs that has **no resolvable state** | **never invent a home.** A post office belongs to a region and the region comes from the county (R3); with neither, the town is set aside to `unresolved/post_office_quarantine.csv` with a classified reason, and the markings on it are marked `landing=blocked` rather than created. 19 towns, 42 markings (1.9%) |
| **D1** | two production markings sharing a post office **and all 14 semantic fields** (`type`, `inscription_txt`, `is_manuscript`, `shape`, `lettering`, `color`, `is_irreg`, `width`, `height`, `date_fmt`, `impression`, `rate_val`, `desc`, `catalog_txt`) | **archive one, never delete.** Keep the copy carrying images -- archiving it would strand them -- then the lowest code. The other is proposed for `marking_recycle_bin`, which is reversible |

P1's five reason codes, all measured: **`route_agent` 7** (steamboat, railroad and route markings --
`POTOMAC STEAMBOAT`, `BALTIMORE AND OHIO R. R.` -- a real philatelic category with no home in the
schema), **`county_unrecognised` 6**, **`no_county` 3**, **`supplement_header` 2**
(`11-93 SUPPLEMENT` is a section header read as a town, with the real town sitting in the county
column), **`town_county_swap` 1**. Every one is a row a human can fix; none is silently dropped.

D1 is measuring a problem that **predates this ingest**: 833 duplicate groups, **847 markings
archivable**, 1,535 of them VA and 145 WV. It is a single duplicated import block rather than
scattered data entry -- 661 of the pairs sit **720 to 728 apart** in code number, the kept half
spanning `M1029`-`M3337` and the archived half `M1032`-`M4064`. Granularity is preserved: only
exact twins collapse, and a difference in any one of the 14 fields keeps both.

The `cancel` column reads as free text but is a controlled vocabulary of Simpson-style device codes
(`C10`, `C`, `C11`, `C31`, `SL`, `Oval`) interleaved with rate and auxiliary words (`PAID`, `5`,
`FREE`, `DUE 10`). Production's own `catalog_txt` uses the same notation (`irregular C-26`).
Values the vocabulary cannot classify -> `unresolved/type_code_vocab.csv`.

---

## Changelog

- **v1** -- 2026-08-11. Initial rule set, written against the measured contents of the sheet
  before any database was touched. Amended the same day by verification, which changed four
  things rather than confirming them:
  - **R1c added.** The sequence test alone left Abingdon #1 at 1897; the scan of that cancel
    reads 179-. The era window is what actually resolves T1.
  - **R1 runs made contiguous.** Keyed grouping merged towns listed in two blocks and silently
    disabled the correction for all of them.
  - **R2c added.** 316 countyless supplement rows recovered; 49 real county formations surfaced.
  - **R6c and row-unique image names added.** Nine column-shifted rows repaired; 72 images had
    been silently overwriting each other.
  - **R1d added** (2026-08-12, at Reese's direction to resolve centuries from context rather than
    a cutoff). Town postmaster windows became a constraint; fixed a DP initial-state bug that let
    the first date of any run ignore every constraint. Window contradictions 76 -> 1.

- **v2** -- 2026-08-12. The Phase 3 match tiers were rewritten after the first actual
  cross-examination of the sheet against the Phase 1 bundle (`tools/vphc_crossexam.py`,
  `phase-02-crossexam.md`). As in v1, verification changed the rules rather than confirming them:
  - **M1-M4 retired; the I/E split introduced.** Their match key *was* their write payload.
    Measured over every unique town+size+colour match: 0 empty production fields filled, 595
    widths and 595 colours merely confirmed. The new invariant -- no field establishes identity
    and is written for the same pair -- makes that failure impossible to reintroduce.
  - **Matching moved to `(town, cancel #)` grain.** The v1 tiers were simulated per row, so
    Abingdon #6's five colour observations each scored as an independent ambiguous match against
    the same four-member fan-out. 3,596 non-manuscript rows are 2,227 markings.
  - **I1 added -- identity is `inscription_txt`, not size.** It is populated on 4,000/4,000
    production rows and varies within 304 of the 1,514 `catalog_txt` clusters. `ASCC6-VA-M1076`
    is `ABINGDON/*VA.*` and `M1077` is `ABINGDON/VA.`, matching the sheet's `*Va.*` (T1:r6,
    cancel #3) and `Va.` (T1:r5, cancel #2). v1 compared the wrong column and concluded the
    fan-out had no tiebreaker.
  - **I3c added -- contention.** I1-I3 are evaluated per sheet marking and are blind to each
    other, which let 11 distinct Richmond cancels (26-35 mm) all claim the single black
    `RICHMOND/VA.` row, and Alum Springs #4/#6/#7 (51, 49, 37 mm) all claim one 30 mm row. That
    silently asserts that many devices are one, and it manufactured most of the apparent size
    conflicts: enforcing one-claim-per-device dropped width conflicts from 142 to 54.
  - **E2 added -- the sheet carries shape.** `cancel` is a device-code vocabulary, not free text.
    Its value is almost entirely in the created population: on matched rows it fills only 4
    shapes, because production rows carrying a size usually carry a shape too.
  - **E4 recorded as impossible, not deferred.** `Marking.code` is unique and already holds the
    ASCC code, so on a matched row the VPHC cancel number cannot be written at all. v1 assumed
    otherwise. This is what makes the merge a strategy decision rather than a script.
  - **I1b, I2b and E5 added (same day, at Reese's direction).** Matching should use every signal
    available, and the marking number should reach its picture. I1b widened bare-town townmarks --
    the sheet leaves `cancel_detail` blank far more often than production leaves the state off the
    inscription -- and I2b routes a detail like `PAID 3` to the RATEMARK `PAID/3`. Together they cut
    false creates from 662 to 545 and raised matched production rows from 493 to 519. E5 was
    written up as strictly additive: the cross-examination now carries the T2 scan for every
    marking that has one and proposes 1,217 image additions, and no proposal can ever remove or
    replace an image production already holds (fixture F11).
  - **C1 and D1 added; E4 reversed (2026-08-12, at Reese's direction).** Three instructions
    changed the shape of the merge:
    - *"The spreadsheet's numbering doesn't matter, the woco site can have authority."* E4 had been
      recorded as the blocker that made the merge a strategy decision -- the VPHC cancel number
      having nowhere to go on a matched row. It is not a blocker: the site mints and keeps its own
      codes and the cancel number is carried as reference data. **This unblocks the merge.**
    - *"Making sure 100% of the data in the CSV is going into the site."* C1. The first draft of v2
      refused 781 markings (35%) across four buckets. Refusing to *match* is correct; refusing to
      *catalogue* is not. Unmatched markings are now created with the reason attached, and fixture
      F12 asserts every one of the 2,227 lands.
    - *"If there are TRUE duplicates... archive one of the records (not delete)."* D1, and it found a
      problem that has nothing to do with the sheet: 847 archivable duplicates already in
      production, one import block that ran twice.
  - **Counting corrected.** The bucket table in the first draft of `phase-02-crossexam.md` counted
    crosswalk *rows*, and a matched marking emits one row per colour -- so "501 resolved" was really
    **415 markings**. Counts are per marking now, with row counts kept separately.
