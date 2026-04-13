---

# WorldCovers **|** Model

---

## **Summary**

This document defines the structural vocabulary for data accessible through WorldCovers. Seventeen types describe the philatelic domain's persistent state. Postmark is the central entity \- the catalog entry itself \- with town marking attributes modeled directly on it rather than as a separate type. Each Postmark carries the authoritative catalog text, the physical inscription of the town marking, and a reference to a PostOffice within a time-bounded Region hierarchy. Marking classification is currently represented through three primary editorial dimensions: Shape, Framing, and Lettering. Framing is simply treated as a per-line border description. Shape and Lettering remain provisional editorial vocabularies: their current seed values preserve catalog usage patterns and known inconsistencies, and therefore do not yet constitute a fully orthogonal or exhaustively normalized taxonomy. Three junction types resolve many-to-many relationships: CoverPostmark links Covers to Postmarks, PostmarkRatemark links Postmarks to Ratemarks, and MarkFraming supports the multi-valued, position-qualified framing vocabulary on any marking type.

## **Domain Types**

---

### **Auxmark**

An auxiliary or instructional marking (e.g., PAID, FREE) associated with a specific Postmark or Ratemark. Classified by the same Shape/Lettering/Framing/Impression/Irregularity categories as Postmark and Ratemark.

*Fields:*

* color\_id \- Related Color, the ink tone of this marking.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscription\_txt \- Text as physically inscribed on the auxiliary marking.  
* is\_irreg (nullable) \- Whether the handstamp outline is non-uniform.  
* is\_manuscript \- Whether this is a handwritten auxiliary marking rather than a handstamped device.  
* lettering\_id (nullable) \- Related Lettering typeface style observed on the handstamp.  
* parent\_mark\_id \- Identifier of the marking this auxmark is associated with.  
* parent\_mark\_type \- Type of the marking this auxmark is associated with.  
* shape\_id (nullable) \- Related Shape, the geometric outline of the handstamp device.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* parent\_mark\_type is one of POSTMARK, or RATEMARK.  
* parent\_mark\_id references exactly one resource of the type specified by parent\_mark\_type.  
* If is\_manuscript is true, lettering\_id must be null.  
* If is\_manuscript is true, shape\_id must be null.  
* If is\_manuscript is false, shape\_id is required and references exactly one Shape.  
* lettering\_id, if set, references exactly one Lettering.  
* color\_id references exactly one Color, defaults to 1 (guaranteed to be “BLACK”).  
* If is\_manuscript is true, is\_irreg must be null.  
* If is\_manuscript is false, is\_irreg is required.  
* width and height are decimals in millimeters.  
* inscription\_txt is the text as it appears on the physical auxiliary marking  
* impression, if set, is one of: Normal, Stencil, Negative.  
* If is\_manuscript is true, impression must be null.  
* If is\_manuscript is false, impression is required.

*Relationships:*

* Belongs to exactly one Postmark or Ratemark, as specified by parent\_mark\_type.  
* Has zero or more Framings (via MarkFraming).  
* References zero or one Shape.  
* References zero or one Lettering.  
* References zero or one Color.

---

### **Citation**

Links a ReferenceWork to a Cover or Postmark.

*Fields:*

* citation\_detail \- Specific location within the reference work (e.g., page number, section, url).  
* reference\_work\_id \- Related ReferenceWork  
* subject\_id \- Identifier of the cited resource.  
* subject\_type \- Type of the cited resource.

*Invariants:*

* reference\_work\_id references exactly one ReferenceWork.  
* subject\_type is one of COVER, or POSTMARK.  
* subject\_id references exactly one resource of the type specified by subject\_type.

*Relationships:*

* References exactly one ReferenceWork.  
* Targets exactly one Cover or Postmark.

---

### **Color**

Value table of ink or cover material colors

*Fields:*

* hex\_val (nullable) \- Hexadecimal color code for display rendering.  
* name \- Display name of the color.  
* pantone\_code (nullable) \- Pantone reference code for precise color matching.

*Invariants:*

* name is unique across all Colors.  
* hex\_val defaults to “000000”.

*Relationships:*

* Referenced by zero or more Postmarks, Ratemarks, Auxmarks, and Covers.

---

### **Cover**

A physical postal cover with recorded postal markings.

*Fields:*

