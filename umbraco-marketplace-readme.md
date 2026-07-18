# Web Analytics

> [Vercel Web Analytics](https://vercel.com/docs/analytics) inside the Umbraco backoffice.

**Web Analytics brings Vercel Web Analytics into the Umbraco backoffice.** View traffic, audience, referrers, pages, campaigns, and custom events without leaving Umbraco.

![Web Analytics overview in the Umbraco backoffice](https://raw.githubusercontent.com/thebuilder/web-analytics/refs/heads/main/docs/screenshots/analytics-overview.png)

## Features

- Analytics section with totals, traffic history, audience, referrers, pages, routes, campaigns, and custom events.
- Page-level analytics in the document workspace, automatically filtered to the published route.
- Clear date controls and drill-down views that follow familiar Umbraco backoffice patterns.

## Built for real Umbraco installations

- Map multiple Umbraco sites to different Vercel projects.
- Choose which document types expose page-level analytics.
- Control global Analytics access through Umbraco user groups and preserve normal document permissions.
- Store Vercel access tokens in server-side configuration. Tokens are never sent to the browser or stored in Umbraco.

The package reads analytics already collected by Vercel. **It does not add tracking scripts to your website.**

## Requirements

- Umbraco CMS 17.1–18.x
- A Vercel project with Web Analytics enabled
- A Vercel access token

Installation, configuration, permissions, and troubleshooting are covered in the [documentation](https://github.com/thebuilder/web-analytics#readme).

Web Analytics is open source under the MIT License. Bugs and feature requests are welcome on [GitHub](https://github.com/thebuilder/web-analytics/issues).
