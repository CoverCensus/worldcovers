---

# WorldCovers **|** Model

---

## **Summary**

This document defines the structural vocabulary for data accessible through WorldCovers. Thirteen tables describe the philatelic domain's persistent state. markings is the central entity — the catalog entry itself — unifying town markings, rate markings, and auxiliary markings under a single type discriminator. Each row in markings carries the authoritative catalog text, the physical inscription of the device, and a reference to a row in post\_offices within a time-bounded regions hierarchy. covers are conceptually observations of markings, linked through the cover\_markings junction, which also records per-observation positional context. Marking classification is represented through two primary editorial dimensions: shapes and letterings. Both remain provisional editorial vocabularies: their current records preserve catalog usage patterns and known inconsistencies, and therefore do not yet constitute fully orthogonal or exhaustively normalized taxonomies. Curatorial responsibility is expressed through collections, each of which wraps exactly one region and serves as the routing target for contributions submitted within that region. A single junction table, cover\_markings, resolves the many-to-many association between covers and the markings they bear.

## **Domain Tables**

---

### **citations**

Links a reference work to a cover or marking.

*Fields:*

* citation\_detail \- Specific location within the reference work (e.g., page number, section, url).  
* reference\_work\_id \- Related reference work.  
* subject\_id \- Identifier of the cited resource.  
* subject\_type \- Type of the cited resource.

*Invariants:*

* reference\_work\_id references exactly one row in reference\_works.  
* subject\_type is one of COVER, or MARKING.  
* subject\_id references exactly one resource of the type specified by subject\_type.

*Relationships:*

* References exactly one reference work.  
* Targets exactly one cover or marking.

---

### **collections**

An institutional curatorial unit associated with exactly one region. Contributions submitted within a collection's region are routed to that collection for editorial review. A collection is the unit of curatorial scope: it carries the human-facing identity (display name, description, active state) under which a region's holdings are presented and reviewed, independent of who is currently assigned to work it.

*Fields:*

* description \- Curatorial description of the collection.  
* is\_active \- Whether the collection is currently accepting submissions and editorial work.  
* name \- Display name for the collection (e.g., "Virginia").  
* region\_id \- Related region; one collection per region.

*Invariants:*

* name is non-empty.  
* region\_id references exactly one row in regions.  
* region\_id is unique across all collections (one-to-one with regions).  
* is\_active defaults to true.

*Relationships:*

* References exactly one region (one-to-one).

---

### **colors**

Value table of ink or cover material colors.

*Fields:*

* hex\_val (nullable) \- Hexadecimal color code for display rendering.  
* name \- Display name of the color.  
* pantone\_code (nullable) \- Pantone reference code for precise color matching.

*Invariants:*

* name is unique across all rows in colors.  
* hex\_val defaults to "000000".

*Relationships:*

* Referenced by zero or more rows in markings and covers.

---

### **covers**

A physical postal cover bearing one or more recorded markings. A cover is conceptually an observation of the markings it bears; each cover records a single-instance date and physical context for the markings it carries.

*Fields:*

* code \- An editor-assigned reference identifier.  
* color\_id \- Ink or material color of the cover itself.  
* type (nullable) \- Physical form of the postal cover.  
* has\_adhesive \- Whether the cover bears an adhesive postage stamp alongside stampless markings.  
* height (nullable) \- Vertical dimension of the cover.  
* is\_institutional \- Whether the cover is institutionally owned (museum, society, etc.).  
* width (nullable) \- Horizontal dimension of the cover.

*Invariants:*

* color\_id references exactly one row in colors, defaults to 0\.  
* width and height are decimals in millimeters.  
* has\_adhesive defaults to false.  
* type, if set, is one of: "FC \- FOLDED COVER", or "FL \- FOLDED LETTER".

*Relationships:*

* Associated with one or more markings (via cover\_markings).  
* Has zero or more cover\_dates entries.  
* Has zero or more cover\_valuations entries.  
* References zero or one color.  
* Referenced by zero or more citations.

---

### **cover\_markings**

Junction linking a cover to a marking, with positional context describing how the marking appears on that particular cover.

*Fields:*

* cover\_id \- Related cover.  
* is\_backstamp \- Whether this marking appears on the reverse of the cover.  
* marking\_id \- Related marking.  
* placement (nullable) \- Positional qualifier for the marking's location on the cover.

*Invariants:*

* cover\_id references exactly one row in covers.  
* marking\_id references exactly one row in markings.  
* The combination of cover\_id and marking\_id is unique.  
* is\_backstamp defaults to false.  
* placement vocabulary is editorial and not yet enumerated; values should be drawn from an agreed controlled list once established.

*Relationships:*

* References exactly one cover.  
* References exactly one marking.

---

### **cover\_dates**

A single date point observed for a cover.

*Fields:*

* cover\_id \- Related cover.  
* date \- Calendar date of the observed use.  
* granularity \- Granularity of the recorded date.

*Invariants:*

