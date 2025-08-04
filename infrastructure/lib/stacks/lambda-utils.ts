import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';

interface CreateLambdaProps {
  scope: Construct;
  id: string;
  functionName: string;
  assetPath: string;
  environment?: { [key: string]: string };
  useLayer?: boolean;
  sharedLayer?: lambda.ILayerVersion;
  config: {
    lambda: {
      timeout: number;
      memorySize: number;
    };
  };
}

export function createLambdaFunction(props: CreateLambdaProps): lambda.Function {
  const func = new lambda.Function(props.scope, props.id, {
    functionName: props.functionName,
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromAsset(props.assetPath, {
      exclude: [
        'cdk.out',
        '.git',
        '*.log',
        '.DS_Store',
        'libraries',
        '*.zip',
        'test',
        'tests',
        '__pycache__',
        '.env',
        'node_modules'
      ],
    }),
    layers: props.useLayer && props.sharedLayer ? [props.sharedLayer] : undefined,
    environment: props.environment ?? {},
    timeout: cdk.Duration.seconds(props.config.lambda.timeout),
    memorySize: props.config.lambda.memorySize,
    logRetention: logs.RetentionDays.ONE_DAY,
  });

  new logs.LogGroup(props.scope, `${props.functionName}LogGroup`, {
    logGroupName: `/aws/lambda/${func.functionName}`,
    retention: logs.RetentionDays.ONE_DAY,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  func.role?.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  );

  return func;
  
}


/* USAGE:

import { createLambdaFunction } from './lambda-utils';

const fn = createLambdaFunction(this, {
  id: 'MyFunction',
  codePath: 'src/my-function',
  handler: 'index.handler',
  layers: [sharedLayer],
});

*/