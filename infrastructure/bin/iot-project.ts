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
import { CognitoWiringStack } from '../lib/stacks/cognito-wiring-stack'; // Add this import
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

// Triggers stack - handles IoT topic rules only
const museumAlertTriggersStack = new TriggersStack(app, `${config.projectName}-triggers-${config.stage}`, {
  ...stackProps,
  config,
});

// NEW: Cognito wiring stack - handles the PostConfirmation trigger
const museumAlertCognitoWiringStack = new CognitoWiringStack(app, `${config.projectName}-cognito-wiring-${config.stage}`, {
  ...stackProps,
  config,
});

// Config output stack
const museumAlertConfigStack = new ConfigOutputStack(app, `${config.projectName}-config-${config.stage}`, {
  ...stackProps,
  config,
});

// CORRECTED DEPENDENCIES - NO CIRCULAR REFERENCES

// Foundation dependencies (parallel - no interdependencies)
museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertCognitoStack.addDependency(museumAlertIamStack);
museumAlertIotStack.addDependency(museumAlertIamStack);

// Lambda imports Cognito exports - Lambda depends on Cognito
museumAlertLambdaStack.addDependency(museumAlertCognitoStack);

// API Gateway dependencies - needs both Lambda and Cognito
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);

// Triggers stack dependencies - imports from Lambda only
museumAlertTriggersStack.addDependency(museumAlertLambdaStack);

// NEW: Cognito wiring depends on BOTH Cognito and Lambda being deployed
museumAlertCognitoWiringStack.addDependency(museumAlertCognitoStack);
museumAlertCognitoWiringStack.addDependency(museumAlertLambdaStack);

// Config output stack dependencies - needs exports from API Gateway and Cognito  
museumAlertConfigStack.addDependency(museumAlertApiStack);
museumAlertConfigStack.addDependency(museumAlertCognitoStack);