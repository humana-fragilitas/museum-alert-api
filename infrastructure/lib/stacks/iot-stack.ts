import { Construct } from 'constructs';

import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as customResources from 'aws-cdk-lib/custom-resources';

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

    const accountId = cdk.Stack.of(this).account;

    // Device policy for sensors
    this.policies.devicePolicy = new iot.CfnPolicy(this, 'DevicePolicy', {
      policyName: `${this.config.projectName}-device-policy`,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['iot:Connect'],
            Resource: [
              `arn:aws:iot:${this.config.region}:${accountId}:client/\${cognito-identity.amazonaws.com:sub}`,
            ],
          },
          {
            Effect: 'Allow',
            Action: ['iot:Publish'],
            Resource: [
              `arn:aws:iot:${this.config.region}:${accountId}:topic/museum-alert/sensor/\${cognito-identity.amazonaws.com:sub}/*`,
              `arn:aws:iot:${this.config.region}:${accountId}:topic/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/status`,
            ],
          },
          {
            Effect: 'Allow',
            Action: ['iot:Subscribe', 'iot:Receive'],
            Resource: [
              `arn:aws:iot:${this.config.region}:${accountId}:topicfilter/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/commands`,
              `arn:aws:iot:${this.config.region}:${accountId}:topic/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/commands`,
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
            Action: ['iot:Connect'],
            Resource: [
              `arn:aws:iot:${this.config.region}:${accountId}:client/\${cognito-identity.amazonaws.com:sub}`,
            ],
          },
          {
            Effect: 'Allow',
            Action: ['iot:Subscribe', 'iot:Receive'],
            Resource: [
              `arn:aws:iot:${this.config.region}:${accountId}:topicfilter/museum-alert/company/\${cognito-identity.amazonaws.com:sub}/*`,
              `arn:aws:iot:${this.config.region}:${accountId}:topic/museum-alert/company/\${cognito-identity.amazonaws.com:sub}/*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: ['iot:Publish'],
            Resource: [
              `arn:aws:iot:${this.config.region}:${accountId}:topic/museum-alert/device/\${cognito-identity.amazonaws.com:sub}/commands`,
            ],
          },
        ],
      },
    });

  }

  private createProvisioningTemplate(): iot.CfnProvisioningTemplate {

    const accountId = cdk.Stack.of(this).account;

    const preProvisioningHookArn = cdk.Fn.importValue(`${this.config.projectName}-preprovisioninghook-arn-${this.config.stage}`);

    const provisioningRole = new iam.Role(this, 'ProvisioningRole', {
      roleName: this.createResourceName('role', 'provisioning'),
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
      
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTThingsRegistration'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTRuleActions'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSIoTLogging'),
      ],
      
      inlinePolicies: {
        'provisioning-policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'iot:CreateThing',
                'iot:CreateKeysAndCertificate', 
                'iot:AttachThingPrincipal',
                'iot:AttachPolicy',
              ],
              resources: ['*'],
            }),
          ],
        }),
      }
    });

    const preProvisioningHookFunction = lambda.Function.fromFunctionAttributes(
      this, 
      'ImportedPreProvisioningHook', 
      {
        functionArn: preProvisioningHookArn,
        sameEnvironment: true,
      }
    );

    const template = new iot.CfnProvisioningTemplate(this, 'ProvisioningTemplate', {
      templateName: this.config.iot.provisioningTemplateName,
      description: 'Provisioning template for Museum Alert sensors',
      enabled: true,
      provisioningRoleArn: provisioningRole.roleArn,
      
      preProvisioningHook: {
        targetArn: preProvisioningHookArn,
        payloadVersion: '2020-04-01',
      },
      
      templateBody: JSON.stringify({
        Parameters: {
          ThingName: { Type: 'String' },
          Company: { Type: 'String' },
          Region: { Type: 'String' },
          AccountId: { Type: 'String' },
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
                  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"iot:Connect","Resource":"arn:aws:iot:${Region}:${AccountId}:client/${ThingName}"},{"Effect":"Allow","Action":"iot:Subscribe","Resource":"arn:aws:iot:${Region}:${AccountId}:topicfilter/companies/${Company}/devices/${ThingName}/commands"},{"Effect":"Allow","Action":"iot:Receive","Resource":"arn:aws:iot:${Region}:${AccountId}:topic/companies/${Company}/devices/${ThingName}/commands"},{"Effect":"Allow","Action":"iot:Publish","Resource":["arn:aws:iot:${Region}:${AccountId}:topic/companies/${Company}/devices/${ThingName}/events","arn:aws:iot:${Region}:${AccountId}:topicfilter/companies/${Company}/devices/${ThingName}/commands/ack"]}]}',
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
          company: { Ref: 'Company' },
        },
      }),
    });

    /**
     * Grants IoT permission to invoke the pre-provisioning hook; since we're using an imported function,
     * we need to use a custom resource to add the permission
     */
    const addLambdaPermission = new customResources.AwsCustomResource(this, 'AddLambdaPermission', {
      onCreate: {
        service: 'Lambda',
        action: 'addPermission',
        parameters: {
          FunctionName: preProvisioningHookArn,
          StatementId: `IoTProvisioningHookPermission-${this.config.stage}`,
          Action: 'lambda:InvokeFunction',
          Principal: 'iot.amazonaws.com',
          SourceArn: `arn:aws:iot:${this.config.region}:${accountId}:provisioningtemplate/${this.config.iot.provisioningTemplateName}`,
        },
        region: this.config.region,
        physicalResourceId: customResources.PhysicalResourceId.of(`lambda-permission-${this.config.stage}`),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'addPermission',
        parameters: {
          FunctionName: preProvisioningHookArn,
          StatementId: `IoTProvisioningHookPermission-${this.config.stage}`,
          Action: 'lambda:InvokeFunction',
          Principal: 'iot.amazonaws.com',
          SourceArn: `arn:aws:iot:${this.config.region}:${accountId}:provisioningtemplate/${this.config.iot.provisioningTemplateName}`,
        },
        region: this.config.region,
        physicalResourceId: customResources.PhysicalResourceId.of(`lambda-permission-${this.config.stage}`),
      },
      onDelete: {
        service: 'Lambda',
        action: 'removePermission',
        parameters: {
          FunctionName: preProvisioningHookArn,
          StatementId: `IoTProvisioningHookPermission-${this.config.stage}`,
        },
        region: this.config.region,
      },
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [preProvisioningHookArn],
      }),
      logGroup: new logs.LogGroup(this, 'AddLambdaPermissionLogGroup', {
        retention: logs.RetentionDays.ONE_DAY,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      })
    });

    // Ensures the permission is added before creating the provisioning template
    template.node.addDependency(addLambdaPermission);

    return template;

  }

}