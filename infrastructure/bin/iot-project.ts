#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getEnvironmentConfig } from '../config/environments';
import { IamStack } from '../lib/stacks/iam-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { CognitoStack } from '../lib/stacks/cognito-stack';
import { LambdaStack } from '../lib/stacks/lambda-stack';
// import { CognitoWiringStack } from '../lib/stacks/cognito-wiring-stack';
import { IoTStack } from '../lib/stacks/iot-stack';
import { TriggersStack } from '../lib/stacks/triggers-stack';
import { ApiGatewayStack } from '../lib/stacks/api-gateway-stack';
import { ConfigOutputStack } from '../lib/stacks/config-output-stack';
import { SharedInfraStack } from '../lib/stacks/shared-infra-stack';

const app = new cdk.App();

// Get stage from context or default to 'dev'
const stage = app.node.tryGetContext('stage') || 'dev';
const config = getEnvironmentConfig(stage);

// Define stack props
const stackProps: cdk.StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
};

// PHASE 1: Foundation stacks (completely independent)
const museumAlertIamStack = new IamStack(app, `${config.projectName}-iam-${config.stage}`, {
  ...stackProps,
  config,
});

const museumAlertSharedInfraStack = new SharedInfraStack(app, `${config.projectName}-shared-infra-${config.stage}`, {
  ...stackProps,
  config,
});

const museumAlertDatabaseStack = new DatabaseStack(app, `${config.projectName}-database-${config.stage}`, {
  ...stackProps,
  config,
});

// TO DO: complete this
// const sharedStack = new SharedInfraStack(app, 'SharedInfraStack');

// PHASE 2: Cognito stack (completely independent - exports values)
const museumAlertCognitoStack = new CognitoStack(app, `${config.projectName}-cognito-${config.stage}`, {
  ...stackProps,
  sharedLayer: museumAlertSharedInfraStack.sharedLayer,
  config,
});

// PHASE 3: Lambda stack (completely independent - imports values via CloudFormation)
const museumAlertLambdaStack = new LambdaStack(app, `${config.projectName}-lambda-${config.stage}`, {
  ...stackProps,
  sharedLayer: museumAlertSharedInfraStack.sharedLayer,
  config,
  // NO direct construct references - Lambda will import these via Fn.importValue
});

// PHASE 4: Cognito Wiring (configures triggers using imports)
// const museumAlertCognitoWiringStack = new CognitoWiringStack(app, `${config.projectName}-cognito-wiring-${config.stage}`, {
//   ...stackProps,
//   config,
//   // Uses imports to get both user pool and lambda function
// });

// PHASE 5: IoT stack (imports Lambda function)
const museumAlertIotStack = new IoTStack(app, `${config.projectName}-iot-${config.stage}`, {
  ...stackProps,
  config,
  iamRoles: museumAlertIamStack.roles,
  // Will import preProvisioningHook function via CloudFormation
});

// PHASE 6: API Gateway (imports from both Cognito and Lambda)
const museumAlertApiStack = new ApiGatewayStack(app, `${config.projectName}-api-${config.stage}`, {
  ...stackProps,
  config,
  // Will import lambdaFunctions and userPool via CloudFormation
});

// PHASE 7: Triggers (imports Lambda functions)
const museumAlertTriggersStack = new TriggersStack(app, `${config.projectName}-triggers-${config.stage}`, {
  ...stackProps,
  config,
  // Will import lambda functions via CloudFormation
});

// PHASE 8: Config output (imports from API and Cognito)
const museumAlertConfigStack = new ConfigOutputStack(app, `${config.projectName}-config-${config.stage}`, {
  ...stackProps,
  config,
  // Will import all values via CloudFormation
});

// DEPENDENCY CHAIN - ONLY EXPLICIT DEPENDENCIES, NO CIRCULAR REFERENCES
// Foundation dependencies
museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertLambdaStack.addDependency(museumAlertSharedInfraStack);
museumAlertLambdaStack.addDependency(museumAlertIamStack);
museumAlertLambdaStack.addDependency(museumAlertCognitoStack);

// TO DO: remove after testing
museumAlertCognitoStack.addDependency(museumAlertSharedInfraStack);

// Wiring dependencies (after both base stacks exist)
//museumAlertCognitoWiringStack.addDependency(museumAlertCognitoStack);
//museumAlertCognitoWiringStack.addDependency(museumAlertLambdaStack);

// Service dependencies
museumAlertIotStack.addDependency(museumAlertIamStack);
museumAlertIotStack.addDependency(museumAlertLambdaStack);

// API dependencies
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);

// Trigger dependencies
museumAlertTriggersStack.addDependency(museumAlertLambdaStack);

// Config dependencies
museumAlertConfigStack.addDependency(museumAlertApiStack);
museumAlertConfigStack.addDependency(museumAlertCognitoStack);

