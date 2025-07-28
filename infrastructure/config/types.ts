// config/types.ts
export interface EnvironmentConfig {
  region: string;
  account?: string;
  stage: string;
  projectName: string;
  
  // Service-specific configuration
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
    pointInTimeRecovery: boolean;
  };
  
  cognito: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
    };
    mfaConfiguration: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  };
  
  lambda: {
    runtime: string;
    timeout: number;
    memorySize: number;
  };
  
  iot: {
    enableLogging: boolean;
    logLevel: 'DEBUG' | 'INFO' | 'ERROR' | 'WARN' | 'DISABLED';
  };
}

export const baseConfig = {
  projectName: 'iot-project', // Update with your project name
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' as const,
    pointInTimeRecovery: true,
  },
  cognito: {
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: false,
    },
    mfaConfiguration: 'OPTIONAL' as const,
  },
  lambda: {
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 256,
  },
  iot: {
    enableLogging: true,
    logLevel: 'INFO' as const,
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
  
  prod: {
    ...baseConfig,
    region: 'eu-west-1', // Your existing production region (working infrastructure)
    stage: 'prod',
    lambda: {
      ...baseConfig.lambda,
      memorySize: 512, // More memory for production
    },
  },
};

export function getEnvironmentConfig(stage: string): EnvironmentConfig {
  const config = environments[stage];
  if (!config) {
    throw new Error(`Environment configuration for stage '${stage}' not found`);
  }
  return config;
}