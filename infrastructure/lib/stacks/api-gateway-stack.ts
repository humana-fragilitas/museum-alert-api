// lib/stacks/api-gateway-stack.ts - IMPORTS VERSION
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

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
  // Create a CloudWatch Logs group for access logs
  const logGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
    retention: logs.RetentionDays.ONE_DAY,
    removalPolicy: this.config.stage === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY,
  });

  // Create IAM role explicitly (optional - CDK creates it by default if cloudWatchRole is true)
  const cloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
    assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
    ],
  });

  const api = new apigateway.RestApi(this, 'MuseumAlertApi', {
    restApiName: this.config.apiGateway.apiName,
    description: 'Museum Alert API for IoT device management',

    defaultCorsPreflightOptions: {
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
      ],
    },

    deployOptions: {
      stageName: this.config.stage,
      loggingLevel: apigateway.MethodLoggingLevel.INFO,
      dataTraceEnabled: true,
      metricsEnabled: true,
      accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
      accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
        caller: true,
        httpMethod: true,
        ip: true,
        protocol: true,
        requestTime: true,
        resourcePath: true,
        responseLength: true,
        status: true,
        user: true,
      }),
    },

    endpointConfiguration: {
      types: [apigateway.EndpointType.REGIONAL],
    },

    cloudWatchRole: true, // allow API Gateway to push logs
  });

  return api;
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
    const getCompanyFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedGetCompany', {
      functionArn: getCompanyArn,
      sameEnvironment: true,
    });

    const updateCompanyFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedUpdateCompany', {
      functionArn: updateCompanyArn,
      sameEnvironment: true,
    });

    const createProvisioningClaimFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedCreateProvisioningClaim', {
      functionArn: createProvisioningClaimArn,
      sameEnvironment: true,
    });

    const getThingsByCompanyFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedGetThingsByCompany', {
      functionArn: getThingsByCompanyArn,
      sameEnvironment: true,
    });

    const checkThingExistsFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedCheckThingExists', {
      functionArn: checkThingExistsArn,
      sameEnvironment: true,
    });

    const attachIoTPolicyFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedAttachIoTPolicy', {
      functionArn: attachIoTPolicyArn,
      sameEnvironment: true,
    });

    const deleteUserLambdaFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedDeleteUserLambda', {
      functionArn: deleteUserLambdaArn,
      sameEnvironment: true,
    });

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

    new lambda.CfnPermission(this, 'InvokeGetCompanyPermission', {
      action: 'lambda:InvokeFunction',
      functionName: getCompanyArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/GET/company',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });

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

    new lambda.CfnPermission(this, 'InvokePutCompanyPermission', {
      action: 'lambda:InvokeFunction',
      functionName: updateCompanyArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/PUT/company',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });

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

    new lambda.CfnPermission(this, 'InvokePostProvisioningClaims', {
      action: 'lambda:InvokeFunction',
      functionName: createProvisioningClaimArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/POST/device-management/provisioning-claims',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });

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

    new lambda.CfnPermission(this, 'InvokeGetThings', {
      action: 'lambda:InvokeFunction',
      functionName: getThingsByCompanyArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/GET/things',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });


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

    new lambda.CfnPermission(this, 'InvokeGetThingByName', {
      action: 'lambda:InvokeFunction',
      functionName: checkThingExistsArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/GET/things/{thingName}',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });

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

    new lambda.CfnPermission(this, 'InvokePostUserPolicy', {
      action: 'lambda:InvokeFunction',
      functionName: attachIoTPolicyArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/POST/user-policy',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });

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

    new lambda.CfnPermission(this, 'InvokeDeleteUser', {
      action: 'lambda:InvokeFunction',
      functionName: deleteUserLambdaArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.sub(
        'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/${StageName}/DELETE/user',
        {
          ApiId: this.api.restApiId,
          StageName: this.config.stage,
        }
      )
    });

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