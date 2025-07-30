// lib/stacks/cognito-wiring-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as customResources from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export class CognitoWiringStack extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.configureCognitoTrigger();
    
    this.applyStandardTags(this);
  }

  private configureCognitoTrigger(): void {
    // Import User Pool ID directly (simpler and more reliable)
    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);
    const userPoolArn = cdk.Fn.importValue(`${this.config.projectName}-user-pool-arn-${this.config.stage}`);
    const postConfirmationLambdaArn = cdk.Fn.importValue(`${this.config.projectName}-post-confirmation-arn-${this.config.stage}`);

    // Get references to existing resources
    const userPool = cognito.UserPool.fromUserPoolArn(this, 'ImportedUserPool', userPoolArn);
    const postConfirmationFunction = lambda.Function.fromFunctionAttributes(
      this, 
      'ImportedPostConfirmationLambda', 
      {
        functionArn: postConfirmationLambdaArn,
        sameEnvironment: true,
      }
    );

    // Grant Cognito permission to invoke the Lambda
    postConfirmationFunction.addPermission('CognitoTriggerPermission', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: userPoolArn,
    });

    // Use a custom resource to configure the trigger
    const configureRule = new cdk.CustomResource(this, 'ConfigureCognitoTrigger', {
      serviceToken: this.createTriggerConfiguratorProvider().serviceToken,
      properties: {
        // Use the directly imported User Pool ID
        UserPoolId: userPoolId,
        PostConfirmationLambdaArn: postConfirmationLambdaArn,
      },
    });

    new cdk.CfnOutput(this, 'CognitoTriggerStatus', {
      value: 'AUTOMATICALLY CONFIGURED VIA CUSTOM RESOURCE',
      description: '✅ PostConfirmation trigger configured via IaC',
    });
  }

  private createTriggerConfiguratorProvider(): customResources.Provider {
    const triggerConfiguratorLambda = new lambda.Function(this, 'TriggerConfiguratorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { CognitoIdentityProviderClient, UpdateUserPoolCommand } = require('@aws-sdk/client-cognito-identity-provider');

        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          
          const { UserPoolId, PostConfirmationLambdaArn } = event.ResourceProperties;
          const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

          try {
            if (event.RequestType === 'Delete') {
              // Remove the trigger on delete
              const command = new UpdateUserPoolCommand({
                UserPoolId: UserPoolId,
                LambdaConfig: {}
              });
              await client.send(command);
              
              return {
                Status: 'SUCCESS',
                PhysicalResourceId: 'cognito-trigger-config',
                Data: { Status: 'Trigger removed' }
              };
            }

            // Create or Update - configure the trigger
            const command = new UpdateUserPoolCommand({
              UserPoolId: UserPoolId,
              LambdaConfig: {
                PostConfirmation: PostConfirmationLambdaArn
              }
            });

            await client.send(command);
            
            return {
              Status: 'SUCCESS',
              PhysicalResourceId: 'cognito-trigger-config',
              Data: { Status: 'Trigger configured successfully' }
            };
          } catch (error) {
            console.error('Error:', error);
            return {
              Status: 'FAILED',
              PhysicalResourceId: 'cognito-trigger-config',
              Reason: error.message
            };
          }
        };
      `),
      timeout: cdk.Duration.seconds(60),
    });

    // Grant permissions to update Cognito User Pool
    triggerConfiguratorLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:UpdateUserPool',
        'cognito-idp:DescribeUserPool'
      ],
      resources: [`arn:aws:cognito-idp:${this.config.region}:*:userpool/*`],
    }));

    return new customResources.Provider(this, 'TriggerConfiguratorProvider', {
      onEventHandler: triggerConfiguratorLambda,
    });
  }
}