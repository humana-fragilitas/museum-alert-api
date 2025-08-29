import { EnvironmentConfig } from './types';

const baseConfig = {
  projectName: 'museum-alert', // Your actual project name
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
  // lambda: {
  //   runtime: 'nodejs18.x',
  //   timeout: 30,
  //   memorySize: 256,
  // },
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
    region: 'eu-west-2', // Test region (empty)
    stage: 'dev',
    iot: {
      ...baseConfig.iot,
      logLevel: 'DEBUG',
    },
  },
  
  // prod: {
  //   ...baseConfig,
  //   region: 'eu-west-1', // Your existing production region (working infrastructure)
  //   stage: 'prod',
  //   // lambda: {
  //   //   ...baseConfig.lambda,
  //   //   memorySize: 512, // More memory for production
  //   // },
  // },
};

export function getEnvironmentConfig(stage: string): EnvironmentConfig {
  const config = environments[stage];
  if (!config) {
    throw new Error(`Environment configuration for stage '${stage}' not found`);
  }
  return config;
}