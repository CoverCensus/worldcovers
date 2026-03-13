---

# WorldCovers **|** Model

---

## **Summary**

This document defines the structural vocabulary for data accessible through WorldCovers. Seventeen types describe the philatelic domain's persistent state. Postmark is the central entity \- the catalog entry itself \- with town marking attributes modeled directly on it rather than as a separate type. Each Postmark carries the authoritative catalog text, the physical inscription of the town marking, and a reference to a PostOffice within a time-bounded Region hierarchy. Marking classification is currently represented through three primary editorial dimensions: Shape, Framing, and Lettering. Framing is simply treated as a per-line border description. Shape and Lettering remain provisional editorial vocabularies: their current seed values preserve catalog usage patterns and known inconsistencies, and therefore do not yet constitute a fully orthogonal or exhaustively normalized taxonomy. Three junction types resolve many-to-many relationships: CoverPostmark links Covers to Postmarks, PostmarkRatemark links Postmarks to Ratemarks, and MarkFraming supports the multi-valued, position-qualified framing vocabulary on any marking type.

## **Domain Types**

---

### **Auxmark**

An auxiliary or instructional marking (e.g., PAID, FREE) associated with a specific Postmark or Ratemark. Classified by the same Shape/Lettering/Framing/Impression/isIrregular categories as Postmark and Ratemark.

*Fields:*

* id  
* colorId (nullable) \- Ink color of this marking.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscriptionText \- Text as physically inscribed on the auxiliary marking.  
* isIrregular (nullable) \- Whether the handstamp outline is non-uniform.  
* isManuscript \- Whether this is a handwritten auxiliary marking rather than a handstamped device.  
* letteringId (nullable) \- Typeface style observed on the handstamp.  
* parentMarkId \- Identifier of the marking this auxmark is associated with.  
* parentMarkType \- Type of the marking this auxmark is associated with.  
* shapeId (nullable) \- Base geometric outline of the handstamp device.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* parentMarkType is one of: Postmark, Ratemark.  
* parentMarkId references exactly one resource of the type specified by parentMarkType.  
* If isManuscript is true, letteringId must be null.  
* If isManuscript is true, shapeId must be null.  
* If isManuscript is false, shapeId is required and references exactly one Shape.  
* letteringId, if set, references exactly one Lettering.  
* colorId, if set, references exactly one Color.  
* If isManuscript is true, isIrregular must be null.  
* If isManuscript is false, isIrregular is required.  
* width and height are decimals in millimeters.  
* inscriptionText is the text as it appears on the physical auxiliary marking  
* impression, if set, is one of: Normal, Stencil, Negative.  
* If isManuscript is true, impression must be null.  
* If isManuscript is false, impression is required.

*Relationships:*

* Belongs to exactly one Postmark or Ratemark, as specified by parentMarkType.  
* Has zero or more Framings (via MarkFraming).  
* References zero or one Shape.  
* References zero or one Lettering.  
* References zero or one Color.

---

### **Citation**

Links a ReferenceWork to a Cover or Postmark.

*Fields:*

* id  
* citationDetail \- Specific location within the reference work (e.g., page number, section, plate).  
* referenceWorkId  
* subjectId \- Identifier of the cited resource.  
* subjectType \- Type of the cited resource.

*Invariants:*

* referenceWorkId references exactly one ReferenceWork.  
* subjectType is one of: Cover, Postmark.  
* subjectId references exactly one resource of the type specified by subjectType.

*Relationships:*

* References exactly one ReferenceWork.  
* Targets exactly one Cover or Postmark.

---

### **Color**

Value table of ink or cover material colors

*Fields:*

* id  
* hexValue (nullable) \- Hexadecimal color code for display rendering.  
* name \- Display name of the color.  
* pantoneCode (nullable) \- Pantone reference code for precise color matching.

*Invariants:*

* name is unique across all Colors.

*Relationships:*

* Referenced by zero or more Postmarks, Ratemarks, Auxmarks, and Covers.

---

### **Cover**

A physical postal cover with recorded postal markings.

*Fields:*

