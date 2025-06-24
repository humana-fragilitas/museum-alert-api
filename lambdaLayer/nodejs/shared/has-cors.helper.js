const corsEnabledEnvironments = [
    'staging',
    'development'
];

export function hasCors(environment) {

    const tempEnv = (environment || '')
        .toLowerCase()
        .trim();

    return corsEnabledEnvironments.includes(tempEnv);
  
}