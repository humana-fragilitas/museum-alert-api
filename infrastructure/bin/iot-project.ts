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
import { ConfigOutputStack } from '../lib/stacks/config-output-stack'; // Add this import

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

const museumAlertCognitoStack = new CognitoStack(app, `${config.projectName}-cognito-${config.stage}`, {
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

const museumAlertApiStack = new ApiGatewayStack(app, `${config.projectName}-api-${config.stage}`, {
  ...stackProps,
  config,
  lambdaFunctions: museumAlertLambdaStack.functions,
  userPool: museumAlertCognitoStack.userPool,
});

// Triggers stack - handles ALL cross-stack wiring using imports/exports
const museumAlertTriggersStack = new TriggersStack(app, `${config.projectName}-triggers-${config.stage}`, {
  ...stackProps,
  config,
});

// ADD THE CONFIG OUTPUT STACK HERE - AFTER ALL OTHER STACKS
const museumAlertConfigStack = new ConfigOutputStack(app, `${config.projectName}-config-${config.stage}`, {
  ...stackProps,
  config,
});

// DEPENDENCIES - CORRECTED FOR PROPER DEPLOYMENT ORDER:
// 1. Core stacks (IAM, Database, Cognito, IoT) - Foundation layer
// 2. Lambda stack - MUST wait for Cognito exports to be available
// 3. API Gateway stack - Needs Lambda and Cognito to exist
// 4. Triggers stack - Needs Lambda exports to be available
// 5. Config output stack - Needs API Gateway and Cognito exports

// Foundation dependencies
museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertCognitoStack.addDependency(museumAlertIamStack);
museumAlertIotStack.addDependency(museumAlertIamStack);

// CRITICAL: Lambda imports Cognito exports - needs explicit dependency
museumAlertLambdaStack.addDependency(museumAlertCognitoStack);

// API Gateway dependencies - needs both Lambda and Cognito
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);

// Triggers stack dependencies - imports from Cognito and Lambda
museumAlertTriggersStack.addDependency(museumAlertCognitoStack);
museumAlertTriggersStack.addDependency(museumAlertLambdaStack);

// Config output stack dependencies - needs exports from API Gateway and Cognito
museumAlertConfigStack.addDependency(museumAlertApiStack);
museumAlertConfigStack.addDependency(museumAlertCognitoStack);