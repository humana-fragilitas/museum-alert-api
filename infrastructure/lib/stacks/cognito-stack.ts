import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { BaseStack, BaseStackProps } from './base-stack';
import { createLambdaFunction } from './lambda-utils';


export interface CognitoStackProps extends BaseStackProps {
    sharedLayer: lambda.LayerVersion;
}

export class CognitoStack extends BaseStack {

  private readonly sharedLayer: lambda.LayerVersion;

  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    
    super(scope, id, props);
    this.sharedLayer = props.sharedLayer;
    this.userPool = this.createUserPoolWithTriggers();
    this.userPoolClient = this.createUserPoolClient();
    this.identityPool = this.createIdentityPool();
    this.createOutputs();
    this.applyStandardTags(this);

  }

  private createUserPoolWithTriggers(): cognito.UserPool {

    const config = {
      lambda: {
        timeout: 10,
        memorySize: 512,
      },
    };
    
    const postConfirmationLambda = createLambdaFunction({
      scope: this,
      id: 'PostConfirmationLambdaFunction',
      functionName: 'postConfirmationLambda',
      assetPath: './lambda/postConfirmationLambda',
      environment: { COMPANIES_TABLE: 'companies' },
      sharedLayer: this.sharedLayer,
      config
    });

    postConfirmationLambda.role?.attachInlinePolicy(
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

    postConfirmationLambda.addPermission('AllowCognitoInvoke', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:cognito-idp:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:userpool/*`,
    });

    return new cognito.UserPool(this, 'UserPool', {

      userPoolName: this.config.cognito.userPoolName,

      lambdaTriggers: {
        postConfirmation: postConfirmationLambda,
      },
      
      // Sign-in configuration: email only, no username
      signInAliases: {
        email: true,
        username: false,
      },
      
      // Self sign-up configuration
      selfSignUpEnabled: true,
      
      // Enables account verification
      userVerification: {
        emailSubject: 'Verify your email for Museum Alert',
        emailBody: 'Thank you for signing up to Museum Alert! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      
      // Enables auto-verification on email addresses
      autoVerify: {
        email: true,
      },
      
      // User invitation settings (if using admin-created users)
      userInvitation: {
        emailSubject: 'Welcome to Museum Alert',
        emailBody: 'Your username is {username} and temporary password is {####}',
        smsMessage: 'Your username is {username} and temporary password is {####}',
      },
      
      // Password policy
      passwordPolicy: {
        minLength: this.config.cognito.passwordPolicy.minLength,
        requireUppercase: this.config.cognito.passwordPolicy.requireUppercase,
        requireLowercase: this.config.cognito.passwordPolicy.requireLowercase,
        requireDigits: this.config.cognito.passwordPolicy.requireNumbers,
        requireSymbols: this.config.cognito.passwordPolicy.requireSymbols,
      },
      
      // MFA disabled for simplicity
      mfa: cognito.Mfa.OFF,
      
      // Account recovery: email only
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Email configuration: use Cognito's built-in email
      email: cognito.UserPoolEmail.withCognito(),
      
      // Enables device tracking for better security
      deviceTracking: {
        challengeRequiredOnNewDevice: false,
        deviceOnlyRememberedOnUserPrompt: false,
      },
      
      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
      },

      // Custom attributes
      customAttributes: {
        Company: new cognito.StringAttribute({ 
          minLen: 36, 
          maxLen: 36, 
          mutable: true 
        }),
        hasPolicy: new cognito.NumberAttribute({ 
          min: 0, 
          max: 1, 
          mutable: true 
        }),
        isProfessional: new cognito.NumberAttribute({ 
          min: 0, 
          max: 1, 
          mutable: true 
        }),
        secondaryCompany: new cognito.StringAttribute({ 
          minLen: 36, 
          maxLen: 36, 
          mutable: true 
        }),
      },
      
      // Removal policy
      removalPolicy: this.config.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

  }

  private createUserPoolClient(): cognito.UserPoolClient {

    return new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${this.config.projectName}-client`,
      
      // Auth flows for Amplify UI
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Prevent user existence errors
      preventUserExistenceErrors: true,
    });

  }

  private createIdentityPool(): cognito.CfnIdentityPool {

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: this.config.cognito.identityPoolName,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Create IAM roles for authenticated users
    const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: this.createResourceName('role', 'cognito-authenticated'),
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      /**
       * Note: users are attached an ad personam IoT Core policy upon successful registration and login;
       * see attachIoTPolicy lambda function for more insight
       */
      inlinePolicies: {
        IoTPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'iot:Connect',
                'iot:Publish',
                'iot:Subscribe',
                'iot:Receive',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Attaches role to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    return identityPool;

  }

  private createOutputs(): void {

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${this.config.projectName}-user-pool-id-${this.config.stage}`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${this.config.projectName}-user-pool-client-id-${this.config.stage}`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: `${this.config.projectName}-user-pool-arn-${this.config.stage}`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      exportName: `${this.config.projectName}-identity-pool-id-${this.config.stage}`,
    });

  }

}
