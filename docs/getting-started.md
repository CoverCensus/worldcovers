# Getting Started -- A Guide for State Editors

This guide takes you from "I was asked to be a state editor" to "I am signed in and reviewing my
state's records." Follow it in order. It assumes no prior familiarity with the site.

If a term here is unfamiliar -- Marking, Townmark, Cover, Submission -- open the **Glossary** in
Help. This guide links to it rather than repeating it.

---

## The two sites, and why there are two

| Site | What it is | What you do there |
|---|---|---|
| **hellowoco.app** | The production site. | Request your login here. |
| **woco.dev** | The development site. Each new state lands here first. | Review your state here. |

Request your account on **hellowoco.app**. The project team copies approved accounts to
**woco.dev** for review work. This is a one-way operator task, not an instant sync.

> **Do not create an account directly on woco.dev.** It will not carry back to hellowoco.app, and
> later account copies can replace its settings. Start at hellowoco.app every time.

---

## Step 1 -- Request your login

1. Go to **https://hellowoco.app/auth** or click **Login** in the top navigation.
2. Below the sign-in form, find **New to the catalog?** and click the
   **Request a login** button. You do not need to fill in the sign-in form.
3. In **Request Login Access**, enter **First Name**, **Last Name**, and
   **Email**, then click **Submit Request**.
4. **Request submitted!** means the request was received. An editor must
   review it before you can sign in. There is no automatic confirmation email
   or automatic temporary password.
5. If you have not heard back within a week, contact the support email shown
   in the confirmation, or the person who invited you. Do not submit a second
   request for the same address.

If the site says your account is **waiting for approval**, wait for that
review or contact support. A password reset cannot approve the account.

---

## Step 2 -- Set your password and sign in

After your account is approved, follow any instructions the project team
sends you. If your active account has no password yet:

1. Return to **https://hellowoco.app/auth** and click **Forgot password?**.
2. Enter the email address used for your account and submit the form.
3. Open the reset link in the email. Choose and confirm a password with at
   least eight characters, including an uppercase letter, a lowercase letter,
   a number, and a special character such as `!`.
4. Return to the sign-in page and use your email and new password.

If the site says it **could not send the reset email**, contact the support
address shown in the message for help setting a password. Repeated requests
will not fix a mail service failure. If the site reports success but the
email does not arrive, check spam, then contact support. An expired or invalid
reset link needs a new reset request.

If you already have a working password, sign in with it. To change it later,
open the menu under your name and choose **Change password**. Enter your
current password, then the new password twice.

![The account menu open, listing Dashboard, Change password and Logout](/assets/guide/03-account-menu.png)

![The Change Password dialog with Current password, New password and Confirm new password fields](/assets/guide/04-change-password.png)

For state review, go to **https://woco.dev** after the project team has copied
your account there. Use the password from the most recent account copy. If
that password does not work, ask the team to sync the account again. Changing
your password on production does not update staging immediately.

---

## Step 3 -- Find your state

1. Click **Catalog** in the top navigation bar. (This is the search screen; it is labelled
   "Catalog".)
2. Use the search box -- it reads *Search records, citations...* -- and the filters beside it to
   narrow down to your state.

![The Catalog page: the Filters sidebar on the left, and marking results listed on the right](/assets/guide/05-catalog-search.png)

