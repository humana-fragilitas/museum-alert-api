// lib/stacks/cognito-stack.ts - EXPORTS ONLY VERSION
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export class CognitoStack extends BaseStack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.userPool = this.createUserPool();
    this.userPoolClient = this.createUserPoolClient();
    this.identityPool = this.createIdentityPool();
    
    // Export values for other stacks to import (NO trigger configuration here)
    this.createOutputs();
    
    this.applyStandardTags(this);
  }

  private createUserPool(): cognito.UserPool {
    return new cognito.UserPool(this, 'UserPool', {
      userPoolName: this.config.cognito.userPoolName,
      
      // Sign-in configuration - ONLY email, no username
      signInAliases: {
        email: true,
        username: false,
      },
      
      // Self sign-up configuration
      selfSignUpEnabled: true,
      
      // CRITICAL: Auto-verify email addresses
      autoVerify: {
        email: true,
      },
      
      // Email verification settings
      userVerification: {
        emailSubject: 'Verify your email for Museum Alert',
        emailBody: 'Thank you for signing up to Museum Alert! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
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
      
      // Account recovery - EMAIL ONLY (this is important for verification)
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Email configuration - CRITICAL: Use Cognito's built-in email
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

      // Custom attributes
      customAttributes: {
        Company: new cognito.StringAttribute({ 
          minLen: 3, 
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
          minLen: 3, 
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

    // Attach the role to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    return identityPool;
  }

  private createOutputs(): void {
    // Export ALL values for other stacks to import
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