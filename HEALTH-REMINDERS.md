# Health inspection email reminders

DISABLED: replaced at the user's request with in-platform traffic-light alerts in Upcoming inspections (red 0–2 days, yellow 3–5 days, green 6–10 days). Email endpoints and the Vercel cron have been removed. The code and audit table below are retained only for reference; the activation instructions below no longer apply to the active application.

Recipient and sender: service@bluelifepools.com. Messages and ticket labels are in English.
The Vercel production cron runs daily at 13:00 UTC (08:00 America/Bogota).
On Hobby plans the actual invocation can occur later within that hour.
No open browser or logged-in user is required.

## Activation

1. In the existing Microsoft Entra app, add Microsoft Graph **Application** permission **Mail.Send** and grant tenant administrator consent. Do not add Mail.ReadWrite.
2. In the Vercel **backend** project's Production environment, add **CRON_SECRET** with a cryptographically random value of at least 32 characters. Never use a user password or commit this value.
3. Redeploy the backend and verify its Cron Jobs page.
4. GET /health-department/reminders/status must show mailSendPermission and schedulerConfigured both true.
5. An administrator can invoke POST /health-department/reminders/run using their existing Health or Chemicals bearer token. This is a real run and sends eligible reminders, not a test preview.

Optional HEALTH_REMINDER_TIMEZONE defaults to America/Bogota.
Optional HEALTH_APP_URL defaults to the production frontend.

## Rules and reliability

- Use the assigned Inspection date (healthData Fecha de Inicio); fall back to visitDate only if that CSV field does not exist. An explicitly cleared inspection date never generates a reminder.
- Exclude closed, deleted, undated and past inspections.
- Reminders occur in the 10-, 5- and 1-day windows. If a run is delayed or a date is assigned late, send only the current window, not all missed reminders.
- A database unique key on ticket ID, inspection date and window prevents duplicates across concurrent/repeated invocations.
- Editing the inspection date creates a new reminder schedule. The worker checks the date/status again immediately before sending.
- ACCEPTED means Graph accepted the message, not guaranteed inbox delivery. Mailbox delivery rules still apply.
- Definite rejected submissions are FAILED and retryable. Timeouts, ambiguous responses, or interruption leave UNKNOWN/SUBMITTING and are NOT automatically resent, to avoid duplicate emails. Review Service's Sent Items before changing these records.
- The latest five comments and inspection details are included, with HTML escaped.
- No test messages are sent automatically during deployment.

Official references:
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