* code \- An editor-assigned reference identifier  
* color\_id \- Ink or material color of the cover itself.  
* type (nullable) \- Physical form of the postal cover.  
* has\_adhesive \- Whether the cover bears an adhesive postage stamp alongside stampless markings.  
* height (nullable) \- Vertical dimension of the cover.  
* is\_institutional \- Whether the cover is institutionally owned (museum, society, etc.).  
* width (nullable) \- Horizontal dimension of the cover.

*Invariants:*

* color\_id, references exactly one Color, defaults to 0  
* width and height are decimals in millimeters.  
* has\_adhesive defaults to false.  
* type, if set, is one of: “FC \- FOLDED COVER”, or “FL \- FOLDED LETTER”.

*Relationships:*

* Associated with zero or more Postmarks (via CoverPostmark).  
* References zero or one Color.  
* Referenced by zero or more Citations.

---

### **CoverPostmark**

Junction linking a Cover to a Postmark.

*Fields:*

* cover\_id \- Related Cover  
* is\_backstamp \- Whether this marking appears on the reverse of the cover.  
* postmark\_id \- Related Postmark

*Invariants:*

* cover\_id references exactly one Cover.  
* postmark\_id references exactly one Postmark.  
* The combination of cover\_id and postmark\_id is unique.  
* A Postmark with no associated CoverPostmark is considered to be undefined.

*Relationships:*

* References exactly one Cover.  
* References exactly one Postmark.

---

### **DateObserved**

A single date point observed for a Postmark.

*Fields:*

* date \- Calendar date of the observed use.  
* granularity \- Granularity of the recorded date.  
* postmark\_id \- Related Postmark

*Invariants:*

* Belongs to exactly one Postmark.  
* granularity is one of DAY, MONTH, or YEAR.  
* If granularity is MONTH, the day component of date is synthetic (set to 01).  
* If granularity is YEAR, the month and day components of date are synthetic (set to 01).

*Relationships:*

* References exactly one Postmark.

---

### **Framing**

Value table of border treatment descriptors. A marking may have zero or more Framings applied simultaneously.

*Fields:*

* code  (nullable) \- An editor-assigned reference identifier.  
* name \- display name of the border.

*Seed values:*

* NOR \- No Outer Rim  
* SL \- Single Line  
* DL \- Double Line  
* Dotted  
* Dashed  
* Cogwheel  
* Fancy  
* Ornate  
* Other

*Invariants:*

* name is unique across all Framings.

*Relationships:*

* Referenced by zero or more MarkFramings.

---

### **Lettering**

Editorial value table for textual styling assigned to a postal marking. This vocabulary is intentionally provisional: current seed values preserve catalog usage and may mix type family, weight, stroke treatment, and stylistic descriptors.

*Fields:*

* name \- display name of the typeface/style category.

*Seed values:*

* Italic  
* Sans-serif  
* Script  
* Printed  
* Serif  
* Hollow  
* Thin  
* Block  
* Roman  
* Seriffed  
* Bold  
* Thick  
* Gothic  
* Other

*Invariants:*

* name is unique across all Letterings.  
* Lettering values are editorial assignment categories and are not guaranteed to be mutually exclusive in a strict typographic sense.

*Relationships:*

* Referenced by zero or more Postmarks, Ratemarks, and Auxmarks.

---

### **MarkFraming**

Polymorphic junction linking a Postmark, Ratemark, or Auxmark to one or more Framings.

*Fields:*

* framing\_id \- Related Framing  
* framing\_pos (nullable) \- Ordinal border position occupied by this framing on the marking, counted from the outside inward.  
* parent\_mark\_id \- Identifier of the marking this framing applies to.  
* parent\_mark\_type \- Type of the marking this framing applies to.

*Invariants:*

* parent\_mark\_type is one of: POSTMARK, RATEMARK, or AUXMARK.  
* parent\_mark\_id references exactly one resource of the type specified by parent\_mark\_type.  
* framing\_id references exactly one Framing.  
* The combination of parent\_mark\_type, parent\_mark\_id, and framing\_id is unique.  
* framing\_pos, if set, is a positive integer.  
* framing\_pos 1 represents the outermost border.  
* If multiple MarkFramings exist for the same parent marking and framing\_pos is populated, framing\_pos values must be unique within that parent marking.  
* A null framing\_pos means the framing is known to apply but its exact border order is unknown or not relevant.

