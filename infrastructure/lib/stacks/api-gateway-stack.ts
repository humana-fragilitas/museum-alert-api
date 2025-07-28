// lib/stacks/api-gateway-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface ApiGatewayStackProps extends BaseStackProps {
  lambdaFunctions: { [key: string]: lambda.Function };
  userPool: cognito.UserPool;
}

export class ApiGatewayStack extends BaseStack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    this.api = this.createRestApi();
    this.authorizer = this.createAuthorizer(props.userPool);
    this.createApiResources(props.lambdaFunctions);
    
    this.applyStandardTags(this);
  }

  private createRestApi(): apigateway.RestApi {
    return new apigateway.RestApi(this, 'MuseumAlertApi', {
      restApiName: this.config.apiGateway.apiName,
      description: 'Museum Alert API for IoT device management',
      
      // CORS configuration for web app
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Restrict this in production
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      
      // Deploy automatically
      deploy: true,
      deployOptions: {
        stageName: this.config.stage,
        throttlingRateLimit: 100, // requests per second
        throttlingBurstLimit: 200, // burst capacity
        
        // Enable CloudWatch logging
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      
      // Binary media types
      binaryMediaTypes: ['*/*'],
    });
  }

  private createAuthorizer(userPool: cognito.UserPool): apigateway.CognitoUserPoolsAuthorizer {
    return new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `${this.config.projectName}-authorizer`,
      identitySource: 'method.request.header.Authorization',
    });
  }

  private createApiResources(lambdaFunctions: { [key: string]: lambda.Function }): void {
    // Company endpoints
    const companyResource = this.api.root.addResource('company');
    
    if (lambdaFunctions.getCompany) {
      companyResource.addMethod('GET', 
        new apigateway.LambdaIntegration(lambdaFunctions.getCompany),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    if (lambdaFunctions.updateCompany) {
      companyResource.addMethod('PUT', 
        new apigateway.LambdaIntegration(lambdaFunctions.updateCompany),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // Device/Things endpoints
    const devicesResource = this.api.root.addResource('devices');
    
    if (lambdaFunctions.getThingsByCompany) {
      devicesResource.addMethod('GET', 
        new apigateway.LambdaIntegration(lambdaFunctions.getThingsByCompany),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    if (lambdaFunctions.checkThingExists) {
      const checkDeviceResource = devicesResource.addResource('check');
      checkDeviceResource.addMethod('POST', 
        new apigateway.LambdaIntegration(lambdaFunctions.checkThingExists),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // IoT provisioning endpoints
    const provisioningResource = this.api.root.addResource('provisioning');
    
    if (lambdaFunctions.createProvisioningClaim) {
      const claimResource = provisioningResource.addResource('claim');
      claimResource.addMethod('POST', 
        new apigateway.LambdaIntegration(lambdaFunctions.createProvisioningClaim),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // User management endpoints
    const userResource = this.api.root.addResource('user');
    
    if (lambdaFunctions.deleteUserLambda) {
      userResource.addMethod('DELETE', 
        new apigateway.LambdaIntegration(lambdaFunctions.deleteUserLambda),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // IoT policy attachment (might be called from frontend)
    const iotResource = this.api.root.addResource('iot');
    
    if (lambdaFunctions.attachIoTPolicy) {
      const policyResource = iotResource.addResource('attach-policy');
      policyResource.addMethod('POST', 
        new apigateway.LambdaIntegration(lambdaFunctions.attachIoTPolicy),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // Add API Gateway execution role permissions for Lambda functions
    this.grantApiGatewayInvokePermissions(lambdaFunctions);
  }

  private grantApiGatewayInvokePermissions(lambdaFunctions: { [key: string]: lambda.Function }): void {
    const apiGatewayPrincipal = new iam.ServicePrincipal('apigateway.amazonaws.com');

    Object.values(lambdaFunctions).forEach((func) => {
      func.addPermission(`ApiGatewayInvoke-${func.functionName}`, {
        principal: apiGatewayPrincipal,
        sourceArn: this.api.arnForExecuteApi(),
      });
    });
  }

  // Output important values for frontend configuration
  private createOutputs(): void {
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'Museum Alert API Gateway URL',
      exportName: `${this.config.projectName}-api-url-${this.config.stage}`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.api.restApiId,
      description: 'Museum Alert API Gateway ID',
      exportName: `${this.config.projectName}-api-id-${this.config.stage}`,
    });
  }
}