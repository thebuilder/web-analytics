![Web Analytics overview in the Umbraco backoffice](https://raw.githubusercontent.com/thebuilder/web-analytics/refs/heads/main/apps/docs/docs/screenshots/analytics-overview.png)

Web Analytics reads the traffic your site already sends to [Vercel Web Analytics](https://vercel.com/docs/analytics) or [Plausible](https://plausible.io/docs/stats-api) and reports it inside the Umbraco backoffice. It adds no tracking to your public site.

## What it does

- The Analytics section reports visitors, page views, and traffic history, broken down by page, referrer, campaign, country, device, browser, and operating system.
- Every metric shows how it moved against the period before it. Click any breakdown row to filter the whole dashboard by it.
- Published documents get their own Analytics view, filtered to that document's route, so an editor can check one page without opening another tool.
- One Umbraco installation can hold several Vercel projects and Plausible sites at once.
- The backoffice hides panels a provider cannot fill, so a missing capability never looks like a broken connection.
- Provider tokens stay in server-side configuration. They are never stored in Umbraco and never sent to the browser.

Document reports follow Umbraco's existing Content permissions, so an editor who can browse a page can read its analytics without being granted the global Analytics section.

Start with the [installation and configuration guide](https://web-analytics.thebuilder.dk/).
