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

## Install

Needs Umbraco CMS 17.1 through 18.x, and a public site already collecting analytics with Vercel or Plausible. Plausible Cloud serves the Stats API on Business plans only.

```sh
dotnet add package TheBuilder.WebAnalytics
```

Services and backoffice extensions register themselves, so there is nothing else to wire up.

## Set up a connection

1. Put a read-only provider credential in server-side configuration, as either `WebAnalytics__Providers__Vercel__AccessToken` or `WebAnalytics__Providers__Plausible__AccessToken`. Use environment variables, .NET user secrets, or your host's secret store. Never `appsettings.json`.
2. Restart the application so it picks up the credential.
3. As an administrator, open **Settings → Web Analytics** and add a connection. Enter your Vercel project ID (`prj_...`) or your Plausible site ID.
4. Select **Test connection**, then open the **Analytics** section.

To give editors page-level reports as well, map a document root in the connection's **Page analytics** settings.

## Documentation

[web-analytics.thebuilder.dk](https://web-analytics.thebuilder.dk/) has the full quickstart, a guide to reading the reports, the configuration reference, and troubleshooting.
