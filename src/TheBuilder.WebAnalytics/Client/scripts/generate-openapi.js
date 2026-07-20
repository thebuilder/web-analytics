import fetch from 'node-fetch';
import chalk from 'chalk';
import { createClient, defaultPlugins } from '@hey-api/openapi-ts';
import { pathToFileURL } from 'node:url';

const getSwaggerUrl = (argumentsToParse) => argumentsToParse.find((argument) => argument !== '--');

const printMissingUrlError = (error) => {
  error(chalk.red('ERROR: Missing URL to OpenAPI spec'));
  error(`Please provide the URL to the OpenAPI spec as the first argument found in ${chalk.yellow('package.json')}`);
  error(`Umbraco 17 example: node generate-openapi.js ${chalk.yellow('https://localhost:44389/umbraco/swagger/thebuilderwebanalytics/swagger.json')}`);
  error(`Umbraco 18 example: node generate-openapi.js ${chalk.yellow('https://localhost:44389/umbraco/openapi/thebuilderwebanalytics.json')}`);
};

const printConnectionError = (error, message) => {
  error(`ERROR: Failed to connect to the OpenAPI spec: ${chalk.red(message)}`);
  error('The URL to your Umbraco instance may be wrong or the instance is not running');
  error(`Please verify or change the URL in the ${chalk.yellow('package.json')} for the script ${chalk.yellow('generate-openapi')}`);
};

export async function generateOpenApiClient({
  swaggerUrl = getSwaggerUrl(process.argv.slice(2)),
  fetchImplementation = fetch,
  createClientImplementation = createClient,
  log = console.log,
  error = console.error,
} = {}) {
  if (swaggerUrl === undefined) {
    printMissingUrlError(error);
    return false;
  }

  // Needed to ignore self-signed certificates from running Umbraco on https on localhost
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  log(chalk.green('Generating OpenAPI client...'));
  log('Ensure your Umbraco instance is running');
  log(`Fetching OpenAPI definition from ${chalk.yellow(swaggerUrl)}`);

  try {
    const response = await fetchImplementation(swaggerUrl);
    if (!response.ok) {
      error(chalk.red(`ERROR: OpenAPI spec returned with a non OK (200) response: ${response.status} ${response.statusText}`));
      error('The URL to your Umbraco instance may be wrong or the instance is not running');
      error(`Please verify or change the URL in the ${chalk.yellow('package.json')} for the script ${chalk.yellow('generate-openapi')}`);
      return false;
    }

    log(`Calling ${chalk.yellow('hey-api')} to generate TypeScript client`);
    await createClientImplementation({
      input: swaggerUrl,
      output: 'src/api',
      plugins: [
        ...defaultPlugins,
        '@hey-api/client-fetch',
        {
          name: '@hey-api/sdk',
          asClass: true,
          classNameBuilder: '{{name}}Service',
        },
      ],
    });
    log('OpenAPI client generated successfully');
    return true;
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : String(exception);
    printConnectionError(error, message);
    return false;
  }
}

export async function main() {
  const succeeded = await generateOpenApiClient();
  if (!succeeded) {
    process.exitCode = 1;
  }
}

const isCliInvocation = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCliInvocation) {
  await main();
}
