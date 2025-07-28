// lib/stacks/lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface LambdaStackProps extends BaseStackProps {
  iamRoles: { [key: string]: iam.Role };
  dynamoTables: { [key: string]: dynamodb.Table };
  userPool?: cognito.UserPool;
  identityPool?: cognito.CfnIdentityPool;
}

export class LambdaStack extends BaseStack {
  public readonly functions: { [key: string]: lambda.Function } = {};

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Create Lambda functions based on your inventory
    this.createCompanyFunctions(props.dynamoTables);
    this.createIoTFunctions(props.identityPool);
    this.createCognitoTriggerFunctions(props.userPool, props.identityPool, props.dynamoTables);
    this.createDeviceManagementFunctions(props.userPool);
    
    this.applyStandardTags(this);
  }

  private createCompanyFunctions(tables: { [key: string]: dynamodb.Table }): void {
    // getCompany function
    this.functions.getCompany = new lambda.Function(this, 'GetCompanyFunction', {
      functionName: 'getCompany',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'getCompany' }) };
        };
      `),
      environment: {
        COMPANIES_TABLE: tables.companies?.tableName || 'companies',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // updateCompany function
    this.functions.updateCompany = new lambda.Function(this, 'UpdateCompanyFunction', {
      functionName: 'updateCompany',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'updateCompany' }) };
        };
      `),
      environment: {
        COMPANIES_TABLE: tables.companies?.tableName || 'companies',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // Grant DynamoDB permissions
    if (tables.companies) {
      tables.companies.grantReadData(this.functions.getCompany);
      tables.companies.grantReadWriteData(this.functions.updateCompany);
    }
  }

  private createIoTFunctions(identityPool?: cognito.CfnIdentityPool): void {
    // attachIoTPolicy function
    this.functions.attachIoTPolicy = new lambda.Function(this, 'AttachIoTPolicyFunction', {
      functionName: 'attachIoTPolicy',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'attachIoTPolicy' }) };
        };
      `),
      environment: {
        IDENTITY_POOL_ID: identityPool?.ref || '',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // addThingToGroup function
    this.functions.addThingToGroup = new lambda.Function(this, 'AddThingToGroupFunction', {
      functionName: 'addThingToGroup',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'addThingToGroup' }) };
        };
      `),
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // republishDeviceConnectionStatus function
    this.functions.republishDeviceConnectionStatus = new lambda.Function(this, 'RepublishDeviceConnectionStatusFunction', {
      functionName: 'republishDeviceConnectionStatus',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'republishDeviceConnectionStatus' }) };
        };
      `),
      environment: {
        IOT_ENDPOINT: `avo0w7o1tlck1-ats.iot.${this.config.region}.amazonaws.com`, // Your actual endpoint pattern
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // createProvisioningClaim function
    this.functions.createProvisioningClaim = new lambda.Function(this, 'CreateProvisioningClaimFunction', {
      functionName: 'createProvisioningClaim',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'createProvisioningClaim' }) };
        };
      `),
      environment: {
        TEMPLATE_NAME: this.config.iot.provisioningTemplateName,
        IDENTITY_POOL_ID: identityPool?.ref || '',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // Grant IoT permissions to these functions
    const iotPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:AttachPolicy',
        'iot:DetachPolicy',
        'iot:AddThingToThingGroup',
        'iot:RemoveThingFromThingGroup',
        'iot:Publish',
        'iot:CreateProvisioningClaim',
        'iot:DescribeEndpoint',
      ],
      resources: ['*'],
    });

    this.functions.attachIoTPolicy.addToRolePolicy(iotPolicy);
    this.functions.addThingToGroup.addToRolePolicy(iotPolicy);
    this.functions.republishDeviceConnectionStatus.addToRolePolicy(iotPolicy);
    this.functions.createProvisioningClaim.addToRolePolicy(iotPolicy);
  }

  private createCognitoTriggerFunctions(
    userPool?: cognito.UserPool,
    identityPool?: cognito.CfnIdentityPool,
    tables?: { [key: string]: dynamodb.Table }
  ): void {
    // postConfirmationLambda function
    this.functions.postConfirmationLambda = new lambda.Function(this, 'PostConfirmationLambdaFunction', {
      functionName: 'postConfirmationLambda',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return event; // Cognito triggers must return the event
        };
      `),
      environment: {
        IDENTITY_POOL_ID: identityPool?.ref || '',
        COMPANIES_TABLE: tables?.companies?.tableName || 'companies',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // deleteUserLambda function
    this.functions.deleteUserLambda = new lambda.Function(this, 'DeleteUserLambdaFunction', {
      functionName: 'deleteUserLambda',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'deleteUserLambda' }) };
        };
      `),
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // Grant permissions
    if (tables?.companies) {
      tables.companies.grantReadWriteData(this.functions.postConfirmationLambda);
    }

    if (userPool) {
      userPool.grant(this.functions.deleteUserLambda, 'cognito-idp:AdminDeleteUser');
    }
  }

  private createDeviceManagementFunctions(userPool?: cognito.UserPool): void {
    // getThingsByCompany function
    this.functions.getThingsByCompany = new lambda.Function(this, 'GetThingsByCompanyFunction', {
      functionName: 'getThingsByCompany',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'getThingsByCompany' }) };
        };
      `),
      environment: {
        USER_POOL_ID: userPool?.userPoolId || '',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // preProvisioningHook function
    this.functions.preProvisioningHook = new lambda.Function(this, 'PreProvisioningHookFunction', {
      functionName: 'preProvisioningHook',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { allowProvisioning: true }; // IoT provisioning hook response
        };
      `),
      environment: {
        USER_POOL_ID: userPool?.userPoolId || '',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // checkThingExists function
    this.functions.checkThingExists = new lambda.Function(this, 'CheckThingExistsFunction', {
      functionName: 'checkThingExists',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        // Placeholder - replace with your actual code
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return { statusCode: 200, body: JSON.stringify({ message: 'checkThingExists' }) };
        };
      `),
      environment: {
        USER_POOL_ID: userPool?.userPoolId || '',
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // Grant IoT permissions for device management
    const iotDevicePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:ListThings',
        'iot:DescribeThing',
        'iot:ListThingsInThingGroup',
        'iot:ListThingGroupsForThing',
      ],
      resources: ['*'],
    });

    this.functions.getThingsByCompany.addToRolePolicy(iotDevicePolicy);
    this.functions.preProvisioningHook.addToRolePolicy(iotDevicePolicy);
    this.functions.checkThingExists.addToRolePolicy(iotDevicePolicy);
  }
}