* Belongs to exactly one cover.  
* granularity is one of DAY, MONTH, or YEAR.  
* If granularity is MONTH, the day component of date is synthetic (set to 01).  
* If granularity is YEAR, the month and day components of date are synthetic (set to 01).

*Relationships:*

* References exactly one cover.

---

### **letterings**

Editorial value table for textual styling assigned to a postal marking. This vocabulary is intentionally provisional: current seed values preserve catalog usage and may mix type family, weight, stroke treatment, and stylistic descriptors.

*Fields:*

* code (nullable) \- An editor-assigned reference identifier.  
* name \- Display name of the typeface/style category.

*Seed values:*

* Italic  
* Serif  
* Sans-serif  
* Small  
* Large  
* Outline  
* Bold  
* Block  
* Gothic

*Invariants:*

* name is unique across all rows in letterings.  
* lettering values are editorial assignment categories and are not guaranteed to be mutually exclusive in a strict typographic sense.

*Relationships:*

* Referenced by zero or more rows in markings.

---

### **markings**

A postal marking — town marking, rate marking, or auxiliary marking — as observed on one or more covers. A marking may be a handstamped device or a manuscript inscription. All marking types share the same physical-device vocabulary (shape, lettering, impression, dimensions, colour); the type discriminator captures functional role.

*Fields:*

* catalog\_txt \- Authoritative catalog entry text for this listing.  
* code \- An editor-assigned reference identifier.  
* color\_id \- Ink color of this marking.  
* date\_fmt (nullable) \- Arrangement of date components inscribed on the device.  
* desc (nullable) \- Freetext field for contributor to provide annotations.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscription\_txt \- Text as physically inscribed on the marking.  
* is\_irreg (nullable) \- Whether the handstamp outline is non-uniform.  
* is\_manuscript \- Whether this is a handwritten marking rather than a handstamped device.  
* lettering\_id (nullable) \- Typeface style observed on the handstamp.  
* post\_office\_id \- Post office that produced this marking.  
* rate\_val (nullable) \- Numeric postal rate amount, where applicable.  
* shape\_id (nullable) \- Base geometric outline of the handstamp device.  
* type \- Functional classification of this marking.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* type is one of TOWNMARK, RATEMARK, or AUXMARK.  
* If is\_manuscript is true, lettering\_id must be null.  
* If is\_manuscript is true, shape\_id must be null.  
* If is\_manuscript is false, shape\_id is required and references exactly one row in shapes.  
* lettering\_id, if set, references exactly one row in letterings.  
* color\_id references exactly one row in colors, defaults to 1 (guaranteed to be "BLACK").  
* If is\_manuscript is true, is\_irreg must be null.  
* If is\_manuscript is false, is\_irreg is required.  
* width and height are decimals in millimeters.  
* date\_fmt, if set, is one of: MD, MDD, YD, YMD, YMDD.  
* rate\_val, if set, is a non-negative decimal representing the rate amount;  
* rate\_val may be populated for any type but is most commonly associated with RATEMARK and with integrated-rate TOWNMARK devices.  
* catalog\_txt is the authoritative ASCC catalog entry text for this listing.  
* inscription\_txt is the text as it appears on the physical marking.  
* post\_office\_id references exactly one row in post\_offices.  
* impression, if set, is one of: Normal, Stencil, Negative.  
* A marking may exist without any cover\_markings rows; covers are only created when a valuation is recorded, so catalog entries without recorded valuations have no associated cover.  
* A marking's earliest and latest use dates are derived by aggregating the cover\_dates of all covers associated with that marking (via cover\_markings), rather than stored on the marking itself. A marking with no associated covers therefore has no derivable date range.

*Relationships:*

* Associated with zero or more covers (via cover\_markings).  
* References zero or one shape.  
* References zero or one lettering.  
* References zero or one color.  
* Referenced by zero or more citations.  
* Belongs to exactly one post office.

---

### **cover\_valuations**

An estimated collector market value for a cover, as published in a reference source.

*Fields:*

* amt (nullable) \- Estimated collector market value.  
* appraisal\_date \- Date of the valuation source.  
* cover\_id \- Related cover.

*Invariants:*

* cover\_id references exactly one row in covers.  
* amt, if set, is a non-negative decimal in USD; a null amt indicates an unpriced catalogue entry.  
* appraisal\_date is the date (or nominal date) of the valuation source.

*Relationships:*

* Belongs to exactly one cover.

---

### **post\_offices**

A postal facility that operated within a specific region.

*Fields:*

* name \- Normalized town name used for filtering and grouping.  
* region\_id \- Related region, a jurisdiction containing this post office.

*Invariants:*

* name is the normalized town name (e.g., Abingdon, Richmond).  
* region\_id references exactly one row in regions.  
* The combination of name and region\_id is unique.

*Relationships:*

* Belongs to exactly one region.  
* Referenced by zero or more rows in markings.

---

### **reference\_works**

A citable publication or source.

*Fields:*

* authorship \- Author(s) or editor(s) of the publication.  
* isbn (nullable) \- International Standard Book Number.  
* publication\_year \- Year of publication.  
* edition (nullable) \- Released version of publication.  
* volume (nullable) \- Identifier for a multi-volume series.  
* publisher \- Publishing entity.  
* title \- Name of the publication.  
* url (nullable) \- Web address of the publication or digital resource.

