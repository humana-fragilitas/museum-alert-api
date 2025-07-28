// lib/stacks/lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface LambdaStackProps extends BaseStackProps {
  // Remove all external dependencies to avoid circular references
}

export class LambdaStack extends BaseStack {
  public readonly functions: { [key: string]: lambda.Function } = {};

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Create Lambda functions with imported values from other stacks
    this.createCompanyFunctions();
    this.createIoTFunctions();
    this.createCognitoTriggerFunctions();
    this.createDeviceManagementFunctions();
    
    // Export Lambda ARNs for other stacks
    this.createOutputs();
    
    this.applyStandardTags(this);
  }

  private createOutputs(): void {
    // Export the postConfirmation Lambda ARN for Cognito triggers
    if (this.functions.postConfirmationLambda) {
      new cdk.CfnOutput(this, 'PostConfirmationLambdaArn', {
        value: this.functions.postConfirmationLambda.functionArn,
        exportName: `${this.config.projectName}-post-confirmation-arn-${this.config.stage}`,
      });
    }

    // Export other important Lambda ARNs
    Object.entries(this.functions).forEach(([name, func]) => {
      if (name !== 'postConfirmationLambda') { // Already exported above
        new cdk.CfnOutput(this, `${name}Arn`, {
          value: func.functionArn,
          exportName: `${this.config.projectName}-${name.toLowerCase()}-arn-${this.config.stage}`,
        });
      }
    });
  }

  private createCompanyFunctions(): void {
    // getCompany function
    this.functions.getCompany = new lambda.Function(this, 'GetCompanyFunction', {
      functionName: 'getCompany',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../getCompanyLambda'),
      environment: {
        COMPANIES_TABLE: 'companies', // Hardcoded table name
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // updateCompany function
    this.functions.updateCompany = new lambda.Function(this, 'UpdateCompanyFunction', {
      functionName: 'updateCompany',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../updateCompanyLambda'),
      environment: {
        COMPANIES_TABLE: 'companies', // Hardcoded table name
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // Grant DynamoDB permissions using IAM policies instead of direct table references
    this.addDynamoDbPermissions([this.functions.getCompany, this.functions.updateCompany]);
  }

  private createIoTFunctions(): void {
    // Import Identity Pool ID
    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    // attachIoTPolicy function
    this.functions.attachIoTPolicy = new lambda.Function(this, 'AttachIoTPolicyFunction', {
      functionName: 'attachIoTPolicy',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../attachIoTPolicyLambda'),
      environment: {
        IDENTITY_POOL_ID: identityPoolId,
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // addThingToGroup function
    this.functions.addThingToGroup = new lambda.Function(this, 'AddThingToGroupFunction', {
      functionName: 'addThingToGroup',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../addThingToGroup'),
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // republishDeviceConnectionStatus function
    this.functions.republishDeviceConnectionStatus = new lambda.Function(this, 'RepublishDeviceConnectionStatusFunction', {
      functionName: 'republishDeviceConnectionStatus',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../republishDeviceConnectionStatusLambda'),
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
      code: lambda.Code.fromAsset('../createProvisioningClaimLambda'),
      environment: {
        TEMPLATE_NAME: this.config.iot.provisioningTemplateName,
        IDENTITY_POOL_ID: identityPoolId,
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

  private createCognitoTriggerFunctions(): void {
    // postConfirmationLambda function
    this.functions.postConfirmationLambda = new lambda.Function(this, 'PostConfirmationLambdaFunction', {
      functionName: 'postConfirmationLambda',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../postConfirmationLambda'),
      environment: {
        IDENTITY_POOL_ID: 'PLACEHOLDER_IDENTITY_POOL_ID', // Will be updated later
        COMPANIES_TABLE: 'companies', // Hardcoded table name
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // deleteUserLambda function
    this.functions.deleteUserLambda = new lambda.Function(this, 'DeleteUserLambdaFunction', {
      functionName: 'deleteUserLambda',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../deleteUserLambda'),
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // Grant permissions using IAM policies
    this.addDynamoDbPermissions([this.functions.postConfirmationLambda]);
    this.addCognitoPermissions([this.functions.deleteUserLambda]);
  }

  // Helper method to add DynamoDB permissions without direct table references
  private addDynamoDbPermissions(functions: lambda.Function[]): void {
    const dynamoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
      ],
      resources: [
        `arn:aws:dynamodb:${this.config.region}:*:table/companies*`,
      ],
    });

    functions.forEach(func => {
      func.addToRolePolicy(dynamoPolicy);
    });
  }

  // Helper method to add Cognito permissions
  private addCognitoPermissions(functions: lambda.Function[]): void {
    const cognitoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers',
      ],
      resources: [
        `arn:aws:cognito-idp:${this.config.region}:*:userpool/*`,
      ],
    });

    functions.forEach(func => {
      func.addToRolePolicy(cognitoPolicy);
    });
  }

  private createDeviceManagementFunctions(): void {
    // Import User Pool ID
    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);

    // getThingsByCompany function
    this.functions.getThingsByCompany = new lambda.Function(this, 'GetThingsByCompanyFunction', {
      functionName: 'getThingsByCompany',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../getThingsByCompanyLambda'),
      environment: {
        USER_POOL_ID: userPoolId,
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // preProvisioningHook function
    this.functions.preProvisioningHook = new lambda.Function(this, 'PreProvisioningHookFunction', {
      functionName: 'preProvisioningHook',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../preProvisioningHookLambda'),
      environment: {
        USER_POOL_ID: userPoolId,
      },
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });

    // checkThingExists function
    this.functions.checkThingExists = new lambda.Function(this, 'CheckThingExistsFunction', {
      functionName: 'checkThingExists',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../checkThingExistsLambda'),
      environment: {
        USER_POOL_ID: userPoolId,
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