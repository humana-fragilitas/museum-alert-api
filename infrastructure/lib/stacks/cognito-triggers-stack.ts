// lib/stacks/cognito-triggers-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from './base-stack';

export interface CognitoTriggersStackProps extends BaseStackProps {
  userPool: cognito.UserPool;
  postConfirmationFunction: lambda.Function;
}

export class CognitoTriggersStack extends BaseStack {
  constructor(scope: Construct, id: string, props: CognitoTriggersStackProps) {
    super(scope, id, props);

    this.addLambdaTriggers(props.userPool, props.postConfirmationFunction);
    
    this.applyStandardTags(this);
  }

  private addLambdaTriggers(userPool: cognito.UserPool, postConfirmationFunction: lambda.Function): void {
    // Add the post confirmation trigger
    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.lambdaConfig = {
      postConfirmation: postConfirmationFunction.functionArn,
    };

    // Grant Cognito permission to invoke the Lambda
    postConfirmationFunction.addPermission('CognitoTriggerPermission', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: userPool.userPoolArn,
    });
  }
}