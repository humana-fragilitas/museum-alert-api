// lib/stacks/api-gateway-stack.ts - IMPORTS VERSION
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export class ApiGatewayStack extends BaseStack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.api = this.createRestApi();
    this.authorizer = this.createAuthorizer();
    this.createApiResources();
    this.createOutputs();
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
      
      // IMPORTANT: Ensure endpoint configuration is REGIONAL (default)
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
    });
  }

  private createAuthorizer(): apigateway.CognitoUserPoolsAuthorizer {
    // Import User Pool ARN and get reference
    const userPoolArn = cdk.Fn.importValue(`${this.config.projectName}-user-pool-arn-${this.config.stage}`);
    const userPool = cognito.UserPool.fromUserPoolArn(this, 'ImportedUserPool', userPoolArn);

    return new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `${this.config.projectName}-authorizer`,
      identitySource: 'method.request.header.Authorization',
    });
  }

  private createApiResources(): void {
    // Import all Lambda function ARNs
    const getCompanyArn = cdk.Fn.importValue(`${this.config.projectName}-getcompany-arn-${this.config.stage}`);
    const updateCompanyArn = cdk.Fn.importValue(`${this.config.projectName}-updatecompany-arn-${this.config.stage}`);
    const createProvisioningClaimArn = cdk.Fn.importValue(`${this.config.projectName}-createprovisioningclaim-arn-${this.config.stage}`);
    const getThingsByCompanyArn = cdk.Fn.importValue(`${this.config.projectName}-getthingsbycompany-arn-${this.config.stage}`);
    const checkThingExistsArn = cdk.Fn.importValue(`${this.config.projectName}-checkthingexists-arn-${this.config.stage}`);
    const attachIoTPolicyArn = cdk.Fn.importValue(`${this.config.projectName}-attachiotpolicy-arn-${this.config.stage}`);
    const deleteUserLambdaArn = cdk.Fn.importValue(`${this.config.projectName}-deleteuserlambda-arn-${this.config.stage}`);

    // Get Lambda function references
    const getCompanyFunction = lambda.Function.fromFunctionArn(this, 'ImportedGetCompany', getCompanyArn);
    const updateCompanyFunction = lambda.Function.fromFunctionArn(this, 'ImportedUpdateCompany', updateCompanyArn);
    const createProvisioningClaimFunction = lambda.Function.fromFunctionArn(this, 'ImportedCreateProvisioningClaim', createProvisioningClaimArn);
    const getThingsByCompanyFunction = lambda.Function.fromFunctionArn(this, 'ImportedGetThingsByCompany', getThingsByCompanyArn);
    const checkThingExistsFunction = lambda.Function.fromFunctionArn(this, 'ImportedCheckThingExists', checkThingExistsArn);
    const attachIoTPolicyFunction = lambda.Function.fromFunctionArn(this, 'ImportedAttachIoTPolicy', attachIoTPolicyArn);
    const deleteUserLambdaFunction = lambda.Function.fromFunctionArn(this, 'ImportedDeleteUserLambda', deleteUserLambdaArn);

    // Company endpoints - EXACT match to production
    const companyResource = this.api.root.addResource('company');
    
    companyResource.addMethod('GET', 
      new apigateway.LambdaIntegration(getCompanyFunction, {
        proxy: true,
      }),
      {
        authorizer: this.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    companyResource.addMethod('PUT', 
      new apigateway.LambdaIntegration(updateCompanyFunction, {
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

    // Device Management endpoints - EXACT match to production structure
    const deviceManagementResource = this.api.root.addResource('device-management');
    
    // IMPORTANT: Provisioning Claims is NESTED under device-management
    const provisioningClaimsResource = deviceManagementResource.addResource('provisioning-claims');
    
    provisioningClaimsResource.addMethod('POST', 
      new apigateway.LambdaIntegration(createProvisioningClaimFunction, {
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

    // Things endpoints - EXACT match to production
    const thingsResource = this.api.root.addResource('things');
    
    thingsResource.addMethod('GET', 
      new apigateway.LambdaIntegration(getThingsByCompanyFunction, {
        proxy: true,
      }),
      {
        authorizer: this.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // Things with thingName parameter - EXACT match to production
    const thingNameResource = thingsResource.addResource('{thingName}');
    
    thingNameResource.addMethod('GET', 
      new apigateway.LambdaIntegration(checkThingExistsFunction, {
        proxy: true,
      }),
      {
        authorizer: this.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // User Policy endpoint - EXACT match to production
    const userPolicyResource = this.api.root.addResource('user-policy');
    
    userPolicyResource.addMethod('POST', 
      new apigateway.LambdaIntegration(attachIoTPolicyFunction, {
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

    // User management endpoints
    const userResource = this.api.root.addResource('user');
    
    userResource.addMethod('DELETE', 
      new apigateway.LambdaIntegration(deleteUserLambdaFunction, {
        proxy: true,
      }),
      {
        authorizer: this.authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );
  }

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