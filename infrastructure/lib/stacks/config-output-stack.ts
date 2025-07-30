// lib/stacks/config-output-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';
import * as customResources from 'aws-cdk-lib/custom-resources';

export class ConfigOutputStack extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.createAngularConfig();
    
    this.applyStandardTags(this);
  }

  private createAngularConfig(): void {
    // Import values from other stacks
    const apiUrl = cdk.Fn.importValue(`${this.config.projectName}-api-url-${this.config.stage}`);
    const userPoolId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-id-${this.config.stage}`);
    const userPoolClientId = cdk.Fn.importValue(`${this.config.projectName}-user-pool-client-id-${this.config.stage}`);
    const identityPoolId = cdk.Fn.importValue(`${this.config.projectName}-identity-pool-id-${this.config.stage}`);

    // DYNAMIC: Get IoT endpoint using custom resource
    const iotEndpointProvider = new customResources.AwsCustomResource(this, 'IoTEndpointProvider', {
      onUpdate: {
        service: 'IoT',
        action: 'describeEndpoint',
        parameters: {
          endpointType: 'iot:Data-ATS'
        },
        region: this.config.region,
        physicalResourceId: customResources.PhysicalResourceId.of('iot-endpoint'),
      },
      policy: customResources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: customResources.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const iotEndpoint = iotEndpointProvider.getResponseField('endpointAddress');

    // Create the complete Angular configuration template
    new cdk.CfnOutput(this, 'AngularAppConfiguration', {
      value: cdk.Fn.sub(`export const APP_CONFIG = {
  production: ${this.config.stage === 'prod'},
  environment: '${this.config.stage.toUpperCase()}',
  aws: {
    apiGateway: '\${ApiUrl}',
    region: '${this.config.region}',
    algorithm: 'AWS4-HMAC-SHA256',
    IoTCore: {
      endpoint: '\${IoTEndpoint}',
      service: 'iotdevicegateway'
    },
    amplify: {
      Auth: {
        Cognito: {
          userPoolId: '\${UserPoolId}',
          userPoolClientId: '\${UserPoolClientId}',
          identityPoolId: '\${IdentityPoolId}',
          mandatorySignIn: true,
          authenticationFlowType: 'USER_SRP_AUTH'
        }
      }
    }
  },
  settings: {
    MQTT_RESPONSE_TIMEOUT: 10000,
    USB_RESPONSE_TIMEOUT: 10000,
  }
};`, {
        ApiUrl: apiUrl,
        UserPoolId: userPoolId,
        UserPoolClientId: userPoolClientId,
        IdentityPoolId: identityPoolId,
        IoTEndpoint: iotEndpoint,
      }),
      description: '🚀 COPY THIS: Complete Angular App Configuration (APP_CONFIG)',
    });

    // Individual values for reference
    new cdk.CfnOutput(this, 'AppConfigApiUrl', {
      value: apiUrl,
      description: '📋 API Gateway URL',
    });

    new cdk.CfnOutput(this, 'AppConfigRegion', {
      value: this.config.region,
      description: '📋 AWS Region',
    });

    new cdk.CfnOutput(this, 'AppConfigIoTEndpoint', {
      value: iotEndpoint,
      description: '📋 IoT Core Endpoint (Dynamic)',
    });

    new cdk.CfnOutput(this, 'AppConfigUserPoolId', {
      value: userPoolId,
      description: '📋 Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'AppConfigUserPoolClientId', {
      value: userPoolClientId,
      description: '📋 Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'AppConfigIdentityPoolId', {
      value: identityPoolId,
      description: '📋 Cognito Identity Pool ID',
    });
  }
}