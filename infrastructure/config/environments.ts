import { EnvironmentConfig } from './types';

const baseConfig = {
  projectName: 'museum-alert',
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' as const,
    pointInTimeRecovery: true,
  },
  cognito: {
    userPoolName: 'museum-alert-user-pool-open-signup',
    identityPoolName: 'museum-alert-identity-pool',
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: false,
    },
    mfaConfiguration: 'OPTIONAL' as const,
  },
  iot: {
    enableLogging: true,
    logLevel: 'INFO' as const,
    thingTypeName: 'Museum-Alert-Sensor',
    provisioningTemplateName: 'museum-alert-provisioning-template',
  },
  apiGateway: {
    apiName: 'museum-alert-api',
  },
};

export const environments: { [key: string]: EnvironmentConfig } = {
  dev: {
    ...baseConfig,
    region: 'eu-west-2',
    stage: 'dev',
    iot: {
      ...baseConfig.iot,
      logLevel: 'DEBUG',
    },
  }
};

export function getEnvironmentConfig(stage: string): EnvironmentConfig {
  const config = environments[stage];
  if (!config) {
    throw new Error(`Environment configuration for stage '${stage}' not found`);
  }
  return config;
}