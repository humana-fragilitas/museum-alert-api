import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

import { BaseStack,
         BaseStackProps } from './base-stack';
import { createLambdaFunction } from './lambda-utils';


export interface LambdaStackProps extends BaseStackProps {
    sharedLayer: lambda.LayerVersion;
}

export class LambdaStack extends BaseStack {

  private readonly sharedLayer: lambda.LayerVersion;

  public readonly functions: { [key: string]: lambda.Function } = {};

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);
    this.sharedLayer = props.sharedLayer;
    this.createCompanyFunctions();
    this.createIoTFunctions();
    this.createDeviceManagementFunctions();
    this.createOutputs();
    this.applyStandardTags(this);
  }

  private createCompanyFunctions(): void {

    const config = {
      lambda: {
        timeout: 10,
        memorySize: 512,
      },
    };

    this.functions.getCompany = createLambdaFunction({
      scope: this,
      id: 'GetCompanyFunction',
      functionName: 'getCompany',
      assetPath: './lambda/getCompanyLambda',
      environment: { COMPANIES_TABLE: 'companies' },
      sharedLayer: this.sharedLayer,
      config
    });

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

    this.functions.updateCompany = createLambdaFunction({
      scope: this,
      id: 'UpdateCompanyFunction',
      functionName: 'updateCompany',
      assetPath: './lambda/updateCompanyLambda',
      environment: { COMPANIES_TABLE: 'companies' },
      sharedLayer: this.sharedLayer,
      config
    });

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

    const config = {
      lambda: {
        timeout: 10,
        memorySize: 512,
      },
    };

    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    this.functions.attachIoTPolicy = createLambdaFunction({
      scope: this,
      id: 'AttachIoTPolicyFunction',
      functionName: 'attachIoTPolicy',
      assetPath: './lambda/attachIoTPolicyLambda',
      environment: { IDENTITY_POOL_ID: identityPoolId },
      sharedLayer: this.sharedLayer,
      config
    });

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

    this.functions.addThingToGroup = createLambdaFunction({
      scope: this,
      id: 'AddThingToGroupFunction',
      functionName: 'addThingToGroup',
      assetPath: './lambda/addThingToGroupLambda',
      config
    });

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

    this.functions.republishDeviceConnectionStatus = createLambdaFunction({
      scope: this,
      id: 'RepublishDeviceConnectionStatusFunction',
      functionName: 'republishDeviceConnectionStatus',
      assetPath: './lambda/republishDeviceConnectionStatusLambda',
      config
    });
    
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

    this.functions.createProvisioningClaim = createLambdaFunction({
      scope: this,
      id: 'CreateProvisioningClaimFunction',
      functionName: 'createProvisioningClaim',
      assetPath: './lambda/createProvisioningClaimLambda',
      environment: { TEMPLATE_NAME: this.config.iot.provisioningTemplateName },
      sharedLayer: this.sharedLayer,
      config
    });

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

  private createDeviceManagementFunctions(): void {

    const config = {
      lambda: {
        timeout: 10,
        memorySize: 512,
      },
    };

    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);

    this.functions.preProvisioningHook = createLambdaFunction({
      scope: this,
      id: 'PreProvisioningHookFunction',
      functionName: 'preProvisioningHook',
      assetPath: './lambda/preProvisioningHookLambda',
      environment: { USER_POOL_ID: userPoolId },
      sharedLayer: this.sharedLayer,
      config
    });

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

    this.functions.checkThingExists = createLambdaFunction({
      scope: this,
      id: 'CheckThingExistsFunction',
      functionName: 'checkThingExists',
      assetPath: './lambda/checkThingExistsLambda',
      environment: { USER_POOL_ID: userPoolId },
      sharedLayer: this.sharedLayer,
      config
    });

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

    this.functions.deleteThing = createLambdaFunction({
      scope: this,
      id: 'DeleteThingFunction',
      functionName: 'deleteThing',
      assetPath: './lambda/deleteThingLambda',
      sharedLayer: this.sharedLayer,
      config
    });

    this.functions.deleteThing.role?.attachInlinePolicy(
      new iam.Policy(this, 'deleteThingLambdaPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iot:DescribeThing', 'iot:DeleteThing'],
            resources: [`arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`]
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              'iot:ListThingPrincipals',
              'iot:DetachThingPrincipal',
              'iot:UpdateCertificate',
              'iot:DeleteCertificate',
              'iot:ListAttachedPolicies',
              'iot:DetachPolicy',
              'iot:DeletePolicy'
            ],
            resources: [
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:thing/*`,
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:cert/*`,
              `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:policy/*`
            ]
          })
        ]
      })
    );

  }

  private createOutputs(): void {
    Object.entries(this.functions).forEach(([name, func]) => {
      new cdk.CfnOutput(this, `${name}Arn`, {
        value: func.functionArn,
        exportName: `${this.config.projectName}-${name.toLowerCase()}-arn-${this.config.stage}`,
      });
    });
  }
  
}