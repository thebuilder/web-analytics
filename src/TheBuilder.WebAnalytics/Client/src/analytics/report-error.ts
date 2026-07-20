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
      return "Check that the Vercel access token can read Web Analytics for this project.";
    case "plan_limit":
      return "This report is outside the reporting window or is unavailable on the current Vercel plan.";
    case "invalid_query":
      return "This query or reporting dimension is not supported by Vercel.";
    case "upstream_timeout":
      return "Vercel Analytics did not respond in time. Try again.";
    case "report_capacity":
      return "Analytics is busy. Try again shortly.";
    case "upstream_transport":
    case "invalid_upstream_payload":
    case "upstream_unavailable":
      return "Vercel Analytics is temporarily unavailable. Try again.";
  }

  switch (status) {
    case 400:
      return "This query or reporting dimension is not supported by Vercel.";
    case 401:
    case 403:
      return "Check that the Vercel access token can read Web Analytics for this project.";
    case 402:
      return "This report is outside the reporting window or is unavailable on the current Vercel plan.";
    default:
      return "Analytics could not be loaded. Try again, or check the connection configuration.";
  }
}
