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

    // TO DO: BEGIN experimental policy here
    const getCompanyPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.config.region}:*:table/companies*`,
      ],
    });

    this.functions.getCompany.addToRolePolicy(getCompanyPolicy);
    // TO DO: END experimental policy here

    // updateCompany function
    this.functions.updateCompany = this.createLambdaFunction(
      'UpdateCompanyFunction',
      'updateCompany',
      '../lambda/updateCompanyLambda',
      {
        COMPANIES_TABLE: 'companies',
      }
    );

        // TO DO: BEGIN experimental policy here
    const updateCompanyPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.config.region}:*:table/companies*`,
      ],
    });

    this.functions.getCompany.addToRolePolicy(updateCompanyPolicy);
    // TO DO: END experimental policy here
  
    // Grant DynamoDB permissions
    //this.addDynamoDbPermissions([this.functions.getCompany, this.functions.updateCompany]);
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

    // TO DO: BEGIN experimental policy here
    const createPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:CreatePolicy'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:policy/company-iot-policy-*`
      ],
    });

    this.functions.attachIoTPolicy.addToRolePolicy(createPolicy);
    const attachPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:AttachPolicy'
      ],
      resources: [
        `*`
      ],
    });
    this.functions.attachIoTPolicy.addToRolePolicy(attachPolicy);

    const cognitoGetId = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-identity:GetId'
      ],
      resources: [
        `arn:aws:cognito-identity:${this.config.region}:identitypool/*`
      ],
    });
    this.functions.attachIoTPolicy.addToRolePolicy(cognitoGetId);

    const cognitoAdminUpdateUserAttributes = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminUpdateUserAttributes'
      ],
      resources: [
        `arn:aws:cognito-idp:${this.config.region}:userpool/*`
      ],
    });
    this.functions.attachIoTPolicy.addToRolePolicy(cognitoAdminUpdateUserAttributes);

    // TO DO: END experimental policy here

    // addThingToGroup function (no layer)
    this.functions.addThingToGroup = this.createLambdaFunction(
      'AddThingToGroupFunction',
      'addThingToGroup',
      '../lambda/addThingToGroupLambda',
      {},
      false // No layer
    );

    // TO DO: BEGIN experimental policy here
   const describeThing = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:DescribeThing'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:thing/*`
      ],
    });
    this.functions.addThingToGroup.addToRolePolicy(describeThing);
   const describeThingGroup = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:DescribeThingGroup',
        'iot:CreateThingGroup'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:thinggroup/Company-Group-*`
      ],
    });
    this.functions.addThingToGroup.addToRolePolicy(describeThingGroup);
   const addIoTThingGroup = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:AddThingToThingGroup'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:thing/*`,
        `arn:aws:iot:${this.config.region}:thinggroup/Company-Group-*`
      ],
    });
    this.functions.addThingToGroup.addToRolePolicy(addIoTThingGroup);
    // TO DO: END experimental policy here

    // republishDeviceConnectionStatus function
    this.functions.republishDeviceConnectionStatus = this.createLambdaFunction(
      'RepublishDeviceConnectionStatusFunction',
      'republishDeviceConnectionStatus',
      '../lambda/republishDeviceConnectionStatusLambda'
    );

    // TO DO: BEGIN experimental policy here
   const describeThing2 = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:DescribeThing'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:thing/*`
      ],
    });
    this.functions.republishDeviceConnectionStatus.addToRolePolicy(describeThing2);
   const publish = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:Publish'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:topic/companies/*/events`
      ],
    });
    this.functions.republishDeviceConnectionStatus.addToRolePolicy(publish);
    // TO DO: END experimental policy here

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

  // TO DO: BEGIN experimental policy here
   const createProvisioningClaim = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iot:CreateProvisioningClaim'
      ],
      resources: [
        `arn:aws:iot:${this.config.region}:provisioningtemplate/*`
      ],
    });
    this.functions.createProvisioningClaim.addToRolePolicy(createProvisioningClaim);
  // TO DO: END experimental policy here

    // Grant IoT permissions
    // const iotPolicy = new iam.PolicyStatement({
    //   effect: iam.Effect.ALLOW,
    //   actions: [
    //     'iot:AttachPolicy',
    //     'iot:DetachPolicy',
    //     'iot:AddThingToThingGroup',
    //     'iot:RemoveThingFromThingGroup',
    //     'iot:Publish',
    //     'iot:CreateProvisioningClaim',
    //     'iot:DescribeEndpoint',
    //   ],
    //   resources: ['*'],
    // });

    // this.functions.attachIoTPolicy.addToRolePolicy(iotPolicy);
    // this.functions.addThingToGroup.addToRolePolicy(iotPolicy);
    // this.functions.republishDeviceConnectionStatus.addToRolePolicy(iotPolicy);
    // this.functions.createProvisioningClaim.addToRolePolicy(iotPolicy);
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

    /**
     * TO DO: BEGIN TEST
     */

    this.functions.postConfirmationLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'PostConfirmationLambdaCognitoPolicy', {
        statements: [
          new iam.PolicyStatement({
            actions: [
              'cognito-idp:AdminUpdateUserAttributes',
              'cognito-idp:AdminAddUserToGroup',
              'cognito-idp:CreateGroup'
            ],
            resources: [
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`
            ]
          })
        ]
      })
    );

    // TO DO: END TEST

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