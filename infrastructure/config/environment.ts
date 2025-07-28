import { EnvironmentConfig, baseConfig } from './types';

export const environments: { [key: string]: EnvironmentConfig } = {
  dev: {
    ...baseConfig,
    region: 'eu-west-2', // Test region (empty)
    stage: 'dev',
    // ... other config
  },
  
  prod: {
    ...baseConfig,
    region: 'eu-west-1', // Your existing production region (working infrastructure)
    stage: 'prod',
    // ... other config
  },
};