// Updated lambda-stack.ts with proper asset handling
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
  public readonly sharedLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Create the shared layer FIRST
    this.sharedLayer = this.createSharedLayer();

    // Create Lambda functions with imported values from other stacks
    this.createCompanyFunctions();
    this.createIoTFunctions();
    this.createCognitoTriggerFunctions();
    this.createDeviceManagementFunctions();
    
    // Export Lambda ARNs for other stacks
    this.createOutputs();
    
    this.applyStandardTags(this);
  }

  private createSharedLayer(): lambda.LayerVersion {
    return new lambda.LayerVersion(this, 'SharedLayer', {
      layerVersionName: `${this.config.projectName}-shared-layer-${this.config.stage}`,
      code: lambda.Code.fromAsset('../lambda/lambdaLayer', {
        // Add bundling options to avoid infinite loops
        bundling: {
          image: lambda.Runtime.NODEJS_18_X.bundlingImage,
          command: [
            'bash', '-c', [
              'cp -r /asset-input/* /asset-output/',
              'cd /asset-output/nodejs',
              'npm install --only=production',
            ].join(' && ')
          ],
        },
        // Exclude problematic directories
        exclude: [
          'node_modules',
          'cdk.out',
          '.git',
          '*.log',
          '.DS_Store',
          'libraries', // Exclude the Arduino libraries that are causing the long path
        ],
      }),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Shared utilities for Museum Alert Lambda functions',
      removalPolicy: this.config.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });
  }

  // Helper method to create Lambda with safe asset bundling
  private createLambdaFunction(
    id: string, 
    functionName: string, 
    assetPath: string, 
    environment: { [key: string]: string } = {},
    useLayer: boolean = true
  ): lambda.Function {
    return new lambda.Function(this, id, {
      functionName,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(assetPath, {
        // Safe bundling options
        exclude: [
          'cdk.out',
          '.git',
          '*.log',
          '.DS_Store',
          'libraries', // Arduino libraries causing infinite loops
          '*.zip',
          'test',
          'tests',
          '__pycache__',
          '.env',
          // NOTE: Individual Lambda functions shouldn't have node_modules
          // They should use the shared layer instead
          'node_modules',
        ],
      }),
      layers: useLayer ? [this.sharedLayer] : undefined,
      environment,
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
    });
  }

  private createCompanyFunctions(): void {
    // getCompany function
    this.functions.getCompany = this.createLambdaFunction(
      'GetCompanyFunction',
      'getCompany',
      '../lambda/getCompanyLambda',
      {
        COMPANIES_TABLE: 'companies',
      }
    );

    // updateCompany function
    this.functions.updateCompany = this.createLambdaFunction(
      'UpdateCompanyFunction',
      'updateCompany',
      '../lambda/updateCompanyLambda',
      {
        COMPANIES_TABLE: 'companies',
      }
    );

    // Grant DynamoDB permissions
    this.addDynamoDbPermissions([this.functions.getCompany, this.functions.updateCompany]);
  }

  private createIoTFunctions(): void {
    // Import Identity Pool ID
    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    // attachIoTPolicy function
    this.functions.attachIoTPolicy = this.createLambdaFunction(
      'AttachIoTPolicyFunction',
      'attachIoTPolicy',
      '../lambda/attachIoTPolicyLambda',
      {
        IDENTITY_POOL_ID: identityPoolId,
      }
    );

    // addThingToGroup function (no layer)
    this.functions.addThingToGroup = this.createLambdaFunction(
      'AddThingToGroupFunction',
      'addThingToGroup',
      '../lambda/addThingToGroupLambda',
      {},
      false // No layer
    );

    // republishDeviceConnectionStatus function
    this.functions.republishDeviceConnectionStatus = this.createLambdaFunction(
      'RepublishDeviceConnectionStatusFunction',
      'republishDeviceConnectionStatus',
      '../lambda/republishDeviceConnectionStatusLambda'
    );

    // createProvisioningClaim function
    this.functions.createProvisioningClaim = this.createLambdaFunction(
      'CreateProvisioningClaimFunction',
      'createProvisioningClaim',
      '../lambda/createProvisioningClaimLambda',
      {
        TEMPLATE_NAME: this.config.iot.provisioningTemplateName,
        IDENTITY_POOL_ID: identityPoolId,
      }
    );

    // Grant IoT permissions
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
    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    this.functions.postConfirmationLambda = this.createLambdaFunction(
      'PostConfirmationLambdaFunction',
      'postConfirmationLambda',
      '../lambda/postConfirmationLambda',
      {
        IDENTITY_POOL_ID: identityPoolId,
        COMPANIES_TABLE: 'companies',
      }
    );

    this.functions.deleteUserLambda = this.createLambdaFunction(
      'DeleteUserLambdaFunction',
      'deleteUserLambda',
      '../lambda/deleteUserLambda',
      {},
      false // No layer
    );

    this.addDynamoDbPermissions([this.functions.postConfirmationLambda]);
    this.addCognitoPermissions([this.functions.deleteUserLambda]);
  }

  private createDeviceManagementFunctions(): void {
    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);

    this.functions.getThingsByCompany = this.createLambdaFunction(
      'GetThingsByCompanyFunction',
      'getThingsByCompany',
      '../lambda/getThingsByCompanyLambda',
      {
        USER_POOL_ID: userPoolId,
      }
    );

    this.functions.preProvisioningHook = this.createLambdaFunction(
      'PreProvisioningHookFunction',
      'preProvisioningHook',
      '../lambda/preProvisioningHookLambda',
      {
        USER_POOL_ID: userPoolId,
      }
    );

    this.functions.checkThingExists = this.createLambdaFunction(
      'CheckThingExistsFunction',
      'checkThingExists',
      '../lambda/checkThingExistsLambda',
      {
        USER_POOL_ID: userPoolId,
      }
    );

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

  private createOutputs(): void {
    if (this.functions.postConfirmationLambda) {
      new cdk.CfnOutput(this, 'PostConfirmationLambdaArn', {
        value: this.functions.postConfirmationLambda.functionArn,
        exportName: `${this.config.projectName}-post-confirmation-arn-${this.config.stage}`,
      });
    }

    Object.entries(this.functions).forEach(([name, func]) => {
      if (name !== 'postConfirmationLambda') {
        new cdk.CfnOutput(this, `${name}Arn`, {
          value: func.functionArn,
          exportName: `${this.config.projectName}-${name.toLowerCase()}-arn-${this.config.stage}`,
        });
      }
    });
  }

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
}