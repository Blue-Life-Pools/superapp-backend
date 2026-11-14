# Direct Microsoft 365 intake

Opportunities is stored in PostgreSQL. The CSV is the historical starting point; SharePoint and Power Automate are not involved in the direct intake. The existing legacy `/opportunities/automation` route remains key-protected for compatibility and can stay unused.

## What is read

The app reads `ximena.velosa@bluelifepools.com` using the existing Microsoft Graph application credentials and application `Mail.Read` permission. No email is sent, moved, marked as read or deleted. Only original QuickBooks messages from `quickbooks@notification.intuit.com` with subjects matching `Estimate <number> from BLUE LIFE POOL SERVICE` create intake records. Replies, forwards, approvals and invoices are excluded from new opportunities.

The parser extracts estimate number, explicitly named customer/property, grand total and line-item work descriptions. New opportunities are Pending. Their creation date is the received date in America/Bogota. Missing fields stay blank; an unidentified property, missing total or conflicting estimate numbers go to the review queue. No property is automatically created. CRM relationships require an unambiguous exact normalized name.

## Deduplication and edits

The mailbox and Graph immutable message ID identify a receipt. An existing unique estimate/property match is linked without changing any imported or manually edited fields. Multiple matching historical rows require review. Deleted opportunities are never restored. Each opportunity and receipt are written together in a transaction. An expiring database lease prevents concurrent scheduled and manual syncs. Page cursors persist after each completed page; subsequent runs resume remaining pages. A five-minute overlap catches delayed arrivals without duplicating receipts.

Initial scanning starts two days before the latest nonfuture creation date in the imported CSV, or seven days ago if there is no dated baseline. `OPPORTUNITIES_MAIL_START_DATE` can explicitly override the initial starting point before the first sync.

## Automatic execution

`.github/workflows/opportunities-mail-sync.yml` runs the same backend service every 15 minutes and through workflow_dispatch. GitHub schedules can be delayed. It does not depend on an open browser or an in-process timer in a Vercel function. It runs no migrations and logs only aggregate counts or a sanitized error.

The backend repository requires four encrypted GitHub Actions secrets:

- `OPPORTUNITIES_DATABASE_URL`
- `OPPORTUNITIES_MICROSOFT_TENANT_ID`
- `OPPORTUNITIES_MICROSOFT_CLIENT_ID`
- `OPPORTUNITIES_MICROSOFT_CLIENT_SECRET`

These are mapped to the existing server variable names only in the worker environment. Never commit their values or the customer CSV. Do not point this production worker at a preview database. A workflow must complete successfully before the UI reports automatic intake as active.

After applying the additive migration, the initial authorized connection can be made with `node scripts/sync-opportunities-mail.cjs --apply --connect`. Running without `--apply` only reports connection state. Use `--apply --scheduled` in the scheduled worker. SetEnabled(false) in the app pauses subsequent automatic checks without deleting records.

## App controls

`Email intake` shows connection state, last manual/scheduled check, intake counts and messages to review. `Sync now` is authenticated and available to the existing Commercial, Operations Director and Super Admin roles. Reviewers can link an email to a matching existing record or complete missing data using the ordinary opportunity editor. Credentials, raw email bodies and cursors are never returned through these endpoints.

The two new tables are OpportunityMailConnection and OpportunityEmailReceipt; existing business tables and imported rows are retained. Monitor failed GitHub Actions runs and lastError in the intake dialog. Do not turn off a user's existing Power Automate workflow until the direct intake has been verified; this implementation neither modifies nor deletes that workflow.
