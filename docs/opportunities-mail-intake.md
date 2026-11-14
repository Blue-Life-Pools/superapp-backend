# Direct Microsoft 365 intake

Opportunities is stored in PostgreSQL. The CSV is the historical starting point; SharePoint and Power Automate are not involved in the direct intake. The existing legacy `/opportunities/automation` route remains key-protected for compatibility and can stay unused.

## What is read

The app reads `ximena.velosa@bluelifepools.com` using the existing Microsoft Graph application credentials and application `Mail.Read` permission. No email is sent, moved, marked as read or deleted. Only original QuickBooks messages from `quickbooks@notification.intuit.com` with subjects matching `Estimate <number> from BLUE LIFE POOL SERVICE` create intake records. Replies, forwards, approvals and invoices are excluded from new opportunities.

The parser extracts estimate number, explicitly named customer/property, grand total and line-item work descriptions. New opportunities are Pending. Their creation date is the received date in America/Bogota. Missing fields stay blank; an unidentified property, missing total or conflicting estimate numbers go to the review queue. No property is automatically created. CRM relationships require an unambiguous exact normalized name.

## Deduplication and edits

The mailbox and Graph immutable message ID identify a receipt. An existing unique estimate/property match is linked without changing any imported or manually edited fields. Multiple matching historical rows require review. Deleted opportunities are never restored. Each opportunity and receipt are written together in a transaction. An expiring database lease prevents concurrent scheduled and manual syncs. Page cursors persist after each completed page; subsequent runs resume remaining pages. A five-minute overlap catches delayed arrivals without duplicating receipts.

Initial scanning starts two days before the latest nonfuture creation date in the imported CSV, or seven days ago if there is no dated baseline. `OPPORTUNITIES_MAIL_START_DATE` can explicitly override the initial starting point before the first sync.

## Arrival-triggered execution

Microsoft Graph notifies `POST /opportunities/mail/notifications` when a new message is created in the mailbox. This is event-driven intake, not a 15-minute mailbox poll. The subscription requests immutable IDs and `created` changes. Metadata is checked first; unrelated email bodies are not downloaded.

The callback echoes Microsoft's URL-validation token as plain text without an app session. Real notifications must match the stored subscription ID, random clientState and tenant. Accepted events are written to OpportunityMailNotification before returning HTTP 202. The Vercel `waitUntil` integration processes persisted events after the response; ordinary email notifications fetch only the indicated message. Duplicate deliveries, worker interruptions and transient failures are safe to retry. Raw notification credentials are never returned in the UI.

Microsoft validates both notification and lifecycle endpoints before creating a subscription. The published callback must be public HTTPS. Until this validation succeeds the UI reports activation as pending, even if an old periodic worker previously ran. `OPPORTUNITIES_MAIL_WEBHOOK_URL` defaults to the production backend URL and may be set to the actual public callback before connecting. Never activate a subscription against an unpublished or preview endpoint.

Subscriptions expire, so `.github/workflows/opportunities-mail-sync.yml` performs hourly maintenance: renew the subscription and retry already-saved failed/interrupted notifications. This maintenance does not periodically scan incoming mail. A catch-up scan runs only on first activation or after a missed/removed-subscription event, using the existing durable scan cursor. A lifecycle reauthorization request renews the subscription directly.

See [Microsoft Graph webhook delivery](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks), [subscription lifetime](https://learn.microsoft.com/en-us/graph/api/resources/subscription) and [Vercel background execution](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).

The backend repository requires four encrypted GitHub Actions secrets:

- `OPPORTUNITIES_DATABASE_URL`
- `OPPORTUNITIES_MICROSOFT_TENANT_ID`
- `OPPORTUNITIES_MICROSOFT_CLIENT_ID`
- `OPPORTUNITIES_MICROSOFT_CLIENT_SECRET`

These are mapped to the existing server variable names only in the worker environment. Never commit their values or the customer CSV. Do not point this production worker at a preview database. Only a validated, unexpired Graph subscription makes the UI report live intake as active; a successful maintenance run alone does not.

Apply the additive mail-notifications migration and publish the backend before activating the connection with `node scripts/sync-opportunities-mail.cjs --apply --connect`. Running without `--apply` only reports connection state. Use `--apply --maintain` for renewal/retry maintenance. The former `--scheduled` polling mode is rejected. SetEnabled(false) pauses intake and removes its subscription without deleting opportunities. Failed removal is retried by maintenance.

## App controls

`Email intake` shows the trigger as When an email arrives, actual live-subscription state, last notification/processing time, intake counts and messages to review. `Sync now` remains an authenticated manual recovery control for the existing Commercial, Operations Director and Super Admin roles. Reviewers can link an email to a matching existing record or complete missing data using the ordinary opportunity editor. Credentials, raw email bodies and cursors are never returned through these endpoints.

OpportunityMailConnection stores the connection and subscription state; OpportunityMailNotification stores durable events; OpportunityEmailReceipt stores processed estimate evidence. Existing business tables and imported rows are retained. Monitor lastError and failed/expired notifications. This implementation neither modifies nor deletes the user's external Power Automate workflow or SharePoint list.
