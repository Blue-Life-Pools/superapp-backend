# Opportunities intake

The current integration reads Microsoft 365 directly. Use [Direct Microsoft 365 intake](opportunities-mail-intake.md) for setup and operation. The Power Automate instructions below document only the optional legacy endpoint.

The Opportunities table retains all 22 columns from the starting CSV. Input customer files are not committed. Commercial users can read, create, edit, import and export opportunities. Only Super Admin and Operations Director can delete; deletion is soft.

## Initial CSV

1. Apply the reviewed `20261113190000_add_opportunities` migration against the CRM database.
2. Run `node scripts/import-opportunities.cjs "<local CSV path>" --check-database` to validate and inspect the import plan.
3. Run the same command with `--apply` to insert the rows atomically. The panel's **Import CSV** action uses the same parser.

Exact source rows have content-based identifiers. Importing the same rows again skips them; existing edits are not overwritten. Repeated estimate numbers and repeated identical rows within one source are retained as separate records. Existing properties are linked only when the registered name match is unambiguous. Missing values stay null. Original source text and formatting remain in backend audit metadata. The initial invoice column mixes US amounts with dot-grouped thousands; `1.610` becomes `1610`, and `6.288.50` becomes `6288.50`.

## Existing Power Automate flow

The CRM does not send emails or modify the existing flow. After confirming whether the existing destination is SharePoint, Lists or Excel, connect the flow's extracted data to the authenticated intake endpoint (or use that destination's stable row ID as `externalId`).

- Set a long random `OPPORTUNITIES_INGEST_KEY` in the backend deployment environment and store the same value securely in Power Automate. Never expose it in the frontend.
- Add an HTTP POST action to `<CRM_API_URL>/opportunities/automation` after the existing extraction step.
- Headers: `Content-Type: application/json` and `x-opportunities-key: <configured secret>`.
- Use a stable Outlook message ID or source row ID for `externalId`. A retry with the same ID updates the same opportunity. Do not use the estimate number as the external ID: the starting file contains legitimate repeated estimate numbers.
- Use the Outlook trigger's **Received time**, not `utcNow()`, for `receivedAt`. The displayed creation date is derived from it in the app's Colombia timezone. Imported historical dates are retained as provided by the CSV.

```json
{
  "externalId": "example-outlook-message-id",
  "mailbox": "ximena.velosa@bluelifepools.com",
  "receivedAt": "2026-11-13T14:25:00Z",
  "propertyName": "Example property",
  "estimateNumber": "7200",
  "estimateAmount": "1250.50",
  "name": "Description extracted from the estimate",
  "status": "Pending",
  "categories": ["Filter"]
}
```

The 22 English field names are defined in `OpportunityInputDto`; all fields other than the property are optional for manual entries. Automatic intake additionally requires mailbox, external ID, receipt timestamp and estimate number. Dates use `YYYY-MM-DD`, amounts are strings, and Skimmer is boolean or null. Invalid credentials, a different mailbox or missing intake configuration cannot write records. No connection is claimed until an actual automated record has arrived.

Table pagination applies only to displayed rows. Counts and CSV exports always use the complete filtered dataset. CSV export includes all 22 business columns regardless of selected display columns.
