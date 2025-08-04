// lib/stacks/lambda-stack.ts - COMPLETELY DECOUPLED VERSION
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface LambdaStackProps extends BaseStackProps {
  // NO construct references - completely independent
}

export class LambdaStack extends BaseStack {
  public readonly functions: { [key: string]: lambda.Function } = {};
  public readonly sharedLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Create the shared layer FIRST
    this.sharedLayer = this.createSharedLayer();

    // Create Lambda functions using CloudFormation imports for Cognito values
    this.createCompanyFunctions();
    this.createIoTFunctions();
    this.createCognitoTriggerFunctions();
    this.createDeviceManagementFunctions();
    
    // Export Lambda function ARNs for other stacks to import
    this.createOutputs();
    
    this.applyStandardTags(this);
  }

  private createSharedLayer(): lambda.LayerVersion {
    return new lambda.LayerVersion(this, 'SharedLayer', {
      layerVersionName: `${this.config.projectName}-shared-layer-${this.config.stage}`,
      code: lambda.Code.fromAsset('./lambda/lambdaLayer', {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash', '-c', [
              'cp -r /asset-input/* /asset-output/',
              'cd /asset-output/nodejs',
              'npm install --only=production',
            ].join(' && ')
          ],
        },
        exclude: [
          'node_modules',
          'cdk.out',
          '.git',
          '*.log',
          '.DS_Store',
          'libraries',
        ],
      }),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: 'Shared utilities for Museum Alert Lambda functions',
      removalPolicy: this.config.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });
  }

  private createLambdaFunction(
    id: string, 
    functionName: string, 
    assetPath: string, 
    environment: { [key: string]: string } = {},
    useLayer: boolean = true
  ): lambda.Function {
    const func = new lambda.Function(this, id, {
      functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(assetPath, {
        exclude: [
          'cdk.out',
          '.git',
          '*.log',
          '.DS_Store',
          'libraries',
          '*.zip',
          'test',
          'tests',
          '__pycache__',
          '.env',
          'node_modules'
        ],
      }),
      layers: useLayer ? [this.sharedLayer] : undefined,
      environment,
      timeout: cdk.Duration.seconds(this.config.lambda.timeout),
      memorySize: this.config.lambda.memorySize,
      logRetention: logs.RetentionDays.ONE_DAY
    });

    // 📝 Create log group separately
    new logs.LogGroup(this, `${functionName}LogGroup`, {
      logGroupName: `/aws/lambda/${func.functionName}`,
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CRITICAL: Add basic CloudWatch logging permissions to ALL Lambda functions
    func.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    return func;
  }

  private createCompanyFunctions(): void {
    // getCompany function
    this.functions.getCompany = this.createLambdaFunction(
      'GetCompanyFunction',
      'getCompany',
      './lambda/getCompanyLambda',
      {
        COMPANIES_TABLE: 'companies',
      }
    );

    this.functions.getCompany.role?.attachInlinePolicy(
      new iam.Policy(this, 'getCompanyLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            actions: ['dynamodb:GetItem'],
            resources: [
              `arn:aws:dynamodb:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:table/companies`
            ]
          })
        ]
      })
    );

    // updateCompany function
    this.functions.updateCompany = this.createLambdaFunction(
      'UpdateCompanyFunction',
      'updateCompany',
      './lambda/updateCompanyLambda',
      {
        COMPANIES_TABLE: 'companies',
      }
    );

    this.functions.updateCompany.role?.attachInlinePolicy(
      new iam.Policy(this, 'updateCompanyLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
            resources: [
              `arn:aws:dynamodb:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:table/companies`
            ]
          })
        ]
      })
    );
  }

  private createIoTFunctions(): void {
    // Import Identity Pool ID from Cognito stack (NO direct reference)
    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    // attachIoTPolicy function
    this.functions.attachIoTPolicy = this.createLambdaFunction(
      'AttachIoTPolicyFunction',
      'attachIoTPolicy',
      './lambda/attachIoTPolicyLambda',
      {
        IDENTITY_POOL_ID: identityPoolId,
      }
    );

    this.functions.attachIoTPolicy.role?.attachInlinePolicy(
      new iam.Policy(this, 'attachIoTPolicyLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:CreatePolicy'],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:policy/company-iot-policy-*`
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:AttachPolicy'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['cognito-identity:GetId'],
            resources: [
              `arn:aws:cognito-identity:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:identitypool/*`
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['cognito-idp:AdminUpdateUserAttributes'],
            resources: [
              `arn:aws:cognito-idp:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:userpool/*`
            ],
          })
        ]
      })
    );

    // addThingToGroup function
    this.functions.addThingToGroup = this.createLambdaFunction(
      'AddThingToGroupFunction',
      'addThingToGroup',
      './lambda/addThingToGroupLambda',
      {},
      false
    );

    this.functions.addThingToGroup.role?.attachInlinePolicy(
      new iam.Policy(this, 'addThingToGroupLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeThing'],
            resources: [`arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:AddThingToThingGroup'],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`,
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thinggroup/Company-Group-*`
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeThingGroup', 'iot:CreateThingGroup'],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thinggroup/Company-Group-*`
            ],
          })
        ]
      })
    );

    // republishDeviceConnectionStatus function
    this.functions.republishDeviceConnectionStatus = this.createLambdaFunction(
      'RepublishDeviceConnectionStatusFunction',
      'republishDeviceConnectionStatus',
      './lambda/republishDeviceConnectionStatusLambda'
    );
    
    this.functions.republishDeviceConnectionStatus.role?.attachInlinePolicy(
      new iam.Policy(this, 'republishDeviceConnectionStatusLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeThing'],
            resources: [`arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:Publish'],
            resources: [`arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:topic/companies/*/events`],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeEndpoint'],
            resources: ['*']
          })
        ]
      })
    );

    // createProvisioningClaim function
    this.functions.createProvisioningClaim = this.createLambdaFunction(
      'CreateProvisioningClaimFunction',
      'createProvisioningClaim',
      './lambda/createProvisioningClaimLambda',
      {
        TEMPLATE_NAME: this.config.iot.provisioningTemplateName,
        IDENTITY_POOL_ID: identityPoolId,
      }
    );

    this.functions.createProvisioningClaim.role?.attachInlinePolicy(
      new iam.Policy(this, 'createProvisioningClaimLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:CreateProvisioningClaim'],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:provisioningtemplate/*`
            ],
          })
        ]
      })
    );
  }

  private createCognitoTriggerFunctions(): void {
    // Import Identity Pool ID (NOT direct reference)
    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    this.functions.postConfirmationLambda = this.createLambdaFunction(
      'PostConfirmationLambdaFunction',
      'postConfirmationLambda',
      './lambda/postConfirmationLambda',
      {
        IDENTITY_POOL_ID: identityPoolId,
        COMPANIES_TABLE: 'companies',
      }
    );

    this.functions.postConfirmationLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'postConfirmationLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:DeleteItem',
              'dynamodb:GetItem'
            ],
            resources: [
              `arn:aws:dynamodb:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:table/companies`
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'cognito-idp:AdminUpdateUserAttributes',
              'cognito-idp:CreateGroup',
              'cognito-idp:AdminAddUserToGroup'
            ],
            resources: [
              `arn:aws:cognito-idp:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:userpool/*`
            ],
          })
        ]
      })
    );

    this.functions.deleteUserLambda = this.createLambdaFunction(
      'DeleteUserLambdaFunction',
      'deleteUserLambda',
      './lambda/deleteUserLambda',
      {},
      false
    );
  }

  private createDeviceManagementFunctions(): void {
    // Import User Pool ID (NOT direct reference)
    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);

    this.functions.getThingsByCompany = this.createLambdaFunction(
      'GetThingsByCompanyFunction',
      'getThingsByCompany',
      './lambda/getThingsByCompanyLambda',
      {
        USER_POOL_ID: userPoolId,
      }
    );

    this.functions.getThingsByCompany.role?.attachInlinePolicy(
      new iam.Policy(this, 'getThingsByCompanyLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:ListThingsInThingGroup'],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thinggroup/Company-Group-*`
            ]
          })
        ]
      })
    );

    this.functions.preProvisioningHook = this.createLambdaFunction(
      'PreProvisioningHookFunction',
      'preProvisioningHook',
      './lambda/preProvisioningHookLambda',
      {
        USER_POOL_ID: userPoolId,
      }
    );

    this.functions.preProvisioningHook.role?.attachInlinePolicy(
      new iam.Policy(this, 'preProvisioningHookLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeThing', 'iot:DescribeCertificate'],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`,
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:cert/*`
            ]
          })
        ]
      })
    );

    this.functions.checkThingExists = this.createLambdaFunction(
      'CheckThingExistsFunction',
      'checkThingExists',
      './lambda/checkThingExistsLambda',
      {
        USER_POOL_ID: userPoolId,
      }
    );

    this.functions.checkThingExists.role?.attachInlinePolicy(
      new iam.Policy(this, 'checkThingExistsLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeThing'],
            resources: [`arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`]
          })
        ]
      })
    );
  }

  private createOutputs(): void {
    // Export ALL Lambda function ARNs for other stacks to import
    Object.entries(this.functions).forEach(([name, func]) => {
      new cdk.CfnOutput(this, `${name}Arn`, {
        value: func.functionArn,
        exportName: `${this.config.projectName}-${name.toLowerCase()}-arn-${this.config.stage}`,
      });
    });
  }
}