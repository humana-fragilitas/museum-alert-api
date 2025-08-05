import { Construct } from 'constructs';

import * as iam from 'aws-cdk-lib/aws-iam';

import { BaseStack, BaseStackProps } from './base-stack';


export class IamStack extends BaseStack {

  public readonly roles: { [key: string]: iam.Role } = {};

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);
    this.createLambdaExecutionRole();
    this.createIoTServiceRole();
    this.applyStandardTags(this);
  }

  private createLambdaExecutionRole(): void {

    this.roles.lambdaExecution = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: this.createResourceName('role', 'lambda-execution'),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [`arn:aws:dynamodb:${this.config.region}:*:table/${this.config.projectName}-*`],
            }),
          ],
        }),
      },
    });

  }

  private createIoTServiceRole(): void {

    this.roles.iotService = new iam.Role(this, 'IoTServiceRole', {
      roleName: this.createResourceName('role', 'iot-service'),
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
      inlinePolicies: {
        LambdaInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['lambda:InvokeFunction'],
              resources: [`arn:aws:lambda:${this.config.region}:*:function:${this.config.projectName}-*`],
            }),
          ],
        }),
      },
    });
    
  }

}