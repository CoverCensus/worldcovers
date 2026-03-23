---

# WorldCovers **|** Design

---

**Summary**

*WorldCovers* is a software system, not a single utility.  This document defines four user roles spanning capability from unauthenticated browsing through to system maintenance and administration. Thirty-five stories describe the system's user-facing capabilities. Twenty-eight are mapped across ten features: authentication, collection administration, collection discovery, reference work management, personal collection management, audit trail, submission workflow, commentary, maintenance, and data pipeline. Seven additional stories are documented as backlog items for future iterations. The role model is cumulative \- each tier inherits the capabilities of those below it. Approval workflow is determined by collection type: personal collection entries publish directly, institutional collection entries require Editor review. Comments and submissions follow the same basic workflow. All submissions are logged as system transactions regardless of collection type.

## **Roles**

**R1** \- *Guest:* Unauthenticated user. Can browse and search collections.

**R2** \- *Contributor:* Authenticated user. Owns a personal collection, submits entries, edits, and comments on institutional collections. Inherits R1 capabilities.

**R3** \- *Editor:* Approves or denies submissions and comments on assigned institutional collections. Provides feedback on decisions. Manages reference works. Inherits R2 capabilities.

**R4** \- *Administrator:* Creates institutional collections, assigns Editors, performs system maintenance operations and data reporting. Inherits R3 capabilities.

## **Stories**

**S1** \- As a Guest, I want to browse collections, so that I can *explore postal marking and cover records without an account.*

**S2** \- As a Guest, I want to search across collections, so that I can *find specific postal markings or covers of interest.*

**S3** \- As a Contributor, I want to add entries to my personal collection, so that I can *catalog my own covers in the system.*

**S4** \- As a Contributor, I want to edit entries in my personal collection, so that I can *correct or improve my own records.*

**S5** \- As a Contributor, I want to submit new entries to an institutional collection, so that I can *contribute data for expert review.*

**S6** \- As a Contributor, I want to submit suggested edits to existing entries in an institutional collection, so that I can *propose corrections or additions for expert review.*

**S7** \- As a Contributor, I want to view the status of my submissions, so that I *know whether my contributions are pending, approved, or rejected.*

**S8** \- As an Editor, I want to view pending submissions on my assigned institutional collections, so that I can *review what needs attention.*

**S9** \- As an Editor, I want to approve or deny a submission, so that *institutional collection quality is maintained through expert review.*

**S10** \- As an Administrator, I want to create new institutional collections, so that *catalogs or regional datasets can be organized in the system.*

**S11** \- As an Administrator, I want to assign Editors to institutional collections, so that *subject-matter experts can curate the collections they're qualified for.*

**S12** \- As a Contributor, I want every submission to be logged as a system transaction, so that *there is an audit trail of all contributions.*

**S13** \- As an Editor, I want to view version history for any entry, so that *changes can be traced for scholarly accountability and recovery.*

**S14** \- As a Contributor, I want API responses in a structured, documented representation, so that *external systems can consume collection data reliably.*

**S15** \- As a Contributor, I want to authenticate with the system, so that *my identity is established for submissions and personal collection ownership.*

**S16** \- As an Editor, I want to add, edit, and remove reference works, so that contributors can *cite established catalogs and publications when documenting records.*

**S17** \- As an Editor, I want to provide feedback when approving or rejecting a submission, so that contributors *understand the reasoning and improve resubmissions.*

**S18** \- As a Contributor, I want to view Editor feedback on my submissions, so that I can *address issues and resubmit a contribution.*

**S19** \- As a Contributor, I want to submit comments on a record or collection, so that I can *contribute observations or corrections for expert review.*

**S20** \- As an Editor, I want to approve or deny submitted comments, so that *published commentary maintains the same quality standards as entry data.*

**S21** \- As an Administrator, I want to back up the system database through the application, so that I can *protect data without requiring infrastructure access.*

**S22** \- As an Administrator, I want to restore the system from a backup through the application, so that I can *recover from data issues without requiring infrastructure access.*

**S23** \- As an Administrator, I want to apply system updates through the application, so that I can *keep the platform current without requiring infrastructure access.*

**S24** \- As an Administrator, I want to invoke exploratory queries against catalog datasets, so that I can *assess data quality.*

**S25** \- As an Administrator, I want to analyze catalog data with statistical summarization, so that I can *identify normalization requirements across inconsistent source formats.*

**S26** \- As an Administrator, I want to convert catalog data from source formats into the system's target representation, so that *legacy and external catalog data can be prepared for import.*

**S27** \- As an Administrator, I want to import converted data into a running system, so that *prepared catalog records become available to users.*

**S28** \- As an Administrator, I want to bundle transformed data for export, so that *prepared datasets can be distributed or archived outside the system.*

### **Backlog Stories**

*The following stories are documented for future iterations. They are not mapped to Features and do not constrain the current design.*

**S29** \- As an Editor, I want to request revisions on a submission with specific feedback, so that *contributors can correct issues and resubmit without starting over.*

