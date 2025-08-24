/**
 * Helper function to validate required environment variables at
 * lambda invocation time.
 */
export function validateEnvironmentVariables(requiredVariables = []) {

    if (!requiredVariables || !requiredVariables.length) return;

    const missing = requiredVariables.filter(envVar => !process.env[envVar]);

    if (missing.length > 0) {

        throw new Error(
            `[LAMBDA LAYER: validateEnvironmentVariables]: ` + 
            `missing required environment variables: `       +
            `${missing.join(', ')}`
        );

    }

};