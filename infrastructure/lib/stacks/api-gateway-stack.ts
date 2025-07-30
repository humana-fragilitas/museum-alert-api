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
    this.createOutputs(); // Add this line
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
        
        // DISABLE CloudWatch logging to avoid role requirement
        loggingLevel: apigateway.MethodLoggingLevel.OFF,
        dataTraceEnabled: false,
        metricsEnabled: true, // Keep metrics, disable logs
      },
      
      // CRITICAL: Remove binary media types to prevent base64 encoding
      // This was causing the base64 encoding issue
      // binaryMediaTypes: ['*/*'], // REMOVE THIS LINE
      
      // IMPORTANT: Ensure endpoint configuration is REGIONAL (default)
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
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
    // Company endpoints - EXACT match to production
    const companyResource = this.api.root.addResource('company');
    
    if (lambdaFunctions.getCompany) {
      companyResource.addMethod('GET', 
        new apigateway.LambdaIntegration(lambdaFunctions.getCompany, {
          proxy: true,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    if (lambdaFunctions.updateCompany) {
      companyResource.addMethod('PUT', 
        new apigateway.LambdaIntegration(lambdaFunctions.updateCompany, {
          proxy: true,
          contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
          requestModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        }
      );
    }

    // Device Management endpoints - EXACT match to production structure
    const deviceManagementResource = this.api.root.addResource('device-management');
    
    // IMPORTANT: Provisioning Claims is NESTED under device-management
    const provisioningClaimsResource = deviceManagementResource.addResource('provisioning-claims');
    
    if (lambdaFunctions.createProvisioningClaim) {
      provisioningClaimsResource.addMethod('POST', 
        new apigateway.LambdaIntegration(lambdaFunctions.createProvisioningClaim, {
          proxy: true,
          contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
          requestModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        }
      );
    }

    // Things endpoints - EXACT match to production
    const thingsResource = this.api.root.addResource('things');
    
    if (lambdaFunctions.getThingsByCompany) {
      thingsResource.addMethod('GET', 
        new apigateway.LambdaIntegration(lambdaFunctions.getThingsByCompany, {
          proxy: true,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // Things with thingName parameter - EXACT match to production
    const thingNameResource = thingsResource.addResource('{thingName}');
    
    if (lambdaFunctions.checkThingExists) {
      thingNameResource.addMethod('GET', 
        new apigateway.LambdaIntegration(lambdaFunctions.checkThingExists, {
          proxy: true,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }

    // User Policy endpoint - EXACT match to production
    const userPolicyResource = this.api.root.addResource('user-policy');
    
    if (lambdaFunctions.attachIoTPolicy) {
      userPolicyResource.addMethod('POST', 
        new apigateway.LambdaIntegration(lambdaFunctions.attachIoTPolicy, {
          proxy: true,
          contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
          requestModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        }
      );
    }

    // User management endpoints (if you have deleteUserLambda)
    const userResource = this.api.root.addResource('user');
    
    if (lambdaFunctions.deleteUserLambda) {
      userResource.addMethod('DELETE', 
        new apigateway.LambdaIntegration(lambdaFunctions.deleteUserLambda, {
          proxy: true,
        }),
        {
          authorizer: this.authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );
    }
  }

  // Output important values for frontend configuration
// Add this method at the end of your ApiGatewayStack class
  private createOutputs(): void {
    // API Gateway URL for Angular config
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL for Angular app',
      exportName: `${this.config.projectName}-api-url-${this.config.stage}`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: `${this.config.projectName}-api-id-${this.config.stage}`,
    });

    // Region for Angular config
    new cdk.CfnOutput(this, 'Region', {
      value: this.config.region,
      description: 'AWS Region for Angular app',
    });
  }

}