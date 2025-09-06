
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

const museumAlertCognitoStack = new CognitoStack(app, `${config.projectName}-cognito-${config.stage}`, {
  ...stackProps,
  sharedLayer: museumAlertSharedInfraStack.sharedLayer,
  config,
});

const museumAlertLambdaStack = new LambdaStack(app, `${config.projectName}-lambda-${config.stage}`, {
  ...stackProps,
  sharedLayer: museumAlertSharedInfraStack.sharedLayer,
  config,
});

const museumAlertIotStack = new IoTStack(app, `${config.projectName}-iot-${config.stage}`, {
  ...stackProps,
  config,
  iamRoles: museumAlertIamStack.roles
});

const museumAlertApiStack = new ApiGatewayStack(app, `${config.projectName}-api-${config.stage}`, {
  ...stackProps,
  config
});

const museumAlertTriggersStack = new TriggersStack(app, `${config.projectName}-triggers-${config.stage}`, {
  ...stackProps,
  config
});

const museumAlertConfigStack = new ConfigOutputStack(app, `${config.projectName}-config-${config.stage}`, {
  ...stackProps,
  config
});

museumAlertDatabaseStack.addDependency(museumAlertIamStack);
museumAlertLambdaStack.addDependency(museumAlertSharedInfraStack);
museumAlertLambdaStack.addDependency(museumAlertIamStack);
museumAlertLambdaStack.addDependency(museumAlertCognitoStack);
museumAlertCognitoStack.addDependency(museumAlertSharedInfraStack);
museumAlertIotStack.addDependency(museumAlertIamStack);
museumAlertIotStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertLambdaStack);
museumAlertApiStack.addDependency(museumAlertCognitoStack);
museumAlertTriggersStack.addDependency(museumAlertLambdaStack);
museumAlertConfigStack.addDependency(museumAlertApiStack);
museumAlertConfigStack.addDependency(museumAlertCognitoStack);
