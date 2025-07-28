// lib/stacks/environment-variables-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface EnvironmentVariablesStackProps extends BaseStackProps {
  userPool: cognito.UserPool;
  identityPool: cognito.CfnIdentityPool;
}

export class EnvironmentVariablesStack extends BaseStack {
  constructor(scope: Construct, id: string, props: EnvironmentVariablesStackProps) {
    super(scope, id, props);

    // Create custom resources to update Lambda environment variables
    this.createEnvironmentVariableUpdaters(props.userPool, props.identityPool);
    
    this.applyStandardTags(this);
  }

  private createEnvironmentVariableUpdaters(
    userPool: cognito.UserPool,
    identityPool: cognito.CfnIdentityPool
  ): void {
    // Create Lambda function to update other Lambda functions' environment variables
    const updaterFunction = new lambda.Function(this, 'EnvironmentVariableUpdater', {
      functionName: `${this.config.projectName}-env-updater-${this.config.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const lambda = new AWS.Lambda();
        
        exports.handler = async (event, context) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          
          const { RequestType, ResourceProperties } = event;
          
          if (RequestType === 'Delete') {
            return { PhysicalResourceId: 'env-updater' };
          }
          
          const { FunctionNames, UserPoolId, IdentityPoolId } = ResourceProperties;
          
          // Functions that need USER_POOL_ID
          const userPoolFunctions = ['getThingsByCompany', 'preProvisioningHook', 'checkThingExists'];
          
          // Functions that need IDENTITY_POOL_ID  
          const identityPoolFunctions = ['attachIoTPolicy', 'createProvisioningClaim', 'postConfirmationLambda'];
          
          for (const functionName of userPoolFunctions) {
            try {
              const params = {
                FunctionName: functionName,
                Environment: {
                  Variables: {
                    USER_POOL_ID: UserPoolId,
                    COMPANIES_TABLE: 'companies'
                  }
                }
              };
              await lambda.updateFunctionConfiguration(params).promise();
              console.log(\`Updated \${functionName} with USER_POOL_ID\`);
            } catch (error) {
              console.log(\`Function \${functionName} not found or update failed:, error);
            }
          }
          
          for (const functionName of identityPoolFunctions) {
            try {
              const params = {
                FunctionName: functionName,
                Environment: {
                  Variables: {
                    IDENTITY_POOL_ID: IdentityPoolId,
                    COMPANIES_TABLE: 'companies'
                  }
                }
              };
              await lambda.updateFunctionConfiguration(params).promise();
              console.log(\`Updated \${functionName} with IDENTITY_POOL_ID\`);
            } catch (error) {
              console.log(\`Function \${functionName} not found or update failed:\`, error);
            }
          }
          
          return { PhysicalResourceId: 'env-updater' };
        };
      `),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    // Grant permissions to update Lambda functions
    updaterFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'lambda:UpdateFunctionConfiguration',
        'lambda:GetFunction',
      ],
      resources: [`arn:aws:lambda:${this.config.region}:*:function:*`],
    }));

    // Create custom resource that triggers the updater
    new cdk.CustomResource(this, 'EnvironmentVariableUpdate', {
      serviceToken: updaterFunction.functionArn,
      properties: {
        UserPoolId: userPool.userPoolId,
        IdentityPoolId: identityPool.ref,
        // Trigger update when these values change
        Timestamp: new Date().toISOString(),
      },
    });
  }
}