* id \- Unique identifier.  
* colorId (nullable) \- Ink or material color of the cover itself.  
* coverType (nullable) \- Physical form of the postal cover.  
* hasAdhesive \- Whether the cover bears an adhesive postage stamp alongside stampless markings.  
* height (nullable) \- Vertical dimension of the cover.  
* isInstitutional (nullable) \- Whether the cover is institutionally owned (museum, society, etc.).  
* width (nullable) \- Horizontal dimension of the cover.

*Invariants:*

* colorId, if set, references exactly one Color.  
* width and height are decimals in millimeters.  
* hasAdhesive defaults to false.  
* coverType, if set, is one of: FC (Folded Cover), FL (Folded Letter).

*Relationships:*

* Associated with zero or more Postmarks (via CoverPostmark).  
* References zero or one Color.  
* Referenced by zero or more Citations.

---

### **CoverPostmark**

Junction linking a Cover to a Postmark.

*Fields:*

* id  
* coverId  
* isBackstamp \- Whether this marking appears on the reverse of the cover.  
* postmarkId

*Invariants:*

* coverId references exactly one Cover.  
* postmarkId references exactly one Postmark.  
* The combination of coverId and postmarkId is unique.  
* A Postmark with no associated CoverPostmark is considered to be undefined.

*Relationships:*

* References exactly one Cover.  
* References exactly one Postmark.

---

### **DateObserved**

A single date point observed for a Postmark.

*Fields:*

* id  
* date \- Calendar date of the observed use.  
* granularity \- Granularity of the recorded date.  
* postmarkId

*Invariants:*

* Belongs to exactly one Postmark.  
* granularity is one of: DAY, MONTH, YEAR.  
* If granularity is MONTH, the day component of date is synthetic (set to 01).  
* If granularity is YEAR, the month and day components of date are synthetic (set to 01).

*Relationships:*

* References exactly one Postmark.

---

### **Framing**

Value table of border treatment descriptors. A marking may have zero or more Framings applied simultaneously.

*Fields:*

* id  
* name \- display name of the border

*Seed values:*

* NOR \- No Outer Rim  
* Single Line  
* Double Line  
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

* id  
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

* id  
* framingId  
* framingPosition (nullable) \- Ordinal border position occupied by this framing on the marking, counted from the outside inward.  
* parentMarkId \- Identifier of the marking this framing applies to.  
* parentMarkType \- Type of the marking this framing applies to.

*Invariants:*

* parentMarkType is one of: Postmark, Ratemark, Auxmark.  
* parentMarkId references exactly one resource of the type specified by parentMarkType.  
* framingId references exactly one Framing.  
* The combination of parentMarkType, parentMarkId, and framingId is unique.  
* framingPosition, if set, is a positive integer.  
* framingPosition 1 represents the outermost border.  
* If multiple MarkFramings exist for the same parent marking and framingPosition is populated, framingPosition values must be unique within that parent marking.  
* A null framingPosition means the framing is known to apply but its exact border order is unknown or not relevant.

*Relationships:*

* References exactly one Framing.  
* References exactly one Postmark, Ratemark, or Auxmark.

---

### **Postmark**

A town marking device (or manuscript marking) as observed on one or more Covers.

*Fields:*

* id  
* catalogText \- Authoritative catalog entry text for this listing.  
* colorId (nullable) \- Ink color of this marking.  
* dateFormat (nullable) \- Arrangement of date components inscribed on the device.  
* dateType (nullable) \- Named date convention used in this marking.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscriptionText \- Text as physically inscribed on the town marking device.  
* isIrregular (nullable) \- Whether the handstamp outline is non-uniform.  
* isManuscript \- Whether this is a handwritten marking rather than a handstamped device.  
* letteringId (nullable) \- Typeface style observed on the handstamp.  
* postOfficeId \- Post office that produced this marking.  
* shapeId (nullable) \- Base geometric outline of the handstamp device.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* If isManuscript is true, letteringId must be null.  
* If isManuscript is true, shapeId must be null.  
* If isManuscript is false, shapeId is required and references exactly one Shape.  
* letteringId, if set, references exactly one Lettering.  
* colorId, if set, references exactly one Color.  
* If isManuscript is true, isIrregular must be null.  
* If isManuscript is false, isIrregular is required.  
* width and height are decimals in millimeters.  
* dateType, if set, is one of: Bishop Mark, Franklin Mark, Quaker Date.  
* dateFormat, if set, is one of: MD, MDD, YD, YMD, YMDD.  
* Must be referenced by at least one CoverPostmark.  
* catalogText is the authoritative ASCC catalog entry text for this listing.  
* inscriptionText is the text as it appears on the physical town marking device.  
* postOfficeId references exactly one PostOffice.  
* impression, if set, is one of: Normal, Stencil, Negative.  
* If isManuscript is true, impression must be null.  
* If isManuscript is false, impression is required.

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

