// lib/stacks/iot-stack.ts
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface IoTStackProps extends BaseStackProps {
  iamRoles: { [key: string]: iam.Role };
  lambdaFunctions: { [key: string]: lambda.Function };
}

export class IoTStack extends BaseStack {
  public readonly thingType: iot.CfnThingType;
  public readonly provisioningTemplate: iot.CfnProvisioningTemplate;
  public readonly policies: { [key: string]: iot.CfnPolicy } = {};

  constructor(scope: Construct, id: string, props: IoTStackProps) {
    super(scope, id, props);

    this.thingType = this.createThingType();
    this.createIoTPolicies();
    this.provisioningTemplate = this.createProvisioningTemplate(props.lambdaFunctions);
    this.createTopicRules(props.lambdaFunctions);
    
    this.applyStandardTags(this);
  }

  private createThingType(): iot.CfnThingType {
    return new iot.CfnThingType(this, 'MuseumAlertSensorThingType', {
      thingTypeName: this.config.iot.thingTypeName,
      thingTypeProperties: {
        thingTypeDescription: 'Museum Alert Sensor device type',
        searchableAttributes: ['companyId', 'location', 'sensorType'],
      },
    });
  }

  private createIoTPolicies(): void {
    // Device policy for sensors
    this.policies.devicePolicy = new iot.CfnPolicy(this, 'DevicePolicy', {
      policyName: `${this.config.projectName}-device-policy`,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'iot:Connect',
            ],
            Resource: [
              `arn:aws:iot:${this.config.region}:*:client/\${cognito-identity.amazonaws.com:sub}`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'iot:Publish',
            ],
            Resource: [
              `arn:aws:iot:${this.config.region}:*:topic/museum-alert/sensor/\${cognito-identity.amazonaws.com:sub}/*`,
              `arn:aws:iot:${this.config.region}:*:topic/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/status`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'iot:Subscribe',
              'iot:Receive',
            ],
            Resource: [
              `arn:aws:iot:${this.config.region}:*:topicfilter/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/commands`,
              `arn:aws:iot:${this.config.region}:*:topic/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/commands`,
            ],
          },
        ],
      },
    });

    // User policy for web/mobile app
    this.policies.userPolicy = new iot.CfnPolicy(this, 'UserPolicy', {
      policyName: `${this.config.projectName}-user-policy`,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'iot:Connect',
            ],
            Resource: [
              `arn:aws:iot:${this.config.region}:*:client/\${cognito-identity.amazonaws.com:sub}`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'iot:Subscribe',
              'iot:Receive',
            ],
            Resource: [
              `arn:aws:iot:${this.config.region}:*:topicfilter/museum-alert/company/\${cognito-identity.amazonaws.com:sub}/*`,
              `arn:aws:iot:${this.config.region}:*:topic/museum-alert/company/\${cognito-identity.amazonaws.com:sub}/*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'iot:Publish',
            ],
            Resource: [
              `arn:aws:iot:${this.config.region}:*:topic/museum-alert/device/*/commands`,
            ],
          },
        ],
      },
    });
  }

  private createProvisioningTemplate(lambdaFunctions: { [key: string]: lambda.Function }): iot.CfnProvisioningTemplate {
    // Create role for provisioning template
    const provisioningRole = new iam.Role(this, 'ProvisioningRole', {
      roleName: this.createResourceName('role', 'provisioning'),
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
      inlinePolicies: {
        ProvisioningPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'iot:CreateThing',
                'iot:CreateKeysAndCertificate',
                'iot:AttachThingPrincipal',
                'iot:AttachPolicy',
                'iot:AddThingToThingGroup',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    return new iot.CfnProvisioningTemplate(this, 'ProvisioningTemplate', {
      templateName: this.config.iot.provisioningTemplateName,
      description: 'Provisioning template for Museum Alert sensors',
      enabled: true,
      provisioningRoleArn: provisioningRole.roleArn,
      templateBody: JSON.stringify({
        Parameters: {
          ThingName: {
            Type: 'String',
          },
          SerialNumber: {
            Type: 'String',
          },
          CompanyId: {
            Type: 'String',
          },
        },
        Resources: {
          thing: {
            Type: 'AWS::IoT::Thing',
            Properties: {
              ThingName: { Ref: 'ThingName' },
              ThingTypeName: this.thingType.thingTypeName,
              AttributePayload: {
                companyId: { Ref: 'CompanyId' },
                serialNumber: { Ref: 'SerialNumber' },
              },
            },
          },
          certificate: {
            Type: 'AWS::IoT::Certificate',
            Properties: {
              CertificateSigningRequest: { Ref: 'CSR' },
              Status: 'ACTIVE',
            },
          },
          policy: {
            Type: 'AWS::IoT::Policy',
            Properties: {
              PolicyName: `\${ThingName}-policy`,
              PolicyDocument: this.policies.devicePolicy.policyDocument,
            },
          },
        },
      }),
      preProvisioningHook: lambdaFunctions.preProvisioningHook ? {
        targetArn: lambdaFunctions.preProvisioningHook.functionArn,
        payloadVersion: '2020-04-01',
      } : undefined,
    });
  }

  private createTopicRules(lambdaFunctions: { [key: string]: lambda.Function }): void {
    // Rule for device connection status
    if (lambdaFunctions.republishDeviceConnectionStatus) {
      const connectionStatusRule = new iot.CfnTopicRule(this, 'DeviceConnectionStatusRule', {
        ruleName: 'republishDeviceConnectionStatus',
        topicRulePayload: {
          description: 'Republish device connection status events',
          sql: "SELECT * FROM '$aws/events/presence/connected/+' WHERE startswith(clientId, 'MAS-')",
          actions: [
            {
              lambda: {
                functionArn: lambdaFunctions.republishDeviceConnectionStatus.functionArn,
              },
            },
          ],
          ruleDisabled: false,
        },
      });

      // Grant permission for IoT to invoke the Lambda
      lambdaFunctions.republishDeviceConnectionStatus.addPermission('IoTInvokePermission', {
        principal: new iam.ServicePrincipal('iot.amazonaws.com'),
        sourceArn: connectionStatusRule.attrArn,
      });
    }

    // Rule for adding things to groups
    if (lambdaFunctions.addThingToGroup) {
      const addToGroupRule = new iot.CfnTopicRule(this, 'AddThingToGroupRule', {
        ruleName: 'addThingToGroup',
        topicRulePayload: {
          description: 'Add newly created things to appropriate groups',
          sql: "SELECT * FROM '$aws/events/thing/+/created'",
          actions: [
            {
              lambda: {
                functionArn: lambdaFunctions.addThingToGroup.functionArn,
              },
            },
          ],
          ruleDisabled: false,
        },
      });

      // Grant permission for IoT to invoke the Lambda
      lambdaFunctions.addThingToGroup.addPermission('IoTInvokePermissionAddGroup', {
        principal: new iam.ServicePrincipal('iot.amazonaws.com'),
        sourceArn: addToGroupRule.attrArn,
      });
    }
  }
}