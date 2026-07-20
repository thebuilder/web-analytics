export function reportApiErrorMessage(error: unknown, status: number): string {
  return reportErrorMessage(typeof error === "object" && error !== null
    ? { ...error, status }
    : { status });
}

export function reportErrorMessage(error: unknown): string {
  const problem = typeof error === "object" && error !== null
    ? error as { code?: unknown; status?: unknown }
    : undefined;
  const code = typeof problem?.code === "string" ? problem.code : undefined;
  const status = problem?.status === undefined ? undefined : Number(problem.status);

  switch (code) {
    case "invalid_credentials":
      return "Check that the configured analytics credentials can read reports for this connection.";
    case "plan_limit":
      return "This report is outside the reporting window or unavailable on the current analytics plan.";
    case "invalid_query":
      return "This query or reporting dimension is not supported by the selected analytics provider.";
    case "upstream_timeout":
      return "The analytics provider did not respond in time. Try again.";
    case "report_capacity":
      return "Analytics is busy. Try again shortly.";
    case "upstream_transport":
    case "invalid_upstream_payload":
    case "upstream_unavailable":
      return "The analytics provider is temporarily unavailable. Try again.";
  }

  switch (status) {
    case 400:
      return "This query or reporting dimension is not supported by the selected analytics provider.";
    case 401:
    case 403:
      return "Check that the configured analytics credentials can read reports for this connection.";
    case 402:
      return "This report is outside the reporting window or unavailable on the current analytics plan.";
    default:
      return "Analytics could not be loaded. Try again, or check the connection configuration.";
  }
}
