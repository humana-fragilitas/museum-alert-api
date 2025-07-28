// lib/stacks/triggers-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export class TriggersStack extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.addCognitoTriggers();
    this.createIoTTopicRules();
    
    this.applyStandardTags(this);
  }

  private addCognitoTriggers(): void {
    // Import values from other stacks
    const userPoolArn = cdk.Fn.importValue(`${this.config.projectName}-user-pool-arn-${this.config.stage}`);
    const postConfirmationLambdaArn = cdk.Fn.importValue(`${this.config.projectName}-post-confirmation-arn-${this.config.stage}`);

    // Get the existing User Pool by ARN (read-only reference)
    const userPool = cognito.UserPool.fromUserPoolArn(this, 'ImportedUserPool', userPoolArn);

    // Get the existing Lambda function by ARN (read-only reference)  
    const postConfirmationFunction = lambda.Function.fromFunctionArn(
        this, 'ImportedPostConfirmationLambda', postConfirmationLambdaArn,
    );

    // Create a custom resource to add the Lambda trigger
    const triggerUpdater = new lambda.Function(this, 'CognitoTriggerUpdater', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cognito = new AWS.CognitoIdentityServiceProvider();
        
        exports.handler = async (event, context) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          
          const { RequestType, ResourceProperties } = event;
          const { UserPoolId, PostConfirmationLambdaArn } = ResourceProperties;
          
          if (RequestType === 'Delete') {
            // Remove the trigger
            try {
              await cognito.updateUserPool({
                UserPoolId: UserPoolId,
                LambdaConfig: {}
              }).promise();
            } catch (error) {
              console.log('Error removing trigger:', error);
            }
            return { PhysicalResourceId: 'cognito-trigger-updater' };
          }
          
          try {
            // Add the post-confirmation trigger
            await cognito.updateUserPool({
              UserPoolId: UserPoolId,
              LambdaConfig: {
                PostConfirmation: PostConfirmationLambdaArn
              }
            }).promise();
            
            console.log('Successfully added PostConfirmation trigger');
            return { PhysicalResourceId: 'cognito-trigger-updater' };
          } catch (error) {
            console.error('Error updating User Pool:', error);
            throw error;
          }
        };
      `),
      timeout: cdk.Duration.minutes(2),
    });

    // Grant permissions to update Cognito User Pool
    triggerUpdater.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:UpdateUserPool',
        'cognito-idp:DescribeUserPool',
      ],
      resources: [userPoolArn],
    }));

    // Create custom resource
    new cdk.CustomResource(this, 'CognitoTriggerResource', {
      serviceToken: triggerUpdater.functionArn,
      properties: {
        UserPoolId: userPool.userPoolId,
        PostConfirmationLambdaArn: postConfirmationLambdaArn,
        // Force update when function ARN changes
        FunctionVersion: new Date().toISOString(),
      },
    });

    // Grant Cognito permission to invoke the Lambda
    postConfirmationFunction.addPermission('CognitoTriggerPermission', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: userPoolArn,
    });
  }

  private createIoTTopicRules(): void {
    // Import Lambda ARNs
    const republishArn = cdk.Fn.importValue(`${this.config.projectName}-republishdeviceconnectionstatus-arn-${this.config.stage}`);
    const addThingArn = cdk.Fn.importValue(`${this.config.projectName}-addthingtogroup-arn-${this.config.stage}`);

    // Get Lambda functions by ARN
    const republishFunction = lambda.Function.fromFunctionArn(this, 'ImportedRepublishFunction', republishArn);
    const addThingFunction = lambda.Function.fromFunctionArn(this, 'ImportedAddThingFunction', addThingArn);

    // Rule for device connection status
    const connectionStatusRule = new iot.CfnTopicRule(this, 'DeviceConnectionStatusRule', {
      ruleName: `${this.config.projectName.replace('-', '')}_republish_connection_status_${this.config.stage}`,
      topicRulePayload: {
        description: 'Republish device connection status events',
        sql: "SELECT * FROM '$aws/events/presence/connected/+' WHERE startswith(clientId, 'MAS-')",
        actions: [
          {
            lambda: {
              functionArn: republishArn,
            },
          },
        ],
        ruleDisabled: false,
      },
    });

    // Rule for adding things to groups
    const addToGroupRule = new iot.CfnTopicRule(this, 'AddThingToGroupRule', {
      ruleName: `${this.config.projectName.replace('-', '')}_add_thing_to_group_${this.config.stage}`,
      topicRulePayload: {
        description: 'Add newly created things to appropriate groups',
        sql: "SELECT * FROM '$aws/events/thing/+/created'",
        actions: [
          {
            lambda: {
              functionArn: addThingArn,
            },
          },
        ],
        ruleDisabled: false,
      },
    });

    // Grant permissions for IoT to invoke Lambda functions
    republishFunction.addPermission('IoTTopicRulePermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: connectionStatusRule.attrArn,
    });

    addThingFunction.addPermission('IoTTopicRulePermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: addToGroupRule.attrArn,
    });
  }
}