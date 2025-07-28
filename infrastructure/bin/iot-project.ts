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

// DEPENDENCIES - CAREFULLY ANALYZED:
// 1. Core stacks are independent (IAM, Database, Cognito, IoT)
// 2. Lambda imports from Cognito (via CloudFormation exports) - NO direct dependency
// 3. API Gateway depends on Lambda + Cognito (direct references, not circular) 
// 4. Triggers stack imports from all others (via exports) - NO circular dependencies

museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertCognitoStack.addDependency(museumAlertIamStack);
// Lambda stack imports from Cognito via exports - NO dependency needed
museumAlertIotStack.addDependency(museumAlertIamStack);
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);
// Triggers stack imports from all via exports - depends on all exporters
museumAlertTriggersStack.addDependency(museumAlertCognitoStack);
museumAlertTriggersStack.addDependency(museumAlertLambdaStack);