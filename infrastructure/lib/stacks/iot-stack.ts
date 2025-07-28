// lib/stacks/iot-stack.ts
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface IoTStackProps extends BaseStackProps {
  iamRoles: { [key: string]: iam.Role };
}

export class IoTStack extends BaseStack {
  public readonly thingType: iot.CfnThingType;
  public readonly provisioningTemplate: iot.CfnProvisioningTemplate;
  public readonly policies: { [key: string]: iot.CfnPolicy } = {};

  constructor(scope: Construct, id: string, props: IoTStackProps) {
    super(scope, id, props);

    this.thingType = this.createThingType();
    this.createIoTPolicies();
    this.provisioningTemplate = this.createProvisioningTemplate();
    // Note: Topic rules will be created separately to avoid circular dependencies
    
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

private createProvisioningTemplate(): iot.CfnProvisioningTemplate {
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
          Company: {
            Type: 'String',
          },
          Region: {
            Type: 'String',
          },
          AccountId: {
            Type: 'String',
          },
        },
        Resources: {
          thing: {
            Type: 'AWS::IoT::Thing',
            Properties: {
              ThingName: { Ref: 'ThingName' },
              AttributePayload: {
                Company: { Ref: 'Company' },
              },
              ThingTypeName: this.config.iot.thingTypeName,
            },
            OverrideSettings: {
              AttributePayload: 'REPLACE',
              ThingTypeName: 'REPLACE',
            },
          },
          certificate: {
            Type: 'AWS::IoT::Certificate',
            Properties: {
              CertificateId: { Ref: 'AWS::IoT::Certificate::Id' },
              Status: 'ACTIVE',
            },
          },
          policy: {
            Type: 'AWS::IoT::Policy',
            Properties: {
              PolicyDocument: {
                'Fn::Sub': [
                  JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                      {
                        Effect: 'Allow',
                        Action: 'iot:Connect',
                        Resource: 'arn:aws:iot:${Region}:${AccountId}:client/${ThingName}',
                      },
                      {
                        Effect: 'Allow',
                        Action: 'iot:Subscribe',
                        Resource: 'arn:aws:iot:${Region}:${AccountId}:topicfilter/companies/${Company}/devices/${ThingName}/commands',
                      },
                      {
                        Effect: 'Allow',
                        Action: 'iot:Receive',
                        Resource: 'arn:aws:iot:${Region}:${AccountId}:topic/companies/${Company}/devices/${ThingName}/commands',
                      },
                      {
                        Effect: 'Allow',
                        Action: 'iot:Publish',
                        Resource: [
                          'arn:aws:iot:${Region}:${AccountId}:topic/companies/${Company}/devices/${ThingName}/events',
                          'arn:aws:iot:${Region}:${AccountId}:topicfilter/companies/${Company}/devices/${ThingName}/commands/ack',
                        ],
                      },
                    ],
                  }),
                  {
                    ThingName: { Ref: 'ThingName' },
                    Company: { Ref: 'Company' },
                    Region: { Ref: 'Region' },
                    AccountId: { Ref: 'AccountId' },
                  },
                ],
              },
            },
          },
        },
        DeviceConfiguration: {
          company: {
            Ref: 'Company',
          },
        },
      }),
      // Note: Pre-provisioning hook will be added by a separate stack to avoid circular dependencies
    });
  }
}