* id  
* placementType (nullable) \- Positional relationship of the rate marking to the associated townmark device.  
* postmarkId  
* ratemarkId

*Invariants:*

* postmarkId references exactly one Postmark.  
* ratemarkId references exactly one Ratemark.  
* The combination of postmarkId and ratemarkId is unique.  
* placementType, if set, qualifies the relationship between the rate marking and the townmark device:  
  * ATTACHED\_FRAME means the rate marking is integral to the townmark frame  
  * WITHIN\_FRAME means the rate appears within the townmark frame but is not integral to it  
  * SEPARATE\_STRIKE means the rate is struck separately from the townmark

*Relationships:*

* References exactly one Postmark.  
* References exactly one Ratemark.

---

### **PostmarkValuation**

An estimated collector market value for a Postmark, as published in a reference source.

*Fields:*

* id  
* amount (nullable) \- Estimated collector market value.  
* appraisalDate \- Date of the valuation source.  
* appraisalPosition \- Ordinal position within the postmark's valuation sequence.  
* postmarkId

*Invariants:*

* postmarkId references exactly one Postmark.  
* amount, if set, is a non-negative decimal in USD cents.  
* appraisalDate is the date (or nominal date) of the valuation source.  
* appraisalPosition is unique within a postmarkId grouping.  
* appraisalPosition 1 represents the earliest observed date period, while a NULL amount indicates an unpriced entry in the source data.

*Relationships:*

* Belongs to exactly one Postmark.

---

### **PostOffice**

A postal facility that operated within a specific Region.

*Fields:*

* id  
* name \- Normalized town name used for filtering and grouping.  
* regionId \- Jurisdiction containing this post office.

*Invariants:*

* name is the normalized town name (e.g., Abingdon, Richmond).  
* regionId references exactly one Region.  
* The combination of name and regionId is unique.

*Relationships:*

* Belongs to exactly one Region.  
* Referenced by zero or more Postmarks.

---

### **Ratemark**

A postal rate marking device or manuscript rate marking. Classified by the same Shape/Lettering/Framing/Impression/isIrregular categories as Postmark.

*Fields:*

* id  
* colorId (nullable) \- Ink color of this marking.  
* height (nullable) \- Vertical dimension of the marking impression.  
* impression (nullable) \- Printing technique of the handstamp device.  
* inscriptionText \- Text as physically inscribed on the rate marking.  
* isIrregular (nullable) \- Whether the handstamp outline is non-uniform.  
* isManuscript \- Whether this is a handwritten rate marking rather than a handstamped device.  
* letteringId (nullable) \- Typeface style observed on the handstamp.  
* rateValue (nullable) \- Numeric postal rate amount.  
* shapeId (nullable) \- Base geometric outline of the handstamp device.  
* width (nullable) \- Horizontal dimension of the marking impression.

*Invariants:*

* If isManuscript is true, letteringId must be null.  
* If isManuscript is true, shapeId must be null.  
* If isManuscript is false, shapeId is required and references exactly one Shape.  
* letteringId, if set, references exactly one Lettering.  
* colorId, if set, references exactly one Color.  
* If isManuscript is true, isIrregular must be null.  
* If isManuscript is false, isIrregular is required.  
* width and height are decimals in millimeters.  
* Must be referenced by at least one PostmarkRatemark.  
* inscriptionText is the text as it appears on the physical rate marking.  
* rateValue, if set, is a non-negative decimal representing the rate amount in cents.  
* impression, if set, is one of: Normal, Stencil, Negative.  
* If isManuscript is true, impression must be null.  
* If isManuscript is false, impression is required.

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

