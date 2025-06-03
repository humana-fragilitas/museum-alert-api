export function hasCors(environment) {

    const tempEnv = (environment || '')
        .toLowerCase()
        .trim();

    return (tempEnv === 'staging' || tempEnv === 'development');
  
}