#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getEnvironmentConfig } from '../config/environments';
import { IamStack } from '../lib/stacks/iam-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { CognitoStack } from '../lib/stacks/cognito-stack';
import { LambdaStack } from '../lib/stacks/lambda-stack';
import { IoTStack } from '../lib/stacks/iot-stack';
import { TriggersStack } from '../lib/stacks/triggers-stack';
import { ApiGatewayStack } from '../lib/stacks/api-gateway-stack';
// REMOVED: CognitoWiringStack - handling trigger directly in CognitoStack now
import { ConfigOutputStack } from '../lib/stacks/config-output-stack';

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

// Create stacks in dependency order
const museumAlertIamStack = new IamStack(app, `${config.projectName}-iam-${config.stage}`, {
  ...stackProps,
  config,
});

const museumAlertDatabaseStack = new DatabaseStack(app, `${config.projectName}-database-${config.stage}`, {
  ...stackProps,
  config,
});

const museumAlertLambdaStack = new LambdaStack(app, `${config.projectName}-lambda-${config.stage}`, {
  ...stackProps,
  config,
});

const museumAlertIotStack = new IoTStack(app, `${config.projectName}-iot-${config.stage}`, {
  ...stackProps,
  config,
  iamRoles: museumAlertIamStack.roles,
});

// IMPORTANT: Cognito stack now depends on Lambda (since it imports Lambda ARN for trigger)
const museumAlertCognitoStack = new CognitoStack(app, `${config.projectName}-cognito-${config.stage}`, {
  ...stackProps,
  config,
});

const museumAlertApiStack = new ApiGatewayStack(app, `${config.projectName}-api-${config.stage}`, {
  ...stackProps,
  config,
  lambdaFunctions: museumAlertLambdaStack.functions,
  userPool: museumAlertCognitoStack.userPool,
});

// Triggers stack - handles IoT topic rules only
const museumAlertTriggersStack = new TriggersStack(app, `${config.projectName}-triggers-${config.stage}`, {
  ...stackProps,
  config,
});

// Config output stack
const museumAlertConfigStack = new ConfigOutputStack(app, `${config.projectName}-config-${config.stage}`, {
  ...stackProps,
  config,
});

// UPDATED DEPENDENCIES - Cognito now depends on Lambda

// Foundation dependencies (parallel - no interdependencies)
museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertIotStack.addDependency(museumAlertIamStack);

// Lambda has no dependencies on other business logic stacks
museumAlertLambdaStack.addDependency(museumAlertIamStack);

// IMPORTANT: Cognito now depends on Lambda (imports Lambda ARN for trigger)
museumAlertCognitoStack.addDependency(museumAlertLambdaStack);

// API Gateway dependencies - needs both Lambda and Cognito
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);

// Triggers stack dependencies - imports from Lambda only
museumAlertTriggersStack.addDependency(museumAlertLambdaStack);

// Config output stack dependencies - needs exports from API Gateway and Cognito  
museumAlertConfigStack.addDependency(museumAlertApiStack);
museumAlertConfigStack.addDependency(museumAlertCognitoStack);