*Invariants:*

* None beyond field presence.

*Relationships:*

* Referenced by zero or more citations.

---

### **regions**

A named geographic or administrative area used to organize post offices within a historical hierarchy.

*Fields:*

* established\_date \- First date on which this region definition is considered in force.  
* defunct\_date (nullable) \- Last date on which this region definition is considered in force.  
* name \- Canonical region name for the applicable historical period.  
* abbrev \- Canonical two or three character abbreviation.  
* parent\_region\_id (nullable) \- Immediate containing region in the hierarchy.  
* region\_tier \- Administrative level of this region.

*Invariants:*

* region\_tier is one of COUNTRY, TERRITORY, STATE, PROVINCE, COUNTY, CITY, DISTRICT, or OTHER.  
* parent\_region\_id, if set, references exactly one row in regions.  
* A region cannot parent itself.  
* If both established\_date and defunct\_date are set, established\_date must be less than or equal to defunct\_date.  
* A region with a non-null defunct\_date is considered inactive. A null defunct\_date indicates the region is still considered active within the modeled historical hierarchy.  
* Region identity is historical rather than purely modern; records with the same name may exist for different periods or different parents.

*Relationships:*

* May belong to zero or one parent region.  
* May contain zero or more child regions.  
* Referenced by zero or more post offices.  
* Referenced by zero or one collection (one-to-one).

---

### **shapes**

Editorial value table for the primary form assigned to a postal marking. This vocabulary is intentionally provisional: while many values describe base geometry, some records reflect catalog terminology that may combine geometry, motif, framing treatment, or construction style. Compound ASCC codes (e.g., DC, DLC, DLDC, DO, DLO, DLDO, NOR, Pmk) are carried verbatim as rows in shapes rather than decomposed into separate shape-and-framing axes.

*Fields:*

* code (nullable) \- An editor-assigned reference identifier.  
* name \- Display name of the assigned form category.

*Invariants:*

* name is unique across all rows in shapes.  
* shape values are editorial assignment categories and are not guaranteed to be mutually exclusive in a strict taxonomic sense.

*Relationships:*

* Referenced by zero or more rows in markings.

---

## **ER Diagram**

erDiagram

covers {  
 int id PK  
 string code  
 int color\_id FK  
 decimal width  
 decimal height  
 boolean has\_adhesive  
 string cover\_type  
 boolean is\_institutional  
 }

markings {  
 int id PK  
 string code  
 string type  
 boolean is\_manuscript string desc  
 int shape\_id FK  
 int lettering\_id FK  
 int color\_id FK  
 boolean is\_irreg  
 decimal width  
 decimal height  
 string date\_fmt  
 string catalog\_txt  
 string inscription\_txt  
 int post\_office\_id FK  
 string impression  
 decimal rate\_val  
 }

cover\_markings {  
 int id PK  
 int cover\_id FK  
 int marking\_id FK  
 boolean is\_backstamp  
 string placement  
 }

shapes {  
 int id PK  
 string code  
 string name  
 }

letterings {  
 int id PK  
 string code  
 string name  
 }

cover\_dates {  
 int id PK  
 int cover\_id FK  
 date date  
 string granularity  
 }

cover\_valuations {  
 int id PK  
 int cover\_id FK  
 decimal amt  
 date appraisal\_date  
 }

colors {  
 int id PK  
 string name  
 string hex\_val  
 string pantone\_code  
 }

reference\_works {  
 int id PK  
 string title  
 string authorship  
 string edition  
 string volume  
 string publisher  
 int publication\_year  
 string isbn  
 string url  
 }

citations {  
 int id PK  
 int reference\_work\_id FK  
 string subject\_type  
 int subject\_id  
 string citation\_detail  
 }

regions {  
 int id PK  
 string name  
 string abbrev  
 string region\_tier  
 int parent\_region\_id FK  
 date established\_date  
 date defunct\_date  
 }

post\_offices {  
 int id PK  
 string name  
 int region\_id FK  
 }

collections {  
 int id PK  
 string name  
 string description  
 int region\_id FK  
 boolean is\_active  
 }

covers ||--|{ cover\_markings : "has"  
 markings ||--|{ cover\_markings : "observed on"  
 covers ||--o{ cover\_valuations : "valued"  
 covers ||--o{ cover\_dates : "dated"  
 shapes o|--o{ markings : "classifies"  
 letterings o|--o{ markings : "classifies"  
 colors o|--o{ markings : "colors"  
 colors o|--o{ covers : "colors"  
 reference\_works ||--o{ citations : "cited in"  
 covers o|--o{ citations : "referenced by"  
 markings o|--o{ citations : "referenced by"  
 regions o|--o{ regions : "contains"  
 regions ||--o{ post\_offices : "contains"  
 post\_offices ||--o{ markings : "operates"  
 regions ||--o| collections : "curated as"

![][image1]

[image1]: <data:image/png;base64,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>