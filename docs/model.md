---

# WorldCovers **|** Model

---

## **Summary**

**This document defines the structural vocabulary for data accessible through WorldCovers. Thirteen tables describe the philatelic domain's persistent state. markings is the central entity — the catalog entry itself — unifying town markings, rate markings, and auxiliary markings under a single type discriminator. Each row in markings carries the authoritative catalog text, the physical inscription of the device, and a reference to a row in post\_offices within a time-bounded regions hierarchy. covers are conceptually observations of markings, linked through the cover\_markings junction, which also records per-observation positional context. Marking classification is represented through two primary editorial dimensions: shapes and letterings. Both remain provisional editorial vocabularies: their current records preserve catalog usage patterns and known inconsistencies, and therefore do not yet constitute fully orthogonal or exhaustively normalized taxonomies. Curatorial responsibility is expressed through collections, each of which wraps exactly one region and serves as the routing target for contributions submitted within that region. A single junction table, cover\_markings, resolves the many-to-many association between covers and the markings they bear.**

## **Domain Tables**

---

### **citations**

**Links a reference work to a cover or marking.**

***Fields:***

* **citation\_detail \- Specific location within the reference work (e.g., page number, section, url).**  
* **reference\_work\_id \- Related reference work.**  
* **subject\_id \- Identifier of the cited resource.**  
* **subject\_type \- Type of the cited resource.**

***Invariants:***

* **reference\_work\_id references exactly one row in reference\_works.**  
* **subject\_type is one of COVER, or MARKING.**  
* **subject\_id references exactly one resource of the type specified by subject\_type.**

***Relationships:***

* **References exactly one reference work.**  
* **Targets exactly one cover or marking.**

---

### **collections**

**An institutional curatorial unit associated with exactly one region. Contributions submitted within a collection's region are routed to that collection for editorial review. A collection is the unit of curatorial scope: it carries the human-facing identity (display name, description, active state) under which a region's holdings are presented and reviewed, independent of who is currently assigned to work it.**

***Fields:***

* **description \- Curatorial description of the collection.**  
* **is\_active \- Whether the collection is currently accepting submissions and editorial work.**  
* **name \- Display name for the collection (e.g., "Virginia").**  
* **region\_id \- Related region; one collection per region.**

***Invariants:***

* **name is non-empty.**  
* **region\_id references exactly one row in regions.**  
* **region\_id is unique across all collections (one-to-one with regions).**  
* **is\_active defaults to true.**

***Relationships:***

* **References exactly one region (one-to-one).**

---

### **colors**

**Value table of ink or cover material colors.**

***Fields:***

* **hex\_val (nullable) \- Hexadecimal color code for display rendering.**  
* **name \- Display name of the color.**  
* **pantone\_code (nullable) \- Pantone reference code for precise color matching.**

***Invariants:***

* **name is unique across all rows in colors.**  
* **hex\_val defaults to "000000".**

***Relationships:***

* **Referenced by zero or more rows in markings and covers.**

---

### **covers**

**A physical postal cover bearing one or more recorded markings. A cover is conceptually an observation of the markings it bears; each cover records a single-instance date and physical context for the markings it carries.**

***Fields:***

* **code \- An editor-assigned reference identifier.**  
* **color\_id \- Ink or material color of the cover itself.**  
* **type (nullable) \- Physical form of the postal cover.**  
* **has\_adhesive \- Whether the cover bears an adhesive postage stamp alongside stampless markings.**  
* **height (nullable) \- Vertical dimension of the cover.**  
* **is\_institutional \- Whether the cover is institutionally owned (museum, society, etc.).**  
* **width (nullable) \- Horizontal dimension of the cover.**

***Invariants:***

* **color\_id references exactly one row in colors, defaults to 0\.**  
* **width and height are decimals in millimeters.**  
* **has\_adhesive defaults to false.**  
* **type, if set, is one of: "FC \- FOLDED COVER", or "FL \- FOLDED LETTER".**

***Relationships:***

* **Associated with one or more markings (via cover\_markings).**  
* **References zero or one color.**  
* **Referenced by zero or more citations.**

---

### **cover\_markings**

**Junction linking a cover to a marking, with positional context describing how the marking appears on that particular cover.**