**S30** \- As an Editor, I want to approve multiple submissions in a single operation, so that *high-volume review periods can be processed efficiently.*

**S31** \- As an Editor, I want to filter and sort my submission queue by status, date, location, and contributor, so that I can *organize and prioritize my review work.*

**S32** \- As a Contributor, I want to configure which notifications I receive and by what method (email, text, in-app), so that I am *informed of submission decisions, feedback, and system events without unwanted interruption.*

**S33** \- As an Editor, I want to escalate a submission or contributor issue to an Administrator, so that *disputes, suspected fraud, or complex edge cases are resolved by the appropriate authority.*

**S34** \- As a Contributor, I want to apply and search by flexible tags on entries, so that *records can be classified and discovered beyond fixed catalog fields.*

**S35** \- As a Contributor, I want to rate submission quality, contributor and editor profiles, and comment helpfulness, so that *the community can identify high-quality contributions and trusted community participants.*

## **Technical Constraints:**

* **API-First Architecture:** The REST API is the system's primary interface. The provided frontend application is an API client with no privileged access. All capabilities available through the frontend are equally available to any API consumer authenticated with the appropriate role.  
* **Backend Server:** Python, Django, MySQL.   
* **Frontend Application:** TypeScript, React.   
* **Data Science Tooling:** Jupyter notebooks, not exposed through the application interface.

## **Features**

**F1** \- *Authentication* (S15): System identity establishment for interactive and API access.

**F2** \- *Collection Administration* (S10, S11): Institutional collection lifecycle and Editor assignment.

**F3** \- *Reference Work Management* (S16): Registry of citable sources available for citation linking.

**F4** \- *Collection Discovery* (S1, S2, S14): Browsing, searching, and structured data access across collections.

**F5** \- *Personal Collection Management* (S3, S4): Entry creation and editing within a Contributor's own collection.

**F6** \- *Audit Trail* (S12, S13): Submission transaction logging and version history viewing.

**F7** \- *Submission Workflow* (S5, S6, S7, S8, S9, S17, S18): Contributor entry submissions and Editor review cycle with feedback.

**F8** \- *Comment Workflow* (S19, S20): Contributor comments on records and collections, with Editor review.

**F9** \- *System Maintenance* (S21, S22, S23): Administrator-facing backup, restore, and update operations exposed through the application interface.

**F10** \- *Catalog Data Pipeline* (S24, S25, S26, S27, S28): Offline tooling for exploratory analysis, normalization, format conversion, and import/export of catalog datasets.

## **Story-to-Feature Reference Map**

| Story | Story Name | Feature | Feature Name |
| ----- | ----- | ----- | ----- |
| S1 | Browse collections | F4 | Collection Discovery |
| S2 | Search across collections | F4 | Collection Discovery |
| S3 | Add entries to personal collection | F5 | Personal Collection Management |
| S4 | Edit entries in personal collection | F5 | Personal Collection Management |
| S5 | Submit new entries to institutional collection | F7 | Submission Workflow |
| S6 | Submit suggested edits to institutional entries | F7 | Submission Workflow |
| S7 | View submission status | F7 | Submission Workflow |
| S8 | View pending submissions | F7 | Submission Workflow |
| S9 | Approve or reject a submission | F7 | Submission Workflow |
| S10 | Create institutional collections | F2 | Collection Administration |
| S11 | Assign Editors to institutional collections | F2 | Collection Administration |
| S12 | Log submissions as system transactions | F6 | Audit Trail |
| S13 | View version history for any entry | F6 | Audit Trail |
| S14 | Structured, documented API responses | F4 | Collection Discovery |
| S15 | Authenticate with the system | F1 | Authentication |
| S16 | Add, edit, and remove reference works | F3 | Reference Work Management |
| S17 | Provide feedback on submissions | F7 | Submission Workflow |
| S18 | View Editor feedback on submissions | F7 | Submission Workflow |
| S19 | Submit comments on a record or collection | F8 | Comment Workflow |
| S20 | Approve or reject submitted comments | F8 | Comment Workflow |
| S21 | Back up system database | F9 | System Maintenance |
| S22 | Restore system from backup | F9 | System Maintenance |
| S23 | Apply system updates | F9 | System Maintenance |
| S24 | Run exploratory queries against catalog datasets | F10 | Catalog Data Pipeline |
| S25 | Analyze catalog data with statistical summarization | F10 | Catalog Data Pipeline |
| S26 | Transform catalog data from source formats | F10 | Catalog Data Pipeline |
| S27 | Load transformed data into a running system | F10 | Catalog Data Pipeline |
| S28 | Bundle transformed data for export | F10 | Catalog Data Pipeline |
| S29 | Request revisions on a submission | – | Backlog |
| S30 | Bulk approve submissions | – | Backlog |
| S31 | Filter and sort submission queue | – | Backlog |
| S32 | Configure notification methods and triggers | – | Backlog |
| S33 | Escalate submission or contributor issue | – | Backlog |
| S34 | Apply and search by flexible tags | – | Backlog |
| S35 | Rate submissions, profiles, and comments | – | Backlog |

