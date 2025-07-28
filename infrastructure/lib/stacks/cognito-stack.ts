// lib/stacks/cognito-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface CognitoStackProps extends BaseStackProps {
  // We'll add Lambda triggers later via separate method
}

export class CognitoStack extends BaseStack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    this.userPool = this.createUserPool();
    this.userPoolClient = this.createUserPoolClient();
    this.identityPool = this.createIdentityPool();
    
    // Export values for other stacks to import
    this.createOutputs();
    
    this.applyStandardTags(this);
  }

  private createOutputs(): void {
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${this.config.projectName}-user-pool-id-${this.config.stage}`,
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

  private createUserPool(): cognito.UserPool {
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: this.config.cognito.userPoolName,
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: true,
      },
      
      // Self sign-up configuration (based on "open-signup" in your pool name)
      selfSignUpEnabled: true,
      
      // Password policy
      passwordPolicy: {
        minLength: this.config.cognito.passwordPolicy.minLength,
        requireUppercase: this.config.cognito.passwordPolicy.requireUppercase,
        requireLowercase: this.config.cognito.passwordPolicy.requireLowercase,
        requireDigits: this.config.cognito.passwordPolicy.requireNumbers,
        requireSymbols: this.config.cognito.passwordPolicy.requireSymbols,
      },
      
      // MFA configuration
      mfa: this.config.cognito.mfaConfiguration === 'REQUIRED' 
        ? cognito.Mfa.REQUIRED 
        : this.config.cognito.mfaConfiguration === 'OPTIONAL'
        ? cognito.Mfa.OPTIONAL
        : cognito.Mfa.OFF,
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Email configuration
      email: cognito.UserPoolEmail.withCognito(),
      
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
      
      // Removal policy
      removalPolicy: this.config.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    return userPool;
  }

  private createUserPoolClient(): cognito.UserPoolClient {
    return new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${this.config.projectName}-client`,
      
      // Auth flows
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      
      // OAuth configuration for Amplify
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:3000/', // For local development
          // Add your production URLs here
        ],
        logoutUrls: [
          'http://localhost:3000/', // For local development
          // Add your production URLs here
        ],
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
      allowUnauthenticatedIdentities: false, // Require authentication
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
              resources: ['*'], // You may want to restrict this based on your IoT topic structure
            }),
          ],
        }),
      },
    });

    // Attach the role to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    return identityPool;
  }
}