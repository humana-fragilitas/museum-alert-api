// lib/stacks/iot-wiring-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface IoTWiringStackProps extends BaseStackProps {
  provisioningTemplate: iot.CfnProvisioningTemplate;
  preProvisioningHookFunction: lambda.Function;
}

export class IoTWiringStack extends BaseStack {
  constructor(scope: Construct, id: string, props: IoTWiringStackProps) {
    super(scope, id, props);

    this.addPreProvisioningHook(props.provisioningTemplate, props.preProvisioningHookFunction);
    
    this.applyStandardTags(this);
  }

  private addPreProvisioningHook(
    template: iot.CfnProvisioningTemplate, 
    hookFunction: lambda.Function
  ): void {
    // Update the provisioning template to include the pre-provisioning hook
    template.preProvisioningHook = {
      targetArn: hookFunction.functionArn,
      payloadVersion: '2020-04-01',
    };

    // Construct the provisioning template ARN manually
    const templateArn = `arn:aws:iot:${this.config.region}:${cdk.Aws.ACCOUNT_ID}:provisioningtemplate/${template.templateName}`;

    // Grant IoT permission to invoke the pre-provisioning hook
    hookFunction.addPermission('IoTProvisioningHookPermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: templateArn,
    });
  }
}