3. Results are Markings: **Townmarks** (the town's own postmark), **Ratemarks** (the postage rate),
   and **Auxmarks** (instructional markings such as PAID, FREE, MISSENT).
4. To start over, clear the filters and search again.

---

## Step 4 -- Read a record

Click any result to open its record page.

![A record detail page showing the marking image alongside the Marking Details panel: type, state, town, dates, colour and catalog code](/assets/guide/06-record-detail.png)

What you are looking at:

- **Inscription Text** -- what is actually struck or written on the marking, abbreviations and all.
- **Color** -- the ink color. Blank is legitimate when the source catalog never stated one.
- **Dates** -- the earliest and latest dates recorded.
- **Shape, dimensions, lettering** -- the physical description of the handstamp. A manuscript
  marking (written by hand) has no shape.
- **Associated Covers** -- the actual covers recorded as bearing this marking.

---

## Step 5 -- Your actual job: review and confirm

Every state's printed catalog used slightly different formats and notation, so an automated import
is never perfect. Your eye for your own state catches what the software cannot. That is the whole
reason you are here.

### Marking a record as reviewed

On a record page, editors see a checkbox labelled **Reviewed / confirmed**. Tick it once you are
satisfied that the record is right.

![The "Reviewed / confirmed" checkbox on a record, unticked](/assets/guide/07-reviewed-checkbox.png)

### Seeing what is left

On the **Catalog** screen, editors get an extra filter called **Review Status**, with three
settings: **All (Default)**, **Reviewed**, and **Unreviewed**.

Set it to **Unreviewed** and you get exactly the records you have not yet worked through. This is
how you get through a whole state methodically instead of losing your place.

![The Review Status filter open, offering All (Default), Reviewed and Unreviewed](/assets/guide/08-review-status-filter.png)

### The one convention that surprises everybody

When a catalog line lists several colors at once -- say `PAID 5 -- red, blue, green` -- the import
creates **a separate listing for each color**. It has to, because it cannot know which ones are
real.

So if that marking only ever existed in red, you will find three listings where there should be
one. **Deleting the two that never existed is part of the job**, not a bug to report. The same
applies wherever one catalog line has been expanded into several records.

### What to do with errors you cannot fix yourself

Write them down and send them to the project team. If the errors are widespread, the state gets
re-run through the import with fixes rather than being corrected by hand. Once you judge the
remaining margin of error acceptable, you approve the state, and the data is moved to
hellowoco.app for final cleanup.

---

## Step 6 -- Adding to the catalog

Beyond reviewing, you can add to the catalog. Use **Submit New Marking** for a marking the catalog
does not have, and **Submit Edit to Existing Marking** to correct one that it does.

![The "Submit Edit to Existing Marking" button in a record's Marking Details header](/assets/guide/09-submit-edit-button.png)

To record an actual cover bearing a marking, use **Submit New Cover** from that marking's record.

![The Submit New Cover form: Type and Date fields, the Cover images upload area, and the Institutionally Owned, Backstamp and submitter-name checkboxes below it](/assets/guide/10-submit-cover-form.png)

On the cover form, three checkboxes matter:

- **Institutionally Owned** -- tick if a museum, society, or archive holds the cover, rather than a
  private collector.
- **Backstamp** -- tick if the marking is on the reverse of the cover.
- **Would you like your name to display as the submitter?** -- tick this and your name is shown,
  publicly and permanently, alongside the cover you contributed. Leave it unticked to stay
  anonymous. It is entirely your choice.

**New submissions require an image.** Data already in the catalog and past submissions are taken
as given, but everything submitted from here on needs a picture as proof.

You can **Save Draft** and come back to it. When you submit, you will see **Submission received**,
and the entry goes into the review queue rather than straight into the catalog.

Everything you have submitted is listed under **Dashboard** in the menu under your name.

![The Dashboard's My Submissions tab showing a submission with a Draft badge and an Edit Draft button](/assets/guide/11-dashboard.png)

---

## If something goes wrong

- **"Request a login" did nothing.** It opens a window on the same page. If nothing appeared, scroll
  up.
- **Waiting for approval.** An editor must approve the account. Resetting the password will not
  change that status. Follow up after a week if you have not heard back.
- **Account deactivated.** Contact the support address in the message to request restored access.
- **Account has no password.** Once it is active, use **Forgot password?** to set one.
- **Reset email could not be sent.** Contact support for help; repeated requests will not fix the
  mail service. If a successful request produces no email, check spam and then contact support.
- **Signed in on hellowoco.app but not woco.dev.** Ask the project team to copy your current
  account to staging. Do not create a second account on woco.dev.
- **A search for your state returns nothing.** Not every state is loaded on every site yet. States
  land on woco.dev first.
- **You cannot see the Reviewed / confirmed checkbox.** It is shown only to editors, and only for
  the states you are responsible for.

The system is in beta. Bugs and rough edges are expected, and reports of them are welcome -- that is
what this stage is for.