* id  
* authors \- Author or authors of the publication.  
* isbn (nullable) \- International Standard Book Number.  
* publicationYear \- Year of publication.  
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

* id  
* effectiveFrom (nullable) \- First date on which this Region definition is considered in force.  
* effectiveTo (nullable) \- Last date on which this Region definition is considered in force.  
* name \- Canonical region name for the applicable historical period.  
* parentRegionId (nullable) \- Immediate containing Region in the hierarchy.  
* regionTier \- Administrative level of this region.

*Invariants:*

* regionTier is one of: COUNTRY, TERRITORY, STATE, PROVINCE, COUNTY, CITY, DISTRICT, OTHER.  
* parentRegionId, if set, references exactly one Region.  
* A Region cannot parent itself.  
* If both effectiveFrom and effectiveTo are set, effectiveFrom must be less than or equal to effectiveTo.  
* A Region with a non-null effectiveTo is considered defunct. A null effectiveTo indicates the Region is still considered active within the modeled historical hierarchy.  
* Region identity is historical rather than purely modern; records with the same name may exist for different periods or different parents.

*Relationships:*

* May belong to zero or one parent Region.  
* May contain zero or more child Regions.  
* Referenced by zero or more PostOffices.

---

### **Shape**

Editorial value table for the primary form assigned to a postal marking. This vocabulary is intentionally provisional: while many values describe base geometry, some preserved seed values reflect catalog terminology that may combine geometry, motif, or construction style.

*Fields:*

* id  
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
 int colorId FK  
 decimal width  
 decimal height  
 boolean hasAdhesive  
 string coverType  
 boolean isInstitutional  
 }

Postmark {    
    int id PK    
    boolean isManuscript    
    int shapeId FK    
    int letteringId FK    
    int colorId FK    
    boolean isIrregular    
    decimal width    
    decimal height    
    string dateType    
    string dateFormat    
    string catalogText     
    string inscriptionText     
    int postOfficeId FK    
    string impression    
}

CoverPostmark {    
    int id PK    
    int coverId FK    
    int postmarkId FK    
    boolean isBackstamp    
}

PostmarkRatemark {    
    int id PK    
    int postmarkId FK    
    int ratemarkId FK    
    string placementType    
}

Shape {    
    int id PK    
    string name    
}

Framing {    
    int id PK    
    string name    
}

MarkFraming {    
    int id PK    
    string parentMarkType    
    int parentMarkId    
    int framingId FK    
    int framingPosition    
}

Lettering {    
    int id PK    
    string name    
}

DateObserved {    
    int id PK    
    int postmarkId FK    
    date date    
    string granularity    
}

PostmarkValuation {     
    int id PK    
    int postmarkId FK    
    decimal amount    
    date appraisalDate    
    int appraisalPosition    
}

Ratemark {    
    int id PK    
    boolean isManuscript    
    int shapeId FK    
    int letteringId FK    
    int colorId FK    
    boolean isIrregular    
    decimal width    
    decimal height    
    string inscriptionText    
    decimal rateValue    
    string impression    
}

Auxmark {    
    int id PK    
    string parentMarkType    
    int parentMarkId    
    boolean isManuscript    
    int shapeId FK    
    int letteringId FK    
    int colorId FK    
    decimal width    
    decimal height    
    boolean isIrregular    
    string inscriptionText    
    string impression    
}

Color {    
    int id PK    
    string name    
    string hexValue    
    string pantoneCode    
}

ReferenceWork {    
    int id PK    
    string title    
    string authors    
    string publisher    
    int publicationYear    
    string isbn    
    string url    
}

Citation {    
    int id PK    
    int referenceWorkId FK    
    string subjectType    
    int subjectId    
    string citationDetail    
}

Region {     
    int id PK     
    string name     
    string regionTier     
    int parentRegionId FK     
    date effectiveTo    
    date effectiveFrom    
} 

PostOffice {     
    int id PK     
    string name     
    int regionId FK     
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

**![][image1]**

[image1]: <data:image/png;base64,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>