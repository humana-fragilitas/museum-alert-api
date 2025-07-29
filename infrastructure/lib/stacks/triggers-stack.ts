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

    // Get the existing Lambda function by ARN
    const postConfirmationFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPostConfirmationLambda', {
      functionArn: postConfirmationLambdaArn,
      sameEnvironment: true
    });

    // Grant Cognito permission to invoke the Lambda
    postConfirmationFunction.addPermission('CognitoTriggerPermission', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: userPoolArn,
    });

    // Add helpful outputs for manual configuration
    new cdk.CfnOutput(this, 'PostConfirmationSetupCommand', {
      value: `aws cognito-idp update-user-pool --user-pool-id \${USER_POOL_ID} --lambda-config PostConfirmation=${postConfirmationLambdaArn}`,
      description: 'Command to manually add PostConfirmation trigger'
    });

    new cdk.CfnOutput(this, 'PostConfirmationLambdaArn', {
      value: postConfirmationLambdaArn,
      description: 'PostConfirmation Lambda ARN for manual setup'
    });
  }

  private createIoTTopicRules(): void {
    // Import Lambda ARNs
    const republishArn = cdk.Fn.importValue(`${this.config.projectName}-republishdeviceconnectionstatus-arn-${this.config.stage}`);
    const addThingArn = cdk.Fn.importValue(`${this.config.projectName}-addthingtogroup-arn-${this.config.stage}`);

    // Get Lambda functions by ARN
    const republishFunction = lambda.Function.fromFunctionAttributes(
  this, 'ImportedRepublishFunction', {
    functionArn: republishArn,
    sameEnvironment: true
  }
);
    const addThingFunction = lambda.Function.fromFunctionAttributes(
  this, 'ImportedAddThingFunction', {
    functionArn: addThingArn,
    sameEnvironment: true
  }
);

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