***Fields:***

* **cover\_id \- Related cover.**  
* **is\_backstamp \- Whether this marking appears on the reverse of the cover.**  
* **marking\_id \- Related marking.**  
* **placement (nullable) \- Positional qualifier for the marking's location on the cover.**

***Invariants:***

* **cover\_id references exactly one row in covers.**  
* **marking\_id references exactly one row in markings.**  
* **The combination of cover\_id and marking\_id is unique.**  
* **is\_backstamp defaults to false.**  
* **placement vocabulary is editorial and not yet enumerated; values should be drawn from an agreed controlled list once established.**

***Relationships:***

* **References exactly one cover.**  
* **References exactly one marking.**

---

### **dates\_seen**

**A single date point observed for a marking.**

***Fields:***

* **date \- Calendar date of the observed use.**  
* **granularity \- Granularity of the recorded date.**  
* **marking\_id \- Related marking.**

***Invariants:***

* **Belongs to exactly one marking.**  
* **granularity is one of DAY, MONTH, or YEAR.**  
* **If granularity is MONTH, the day component of date is synthetic (set to 01).**  
* **If granularity is YEAR, the month and day components of date are synthetic (set to 01).**  
* **A marking's earliest and latest use dates are derived from its dates\_seen collection rather than stored on the marking itself.**

***Relationships:***

* **References exactly one marking.**

---

### **letterings**

**Editorial value table for textual styling assigned to a postal marking. This vocabulary is intentionally provisional: current seed values preserve catalog usage and may mix type family, weight, stroke treatment, and stylistic descriptors.**

***Fields:***

* **code (nullable) \- An editor-assigned reference identifier.**  
* **name \- Display name of the typeface/style category.**

***Seed values:***

* **Italic**  
* **Serif**  
* **Sans-serif**  
* **Small**  
* **Large**  
* **Outline**  
* **Bold**  
* **Block**  
* **Gothic**

***Invariants:***

* **name is unique across all rows in letterings.**  
* **lettering values are editorial assignment categories and are not guaranteed to be mutually exclusive in a strict typographic sense.**

***Relationships:***

* **Referenced by zero or more rows in markings.**

---

### **markings**

**A postal marking — town marking, rate marking, or auxiliary marking — as observed on one or more covers. A marking may be a handstamped device or a manuscript inscription. All marking types share the same physical-device vocabulary (shape, lettering, impression, dimensions, colour); the type discriminator captures functional role.**

***Fields:***

* **catalog\_txt \- Authoritative catalog entry text for this listing.**  
* **code \- An editor-assigned reference identifier.**  
* **color\_id \- Ink color of this marking.**  
* **date\_fmt (nullable) \- Arrangement of date components inscribed on the device.**  
* **height (nullable) \- Vertical dimension of the marking impression.**  
* **impression (nullable) \- Printing technique of the handstamp device.**  
* **inscription\_txt \- Text as physically inscribed on the marking.**  
* **is\_irreg (nullable) \- Whether the handstamp outline is non-uniform.**  
* **is\_manuscript \- Whether this is a handwritten marking rather than a handstamped device.**  
* **lettering\_id (nullable) \- Typeface style observed on the handstamp.**  
* **post\_office\_id \- Post office that produced this marking.**  
* **rate\_val (nullable) \- Numeric postal rate amount, where applicable.**  
* **shape\_id (nullable) \- Base geometric outline of the handstamp device.**  
* **type \- Functional classification of this marking.**  
* **width (nullable) \- Horizontal dimension of the marking impression.**

***Invariants:***

