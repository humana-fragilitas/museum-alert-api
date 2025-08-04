// lib/stacks/cognito-wiring-stack.ts - FIXED VERSION
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
    // Import User Pool ID from Cognito stack
    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);
    
    // Import PostConfirmation Lambda ARN from Lambda stack
    const postConfirmationArn = cdk.Fn.importValue(`${this.config.projectName}-postconfirmationlambda-arn-${this.config.stage}`);

    // Get the Lambda function by ARN for permissions
    const postConfirmationFunction = lambda.Function.fromFunctionArn(
      this, 
      'ImportedPostConfirmationLambda', 
      postConfirmationArn
    );

    // Use AwsCustomResource to update the User Pool with Lambda trigger
    const updateUserPoolTrigger = new customResources.AwsCustomResource(this, 'UpdateUserPoolTrigger', {
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPool',
        parameters: {
          UserPoolId: userPoolId,
          LambdaConfig: {
            PostConfirmation: postConfirmationArn,
          },
        },
        region: this.config.region,
        physicalResourceId: customResources.PhysicalResourceId.of(`user-pool-trigger-${userPoolId}`),
      },
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [
          cdk.Fn.sub('arn:aws:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/*')
        ],
      }),
    });

    // Grant Cognito permission to invoke the Lambda
    postConfirmationFunction.addPermission('CognitoTriggerPermission', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: cdk.Fn.sub('arn:aws:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/${UserPoolId}', {
        UserPoolId: userPoolId
      }),
    });

    // Output confirmation
    new cdk.CfnOutput(this, 'PostConfirmationTriggerStatus', {
      value: 'CONFIGURED VIA AWS CUSTOM RESOURCE',
      description: '✅ PostConfirmation trigger configured via AwsCustomResource',
    });
  }
}