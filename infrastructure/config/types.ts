export interface EnvironmentConfig {
  region: string;
  account?: string;
  stage: string;
  projectName: string;
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
    pointInTimeRecovery: boolean;
  };
  
  cognito: {
    userPoolName: string;
    identityPoolName: string;
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSymbols: boolean;
    };
    mfaConfiguration: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  };
  
  iot: {
    enableLogging: boolean;
    logLevel: 'DEBUG' | 'INFO' | 'ERROR' | 'WARN' | 'DISABLED';
    thingTypeName: string;
    provisioningTemplateName: string;
  };

  apiGateway: {
    apiName: string;
  };
  
}