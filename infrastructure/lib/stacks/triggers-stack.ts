import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';

import { BaseStack,
         BaseStackProps } from './base-stack';


export class TriggersStack extends BaseStack {

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);
    this.createIoTTopicRules();
    this.applyStandardTags(this);
  }

  private createIoTTopicRules(): void {

    const republishArn = cdk.Fn.importValue(`${this.config.projectName}-republishdeviceconnectionstatus-arn-${this.config.stage}`);
    const addThingArn = cdk.Fn.importValue(`${this.config.projectName}-addthingtogroup-arn-${this.config.stage}`);

    const republishFunction = lambda.Function.fromFunctionAttributes(
      this, 
      'ImportedRepublishFunction', 
      {
        functionArn: republishArn,
        sameEnvironment: true,
      }
    );
    
    const addThingFunction = lambda.Function.fromFunctionAttributes(
      this, 
      'ImportedAddThingFunction', 
      {
        functionArn: addThingArn,
        sameEnvironment: true,
      }
    );

    // Adds rule to republish devices' connection status to company-specific topics
    const connectionStatusRule = new iot.CfnTopicRule(this, 'DeviceConnectionStatusRule', {
      ruleName: `${this.config.projectName.replace('-', '')}_republish_connection_status_${this.config.stage}`,
      topicRulePayload: {
        description: 'Republish device connection status events',
        sql: "SELECT * FROM '$aws/events/presence/+/+' WHERE startswith(clientid(), 'MAS-')",
        awsIotSqlVersion: '2016-03-23',
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

    // Adds rule to automatically assign newly created devices to company-specific groups
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

    // Create execution role for republish rule
    const ruleExecutionRole = new iam.Role(this, 'RuleExecutionRole', {

      roleName: this.createResourceName('role', 'rule-execution'),
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),

      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTRuleActions'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTLogging'),
      ],

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
              resources: ['*'],
            }),
          ],
        }),
      }

    });

    // Forward to company events rule
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
    new lambda.CfnPermission(this, 'AllowIoTInvokeRepublishLambda', {
      action: 'lambda:InvokeFunction',
      principal: 'iot.amazonaws.com',
      functionName: republishArn,
      sourceArn: connectionStatusRule.attrArn,
    });

    addThingFunction.addPermission('IoTTopicRulePermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: addToGroupRule.attrArn,
    });

    // Output confirmation
    new cdk.CfnOutput(this, 'IoTRulesConfigured', {
      value: 'AUTOMATICALLY CONFIGURED VIA IMPORTS',
      description: 'IoT Topic Rules configured via CloudFormation imports',
    });

  }

}