*Relationships:*

* References exactly one Framing.  
* References exactly one Postmark, Ratemark, or Auxmark.

---

### **Postmark**

A town marking device (or manuscript marking) as observed on one or more Covers.

*Fields:*

* code \- An editor-assigned reference identifier  
* catalog\_txt \- Authoritative catalog entry text for this listing.  
* color\_id \- Ink color of this marking.  
* date\_fmt (nullable) \- Arrangement of date components inscribed on the device.  
* date\_type (nullable) \- Named date convention used in this marking.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscription\_txt \- Text as physically inscribed on the town marking device.  
* is\_irreg (nullable) \- Whether the handstamp outline is non-uniform.  
* is\_manuscript \- Whether this is a handwritten marking rather than a handstamped device.  
* lettering\_id (nullable) \- Typeface style observed on the handstamp.  
* post\_office\_id \- Post office that produced this marking.  
* shape\_id (nullable) \- Base geometric outline of the handstamp device.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* If is\_manuscript is true, lettering\_id must be null.  
* If is\_manuscript is true, shape\_id must be null.  
* If is\_manuscript is false, shapeId is required and references exactly one Shape.  
* lettering\_id, if set, references exactly one Lettering.  
* color\_id, references exactly one Color, defaults to 1 (guaranteed to be “BLACK”).  
* If is\_manuscript is true, is\_irreg must be null.  
* If is\_manuscript is false, is\_irreg is required.  
* width and height are decimals in millimeters.  
* date\_type, if set, is one of: “BISHOP MARK”, “FRANKLIN MARK”, or “QUAKER DATE”.  
* date\_fmt, if set, is one of: MD, MDD, YD, YMD, YMDD.  
* Must be referenced by at least one CoverPostmark.  
* catalog\_txt is the authoritative ASCC catalog entry text for this listing.  
* inscription\_txt is the text as it appears on the physical town marking device.  
* post\_office\_id references exactly one PostOffice.  
* impression, if set, is one of: Normal, Stencil, Negative.  
* If is\_manuscript is true, impression must be null.  
* If is\_manuscript is false, impression is required.

*Relationships:*

* Associated with one or more Covers (via CoverPostmark).  
* Associated with zero or more Ratemarks (via PostmarkRatemark).  
* Has zero or more Auxmarks.  
* Has zero or more DateObserved entries.  
* Has zero or more Framings (via MarkFraming).  
* References zero or one Shape.  
* References zero or one Lettering.  
* References zero or one Color.  
* Referenced by zero or more Citations.  
* Belongs to exactly one PostOffice.  
* Has zero or more PostmarkValuations.

---

### **PostmarkRatemark**

Junction linking a Postmark to a Ratemark.

*Fields:*

* placement\_type (nullable) \- Positional relationship of the rate marking to the associated townmark device.  
* postmark\_id \- Related Postmark  
* ratemark\_id \- Related Ratemark

*Invariants:*

* postmark\_id references exactly one Postmark.  
* ratemark\_id references exactly one Ratemark.  
* The combination of postmark\_id and ratemark\_id is unique.  
* placement\_type, if set, qualifies the relationship between the rate marking and the townmark device:  
  * ATTACHED means the rate marking is integral to the townmark frame  
  * WITHIN means the rate appears within the townmark frame but is not integral to it  
  * SEPARATE means the rate is struck separately from the townmark

*Relationships:*

* References exactly one Postmark.  
* References exactly one Ratemark.

---

### **PostmarkValuation**

An estimated collector market value for a Postmark, as published in a reference source.

*Fields:*

* amt \- Estimated collector market value.  
* appraisal\_date \- Date of the valuation source.  
* appraisal\_pos \- Ordinal position within the postmark's valuation sequence.  
* postmark\_id \- Related Postmark

*Invariants:*

* postmark\_id references exactly one Postmark.  
* amt, is a non-negative decimal in USD.  
* appraisal\_date is the date (or nominal date) of the valuation source.  
* appraisal\_pos is unique within a postmark\_id grouping.  
* appraisal\_pos defaults to 0\.

*Relationships:*

* Belongs to exactly one Postmark.

---

### **PostOffice**

A postal facility that operated within a specific Region.

*Fields:*

