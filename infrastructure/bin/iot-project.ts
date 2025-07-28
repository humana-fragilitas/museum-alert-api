#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getEnvironmentConfig } from '../config/environments';
import { IamStack } from '../lib/stacks/iam-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { CognitoStack } from '../lib/stacks/cognito-stack';
import { LambdaStack } from '../lib/stacks/lambda-stack';
import { IoTStack } from '../lib/stacks/iot-stack';
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
  iamRoles: museumAlertIamStack.roles,
  dynamoTables: museumAlertDatabaseStack.tables,
  userPool: museumAlertCognitoStack.userPool,
  identityPool: museumAlertCognitoStack.identityPool,
});

const museumAlertIotStack = new IoTStack(app, `${config.projectName}-iot-${config.stage}`, {
  ...stackProps,
  config,
  iamRoles: museumAlertIamStack.roles,
  lambdaFunctions: museumAlertLambdaStack.functions,
});

const museumAlertApiStack = new ApiGatewayStack(app, `${config.projectName}-api-${config.stage}`, {
  ...stackProps,
  config,
  lambdaFunctions: museumAlertLambdaStack.functions,
  userPool: museumAlertCognitoStack.userPool,
});

// Add Lambda triggers to Cognito after Lambda stack is created
if (museumAlertLambdaStack.functions.postConfirmationLambda) {
  museumAlertCognitoStack.addLambdaTriggers(museumAlertLambdaStack.functions.postConfirmationLambda);
}

// Add dependencies
museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertCognitoStack.addDependency(museumAlertIamStack);
museumAlertLambdaStack.addDependency(museumAlertDatabaseStack);
museumAlertLambdaStack.addDependency(museumAlertCognitoStack);
museumAlertLambdaStack.addDependency(museumAlertIamStack);
museumAlertIotStack.addDependency(museumAlertLambdaStack);
museumAlertIotStack.addDependency(museumAlertIamStack);
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);