* **type is one of TOWNMARK, RATEMARK, or AUXMARK.**  
* **If is\_manuscript is true, lettering\_id must be null.**  
* **If is\_manuscript is true, shape\_id must be null.**  
* **If is\_manuscript is false, shape\_id is required and references exactly one row in shapes.**  
* **lettering\_id, if set, references exactly one row in letterings.**  
* **color\_id references exactly one row in colors, defaults to 1 (guaranteed to be "BLACK").**  
* **If is\_manuscript is true, is\_irreg must be null.**  
* **If is\_manuscript is false, is\_irreg is required.**  
* **width and height are decimals in millimeters.**  
* **date\_fmt, if set, is one of: MD, MDD, YD, YMD, YMDD.**  
* **rate\_val, if set, is a non-negative decimal representing the rate amount;**   
* **rate\_val may be populated for any type but is most commonly associated with RATEMARK and with integrated-rate TOWNMARK devices.**  
* **catalog\_txt is the authoritative ASCC catalog entry text for this listing.**  
* **inscription\_txt is the text as it appears on the physical marking.**  
* **post\_office\_id references exactly one row in post\_offices.**  
* **impression, if set, is one of: Normal, Stencil, Negative.**  
* **Must be referenced by at least one row in cover\_markings.**

***Relationships:***

* **Associated with one or more covers (via cover\_markings).**  
* **Has zero or more dates\_seen entries.**  
* **References zero or one shape.**  
* **References zero or one lettering.**  
* **References zero or one color.**  
* **Referenced by zero or more citations.**  
* **Belongs to exactly one post office.**  
* **Has zero or more marking valuations.**

---

### **marking\_valuations**

**An estimated collector market value for a marking, as published in a reference source.**

***Fields:***

* **amt (nullable) \- Estimated collector market value.**  
* **appraisal\_date \- Date of the valuation source.**  
* **appraisal\_pos \- Ordinal position within the marking's valuation sequence.**  
* **marking\_id \- Related marking.**

***Invariants:***

* **marking\_id references exactly one row in markings.**  
* **amt, if set, is a non-negative decimal in USD; a null amt indicates an unpriced catalogue entry.**  
* **appraisal\_date is the date (or nominal date) of the valuation source.**  
* **appraisal\_pos is unique within a marking\_id grouping.**  
* **appraisal\_pos defaults to 0\.**

***Relationships:***

* **Belongs to exactly one marking.**

---

### **post\_offices**

**A postal facility that operated within a specific region.**

***Fields:***

* **name \- Normalized town name used for filtering and grouping.**  
* **region\_id \- Related region, a jurisdiction containing this post office.**

***Invariants:***

* **name is the normalized town name (e.g., Abingdon, Richmond).**  
* **region\_id references exactly one row in regions.**  
* **The combination of name and region\_id is unique.**

***Relationships:***

* **Belongs to exactly one region.**  
* **Referenced by zero or more rows in markings.**

---

### **reference\_works**

**A citable publication or source.**

***Fields:***

* **authorship \- Author(s) or editor(s) of the publication.**  
* **isbn (nullable) \- International Standard Book Number.**  
* **publication\_year \- Year of publication.**  
* **edition (nullable) \- Released version of publication.**  
* **volume (nullable) \- Identifier for a multi-volume series.**  
* **publisher \- Publishing entity.**  
* **title \- Name of the publication.**  
* **url (nullable) \- Web address of the publication or digital resource.**

***Invariants:***

* **None beyond field presence.**

***Relationships:***

* **Referenced by zero or more citations.**

---

### **regions**

**A named geographic or administrative area used to organize post offices within a historical hierarchy.**

***Fields:***

* **established\_date \- First date on which this region definition is considered in force.**  
* **defunct\_date (nullable) \- Last date on which this region definition is considered in force.**  
* **name \- Canonical region name for the applicable historical period.**  
* **abbrev \- Canonical two or three character abbreviation.**  
* **parent\_region\_id (nullable) \- Immediate containing region in the hierarchy.**  
* **region\_tier \- Administrative level of this region.**

***Invariants:***

* **region\_tier is one of COUNTRY, TERRITORY, STATE, PROVINCE, COUNTY, CITY, DISTRICT, or OTHER.**  
* **parent\_region\_id, if set, references exactly one row in regions.**  
* **A region cannot parent itself.**  
* **If both established\_date and defunct\_date are set, established\_date must be less than or equal to defunct\_date.**  
* **A region with a non-null defunct\_date is considered inactive. A null defunct\_date indicates the region is still considered active within the modeled historical hierarchy.**  
* **Region identity is historical rather than purely modern; records with the same name may exist for different periods or different parents.**

***Relationships:***

* **May belong to zero or one parent region.**  
* **May contain zero or more child regions.**  
* **Referenced by zero or more post offices.**  
* **Referenced by zero or one collection (one-to-one).**

