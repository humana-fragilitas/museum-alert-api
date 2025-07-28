// lib/stacks/wiring-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface WiringStackProps extends BaseStackProps {
  userPool: cognito.UserPool;
  lambdaFunctions: { [key: string]: lambda.Function };
}

export class WiringStack extends BaseStack {
  constructor(scope: Construct, id: string, props: WiringStackProps) {
    super(scope, id, props);

    // 1. Wire up Cognito Lambda triggers
    this.configureCognitoTriggers(props.userPool, props.lambdaFunctions);
    
    // 2. Create IoT Topic Rules
    this.createIoTTopicRules(props.lambdaFunctions);
    
    this.applyStandardTags(this);
  }

  private configureCognitoTriggers(userPool: cognito.UserPool, functions: { [key: string]: lambda.Function }): void {
    if (functions.postConfirmationLambda) {
      // Add the post confirmation trigger to the existing User Pool
      const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
      cfnUserPool.lambdaConfig = {
        postConfirmation: functions.postConfirmationLambda.functionArn,
      };

      // Grant Cognito permission to invoke the Lambda
      functions.postConfirmationLambda.addPermission('CognitoTriggerPermission', {
        principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
        sourceArn: userPool.userPoolArn,
      });
    }
  }

  private createIoTTopicRules(functions: { [key: string]: lambda.Function }): void {
    // Rule for device connection status
    if (functions.republishDeviceConnectionStatus) {
      const connectionStatusRule = new iot.CfnTopicRule(this, 'DeviceConnectionStatusRule', {
        ruleName: `${this.config.projectName}-republish-connection-status-${this.config.stage}`,
        topicRulePayload: {
          description: 'Republish device connection status events',
          sql: "SELECT * FROM '$aws/events/presence/connected/+' WHERE startswith(clientId, 'MAS-')",
          actions: [
            {
              lambda: {
                functionArn: functions.republishDeviceConnectionStatus.functionArn,
              },
            },
          ],
          ruleDisabled: false,
        },
      });

      // Grant permission for IoT to invoke the Lambda
      functions.republishDeviceConnectionStatus.addPermission('IoTInvokePermission', {
        principal: new iam.ServicePrincipal('iot.amazonaws.com'),
        sourceArn: connectionStatusRule.attrArn,
      });
    }

    // Rule for adding things to groups
    if (functions.addThingToGroup) {
      const addToGroupRule = new iot.CfnTopicRule(this, 'AddThingToGroupRule', {
        ruleName: `${this.config.projectName}-add-thing-to-group-${this.config.stage}`,
        topicRulePayload: {
          description: 'Add newly created things to appropriate groups',
          sql: "SELECT * FROM '$aws/events/thing/+/created'",
          actions: [
            {
              lambda: {
                functionArn: functions.addThingToGroup.functionArn,
              },
            },
          ],
          ruleDisabled: false,
        },
      });

      // Grant permission for IoT to invoke the Lambda
      functions.addThingToGroup.addPermission('IoTInvokePermissionAddGroup', {
        principal: new iam.ServicePrincipal('iot.amazonaws.com'),
        sourceArn: addToGroupRule.attrArn,
      });
    }
  }
}