* name \- Normalized town name used for filtering and grouping.  
* region\_id \- Related Region, a jurisdiction containing this post office.

*Invariants:*

* name is the normalized town name (e.g., Abingdon, Richmond).  
* region\_id references exactly one Region.  
* The combination of name and region\_id is unique.

*Relationships:*

* Belongs to exactly one Region.  
* Referenced by zero or more Postmarks.

---

### **Ratemark**

A postal rate marking device or manuscript rate marking. Classified by the same Shape/Lettering/Framing/Impression/Irregularity categories as Postmark.

*Fields:*

* color\_id \- Related Color, the ink color of this marking.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscription\_txt \- Text as physically inscribed on the rate marking.  
* is\_irreg (nullable) \- Whether the handstamp outline is non-uniform.  
* is\_manuscript \- Whether this is a handwritten rate marking rather than a handstamped device.  
* lettering\_id (nullable) \- Related Lettering, the Typeface style observed on the handstamp.  
* rate\_val (nullable) \- Numeric postal rate amount.  
* shape\_id (nullable) \- Base geometric outline of the handstamp device.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* If is\_manuscript is true, lettering\_id must be null.  
* If is\_manuscript is true, shape\_id must be null.  
* If is\_manuscript is false, shape\_id is required and references exactly one Shape.  
* lettering\_id, if set, references exactly one Lettering.  
* color\_id, references exactly one Color, defaults to 1 (guaranteed to be “BLACK”)  
* If is\_manuscript is true, is\_irreg must be null.  
* If is\_manuscript is false, is\_irreg is required.  
* width and height are decimals in millimeters.  
* Must be referenced by at least one PostmarkRatemark.  
* inscription\_txt is the text as it appears on the physical rate marking.  
* rate\_val, if set, is a non-negative decimal representing the rate amount in cents.  
* impression, if set, is one of NORMAL, STENCIL, or NEGATIVE.  
* If is\_manuscript is true, impression must be null.  
* If is\_manuscript is false, impression is required.

*Relationships:*

* Associated with one or more Postmarks (via PostmarkRatemark).  
* Has zero or more Auxmarks.  
* Has zero or more Framings (via MarkFraming).  
* References zero or one Shape.  
* References zero or one Lettering.  
* References zero or one Color.

---

### **ReferenceWork**

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

* Referenced by zero or more Citations.

---

### **Region**

A named geographic or administrative area used to organize PostOffices within a historical hierarchy.

*Fields:*

* established\_date \- First date on which this Region definition is considered in force.  
* defunct\_date (nullable) \- Last date on which this Region definition is considered in force.  
* name \- Canonical region name for the applicable historical period.  
* abbrev \- Canonical two or three character abbreviation.  
* parent\_region\_id (nullable) \- Immediate containing Region in the hierarchy.  
* region\_tier \- Administrative level of this region.

*Invariants:*

* region\_tier is one of COUNTRY, TERRITORY, STATE, PROVINCE, COUNTY, CITY, DISTRICT, or OTHER.  
* parent\_region\_id, if set, references exactly one Region.  
* A Region cannot parent itself.  
* If both established\_date and defunct\_date are set, established\_date must be less than or equal to defunct\_date.  
* A Region with a non-null defunct\_date is considered inactive. A null defunct\_date indicates the Region is still considered active within the modeled historical hierarchy.  
* Region identity is historical rather than purely modern; records with the same name may exist for different periods or different parents.

*Relationships:*

* May belong to zero or one parent Region.  
* May contain zero or more child Regions.  
* Referenced by zero or more PostOffices.

---

### **Shape**

Editorial value table for the primary form assigned to a postal marking. This vocabulary is intentionally provisional: while many values describe base geometry, some preserved seed values reflect catalog terminology that may combine geometry, motif, or construction style.

*Fields:*

* code (nullable) \- An editor-assigned reference identifier.  
* name \- display name of the assigned form category.

*Seed values:*

* SL \- Straight Line  
* BOX \- Box  
* O \- Oval  
* C \- Circle  
* ARC \- Arc or Semi-circle  
* Octagon  
* Pictorial  
* Ornamental Mortised  
* Other

*Invariants:*

* name is unique across all Shapes.  
* Shape values are editorial assignment categories and are not guaranteed to be mutually exclusive in a strict taxonomic sense.

*Relationships:*