---

### **shapes**

**Editorial value table for the primary form assigned to a postal marking. This vocabulary is intentionally provisional: while many values describe base geometry, some records reflect catalog terminology that may combine geometry, motif, framing treatment, or construction style. Compound ASCC codes (e.g., DC, DLC, DLDC, DO, DLO, DLDO, NOR, Pmk) are carried verbatim as rows in shapes rather than decomposed into separate shape-and-framing axes.**

***Fields:***

* **code (nullable) \- An editor-assigned reference identifier.**  
* **name \- Display name of the assigned form category.**

***Invariants:***

* **name is unique across all rows in shapes.**  
* **shape values are editorial assignment categories and are not guaranteed to be mutually exclusive in a strict taxonomic sense.**

***Relationships:***

* **Referenced by zero or more rows in markings.**

---

## **ER Diagram**

**erDiagram**

 **covers {**    
 **int id PK**    
 **string code**    
 **int color\_id FK**    
 **decimal width**    
 **decimal height**    
 **boolean has\_adhesive**    
 **string cover\_type**    
 **boolean is\_institutional**    
 **}**

**markings {**      
    **int id PK**      
    **string code**    
    **string type**    
    **boolean is\_manuscript**      
    **int shape\_id FK**      
    **int lettering\_id FK**      
    **int color\_id FK**      
    **boolean is\_irreg**    
    **decimal width**      
    **decimal height**      
    **string date\_fmt**    
    **string catalog\_txt**       
    **string inscription\_txt**       
    **int post\_office\_id FK**      
    **string impression**    
    **decimal rate\_val**    
**}**

**cover\_markings {**      
    **int id PK**      
    **int cover\_id FK**      
    **int marking\_id FK**      
    **boolean is\_backstamp**    
    **string placement**    
**}**

**shapes {**      
    **int id PK**      
    **string code**    
    **string name**      
**}**

**letterings {**      
    **int id PK**      
    **string code**    
    **string name**      
**}**

**dates\_seen {**      
    **int id PK**      
    **int marking\_id FK**      
    **date date**      
    **string granularity**      
**}**

**marking\_valuations {**       
    **int id PK**      
    **int marking\_id FK**      
    **decimal amt**      
    **date appraisal\_date**      
    **int appraisal\_pos**      
**}**

**colors {**      
    **int id PK**      
    **string name**      
    **string hex\_val**      
    **string pantone\_code**      
**}**

**reference\_works {**      
    **int id PK**      
    **string title**      
    **string authorship**    
    **string edition**      
    **string volume**    
    **string publisher**      
    **int publication\_year**      
    **string isbn**      
    **string url**      
**}**

**citations {**      
    **int id PK**      
    **int reference\_work\_id FK**      
    **string subject\_type**      
    **int subject\_id**      
    **string citation\_detail**      
**}**

**regions {**       
    **int id PK**       
    **string name**       
    **string abbrev**    
    **string region\_tier**       
    **int parent\_region\_id FK**       
    **date established\_date**      
    **date defunct\_date**    
**}** 

**post\_offices {**       
    **int id PK**       
    **string name**       
    **int region\_id FK**       
**}**

**collections {**    
    **int id PK**    
    **string name**    
    **string description**    
    **int region\_id FK**    
    **boolean is\_active**    
**}**

**covers ||--|{ cover\_markings : "has"**      
**markings ||--|{ cover\_markings : "observed on"**      
**markings ||--o{ marking\_valuations : "has"**      
**markings ||--o{ dates\_seen : "seen on"**    
**shapes o|--o{ markings : "classifies"**      
**letterings o|--o{ markings : "classifies"**      
**colors o|--o{ markings : "colors"**      
**colors o|--o{ covers : "colors"**      
**reference\_works ||--o{ citations : "cited in"**      
**covers o|--o{ citations : "referenced by"**      
**markings o|--o{ citations : "referenced by"**      
**regions o|--o{ regions : "contains"**      
**regions ||--o{ post\_offices : "contains"**      
**post\_offices ||--o{ markings : "operates"**    
**regions ||--o| collections : "curated as"** 

