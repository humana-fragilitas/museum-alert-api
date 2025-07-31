// lib/stacks/triggers-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export class TriggersStack extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // Only handle IoT Topic Rules - Cognito trigger is handled by CognitoStack
    this.createIoTTopicRules();
    
    this.applyStandardTags(this);
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

const ruleExecutionRole = new iam.Role(this, 'RuleExecutionRole', {
  roleName: this.createResourceName('role', 'rule-execution'),
  assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),

  // EXACT managed policies for IoT Rule Actions and Logging
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTRuleActions'),
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTLogging'),
  ],

  // Inline policy with necessary permissions
  inlinePolicies: {
    'iot-rule-action-policy': new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'iot:Publish',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
          ],
          resources: ['*'], // Wildcard as per production standard
        }),
      ],
    }),
  },
});


const forwardToCompanyEventsRule = new iot.CfnTopicRule(this, 'ForwardToCompanyEventsRule', {
  ruleName: `${this.config.projectName.replace('-', '')}_forward_to_company_events_${this.config.stage}`,
  topicRulePayload: {
    sql: "SELECT type, cid, topic(4) AS sn, timestamp() AS timestamp, data FROM 'companies/+/devices/+/events'",
    description: 'Forward device events to company-specific topics and CloudWatch Logs',
    actions: [
      {
        republish: {
          roleArn: ruleExecutionRole.roleArn,
          topic: 'companies/${topic(2)}/events'
        }
      },
      {
        cloudwatchLogs: {
          roleArn: ruleExecutionRole.roleArn,
          logGroupName: `/aws/iot/companyEvents`
        }
      }
    ],
    ruleDisabled: false
  }
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

    // Output confirmation
    new cdk.CfnOutput(this, 'IoTRulesConfigured', {
      value: 'AUTOMATICALLY CONFIGURED',
      description: '✅ IoT Topic Rules configured via IaC',
    });
  }
}