* Referenced by zero or more Postmarks, Ratemarks, and Auxmarks.

---

## **ER Diagram**

\`\`\`mermaid  
 erDiagram

 Cover {  
 int id PK  
 int color\_id FK  
 decimal width  
 decimal height  
 boolean has\_adhesive  
 string cover\_type  
 boolean is\_institutional  
 }

Postmark {    
    int id PK    
    string code  
    boolean is\_manuscript    
    int shape\_id FK    
    int lettering\_id FK    
    int color\_id FK    
    boolean is\_irreg  
    decimal width    
    decimal height    
    string date\_type    
    string date\_fmt  
    string catalog\_txt     
    string inscription\_txt     
    int post\_office\_id FK    
    string impression    
}

CoverPostmark {    
    int id PK    
    int cover\_id FK    
    int postmark\_id FK    
    boolean is\_backstamp    
}

PostmarkRatemark {    
    int id PK    
    int postmark\_id FK    
    int ratemark\_id FK    
    string placement\_type    
}

Shape {    
    int id PK    
    string code  
    string name    
}

Framing {    
    int id PK    
    string code  
    string name    
}

MarkFraming {    
    int id PK    
    string parent\_mark\_type    
    int parent\_mark\_id    
    int framing\_id FK    
    int framing\_pos    
}

Lettering {    
    int id PK    
    string name    
}

DateObserved {    
    int id PK    
    int postmark\_id FK    
    date date    
    string granularity    
}

PostmarkValuation {     
    int id PK    
    int postmark\_id FK    
    decimal amt    
    date appraisal\_date    
    int appraisal\_pos    
}

Ratemark {    
    int id PK    
    boolean is\_manuscript    
    int shape\_id FK    
    int lettering\_id FK    
    int color\_id FK    
    boolean is\_irreg    
    decimal width    
    decimal height    
    string inscription\_txt    
    decimal rate\_val  
    string impression    
}

Auxmark {    
    int id PK    
    string parent\_mark\_type    
    int parent\_mark\_id    
    boolean is\_manuscript    
    int shape\_id FK    
    int lettering\_id FK    
    int color\_id FK    
    decimal width    
    decimal height    
    boolean is\_irreg  
    string inscription\_txt    
    string impression    
}

Color {    
    int id PK    
    string name    
    string hex\_val    
    string pantone\_code    
}

ReferenceWork {    
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

Citation {    
    int id PK    
    int reference\_work\_id FK    
    string subject\_type    
    int subject\_id    
    string citation\_detail    
}

Region {     
    int id PK     
    string name     
    string abbrev  
    string region\_tier     
    int parent\_region\_id FK     
    date established\_date    
    date defunct\_date  
} 

PostOffice {     
    int id PK     
    string name     
    int region\_id FK     
}

Cover ||--o{ CoverPostmark : "has"    
Postmark ||--|{ CoverPostmark : "has"    
Postmark ||--o{ PostmarkRatemark : "has"    
Postmark ||--o{ PostmarkValuation : "has"    
Ratemark ||--|{ PostmarkRatemark : "has"    
Postmark ||--o{ DateObserved : "has"    
Postmark o|--o{ Auxmark : "has"    
Ratemark o|--o{ Auxmark : "has"    
Shape o|--o{ Postmark : "classifies"    
Shape o|--o{ Ratemark : "classifies"    
Shape o|--o{ Auxmark : "classifies"    
Lettering o|--o{ Postmark : "classifies"    
Lettering o|--o{ Ratemark : "classifies"    
Lettering o|--o{ Auxmark : "classifies"    
Framing ||--o{ MarkFraming : "applied via"    
Postmark o|--o{ MarkFraming : “has”    
Ratemark o|--o{ MarkFraming : “has”    
Auxmark o|--o{ MarkFraming : “has”    
Color o|--o{ Postmark : "colors"    
Color o|--o{ Ratemark : "colors"    
Color o|--o{ Auxmark : "colors"    
Color o|--o{ Cover : "colors"    
ReferenceWork ||--o{ Citation : "cited in"    
Cover o|--o{ Citation : "referenced by"    
Postmark o|--o{ Citation : "referenced by"    
Region o|--o{ Region : "contains"    
Region ||--o{ PostOffice : "contains"    
PostOffice ||--o{ Postmark : "operates"  

\`\`\`

