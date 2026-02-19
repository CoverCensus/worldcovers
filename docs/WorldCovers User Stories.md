# **User Stories of the WorldCovers Project**

Summary  
**WorldCovers** is a project to create a free, open, collaborative database for global postal markings and covers. The goal of the WorldCovers System is to develop a scalable web application that digitizes, normalizes, and organizes postal marking data. This system will enable contributors to submit entries, managers to review and approve submissions through a ticketing workflow, and users to browse or query the catalog with search and filtering tools. This document outlines the User Stories for the WorldCovers System. It defines the goals and functional needs of each stakeholder in this project, and describes how they interact with the platform. By documenting each stakeholder’s goals and interactions, this document supports a user-focused approach to system development and quality assurance. 

Stakeholders

1. **Contributors:** Individuals who submit and digitize postal markings and covers.  
2. **Users:** General visitors or philatelists who want to browse, search, and learn from the database.  
3. **Managers:** State appointed individuals who review, validate, and approve contributor submissions.  
4. **Administrators:** System maintainers responsible for managing permissions, technical operations, and overall platform stability and security.

Contributors

* As a contributor, I want each of my submissions to create a unique, trackable ticket that logs submission metadata, so that I am ensured that it isn’t lost or overlooked in the queue.  
* As a contributor, I want a status update on my submission either via email or in-app alerts, so that I’m aware if it’s still pending or has been approved or rejected.  
* As a contributor, I want to digitize my physical postal marking collection, so that I can share my collection with others.  
* As a contributor, I want to get accredited for my postal marking submission, so that I obtain recognition within the philatelist community.  
* As a contributor, I want to have similar submissions appear while I create my ticket, so I can compare my postal marking to any pre-documented markings.

Users

* As a user, I want the system interface to be intuitive, responsive, and accessible, so that users with varying physical abilities can navigate, search, and interact with the platform without difficulty.  
  * E.g. mobile support, text alternatives, keyboard navigability, perceivable text  
* As a user, I want the ability to create a unique user ID when registering on the WorldCovers web application, so that my contributions and interactions are  properly attributed to me.  
* As a user, I want a structured FAQ section with categorized topics, including links or videos of tutorials, examples, and common issues.  
* As a user, I want a contact form or direct messaging system that allows me to send questions to managers.  
* As a user, I want to be able to use filters in the search menu, so that I can narrow down the type of entries I’m looking for.  
  * Filter by region, time period, stamp type, postal marking type. Should also allow sorting by relevance, date, or alphabetized.  
* As a user, I want the ability to print postal marking submissions directly from the website, so I can create physical records for reference or display purposes.  
  * Users should have the option to select individual entries or ranges of entries, and the output should be compatible with standard printers or in PDF format.

Managers

* As a manager, I want to have a ticketing system for submissions, so that there aren’t any missing or unseen submissions.  
* As a manager, I want the system to enforce submission quality standards, such as mandatory metadata fields and minimum image resolution.  
  * System should reject any incomplete submissions if required fields aren’t filled out.  
* As a manager, I want the ability to message contributors regarding their ticket submissions, so I can clarify information.  
  * Direct messaging system and ability to email the contributor. 

Administrators

* As an administrator, I want to manage user roles and permissions, so users, managers, and contributors can only access features that are relevant to their roles.  
* As an administrator, I want to manage the image processing and storage system, so that contributors’ digitalized postal marking scans are handled efficiently.  
* As an administrator, I want to update or rollback database schemas safely, so I can maintain user submissions and system features.  
* As an administrator, I want to deploy updates with minimum downtime, so users can continue using the system with minimal disruptions.   
* As an administrator, I want to obtain and review system logs, so I can keep track of issues and security threats. 